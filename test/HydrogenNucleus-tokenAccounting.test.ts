/* global describe it before ethers */

import hre from "hardhat";
const { ethers } = hre;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;

import { HydrogenNucleus, MockERC20, MockERC20NoReturnsSuccess, MockERC20NoReturnsRevert, MockERC20NoReturnsRevertWithError, MockERC20SuccessFalse, MockFlashSwapCallee1, MockFlashSwapCallee2, MockFlashSwapCallee3, MockFlashSwapCallee4, MockFlashSwapCallee5, MockFlashSwapCallee6, MockFlashSwapCallee7, MockFlashSwapCallee8 } from "./../typechain-types";

import { expectDeployed } from "./../scripts/utilities/expectDeployed";
import { getNetworkSettings } from "../scripts/utils/getNetworkSettings";
import HydrogenNucleusHelper from "../scripts/utils/HydrogenNucleusHelper";
import HydrogenNucleusEventLogger from "../scripts/utils/HydrogenNucleusEventLogger";
import { setStorageAt, toBytes32 } from "../scripts/utilities/setStorage";
import { decimalsToAmount } from "../scripts/utils/price";
import { deployContract } from "../scripts/utils/deployContract";
import L1DataFeeAnalyzer from "../scripts/utils/L1DataFeeAnalyzer";

const { AddressZero, WeiPerEther, MaxUint256, Zero } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const MAX_PPM = BN.from(1_000_000); // parts per million

const INVALID_LOCATION_0 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const INVALID_LOCATION_6 = "0x0600000000000000000000000000000000000000000000000000000000000000";
const INVALID_LOCATION_FLAG = "0x0400000000000000000000000000000000000000000000000000000000000000";
const INVALID_EXTERNAL_ADDRESS_LOCATION = "0x01ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const INVALID_INTERNAL_ADDRESS_LOCATION = "0x02ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const NULL_LOCATION = "0x0000000000000000000000000000000000000000000000000000000000000000";
const NULL_EXCHANGE_RATE = "0x0000000000000000000000000000000000000000000000000000000000000000";
const NULL_FEE = "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("HydrogenNucleus-tokenAccounting", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let user4: SignerWithAddress;
  let user5: SignerWithAddress;
  let user1ExternalLocation: string;
  let user1InternalLocation: string;
  let user2ExternalLocation: string;
  let user2InternalLocation: string;
  let user3ExternalLocation: string;
  let user3InternalLocation: string;
  let user4ExternalLocation: string;
  let user4InternalLocation: string;
  let user5ExternalLocation: string;
  let user5InternalLocation: string;
  let nucleusExternalLocation: string;
  let nucleusInternalLocation: string;
  let addressZeroExternalLocation: string;
  let addressZeroInternalLocation: string;
  let pool1001Location = HydrogenNucleusHelper.poolIDtoLocation(1001);
  let pool2001Location = HydrogenNucleusHelper.poolIDtoLocation(2001);

  let token1: MockERC20;
  let token2: MockERC20;
  let token3: MockERC20;
  let nonstandardToken1: MockERC20NoReturnsSuccess;
  let nonstandardToken2: MockERC20NoReturnsRevert;
  let nonstandardToken3: MockERC20NoReturnsRevertWithError;
  let nonstandardToken4: MockERC20SuccessFalse;

  let nucleus: HydrogenNucleus;

  let swapCallee1: MockFlashSwapCallee1;
  let swapCallee2: MockFlashSwapCallee2;
  let swapCallee3: MockFlashSwapCallee3;
  let swapCallee4: MockFlashSwapCallee4;
  let swapCallee5: MockFlashSwapCallee5;
  let swapCallee6: MockFlashSwapCallee6;
  let swapCallee7: MockFlashSwapCallee7;
  let swapCallee8: MockFlashSwapCallee8;

  let chainID: number;
  let networkSettings: any;
  let snapshot: BN;

  let l1DataFeeAnalyzer = new L1DataFeeAnalyzer();

  before(async function () {
    [deployer, owner, user1, user2, user3, user4, user5] = await ethers.getSigners();
    chainID = (await provider.getNetwork()).chainId;
    networkSettings = getNetworkSettings(chainID);
    if(!networkSettings.isTestnet) throw new Error("Do not run tests on production networks");
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    token1 = await deployContract(deployer, "MockERC20", [`Token1`, `TKN1`, 18]) as MockERC20;
    token2 = await deployContract(deployer, "MockERC20", [`Token2`, `TKN2`, 18]) as MockERC20;
    token3 = await deployContract(deployer, "MockERC20", [`Token3`, `TKN3`, 18]) as MockERC20;

    nonstandardToken1 = await deployContract(deployer, "MockERC20NoReturnsSuccess", [`NonstandardToken1`, `NSTKN1`, 18]) as MockERC20NoReturnsSuccess;
    nonstandardToken2 = await deployContract(deployer, "MockERC20NoReturnsRevert", [`NonstandardToken2`, `NSTKN2`, 18]) as MockERC20NoReturnsRevert;
    nonstandardToken3 = await deployContract(deployer, "MockERC20NoReturnsRevertWithError", [`NonstandardToken3`, `NSTKN3`, 18]) as MockERC20NoReturnsRevertWithError;
    nonstandardToken4 = await deployContract(deployer, "MockERC20SuccessFalse", [`NonstandardToken4`, `NSTKN4`, 18]) as MockERC20SuccessFalse;

    nucleus = await deployContract(deployer, "HydrogenNucleus", [owner.address]) as HydrogenNucleus;

    swapCallee1 = await deployContract(deployer, "MockFlashSwapCallee1", [nucleus.address]) as MockFlashSwapCallee1;

    user1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
    user1InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
    user2ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
    user2InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
    user3ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user3.address);
    user3InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user3.address);
    user4ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user4.address);
    user4InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user4.address);
    user5ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user5.address);
    user5InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user5.address);
    nucleusExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(nucleus.address);
    nucleusInternalLocation = HydrogenNucleusHelper.internalAddressToLocation(nucleus.address);
    addressZeroExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(AddressZero);
    addressZeroInternalLocation = HydrogenNucleusHelper.internalAddressToLocation(AddressZero);
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("initial state", function () {
    it("should have no internal balances", async function () {
      expect(await nucleus.getTokenBalance(token1.address, user1InternalLocation)).eq(0);
      expect(await nucleus.getTokenBalance(token1.address, pool1001Location)).eq(0);
    });
    it("may have external balances", async function () {
      expect(await nucleus.getTokenBalance(token1.address, user1ExternalLocation)).eq(0);
      await token1.mint(user1.address, WeiPerEther.mul(10_000));
      expect(await nucleus.getTokenBalance(token1.address, user1ExternalLocation)).eq(WeiPerEther.mul(10_000));
    });
  });

  describe("invalid lookups", function () {
    it("cannot fetch token balance of nucleus as erc20", async function () {
      await expect(nucleus.getTokenBalance(nucleus.address, user1ExternalLocation)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot fetch token balance of invalid locations", async function () {
      await expect(nucleus.getTokenBalance(token1.address, addressZeroExternalLocation)).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.getTokenBalance(token1.address, addressZeroInternalLocation)).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.getTokenBalance(token1.address, nucleusExternalLocation)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.getTokenBalance(token1.address, nucleusInternalLocation)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.getTokenBalance(token1.address, INVALID_LOCATION_0)).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
      await expect(nucleus.getTokenBalance(token1.address, INVALID_LOCATION_6)).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
      await expect(nucleus.getTokenBalance(token1.address, INVALID_EXTERNAL_ADDRESS_LOCATION)).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
      await expect(nucleus.getTokenBalance(token1.address, INVALID_INTERNAL_ADDRESS_LOCATION)).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
  });

  // between address based locations
  describe("tokenTransfer part 1", function () {
    it("cannot transfer from external address that isn't msg.sender", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: user2ExternalLocation,
        dst: user1ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
    });
    it("cannot transfer from external address to self with insufficient balance", async function () {
      let bal = await nucleus.getTokenBalance(token1.address, user2ExternalLocation);
      await expect(nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: bal.add(1),
        src: user2ExternalLocation,
        dst: user2ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
    });
    it("cannot transfer from external address to other with insufficient balance", async function () {
      await token1.connect(user2).approve(nucleus.address, MaxUint256);
      let bal = await nucleus.getTokenBalance(token1.address, user2ExternalLocation);
      await expect(nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: bal.add(1),
        src: user2ExternalLocation,
        dst: user1ExternalLocation
      })).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot transfer from external address with insufficient allowance", async function () {
      let bal = await nucleus.getTokenBalance(token1.address, user1ExternalLocation);
      let allowance = await token1.allowance(user1.address, nucleus.address);
      let amount = allowance.add(1);
      expect(amount).lte(bal);
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: user1ExternalLocation,
        dst: user2ExternalLocation
      })).to.be.revertedWith("ERC20: insufficient allowance");
    });
    it("can transfer from external address to self", async function () {
      await token1.connect(user1).approve(nucleus.address, MaxUint256);
      let src = user1ExternalLocation;
      let dst = src;
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(2);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(0);
      expect(balNu1.sub(balNu2)).eq(0);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, src, amount);
      await expect(tx).to.not.emit(token1, "Transfer");
      expect(await nucleus.getTokenBalance(token1.address, user1InternalLocation)).to.eq(0);
      expect(await nucleus.getTokenBalance(token1.address, user2InternalLocation)).to.eq(0);
      l1DataFeeAnalyzer.register("tokenTransfer", tx);
    });
    it("can transfer from external address to external address", async function () {
      let src = user1ExternalLocation;
      let dst = user2ExternalLocation;
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(4);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu1.sub(balNu2)).eq(0);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
      await expect(tx).to.emit(token1, "Transfer").withArgs(user1.address, nucleus.address, amount);
      await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amount);
      expect(await nucleus.getTokenBalance(token1.address, user1InternalLocation)).to.eq(0);
      expect(await nucleus.getTokenBalance(token1.address, user2InternalLocation)).to.eq(0);
      l1DataFeeAnalyzer.register("tokenTransfer", tx);
    });
    it("can transfer from external address to internal address", async function () {
      let src = user1ExternalLocation;
      let dst = user2InternalLocation;
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(8);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu2.sub(balNu1)).eq(amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
      await expect(tx).to.emit(token1, "Transfer").withArgs(user1.address, nucleus.address, amount);
      expect(await nucleus.getTokenBalance(token1.address, user1InternalLocation)).to.eq(0);
      expect(await nucleus.getTokenBalance(token1.address, user2InternalLocation)).gt(0);
      l1DataFeeAnalyzer.register("tokenTransfer", tx);
    });
    it("can transfer from external address to nonexistant pool", async function () {
      // not a regular use case
      // allowed to save gas and avoid revert
      // these tokens may be locked forever, similar to raw erc20 transfer
      let src = user1ExternalLocation;
      let dst = HydrogenNucleusHelper.poolIDtoLocation(1);
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(16);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu2.sub(balNu1)).eq(amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
      await expect(tx).to.emit(token1, "Transfer").withArgs(user1.address, nucleus.address, amount);
      l1DataFeeAnalyzer.register("tokenTransfer", tx);
    });
    it("cannot transfer from internal address that isn't msg.sender", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: user2InternalLocation,
        dst: user1InternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
    });
    it("cannot transfer from internal address to self with insufficient balance", async function () {
      // setup user2 internal balance
      let depositAmount = WeiPerEther.mul(10_000);
      await token1.mint(user2.address, depositAmount);
      await token1.connect(user2).approve(nucleus.address, MaxUint256);
      await nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: depositAmount,
        src: user2ExternalLocation,
        dst: user2InternalLocation
      });
      // test
      let bal = await nucleus.getTokenBalance(token1.address, user2InternalLocation);
      let amount = bal.add(1);
      await expect(nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: user2InternalLocation,
        dst: user2InternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
    });
    it("cannot transfer from internal address to other with insufficient balance", async function () {
      let bal = await nucleus.getTokenBalance(token1.address, user2InternalLocation);
      let amount = bal.add(1);
      await expect(nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: user2InternalLocation,
        dst: user1ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
    });
    it("can transfer from internal address to self", async function () {
      let src = user2InternalLocation;
      let dst = src;
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(32);
      let tx = await nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(0);
      expect(balNu2.sub(balNu1)).eq(0);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
      await expect(tx).to.not.emit(token1, "Transfer");
      l1DataFeeAnalyzer.register("tokenTransfer", tx);
    });
    it("can transfer from internal address to external address", async function () {
      let src = user2InternalLocation;
      let dst = user3ExternalLocation;
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(64);
      let tx = await nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu1.sub(balNu2)).eq(amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
      await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user3.address, amount);
      l1DataFeeAnalyzer.register("tokenTransfer", tx);
    });
    it("can transfer from internal address to internal address", async function () {
      let src = user2InternalLocation;
      let dst = user1InternalLocation;
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(128);
      let tx = await nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu2.sub(balNu1)).eq(0);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
      await expect(tx).to.not.emit(token1, "Transfer");
      l1DataFeeAnalyzer.register("tokenTransfer", tx);
    });
    it("can transfer from internal address to nonexistant pool", async function () {
      // not a regular use case
      // allowed to save gas and avoid revert
      // these tokens may be locked forever, similar to raw erc20 transfer
      let src = user2InternalLocation;
      let dst = HydrogenNucleusHelper.poolIDtoLocation(1);
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(256);
      let tx = await nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu1.sub(balNu2)).eq(0);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
      await expect(tx).to.not.emit(token1, "Transfer");
      l1DataFeeAnalyzer.register("tokenTransfer", tx);
    });
    it("cannot transfer to invalid external address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: user1ExternalLocation,
        dst: INVALID_EXTERNAL_ADDRESS_LOCATION
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
    it("cannot transfer to invalid internal address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: user1ExternalLocation,
        dst: INVALID_INTERNAL_ADDRESS_LOCATION
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
    it("cannot transfer to external address zero", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: user1ExternalLocation,
        dst: addressZeroExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot transfer to internal address zero", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: user1ExternalLocation,
        dst: addressZeroInternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot transfer from nonexistant pool", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.poolIDtoLocation(1),
        dst: user1ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("cannot transfer from invalid location type", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: INVALID_LOCATION_6,
        dst: user1ExternalLocation,
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("cannot transfer to invalid location type", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: user1ExternalLocation,
        dst: INVALID_LOCATION_6
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("cannot transfer between invalid location types", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: INVALID_LOCATION_6,
        dst: INVALID_LOCATION_6
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("cannot transfer not contract 1", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: user1.address,
        amount: 0,
        src: user1ExternalLocation,
        dst: user1ExternalLocation
      })).to.be.reverted;
    });
    /* // no external call, but only works with zero amount
    it("cannot transfer not contract 2", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: user1.address,
        amount: 0,
        src: user1InternalLocation,
        dst: user1InternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    */
    it("cannot transfer not contract 3", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: user1.address,
        amount: 0,
        src: user1ExternalLocation,
        dst: user1InternalLocation
      })).to.be.reverted;
    });
    it("cannot transfer not contract 4", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: user1.address,
        amount: 0,
        src: user1InternalLocation,
        dst: user1ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot transfer not contract 5", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: user1.address,
        amount: 0,
        src: user1ExternalLocation,
        dst: user2ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot transfer not erc20 1", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: swapCallee1.address,
        amount: 0,
        src: user1ExternalLocation,
        dst: user1ExternalLocation
      })).to.be.reverted;
    });
    /* // no external call, but only works with zero amount
    it("cannot transfer not erc20 2", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: swapCallee1.address,
        amount: 0,
        src: user1InternalLocation,
        dst: user1InternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    */
    it("cannot transfer not erc20 3", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: swapCallee1.address,
        amount: 0,
        src: user1ExternalLocation,
        dst: user1InternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot transfer not erc20 4", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: swapCallee1.address,
        amount: 0,
        src: user1InternalLocation,
        dst: user1ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("can transfer nonstandard token 1", async function () {
      await nonstandardToken1.mint(user1.address, WeiPerEther.mul(10));
      await nonstandardToken1.connect(user1).approve(nucleus.address, MaxUint256);
      let src = user1ExternalLocation;
      let dst = user2InternalLocation;
      let balSrc1 = await nucleus.getTokenBalance(nonstandardToken1.address, src);
      let balDst1 = await nucleus.getTokenBalance(nonstandardToken1.address, dst);
      let balNu1 = await nonstandardToken1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(8);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: nonstandardToken1.address,
        amount: amount,
        src: src,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(nonstandardToken1.address, src);
      let balDst2 = await nucleus.getTokenBalance(nonstandardToken1.address, dst);
      let balNu2 = await nonstandardToken1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu2.sub(balNu1)).eq(amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(nonstandardToken1.address, src, dst, amount);
      await expect(tx).to.emit(nonstandardToken1, "Transfer").withArgs(user1.address, nucleus.address, amount);
      l1DataFeeAnalyzer.register("tokenTransfer", tx);
    });
    it("cannot transfer nonstandard token 2", async function () {
      await nonstandardToken2.mint(user1.address, WeiPerEther);
      await nonstandardToken2.connect(user1).approve(nucleus.address, MaxUint256);
      await expect(nucleus.connect(user1).tokenTransfer({
        token: nonstandardToken2.address,
        amount: 1,
        src: user1ExternalLocation,
        dst: user1InternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot transfer nonstandard token 3", async function () {
      await nonstandardToken3.mint(user1.address, WeiPerEther);
      await nonstandardToken3.connect(user1).approve(nucleus.address, MaxUint256);
      await expect(nucleus.connect(user1).tokenTransfer({
        token: nonstandardToken3.address,
        amount: 1,
        src: user1ExternalLocation,
        dst: user1InternalLocation
      })).to.be.revertedWith("MockERC20NoReturnsRevertWithError: revert");
    });
    it("cannot transfer nonstandard token 4", async function () {
      await nonstandardToken4.mint(user1.address, WeiPerEther);
      await nonstandardToken4.connect(user1).approve(nucleus.address, MaxUint256);
      await expect(nucleus.connect(user1).tokenTransfer({
        token: nonstandardToken4.address,
        amount: 1,
        src: user1ExternalLocation,
        dst: user1InternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot transfer address zero as erc20 1", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: AddressZero,
        amount: 0,
        src: user1ExternalLocation,
        dst: user1ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot transfer address zero as erc20 2", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: AddressZero,
        amount: 0,
        src: user1InternalLocation,
        dst: user1InternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot transfer nucleus as erc20 1", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: nucleus.address,
        amount: 0,
        src: user1ExternalLocation,
        dst: user1ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer nucleus as erc20 2", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: nucleus.address,
        amount: 0,
        src: user1InternalLocation,
        dst: user1InternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer from nucleus external address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: nucleusExternalLocation,
        dst: user1ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer from nucleus internal address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: nucleusInternalLocation,
        dst: user1ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer from external address to nucleus external address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: user1ExternalLocation,
        dst: nucleusExternalLocation,
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer from external address to nucleus internal address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: user1ExternalLocation,
        dst: nucleusInternalLocation,
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer from internal address to nucleus external address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: user1InternalLocation,
        dst: nucleusExternalLocation,
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer from internal address to nucleus internal address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: user1InternalLocation,
        dst: nucleusInternalLocation,
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("can transfer multiple times using multicall", async function () {
      let src = user2InternalLocation;
      let dst1 = user3InternalLocation;
      let dst2 = user4InternalLocation;
      let dst3 = user5InternalLocation;
      let amount1 = WeiPerEther.mul(10);
      let amount2 = WeiPerEther.mul(11);
      let amount3 = WeiPerEther.mul(12);
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst11 = await nucleus.getTokenBalance(token1.address, dst1);
      let balDst12 = await nucleus.getTokenBalance(token1.address, dst2);
      let balDst13 = await nucleus.getTokenBalance(token1.address, dst3);
      let txdata1 = nucleus.interface.encodeFunctionData("tokenTransfer", [{
        token: token1.address,
        amount: amount1,
        src: src,
        dst: dst1
      }]);
      let txdata2 = nucleus.interface.encodeFunctionData("tokenTransfer", [{
        token: token1.address,
        amount: amount2,
        src: src,
        dst: dst2
      }]);
      let txdata3 = nucleus.interface.encodeFunctionData("tokenTransfer", [{
        token: token1.address,
        amount: amount3,
        src: src,
        dst: dst3
      }]);
      let tx = await nucleus.connect(user2).multicall([txdata1, txdata2, txdata3]);
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst21 = await nucleus.getTokenBalance(token1.address, dst1);
      let balDst22 = await nucleus.getTokenBalance(token1.address, dst2);
      let balDst23 = await nucleus.getTokenBalance(token1.address, dst3);
      expect(balSrc1.sub(balSrc2)).eq(amount1.add(amount2).add(amount3));
      expect(balDst21.sub(balDst11)).eq(amount1);
      expect(balDst22.sub(balDst12)).eq(amount2);
      expect(balDst23.sub(balDst13)).eq(amount3);
      await expect(tx).to.not.emit(token1, "Transfer");
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst1, amount1);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst2, amount2);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst3, amount3);
      l1DataFeeAnalyzer.register("multicall", tx);
    });
    it("can get balance of flag location address types", async function () {
      for(const user of [owner, user1, user2, user3]) {
        let balE1 = await token1.balanceOf(user.address);
        let balE2 = await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.externalAddressToLocation(user.address));
        let balE3 = await nucleus.connect(user).getTokenBalance(token1.address, HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS);
        expect(balE1).eq(balE2);
        expect(balE2).eq(balE3);
        let balI2 = await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user.address));
        let balI3 = await nucleus.connect(user).getTokenBalance(token1.address, HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS);
        expect(balI2).eq(balI3);
      }
    });
    it("cannot get balance of flag location pool types", async function () {
      await expect(nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.LOCATION_FLAG_POOL)).to.be.revertedWithCustomError(nucleus, "HydrogenMissingPoolContext");
    });
  });

  // with pool based locations
  describe("tokenTransfer part 2", function () {
    before("create pools", async function () {
      await token1.connect(user1).mint(user1.address, WeiPerEther.mul(100));
      await token1.connect(user1).approve(nucleus.address, MaxUint256);
      await token2.connect(user2).mint(user2.address, WeiPerEther.mul(5));
      await token2.connect(user2).approve(nucleus.address, MaxUint256);
      // 1001
      await nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: WeiPerEther.mul(100),
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: user1ExternalLocation,
        locationB: user1ExternalLocation,
        hptReceiver: user1.address
      });
      // 2001
      await nucleus.connect(user2).createLimitOrderPool({
        tokenA: token2.address,
        tokenB: token3.address,
        amountA: WeiPerEther.mul(5),
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: user2ExternalLocation,
        locationB: user2ExternalLocation,
        hptReceiver: user2.address
      });
    });
    it("cannot transfer from nonexistant pool", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.poolIDtoLocation(1),
        dst: user1ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("cannot transfer from pool that is not yours", async function () {
      await expect(nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.poolIDtoLocation(1001),
        dst: user2ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
    });
    it("cannot transfer from pool to self with insufficient balance", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: (await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.poolIDtoLocation(1001))).add(1),
        src: HydrogenNucleusHelper.poolIDtoLocation(1001),
        dst: HydrogenNucleusHelper.poolIDtoLocation(1001)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
    });
    it("cannot transfer from pool to other with insufficient balance", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: (await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.poolIDtoLocation(1001))).add(1),
        src: HydrogenNucleusHelper.poolIDtoLocation(1001),
        dst: HydrogenNucleusHelper.poolIDtoLocation(2001)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
    });
    it("can transfer from pool to self", async function () {
      let poolID = 1001;
      let src = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let dst = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amount = 33;
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      expect(balSrc1).gte(amount);
      expect(balSrc1).eq(balDst1);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc2.sub(balSrc1)).eq(0);
      expect(balDst2.sub(balDst1)).eq(0);
      expect(balNu2.sub(balNu1)).eq(0);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
      await expect(tx).to.not.emit(token1, "Transfer");
      l1DataFeeAnalyzer.register("tokenTransfer", tx);
    });
    it("can transfer from pool to external balance", async function () {
      let poolID = 1001;
      let src = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let dst = user2ExternalLocation;
      let amount = 34;
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      expect(balSrc1).gte(amount);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu1.sub(balNu2)).eq(amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
      await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amount);
      l1DataFeeAnalyzer.register("tokenTransfer", tx);
    });
    it("can transfer from pool to internal balance", async function () {
      let poolID = 1001;
      let src = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let dst = user2InternalLocation;
      let amount = 35;
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      expect(balSrc1).gte(amount);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu1.sub(balNu2)).eq(0);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
      await expect(tx).to.not.emit(token1, "Transfer");
      l1DataFeeAnalyzer.register("tokenTransfer", tx);
    });
    it("can transfer from pool to other pool", async function () {
      let fromPoolID = 1001;
      let toPoolID = 2001;
      let src = HydrogenNucleusHelper.poolIDtoLocation(fromPoolID);
      let dst = HydrogenNucleusHelper.poolIDtoLocation(toPoolID);
      let amount = 36;
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      expect(balSrc1).gte(amount);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu1.sub(balNu2)).eq(0);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
      await expect(tx).to.not.emit(token1, "Transfer");
      l1DataFeeAnalyzer.register("tokenTransfer", tx);
    });
    it("only pool owner can withdraw funds", async function () {
      let poolID = 2001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let owner1 = await nucleus.ownerOf(poolID);
      expect(owner1).eq(user2.address);
      // user2 is allowed, user3 is not
      await expect(nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: poolLocation,
        dst: user2InternalLocation
      })).to.not.be.reverted;
      await expect(nucleus.connect(user3).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: poolLocation,
        dst: user3InternalLocation
      })).to.be.reverted;
      // transfer hpt
      let tx1 = await nucleus.connect(user2).transferFrom(user2.address, user3.address, poolID);
      await expect(tx1).to.emit(nucleus, "Transfer").withArgs(user2.address, user3.address, poolID);
      let owner2 = await nucleus.ownerOf(poolID);
      expect(owner2).eq(user3.address);
      // user3 is allowed, user2 is not
      await expect(nucleus.connect(user3).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: poolLocation,
        dst: user3InternalLocation
      })).to.not.be.reverted;
      await expect(nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: poolLocation,
        dst: user2InternalLocation
      })).to.be.reverted;
    });
  });

  // between address based locations using short functions
  describe("tokenTransfer part 3", function () {
    it("can transfer tokens in", async function () {
      let balE1 = await nucleus.getTokenBalance(token1.address, user1ExternalLocation);
      let balI1 = await nucleus.getTokenBalance(token1.address, user1InternalLocation);
      expect(balE1).gt(10);
      let amount = balE1.sub(3);
      let tx = await nucleus.connect(user1).tokenTransferIn({
        token: token1.address,
        amount: amount
      });
      let balE2 = await nucleus.getTokenBalance(token1.address, user1ExternalLocation);
      let balI2 = await nucleus.getTokenBalance(token1.address, user1InternalLocation);
      expect(balE1.sub(balE2)).eq(amount);
      expect(balI2.sub(balI1)).eq(amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, user1ExternalLocation, user1InternalLocation, amount);
      l1DataFeeAnalyzer.register("tokenTransferIn", tx);
    });
    it("can transfer tokens out", async function () {
      let balE1 = await nucleus.getTokenBalance(token1.address, user1ExternalLocation);
      let balI1 = await nucleus.getTokenBalance(token1.address, user1InternalLocation);
      expect(balI1).gt(10);
      let amount = balI1.sub(5);
      let tx = await nucleus.connect(user1).tokenTransferOut({
        token: token1.address,
        amount: amount
      });
      let balE2 = await nucleus.getTokenBalance(token1.address, user1ExternalLocation);
      let balI2 = await nucleus.getTokenBalance(token1.address, user1InternalLocation);
      expect(balE2.sub(balE1)).eq(amount);
      expect(balI1.sub(balI2)).eq(amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, user1InternalLocation, user1ExternalLocation, amount);
      l1DataFeeAnalyzer.register("tokenTransferOut", tx);
    });
    it("cannot transfer address zero as erc20 in", async function () {
      await expect(nucleus.connect(user1).tokenTransferIn({
        token: AddressZero,
        amount: 0
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot transfer address zero as erc20 out", async function () {
      await expect(nucleus.connect(user1).tokenTransferOut({
        token: AddressZero,
        amount: 0
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot transfer nucleus as erc20 in", async function () {
      await expect(nucleus.connect(user1).tokenTransferIn({
        token: nucleus.address,
        amount: 0
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer nucleus as erc20 out", async function () {
      await expect(nucleus.connect(user1).tokenTransferOut({
        token: nucleus.address,
        amount: 0
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
  });

  describe("L1 gas fees", function () {
    it("calculate", async function () {
      l1DataFeeAnalyzer.analyze()
    });
  });
});
