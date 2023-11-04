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

describe("HydrogenNucleus-core", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let user4: SignerWithAddress;
  let user5: SignerWithAddress;

  let nucleus: HydrogenNucleus;

  let swapCallee1: MockFlashSwapCallee1;
  let swapCallee2: MockFlashSwapCallee2;
  let swapCallee3: MockFlashSwapCallee3;
  let swapCallee4: MockFlashSwapCallee4;
  let swapCallee5: MockFlashSwapCallee5;
  let swapCallee6: MockFlashSwapCallee6;
  let swapCallee7: MockFlashSwapCallee7;
  let swapCallee8: MockFlashSwapCallee8;

  let token1: MockERC20;
  let token2: MockERC20;
  let token3: MockERC20;
  let tokens:any[] = [];
  let nonstandardToken1: MockERC20NoReturnsSuccess;
  let nonstandardToken2: MockERC20NoReturnsRevert;
  let nonstandardToken3: MockERC20NoReturnsRevertWithError;
  let nonstandardToken4: MockERC20SuccessFalse;

  let chainID: number;
  let networkSettings: any;
  let snapshot: BN;

  before(async function () {
    [deployer, owner, user1, user2, user3, user4, user5] = await ethers.getSigners();
    chainID = (await provider.getNetwork()).chainId;
    networkSettings = getNetworkSettings(chainID);
    if(!networkSettings.isTestnet) throw new Error("Do not run tests on production networks");
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    while(tokens.length < 21) {
      let token = await deployContract(deployer, "MockERC20", [`Token${tokens.length+1}`, `TKN${tokens.length+1}`, 18]) as MockERC20;
      tokens.push(token);
    }
    [token1, token2, token3] = tokens;

    nonstandardToken1 = await deployContract(deployer, "MockERC20NoReturnsSuccess", [`NonstandardToken1`, `NSTKN1`, 18]) as MockERC20NoReturnsSuccess;
    nonstandardToken2 = await deployContract(deployer, "MockERC20NoReturnsRevert", [`NonstandardToken2`, `NSTKN2`, 18]) as MockERC20NoReturnsRevert;
    nonstandardToken3 = await deployContract(deployer, "MockERC20NoReturnsRevertWithError", [`NonstandardToken3`, `NSTKN3`, 18]) as MockERC20NoReturnsRevertWithError;
    nonstandardToken4 = await deployContract(deployer, "MockERC20SuccessFalse", [`NonstandardToken4`, `NSTKN4`, 18]) as MockERC20SuccessFalse;
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("should deploy successfully", async function () {
      nucleus = await deployContract(deployer, "HydrogenNucleus", [owner.address]) as HydrogenNucleus;
    });
    it("should deploy callback contracts", async function () {
      swapCallee1 = await deployContract(deployer, "MockFlashSwapCallee1", [nucleus.address]) as MockFlashSwapCallee1;
      swapCallee2 = await deployContract(deployer, "MockFlashSwapCallee2", [nucleus.address]) as MockFlashSwapCallee2;
      swapCallee3 = await deployContract(deployer, "MockFlashSwapCallee3", [nucleus.address]) as MockFlashSwapCallee3;
      swapCallee4 = await deployContract(deployer, "MockFlashSwapCallee4", [nucleus.address]) as MockFlashSwapCallee4;
      swapCallee5 = await deployContract(deployer, "MockFlashSwapCallee5", [nucleus.address]) as MockFlashSwapCallee5;
      swapCallee6 = await deployContract(deployer, "MockFlashSwapCallee6", [nucleus.address]) as MockFlashSwapCallee6;
      swapCallee7 = await deployContract(deployer, "MockFlashSwapCallee7", [nucleus.address]) as MockFlashSwapCallee7;
      swapCallee8 = await deployContract(deployer, "MockFlashSwapCallee8", [nucleus.address]) as MockFlashSwapCallee8;
    });
  });

  describe("initial state", function () {
    it("should have no pools", async function () {
      expect(await nucleus.totalSupply()).eq(0);
      expect(await nucleus.balanceOf(user1.address)).eq(0);
      expect(await nucleus.exists(0)).eq(false);
      expect(await nucleus.exists(1)).eq(false);
      await expect(nucleus.ownerOf(0)).to.be.reverted;
      await expect(nucleus.getPoolType(0)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.getPoolType(1)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.getLimitOrderPool(0)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.getGridOrderPool(0)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.getTradeRequest(0, token1.address, token2.address)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("may have external token balances", async function () {
      expect(await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.externalAddressToLocation(user1.address))).to.eq(0);
      let amount = WeiPerEther.mul(10_000);
      await token1.mint(user1.address, amount);
      expect(await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.externalAddressToLocation(user1.address))).to.eq(amount);
    });
    it("should have no internal token balances", async function () {
      await expect(nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user1.address))).to.not.be.reverted;
      expect(await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user1.address))).to.eq(0);
      await expect(nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.poolIDtoLocation(0))).to.not.be.reverted;
      expect(await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.poolIDtoLocation(0))).to.eq(0);
    });
    it("cannot fetch token balance of nucleus as erc20", async function () {
      await expect(nucleus.getTokenBalance(nucleus.address, HydrogenNucleusHelper.externalAddressToLocation(user1.address))).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot fetch token balance of invalid locations", async function () {
      await expect(nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.externalAddressToLocation(AddressZero))).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(AddressZero))).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.externalAddressToLocation(nucleus.address))).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(nucleus.address))).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.getTokenBalance(token1.address, INVALID_LOCATION_0)).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
      await expect(nucleus.getTokenBalance(token1.address, INVALID_LOCATION_6)).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
      await expect(nucleus.getTokenBalance(token1.address, INVALID_EXTERNAL_ADDRESS_LOCATION)).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
      await expect(nucleus.getTokenBalance(token1.address, INVALID_INTERNAL_ADDRESS_LOCATION)).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
    it("should not be reenterred", async function() {
      expect(await nucleus.reentrancyGuardState()).eq(1);
    });
  });

  describe("tokenTransfer part 1", function () {
    it("cannot transfer from external address that isn't msg.sender", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: HydrogenNucleusHelper.externalAddressToLocation(user2.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
    });
    it("cannot transfer from external address to self with insufficient balance", async function () {
      let bal = await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.externalAddressToLocation(user2.address));
      await expect(nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: bal.add(1),
        src: HydrogenNucleusHelper.externalAddressToLocation(user2.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user2.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
    });
    it("cannot transfer from external address to other with insufficient balance", async function () {
      await token1.connect(user2).approve(nucleus.address, MaxUint256);
      let bal = await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.externalAddressToLocation(user2.address));
      await expect(nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: bal.add(1),
        src: HydrogenNucleusHelper.externalAddressToLocation(user2.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot transfer from external address with insufficient allowance", async function () {
      let bal = await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.externalAddressToLocation(user1.address));
      let allowance = await token1.allowance(user1.address, nucleus.address);
      let amount = allowance.add(1);
      expect(amount).lte(bal);
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user2.address)
      })).to.be.revertedWith("ERC20: insufficient allowance");
    });
    it("can transfer from external address to self", async function () {
      await token1.connect(user1).approve(nucleus.address, MaxUint256);
      let src = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
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
      expect(await token1.balanceOf(nucleus.address)).to.eq(0);
      expect(await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user1.address))).to.eq(0);
      expect(await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user2.address))).to.eq(0);
    });
    it("can transfer from external address to external address", async function () {
      let src = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let dst = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
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
      expect(await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user1.address))).to.eq(0);
      expect(await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user2.address))).to.eq(0);
    });
    it("can transfer from external address to internal address", async function () {
      let src = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let dst = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
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
      expect(await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user1.address))).to.eq(0);
      expect(await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user2.address))).gt(0);
    });
    it("can transfer from external address to nonexistant pool", async function () {
      // not a regular use case
      // allowed to avoid revert
      // these tokens may be locked forever, similar to raw erc20 transfer
      let src = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
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
    });
    it("cannot transfer from internal address that isn't msg.sender", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: HydrogenNucleusHelper.internalAddressToLocation(user2.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(user1.address)
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
        src: HydrogenNucleusHelper.externalAddressToLocation(user2.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(user2.address)
      });
      // test
      let bal = await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user2.address));
      let amount = bal.add(1);
      await expect(nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: HydrogenNucleusHelper.internalAddressToLocation(user2.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(user2.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
    });
    it("cannot transfer from internal address to other with insufficient balance", async function () {
      let bal = await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user2.address));
      let amount = bal.add(1);
      await expect(nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: HydrogenNucleusHelper.internalAddressToLocation(user2.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
    });
    it("can transfer from internal address to self", async function () {
      let src = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
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
    });
    it("can transfer from internal address to external address", async function () {
      let src = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let dst = HydrogenNucleusHelper.externalAddressToLocation(user3.address);
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
    });
    it("can transfer from internal address to internal address", async function () {
      let src = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let dst = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
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
    });
    it("can transfer from internal address to nonexistant pool", async function () {
      // not a regular use case
      // allowed to avoid revert
      // these tokens may be locked forever, similar to raw erc20 transfer
      let src = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
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
    });
    it("cannot transfer to invalid external address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: INVALID_EXTERNAL_ADDRESS_LOCATION
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
    it("cannot transfer to invalid internal address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: INVALID_INTERNAL_ADDRESS_LOCATION
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
    it("cannot transfer to external address zero", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(AddressZero)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot transfer to internal address zero", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(AddressZero)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot transfer from nonexistant pool", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.poolIDtoLocation(1),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("cannot transfer from invalid location type", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: INVALID_LOCATION_6,
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("cannot transfer to invalid location type", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
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
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.reverted;
    });
    /* // no external call, but only works with zero amount
    it("cannot transfer not contract 2", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: user1.address,
        amount: 0,
        src: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    */
    it("cannot transfer not contract 3", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: user1.address,
        amount: 0,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(user1.address)
      })).to.be.reverted;
    });
    it("cannot transfer not contract 4", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: user1.address,
        amount: 0,
        src: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot transfer not contract 5", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: user1.address,
        amount: 0,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user2.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot transfer not erc20 1", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: swapCallee1.address,
        amount: 0,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.reverted;
    });
    /* // no external call, but only works with zero amount
    it("cannot transfer not erc20 2", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: swapCallee1.address,
        amount: 0,
        src: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    */
    it("cannot transfer not erc20 3", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: swapCallee1.address,
        amount: 0,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot transfer not erc20 4", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: swapCallee1.address,
        amount: 0,
        src: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("can transfer nonstandard token 1", async function () {
      await nonstandardToken1.mint(user1.address, WeiPerEther.mul(10));
      await nonstandardToken1.connect(user1).approve(nucleus.address, MaxUint256);
      let src = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let dst = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
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
    });
    it("cannot transfer nonstandard token 2", async function () {
      await nonstandardToken2.mint(user1.address, WeiPerEther);
      await nonstandardToken2.connect(user1).approve(nucleus.address, MaxUint256);
      await expect(nucleus.connect(user1).tokenTransfer({
        token: nonstandardToken2.address,
        amount: 1,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot transfer nonstandard token 3", async function () {
      await nonstandardToken3.mint(user1.address, WeiPerEther);
      await nonstandardToken3.connect(user1).approve(nucleus.address, MaxUint256);
      await expect(nucleus.connect(user1).tokenTransfer({
        token: nonstandardToken3.address,
        amount: 1,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(user1.address)
      })).to.be.revertedWith("MockERC20NoReturnsRevertWithError: revert");
    });
    it("cannot transfer nonstandard token 4", async function () {
      await nonstandardToken4.mint(user1.address, WeiPerEther);
      await nonstandardToken4.connect(user1).approve(nucleus.address, MaxUint256);
      await expect(nucleus.connect(user1).tokenTransfer({
        token: nonstandardToken4.address,
        amount: 1,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot transfer nucleus as erc20", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: nucleus.address,
        amount: 0,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer from nucleus external address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: HydrogenNucleusHelper.externalAddressToLocation(nucleus.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer from nucleus internal address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: HydrogenNucleusHelper.internalAddressToLocation(nucleus.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer from external address to nucleus external address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(nucleus.address),
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer from external address to nucleus internal address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(nucleus.address),
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer from internal address to nucleus external address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(nucleus.address),
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot transfer from internal address to nucleus internal address", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 0,
        src: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(nucleus.address),
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("can transfer multiple times using multicall", async function () {
      let src = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let dst1 = HydrogenNucleusHelper.internalAddressToLocation(user3.address);
      let dst2 = HydrogenNucleusHelper.internalAddressToLocation(user4.address);
      let dst3 = HydrogenNucleusHelper.internalAddressToLocation(user5.address);
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

  describe("createLimitOrderPool", function () {
    before("mint", async function () {
      await token1.mint(user1.address, WeiPerEther.mul(10000));
    });
    it("cannot create limit order using not contract as erc20", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: user1.address,
        tokenB: token1.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot create limit order using not token as erc20", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: swapCallee1.address,
        tokenB: token1.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot create limit order using nucleus as erc20", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: nucleus.address,
        tokenB: token1.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: nucleus.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot create limit order using same token", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token1.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSameToken");
    });
    it("cannot create limit order using funds from external address that isn't msg.sender", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user2.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
    });
    it("cannot create limit order using funds from internal address that isn't msg.sender", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.internalAddressToLocation(user2.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
    });
    it("cannot create limit order using funds from external address with insufficient balance", async function () {
      let balance = await token2.balanceOf(user1.address);
      await token2.connect(user1).approve(nucleus.address, MaxUint256);
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token2.address,
        tokenB: token1.address,
        amountA: balance.add(1),
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot create limit order using funds from external address with insufficient allowance", async function () {
      await token2.mint(user1.address, WeiPerEther);
      await token2.connect(user1).approve(nucleus.address, 0);
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token2.address,
        tokenB: token1.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWith("ERC20: insufficient allowance");
    });
    it("cannot create limit order using funds from internal address with insufficient balance", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token2.address,
        tokenB: token1.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
    });
    it("cannot create limit order from invalid location type", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: INVALID_LOCATION_6,
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("cannot create limit order to invalid location type", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: INVALID_LOCATION_6,
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("cannot create limit order from invalid external address", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: INVALID_EXTERNAL_ADDRESS_LOCATION,
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
    it("cannot create limit order to invalid external address", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: INVALID_EXTERNAL_ADDRESS_LOCATION,
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
    it("cannot create limit order to external address zero", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(AddressZero),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot create limit order from invalid internal address", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: INVALID_INTERNAL_ADDRESS_LOCATION,
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
    it("cannot create limit order to invalid internal address", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: INVALID_INTERNAL_ADDRESS_LOCATION,
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
    it("cannot create limit order to internal address zero", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(AddressZero),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot create more than max num pools", async function () {
      // set totalSupply incredibly high to force revert
      let ts1 = await nucleus.totalSupply();
      // set
      let slotIndex = toBytes32(0);
      let desiredLength = toBytes32(BN.from(2).pow(248).div(1000));
      await setStorageAt(nucleus.address, slotIndex, desiredLength);
      let ts2 = await nucleus.totalSupply();
      expect(ts2).eq(desiredLength);
      // test
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenMaxPoolCount");
      // reset
      await setStorageAt(nucleus.address, slotIndex, toBytes32(ts1));
      let ts3 = await nucleus.totalSupply();
      expect(ts3).eq(ts1);
    });
    it("can create limit order 1", async function () {
      // from external address to external address
      let poolID = 1001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(100);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(1, 1);
      let locationA = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let locationB = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      expect(await nucleus.totalSupply()).eq(0);
      expect(await nucleus.balanceOf(user1.address)).eq(0);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate,
        locationA: locationA,
        locationB: locationB,
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createLimitOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createLimitOrderPool(params);
      expect(await nucleus.totalSupply()).eq(1);
      expect(await nucleus.balanceOf(user1.address)).eq(1);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(1);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(token1.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.amountA).eq(amountA);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest.amountA).eq(amountA);
      expect(tradeRequest.exchangeRate).eq(exchangeRate);
      expect(tradeRequest.locationB).eq(locationB);
      expect(await nucleus.getTokenBalance(token1.address, poolLocation)).eq(amountA);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user1.address);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(amountA);
      expect(balEA1.sub(balEA2)).eq(amountA);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.emit(token1, "Transfer").withArgs(user1.address, nucleus.address, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, params.locationB);
    });
    it("can create limit order 2", async function () {
      // from external address to internal address
      let poolID = 2001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(200);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(16, 100);
      let locationA = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let locationB = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      expect(await nucleus.totalSupply()).eq(1);
      expect(await nucleus.balanceOf(user1.address)).eq(1);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate,
        locationA: locationA,
        locationB: locationB,
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createLimitOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createLimitOrderPool(params);
      expect(await nucleus.totalSupply()).eq(2);
      expect(await nucleus.balanceOf(user1.address)).eq(2);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(1);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(token1.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.amountA).eq(amountA);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest.amountA).eq(amountA);
      expect(tradeRequest.exchangeRate).eq(exchangeRate);
      expect(tradeRequest.locationB).eq(locationB);
      expect(await nucleus.getTokenBalance(token1.address, poolLocation)).eq(amountA);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user1.address);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(amountA);
      expect(balEA1.sub(balEA2)).eq(amountA);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.emit(token1, "Transfer").withArgs(user1.address, nucleus.address, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, params.locationB);
    });
    it("can create limit order 3", async function () {
      expect(await nucleus.reentrancyGuardState()).eq(1);
      // from internal address to external address
      let poolID = 3001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(400);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(0, 0);
      let locationA = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let locationB = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      expect(await nucleus.totalSupply()).eq(2);
      expect(await nucleus.balanceOf(user2.address)).eq(0);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user2.address);
      let balIA1 = await nucleus.getTokenBalance(token1.address, locationA);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate,
        locationA: locationA,
        locationB: locationB,
        hptReceiver: user2.address
      };
      let poolIDout = await nucleus.connect(user2).callStatic.createLimitOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user2).createLimitOrderPool(params);
      expect(await nucleus.totalSupply()).eq(3);
      expect(await nucleus.balanceOf(user2.address)).eq(1);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user2.address);
      expect(await nucleus.getPoolType(poolID)).eq(1);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(token1.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.amountA).eq(amountA);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest.amountA).eq(amountA);
      expect(tradeRequest.exchangeRate).eq(exchangeRate);
      expect(tradeRequest.locationB).eq(locationB);
      expect(await nucleus.getTokenBalance(token1.address, poolLocation)).eq(amountA);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user2.address);
      let balIA2 = await nucleus.getTokenBalance(token1.address, locationA);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(0);
      expect(balEA1.sub(balEA2)).eq(0);
      expect(balIA1.sub(balIA2)).eq(amountA);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user2.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.not.emit(token1, "Transfer");
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, params.locationB);
    });
    it("can create limit order 4", async function () {
      expect(await nucleus.reentrancyGuardState()).eq(1);
      // from other pool to another pool
      // mint hpt to other user
      let fromPoolID = 3001;
      let toPoolID = 1001;
      let newPoolID = 4001;
      let fromPoolLocation = HydrogenNucleusHelper.poolIDtoLocation(fromPoolID);
      let toPoolLocation = HydrogenNucleusHelper.poolIDtoLocation(toPoolID);
      let newPoolLocation = HydrogenNucleusHelper.poolIDtoLocation(newPoolID);
      let amountA = WeiPerEther.mul(50);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(102, 100);
      let locationA = fromPoolLocation;
      let locationB = toPoolLocation;
      expect(await nucleus.totalSupply()).eq(3);
      expect(await nucleus.balanceOf(user2.address)).eq(1);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.exists(newPoolID)).eq(false);
      await expect(nucleus.ownerOf(newPoolID)).to.be.reverted;
      await expect(nucleus.getPoolType(newPoolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(newPoolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(newPoolID, token1.address, token2.address)).to.be.reverted
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user2.address);
      let balIA1 = await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user2.address));
      let balPLf1 = await nucleus.getTokenBalance(token1.address, fromPoolLocation);
      let balPLt1 = await nucleus.getTokenBalance(token1.address, toPoolLocation);
      let balPLn1 = await nucleus.getTokenBalance(token1.address, newPoolLocation);
      let params = {
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate,
        locationA: locationA,
        locationB: locationB,
        hptReceiver: user3.address
      };
      let poolIDout = await nucleus.connect(user2).callStatic.createLimitOrderPool(params);
      expect(poolIDout).eq(newPoolID);
      let tx = await nucleus.connect(user2).createLimitOrderPool(params);
      expect(await nucleus.totalSupply()).eq(4);
      expect(await nucleus.balanceOf(user2.address)).eq(1);
      expect(await nucleus.balanceOf(user3.address)).eq(1);
      expect(await nucleus.exists(newPoolID)).eq(true);
      expect(await nucleus.ownerOf(newPoolID)).eq(user3.address);
      expect(await nucleus.getPoolType(newPoolID)).eq(1);
      let pool = await nucleus.getLimitOrderPool(newPoolID);
      expect(pool.tokenA).eq(token1.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.amountA).eq(amountA);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      let tradeRequest = await nucleus.getTradeRequest(newPoolID, token1.address, token2.address);
      expect(tradeRequest.amountA).eq(amountA);
      expect(tradeRequest.exchangeRate).eq(exchangeRate);
      expect(tradeRequest.locationB).eq(locationB);
      expect(await nucleus.getTokenBalance(token1.address, newPoolLocation)).eq(amountA);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user2.address);
      let balIA2 = await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user2.address));
      let balPLf2 = await nucleus.getTokenBalance(token1.address, fromPoolLocation);
      let balPLt2 = await nucleus.getTokenBalance(token1.address, toPoolLocation);
      let balPLn2 = await nucleus.getTokenBalance(token1.address, newPoolLocation);
      expect(balNu2.sub(balNu1)).eq(0);
      expect(balEA1.sub(balEA2)).eq(0);
      expect(balIA1.sub(balIA2)).eq(0);
      expect(balPLf1.sub(balPLf2)).eq(amountA);
      expect(balPLt2.sub(balPLt1)).eq(0);
      expect(balPLn2.sub(balPLn1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user3.address, newPoolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, fromPoolLocation, newPoolLocation, amountA);
      await expect(tx).to.not.emit(token1, "Transfer");
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(newPoolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(newPoolID, params.tokenA, params.tokenB, params.exchangeRate, params.locationB);
    });
    it("can create limit order 5", async function () {
      // store output in the new pool
      let poolID = 5001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther;
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(103, 100);
      let locationA = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let locationB = HydrogenNucleusHelper.LOCATION_FLAG_POOL;
      expect(await nucleus.totalSupply()).eq(4);
      expect(await nucleus.balanceOf(user2.address)).eq(1);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user2.address);
      let balIA1 = await nucleus.getTokenBalance(token1.address, locationA);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate,
        locationA: locationA,
        locationB: locationB,
        hptReceiver: user2.address
      };
      let poolIDout = await nucleus.connect(user2).callStatic.createLimitOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user2).createLimitOrderPool(params);
      expect(await nucleus.totalSupply()).eq(5);
      expect(await nucleus.balanceOf(user2.address)).eq(2);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user2.address);
      expect(await nucleus.getPoolType(poolID)).eq(1);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(token1.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.amountA).eq(amountA);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(poolLocation);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest.amountA).eq(amountA);
      expect(tradeRequest.exchangeRate).eq(exchangeRate);
      expect(tradeRequest.locationB).eq(poolLocation);
      expect(await nucleus.getTokenBalance(token1.address, poolLocation)).eq(amountA);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user2.address);
      let balIA2 = await nucleus.getTokenBalance(token1.address, locationA);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(0);
      expect(balEA1.sub(balEA2)).eq(0);
      expect(balIA1.sub(balIA2)).eq(amountA);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user2.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.not.emit(token1, "Transfer");
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, poolLocation);
    });
    it("cannot create limit order using funds from pool msg.sender doesn't own", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: HydrogenNucleusHelper.poolIDtoLocation(3001),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
    });
    it("cannot create limit order using funds from pool with insufficient balance", async function () {
      let fromPoolLocation = HydrogenNucleusHelper.poolIDtoLocation(1001);
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: (await nucleus.getTokenBalance(token1.address, fromPoolLocation)).add(1),
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: fromPoolLocation,
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
    });
    it("can create multiple limit orders using multicall", async function () {
      let src = HydrogenNucleusHelper.internalAddressToLocation(user4.address);
      let dst = src;
      let exchangeRate1 = HydrogenNucleusHelper.encodeExchangeRate(104, 100);
      let exchangeRate2 = HydrogenNucleusHelper.encodeExchangeRate(105, 100);
      let txdata2 = nucleus.interface.encodeFunctionData("createLimitOrderPool", [{
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: WeiPerEther,
        exchangeRate: exchangeRate1,
        locationA: src,
        locationB: dst,
        hptReceiver: user4.address
      }]);
      let txdata3 = nucleus.interface.encodeFunctionData("createLimitOrderPool", [{
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: WeiPerEther,
        exchangeRate: exchangeRate2,
        locationA: src,
        locationB: dst,
        hptReceiver: user4.address
      }]);
      let tx = await nucleus.connect(user4).multicall([txdata2, txdata3]);
      await expect(tx).to.not.emit(token1, "Transfer");
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user4.address, 6001);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user4.address, 7001);
      let poolLoc1 = HydrogenNucleusHelper.poolIDtoLocation(6001);
      let poolLoc2 = HydrogenNucleusHelper.poolIDtoLocation(7001);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, poolLoc1, WeiPerEther);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, poolLoc2, WeiPerEther);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(6001);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(7001);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(6001, token1.address, token2.address, exchangeRate1, dst);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(7001, token1.address, token2.address, exchangeRate2, dst);
    });
  });

  describe("tokenTransfer part 2", function () {
    it("cannot transfer from nonexistant pool", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.poolIDtoLocation(1),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("cannot transfer from pool that is not yours", async function () {
      await expect(nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.poolIDtoLocation(1001),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user2.address)
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
      let balNu11 = await token1.balanceOf(nucleus.address);
      expect(balNu1).eq(balNu11);
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
    });
    it("can transfer from pool to external balance", async function () {
      let poolID = 1001;
      let src = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let dst = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
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
    });
    it("can transfer from pool to internal balance", async function () {
      let poolID = 1001;
      let src = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let dst = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
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
    });
    it("only pool owner can withdraw funds", async function () {
      let poolID = 6001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let owner1 = await nucleus.ownerOf(poolID);
      expect(owner1).eq(user4.address);
      // user4 is allowed, user5 is not
      await expect(nucleus.connect(user4).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: poolLocation,
        dst: HydrogenNucleusHelper.internalAddressToLocation(user4.address)
      })).to.not.be.reverted;
      await expect(nucleus.connect(user5).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: poolLocation,
        dst: HydrogenNucleusHelper.internalAddressToLocation(user5.address)
      })).to.be.reverted;
      // transfer
      let tx1 = await nucleus.connect(user4).transferFrom(user4.address, user5.address, poolID);
      await expect(tx1).to.emit(nucleus, "Transfer").withArgs(user4.address, user5.address, poolID);
      let owner2 = await nucleus.ownerOf(poolID);
      expect(owner2).eq(user5.address);
      // user5 is allowed, user4 is not
      await expect(nucleus.connect(user5).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: poolLocation,
        dst: HydrogenNucleusHelper.internalAddressToLocation(user5.address)
      })).to.not.be.reverted;
      await expect(nucleus.connect(user4).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: poolLocation,
        dst: HydrogenNucleusHelper.internalAddressToLocation(user4.address)
      })).to.be.reverted;
    });
  });

  describe("executeFlashSwap part 1", function () {
    before("create more pools", async function () {
      // create pools
      // poolID 8001
      await token2.mint(user2.address, WeiPerEther.mul(10_000));
      await token2.connect(user2).approve(nucleus.address, MaxUint256);
      await nucleus.connect(user2).createLimitOrderPool({
        tokenA: token2.address,
        tokenB: token1.address,
        amountA: WeiPerEther.mul(500),
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(10, 18),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user2.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user2.address),
        hptReceiver: user2.address
      });
      // poolID 9001
      await token2.mint(user1.address, WeiPerEther.mul(10_000));
      await token2.connect(user1).approve(nucleus.address, MaxUint256);
      await nucleus.connect(user1).createLimitOrderPool({
        tokenA: token2.address,
        tokenB: token3.address,
        amountA: WeiPerEther.mul(1_000),
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, 7_500_000),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      });
      // poolID 10001
      let depositAmount = WeiPerUsdc.mul(1_000_000); // one million with 6 decimals
      await token3.mint(user1.address, depositAmount);
      await token3.connect(user1).approve(nucleus.address, MaxUint256);
      await nucleus.connect(user1).createLimitOrderPool({
        tokenA: token3.address,
        tokenB: token1.address,
        amountA: depositAmount,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(8_000_000, WeiPerEther),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: swapCallee4.address
      });
    });
    it("cannot swap in non existant pool", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 0,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("cannot swap tokens not supported by pool", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token3.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeTheseTokens");
    });
    it("cannot swap tokens in reverse direction", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 1001,
        tokenA: token2.address,
        tokenB: token1.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeTheseTokens");
    });
    it("cannot swap if pool has invalid exchange rate", async function () {
      expect(await nucleus.reentrancyGuardState()).eq(1);
      let swapParams = {
        poolID: 3001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      await expect(nucleus.connect(user1).executeFlashSwap(swapParams)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeTheseTokens");
      let updateParams = {
        poolID: 3001,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 0),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user2.address)
      }
      await nucleus.connect(user2).updateLimitOrderPool(updateParams);
      await expect(nucleus.connect(user1).executeFlashSwap(swapParams)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeTheseTokens");
      updateParams.exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(0, 1);
      await nucleus.connect(user2).updateLimitOrderPool(updateParams);
      await expect(nucleus.connect(user1).executeFlashSwap(swapParams)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeTheseTokens");
      expect(await nucleus.reentrancyGuardState()).eq(1);
    });
    it("cannot swap using funds from external address that isn't msg.sender", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user2.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
    });
    it("cannot swap using funds from internal address that isn't msg.sender", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(user2.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
    });
    it("cannot swap using funds from nucleus external address as src", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(nucleus.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot swap sending funds to nucleus external address as dst", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(nucleus.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot swap using funds from nucleus internal address as src", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(nucleus.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot swap sending funds to nucleus internal address as dst", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.internalAddressToLocation(nucleus.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot swap sending funds to external address zero", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(AddressZero),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot swap sending funds to internal address zero", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.internalAddressToLocation(AddressZero),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot swap using funds from external address with insufficient balance", async function () {
      let balance = await token2.balanceOf(user3.address);
      await token2.connect(user3).approve(nucleus.address, MaxUint256);
      await expect(nucleus.connect(user3).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: balance.add(1),
        amountB: 100,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user3.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user3.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot swap using funds from external address with insufficient allowance", async function () {
      await token2.mint(user3.address, WeiPerEther.mul(10));
      await token2.connect(user3).approve(nucleus.address, 0);
      await expect(nucleus.connect(user3).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 100,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user3.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user3.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWith("ERC20: insufficient allowance");
    });
    it("cannot swap using funds from internal address with insufficient balance", async function () {
      await expect(nucleus.connect(user2).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: WeiPerEther,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(user2.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
    });
    it("cannot swap using funds from invalid location type", async function () {
      await expect(nucleus.connect(user2).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: INVALID_LOCATION_6,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("cannot swap and send funds to invalid location type", async function () {
      await expect(nucleus.connect(user2).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: INVALID_LOCATION_6,
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("pool cannot trade against itself", async function () {
      let poolID = 1001;
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.poolIDtoLocation(poolID),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeAgainstItself");
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.poolIDtoLocation(poolID),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeAgainstItself");
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        amountB: 1,
        locationA: HydrogenNucleusHelper.poolIDtoLocation(poolID),
        locationB: HydrogenNucleusHelper.poolIDtoLocation(poolID),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeAgainstItself");
    });
    it("cannot swap more than pool capacity", async function () {
      let poolID = 1001;
      let pool = await nucleus.getLimitOrderPool(poolID);
      let amountA = pool.amountA.add(1);
      let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, pool.exchangeRate);
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientCapacity");
    });
    it("reverts insufficient amountA", async function () {
      let poolID = 1001;
      let pool = await nucleus.getLimitOrderPool(poolID);
      let amountB = WeiPerEther.mul(10);
      let amountA = HydrogenNucleusHelper.calculateAmountA(amountB, pool.exchangeRate);
      amountA = amountA.add(1);
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
    });
    it("reverts excessive amountB", async function () {
      let poolID = 1001;
      let amountA = WeiPerEther.mul(10);
      let pool = await nucleus.getLimitOrderPool(poolID);
      let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, pool.exchangeRate);
      amountB = amountB.sub(1);
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
    });
    it("can swap 1", async function () {
      // from and to external address
      await token2.connect(user2).approve(nucleus.address, MaxUint256);
      let poolID = 1001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let pool = await nucleus.getLimitOrderPool(poolID);
      let mtLocationA = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      let mtLocationB = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      let balNuA1 = await token1.balanceOf(nucleus.address);
      let balNuB1 = await token2.balanceOf(nucleus.address);
      let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB1 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB1 = await nucleus.getTokenBalance(token2.address, pool.locationB);
      let amountB = WeiPerEther.mul(10);
      let amountA = HydrogenNucleusHelper.calculateAmountA(amountB, pool.exchangeRate);
      expect(amountA).eq(amountB); // since pool is 1:1
      expect(amountA).gt(0);
      expect(amountB).gt(0);
      expect(amountA).lte(balPlA1);
      expect(amountB).lte(balMtB1);
      let params = {
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: mtLocationA,
        locationB: mtLocationB,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user2).executeFlashSwap(params);
      let balNuA2 = await token1.balanceOf(nucleus.address);
      let balNuB2 = await token2.balanceOf(nucleus.address);
      let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB2 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB2 = await nucleus.getTokenBalance(token2.address, pool.locationB);
      expect(balNuA1.sub(balNuA2)).eq(amountA);
      expect(balPlA1.sub(balPlA2)).eq(amountA);
      expect(balMtA2.sub(balMtA1)).eq(amountA);
      expect(balNuB2.sub(balNuB1)).eq(0);
      expect(balPlB2.sub(balPlB1)).eq(0);
      expect(balMtB1.sub(balMtB2)).eq(amountB);
      expect(balMmB2.sub(balMmB1)).eq(amountB);
      let pool2 = await nucleus.getLimitOrderPool(poolID);
      expect(pool2.tokenA).eq(pool.tokenA);
      expect(pool2.tokenB).eq(pool.tokenB);
      expect(pool2.amountA).eq(pool.amountA.sub(amountA));
      expect(pool2.exchangeRate).eq(pool.exchangeRate);
      expect(pool2.locationB).eq(pool.locationB);
      let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest2.amountA).eq(pool.amountA.sub(amountA));
      expect(tradeRequest2.exchangeRate).eq(pool.exchangeRate);
      expect(tradeRequest2.locationB).eq(pool.locationB);
      await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amountA);
      await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationA, amountA);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationB, poolLocation, amountB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, poolLocation, pool.locationB, amountB);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountA, amountB, amountB);
    });
    it("can swap 2", async function () {
      // same pool. trade to capacity
      // from internal address to other internal address
      // setup user2 internal balance
      let depositAmount = WeiPerEther.mul(10_000);
      await token2.mint(user2.address, depositAmount);
      await token2.connect(user2).approve(nucleus.address, MaxUint256);
      await nucleus.connect(user2).tokenTransfer({
        token: token2.address,
        amount: depositAmount,
        src: HydrogenNucleusHelper.externalAddressToLocation(user2.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(user2.address)
      });
      // test
      let poolID = 1001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let pool = await nucleus.getLimitOrderPool(poolID);
      let mtLocationA = HydrogenNucleusHelper.internalAddressToLocation(user3.address);
      let mtLocationB = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let balNuA1 = await token1.balanceOf(nucleus.address);
      let balNuB1 = await token2.balanceOf(nucleus.address);
      let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB1 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB1 = await nucleus.getTokenBalance(token2.address, pool.locationB);
      let amountA = balPlA1;
      let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, pool.exchangeRate);
      expect(amountA).eq(amountB); // since pool is 1:1
      expect(amountA).gt(0);
      expect(amountB).gt(0);
      expect(amountA).lte(balPlA1);
      expect(amountB).lte(balMtB1);
      let params = {
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: mtLocationA,
        locationB: mtLocationB,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user2).executeFlashSwap(params);
      let balNuA2 = await token1.balanceOf(nucleus.address);
      let balNuB2 = await token2.balanceOf(nucleus.address);
      let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB2 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB2 = await nucleus.getTokenBalance(token2.address, pool.locationB);
      expect(balNuA1.sub(balNuA2)).eq(0);
      expect(balPlA1.sub(balPlA2)).eq(amountA);
      expect(balMtA2.sub(balMtA1)).eq(amountA);
      expect(balNuB1.sub(balNuB2)).eq(amountB);
      expect(balPlB2.sub(balPlB1)).eq(0);
      expect(balMtB1.sub(balMtB2)).eq(amountB);
      expect(balMmB2.sub(balMmB1)).eq(amountB);
      let pool2 = await nucleus.getLimitOrderPool(poolID);
      expect(pool2.tokenA).eq(pool.tokenA);
      expect(pool2.tokenB).eq(pool.tokenB);
      expect(pool2.amountA).eq(pool.amountA.sub(amountA));
      expect(pool2.exchangeRate).eq(pool.exchangeRate);
      expect(pool2.locationB).eq(pool.locationB);
      let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest2.amountA).eq(pool.amountA.sub(amountA));
      expect(tradeRequest2.exchangeRate).eq(pool.exchangeRate);
      expect(tradeRequest2.locationB).eq(pool.locationB);
      await expect(tx).to.not.emit(token1, "Transfer");
      await expect(tx).to.emit(token2, "Transfer").withArgs(nucleus.address, user1.address, amountB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationA, amountA);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationB, poolLocation, amountB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, poolLocation, pool.locationB, amountB);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountA, amountB, amountB);
    });
    it("can swap 3", async function () {
      // user1 has an open limit order to sell token1 for token2 at 1.6 token1/token2
      // user2 has an open limit order to buy token1 for token2 at 1.8 token1/token2
      // user1 pulls token1 from his pool, market buys in user2's pool, and sends the funds to his other pool
      // careful each pool's tokenA and tokenB are different
      let srcPoolID = 2001;
      let srcPoolLocation = HydrogenNucleusHelper.poolIDtoLocation(srcPoolID);
      let swapPoolID = 8001;
      let swapPoolLocation = HydrogenNucleusHelper.poolIDtoLocation(swapPoolID);
      let dstPoolID = 9001;
      let dstPoolLocation = HydrogenNucleusHelper.poolIDtoLocation(dstPoolID);
      let swapPool = await nucleus.getLimitOrderPool(swapPoolID);
      let mtLocationA = dstPoolLocation;
      let mtLocationB = srcPoolLocation;
      let balNuA1 = await token2.balanceOf(nucleus.address);
      let balNuB1 = await token1.balanceOf(nucleus.address);
      let balPlA1 = await nucleus.getTokenBalance(token2.address, swapPoolLocation);
      let balPlB1 = await nucleus.getTokenBalance(token1.address, swapPoolLocation);
      let balMtA1 = await nucleus.getTokenBalance(token2.address, mtLocationA);
      let balMtB1 = await nucleus.getTokenBalance(token1.address, mtLocationB);
      let balMmB1 = await nucleus.getTokenBalance(token1.address, swapPool.locationB);
      let amountB = balMtB1;
      let amountA = HydrogenNucleusHelper.calculateAmountA(amountB, swapPool.exchangeRate);
      expect(amountA).eq(amountB.mul(10).div(18));
      expect(amountA).gt(0);
      expect(amountB).gt(0);
      expect(amountA).lte(balPlA1);
      expect(amountB).lte(balMtB1);
      let params = {
        poolID: swapPoolID,
        tokenA: token2.address,
        tokenB: token1.address,
        amountA: amountA,
        amountB: amountB,
        locationA: mtLocationA,
        locationB: mtLocationB,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user1).executeFlashSwap(params);
      let balNuA2 = await token2.balanceOf(nucleus.address);
      let balNuB2 = await token1.balanceOf(nucleus.address);
      let balPlA2 = await nucleus.getTokenBalance(token2.address, swapPoolLocation);
      let balPlB2 = await nucleus.getTokenBalance(token1.address, swapPoolLocation);
      let balMtA2 = await nucleus.getTokenBalance(token2.address, mtLocationA);
      let balMtB2 = await nucleus.getTokenBalance(token1.address, mtLocationB);
      let balMmB2 = await nucleus.getTokenBalance(token1.address, swapPool.locationB);
      expect(balNuA1.sub(balNuA2)).eq(0);
      expect(balPlA1.sub(balPlA2)).eq(amountA);
      expect(balMtA2.sub(balMtA1)).eq(amountA);
      expect(balNuB1.sub(balNuB2)).eq(amountB);
      expect(balPlB2.sub(balPlB1)).eq(0);
      expect(balMtB1.sub(balMtB2)).eq(amountB);
      expect(balMmB2.sub(balMmB1)).eq(amountB);
      let pool2 = await nucleus.getLimitOrderPool(swapPoolID);
      expect(pool2.tokenA).eq(swapPool.tokenA);
      expect(pool2.tokenB).eq(swapPool.tokenB);
      expect(pool2.amountA).eq(swapPool.amountA.sub(amountA));
      expect(pool2.exchangeRate).eq(swapPool.exchangeRate);
      expect(pool2.locationB).eq(swapPool.locationB);
      let tradeRequest2 = await nucleus.getTradeRequest(swapPoolID, token2.address, token1.address);
      expect(tradeRequest2.amountA).eq(swapPool.amountA.sub(amountA));
      expect(tradeRequest2.exchangeRate).eq(swapPool.exchangeRate);
      expect(tradeRequest2.locationB).eq(swapPool.locationB);
      await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amountB);
      await expect(tx).to.not.emit(token2, "Transfer");
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, swapPoolLocation, mtLocationA, amountA);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, mtLocationB, swapPoolLocation, amountB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, swapPoolLocation, swapPool.locationB, amountB);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(swapPoolID, token2.address, token1.address, amountA, amountB, amountB);
    });
    it("cannot callback to EOA", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 4001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 0,
        amountB: 0,
        locationA: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        flashSwapCallee: user1.address,
        callbackData: "0x"
      })).to.be.reverted;
    });
    it("cannot callback to non callee implementer", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 4001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 0,
        amountB: 0,
        locationA: HydrogenNucleusHelper.internalAddressToLocation(swapCallee1.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        flashSwapCallee: swapCallee1.address,
        callbackData: "0x"
      })).to.be.reverted;
    });
    it("reverts if callee reverts", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 4001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 0,
        amountB: 0,
        locationA: HydrogenNucleusHelper.internalAddressToLocation(swapCallee2.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        flashSwapCallee: swapCallee2.address,
        callbackData: "0x"
      })).to.be.revertedWith("MockFlashSwapCallee2: force revert");
    });
    it("reverts if the callee does not return any value", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 4001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 0,
        amountB: 0,
        locationA: HydrogenNucleusHelper.internalAddressToLocation(swapCallee7.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        flashSwapCallee: swapCallee7.address,
        callbackData: "0x"
      })).to.be.reverted;
    });
    it("reverts if the callee returns the wrong value", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 4001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 0,
        amountB: 0,
        locationA: HydrogenNucleusHelper.internalAddressToLocation(swapCallee8.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        flashSwapCallee: swapCallee8.address,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenFlashSwapCallbackFailed");
    });
    it("can swap with callback", async function () {
      let params = {
        poolID: 4001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 0,
        amountB: 0,
        locationA: HydrogenNucleusHelper.internalAddressToLocation(swapCallee3.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        flashSwapCallee: swapCallee3.address,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user1).executeFlashSwap(params);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(4001, token1.address, token2.address, 0, 0, 0);
      await expect(tx).to.emit(swapCallee3, "Callback");
    });
    it("reverts if callee needs to produce funds but cant", async function () {
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: 4001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 0,
        amountB: 10,
        locationA: HydrogenNucleusHelper.internalAddressToLocation(swapCallee3.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        flashSwapCallee: swapCallee3.address,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
    });
    it("can flash swap with callback 1", async function () {
      let poolID = 4001;
      let pool = await nucleus.getLimitOrderPool(poolID);
      let amountB = WeiPerEther;
      let amountA = HydrogenNucleusHelper.calculateAmountA(amountB, pool.exchangeRate);
      let params = {
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: HydrogenNucleusHelper.internalAddressToLocation(swapCallee4.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        flashSwapCallee: swapCallee4.address,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user1).executeFlashSwap(params);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(4001, token1.address, token2.address, amountA, amountB, amountB);
      await expect(tx).to.emit(swapCallee4, "Callback");
    });
    it("can flash swap with callback 2", async function () {
      let poolID = 4001;
      let pool = await nucleus.getLimitOrderPool(poolID);
      let amountB = WeiPerEther;
      let amountA = HydrogenNucleusHelper.calculateAmountA(amountB, pool.exchangeRate);
      let params = {
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(swapCallee4.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        flashSwapCallee: swapCallee4.address,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user1).executeFlashSwap(params);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(4001, token1.address, token2.address, amountA, amountB, amountB);
      await expect(tx).to.emit(swapCallee4, "Callback");
    });
    it("locationB pool must be owned by initiator not callee", async function () {
      let poolID = 4001;
      let pool = await nucleus.getLimitOrderPool(poolID);
      let amountB = WeiPerEther;
      let amountA = HydrogenNucleusHelper.calculateAmountA(amountB, pool.exchangeRate);
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(swapCallee4.address),
        locationB: HydrogenNucleusHelper.poolIDtoLocation(10001),
        flashSwapCallee: swapCallee4.address,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
    });
    it("locationB address must be initiator not callee", async function () {
      let poolID = 4001;
      let pool = await nucleus.getLimitOrderPool(poolID);
      let amountB = WeiPerEther;
      let amountA = HydrogenNucleusHelper.calculateAmountA(amountB, pool.exchangeRate);
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(swapCallee4.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(swapCallee4.address),
        flashSwapCallee: swapCallee4.address,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
      await expect(nucleus.connect(user1).executeFlashSwap({
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(swapCallee4.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(swapCallee4.address),
        flashSwapCallee: swapCallee4.address,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
    });
    it("can flash swap with callback 3", async function () {
      let swapPoolID = 4001;
      let returnPoolID = 2001;
      let pool = await nucleus.getLimitOrderPool(swapPoolID);
      let amountB = WeiPerEther;
      let amountA = HydrogenNucleusHelper.calculateAmountA(amountB, pool.exchangeRate);
      let params = {
        poolID: swapPoolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(swapCallee4.address),
        locationB: HydrogenNucleusHelper.poolIDtoLocation(returnPoolID),
        flashSwapCallee: swapCallee4.address,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user1).executeFlashSwap(params);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(swapPoolID, token1.address, token2.address, amountA, amountB, amountB);
      await expect(tx).to.emit(swapCallee4, "Callback");
    });
    it("callback won't be called if zero callee address", async function () {
      let params = {
        poolID: 4001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 0,
        amountB: 0,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(swapCallee4.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user1).executeFlashSwap(params);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(4001, token1.address, token2.address, 0, 0, 0);
      await expect(tx).to.not.emit(swapCallee4, "Callback");
    });
    it("cannot use callback to buy hpt locationB", async function () {
      // user3 wants to trade token1 for token3 in poolID 10001
      // user3 attempts to use callback to buy poolID 3001 and pull from its token1 bag
      // tx should revert since user does not own poolID 3001 at the beginning of tx
      let swapPoolID = 10001;
      let buyPoolID = 3001;
      expect(await nucleus.ownerOf(buyPoolID)).eq(user2.address);
      await nucleus.connect(user2).setApprovalForAll(swapCallee5.address, true);
      await expect(nucleus.connect(user3).executeFlashSwap({
        poolID: swapPoolID,
        tokenA: token3.address,
        tokenB: token1.address,
        amountA: 0,
        amountB: 0,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user3.address),
        locationB: HydrogenNucleusHelper.poolIDtoLocation(buyPoolID),
        flashSwapCallee: swapCallee5.address,
        callbackData: toBytes32(buyPoolID)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
    });
    it("cannot use callback to sell hpt locationB", async function () {
      // user2 wants to trade token1 for token3 in poolID 10001
      // user2 attempts to sell poolID 3001 and still pull from its token1 bag
      // tx should revert since user does not own poolID 3001 when pulling tokens
      let swapPoolID = 10001;
      let sellPoolID = 3001;
      expect(await nucleus.ownerOf(sellPoolID)).eq(user2.address);
      await nucleus.connect(user2).setApprovalForAll(swapCallee6.address, true);
      await expect(swapCallee6.connect(user2).executeFlashSwapWithCallback({
        poolID: swapPoolID,
        tokenA: token3.address,
        tokenB: token1.address,
        amountA: 0,
        amountB: 0,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user2.address),
        locationB: HydrogenNucleusHelper.poolIDtoLocation(sellPoolID),
        flashSwapCallee: swapCallee6.address,
        callbackData: toBytes32(sellPoolID)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
    });
    it("can combine multiple swaps with multicall", async function () {
      // swap tkn2 to tkn1 in pools 5001, 6001, and 7001 in parallel
      // swap tkn1 to tkn3 in pool 10001
      // trades are labeled w, x, y, z
      // mint tkn2 to user
      let token2DepositAmount = WeiPerEther.mul(100);
      await token2.mint(user5.address, token2DepositAmount);
      await token2.connect(user5).approve(nucleus.address, MaxUint256);
      // test
      let userLocExt = HydrogenNucleusHelper.externalAddressToLocation(user5.address);
      let userLoc = HydrogenNucleusHelper.internalAddressToLocation(user5.address);
      let poolID5 = 5001;
      let poolID6 = 6001;
      let poolID7 = 7001;
      let poolID10 = 10001;
      let pool5 = await nucleus.getLimitOrderPool(poolID5);
      let pool6 = await nucleus.getLimitOrderPool(poolID6);
      let pool7 = await nucleus.getLimitOrderPool(poolID7);
      let pool10 = await nucleus.getLimitOrderPool(poolID10);
      let poolLoc5 = HydrogenNucleusHelper.poolIDtoLocation(poolID5);
      let poolLoc6 = HydrogenNucleusHelper.poolIDtoLocation(poolID6);
      let poolLoc7 = HydrogenNucleusHelper.poolIDtoLocation(poolID7);
      let poolLoc10 = HydrogenNucleusHelper.poolIDtoLocation(poolID10);
      let balUE11 = await nucleus.getTokenBalance(token1.address, userLocExt);
      let balUE21 = await nucleus.getTokenBalance(token2.address, userLocExt);
      let balUE31 = await nucleus.getTokenBalance(token3.address, userLocExt);
      let balU11 = await nucleus.getTokenBalance(token1.address, userLoc);
      let balU21 = await nucleus.getTokenBalance(token2.address, userLoc);
      let balU31 = await nucleus.getTokenBalance(token3.address, userLoc);
      let balN11 = await token1.balanceOf(nucleus.address);
      let balN21 = await token2.balanceOf(nucleus.address);
      let balN31 = await token3.balanceOf(nucleus.address);
      let balPl511 = await nucleus.getTokenBalance(token1.address, poolLoc5);
      let balPl521 = await nucleus.getTokenBalance(token2.address, poolLoc5);
      let balPl611 = await nucleus.getTokenBalance(token1.address, poolLoc6);
      let balPl621 = await nucleus.getTokenBalance(token2.address, poolLoc6);
      let balPl711 = await nucleus.getTokenBalance(token1.address, poolLoc7);
      let balPl721 = await nucleus.getTokenBalance(token2.address, poolLoc7);
      let balPl1011 = await nucleus.getTokenBalance(token1.address, poolLoc10);
      let balPl1031 = await nucleus.getTokenBalance(token3.address, poolLoc10);
      // todo: fix this
      // since trades w, y, and y are to the pool's capacity, they should really use swapExactA()
      // since that's not what we're testing, keep a small buffer for rounding errors
      let amountW2 = HydrogenNucleusHelper.calculateAmountB(balPl511, pool5.exchangeRate).sub(10);
      let amountW1 = HydrogenNucleusHelper.calculateAmountA(amountW2, pool5.exchangeRate);
      let amountX2 = HydrogenNucleusHelper.calculateAmountB(balPl611, pool6.exchangeRate).sub(10);
      let amountX1 = HydrogenNucleusHelper.calculateAmountA(amountX2, pool6.exchangeRate);
      let amountY2 = HydrogenNucleusHelper.calculateAmountB(balPl711, pool7.exchangeRate).sub(10);
      let amountY1 = HydrogenNucleusHelper.calculateAmountA(amountY2, pool7.exchangeRate);
      let amount1sum = amountW1.add(amountX1).add(amountY1);
      let amount2sum = amountW2.add(amountX2).add(amountY2);
      let amountZ1 = amount1sum;
      let amountZ3 = HydrogenNucleusHelper.calculateAmountA(amountZ1, pool10.exchangeRate);
      // prechecks
      expect(balUE21).gte(amount2sum);
      expect(balPl1031).gte(amountZ3);
      expect(balPl511).gt(amountW1);
      expect(balPl611).gt(amountX1);
      expect(balPl711).gt(amountY1);
      expect(balPl1031).gt(amountZ3);
      let txdataDeposit = nucleus.interface.encodeFunctionData("tokenTransfer", [{
        token: token2.address,
        amount: token2DepositAmount,
        src: userLocExt,
        dst: userLoc
      }]);
      let txdataW = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
        poolID: poolID5,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountW1,
        amountB: amountW2,
        locationA: userLoc,
        locationB: userLoc,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      }]);
      let txdataX = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
        poolID: poolID6,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountX1,
        amountB: amountX2,
        locationA: userLoc,
        locationB: userLoc,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      }]);
      let txdataY = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
        poolID: poolID7,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountY1,
        amountB: amountY2,
        locationA: userLoc,
        locationB: userLoc,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      }]);
      let txdataZ = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
        poolID: poolID10,
        tokenA: token3.address,
        tokenB: token1.address,
        amountA: amountZ3,
        amountB: amountZ1,
        locationA: userLoc,
        locationB: userLoc,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      }]);
      let txdatas = [txdataDeposit, txdataW, txdataX, txdataY, txdataZ];
      let tx = await nucleus.connect(user5).multicall(txdatas);
      let balUE12 = await nucleus.getTokenBalance(token1.address, userLocExt);
      let balUE22 = await nucleus.getTokenBalance(token2.address, userLocExt);
      let balUE32 = await nucleus.getTokenBalance(token3.address, userLocExt);
      let balU12 = await nucleus.getTokenBalance(token1.address, userLoc);
      let balU22 = await nucleus.getTokenBalance(token2.address, userLoc);
      let balU32 = await nucleus.getTokenBalance(token3.address, userLoc);
      let balN12 = await token1.balanceOf(nucleus.address);
      let balN22 = await token2.balanceOf(nucleus.address);
      let balN32 = await token3.balanceOf(nucleus.address);
      let balPl512 = await nucleus.getTokenBalance(token1.address, poolLoc5);
      let balPl522 = await nucleus.getTokenBalance(token2.address, poolLoc5);
      let balPl612 = await nucleus.getTokenBalance(token1.address, poolLoc6);
      let balPl622 = await nucleus.getTokenBalance(token2.address, poolLoc6);
      let balPl712 = await nucleus.getTokenBalance(token1.address, poolLoc7);
      let balPl722 = await nucleus.getTokenBalance(token2.address, poolLoc7);
      let balPl1012 = await nucleus.getTokenBalance(token1.address, poolLoc10);
      let balPl1032 = await nucleus.getTokenBalance(token3.address, poolLoc10);
      expect(balUE11.sub(balUE12)).eq(0);
      expect(balUE21.sub(balUE22)).eq(token2DepositAmount);
      expect(balUE31.sub(balUE32)).eq(0);
      expect(balU11.sub(balU12)).eq(0);
      expect(balU22.sub(balU21)).eq(token2DepositAmount.sub(amount2sum));
      expect(balU32.sub(balU31)).eq(amountZ3);
      expect(balN11.sub(balN12)).eq(amount1sum);
      expect(balN22.sub(balN21)).eq(token2DepositAmount);
      expect(balN31.sub(balN32)).eq(0);
      expect(balPl511.sub(balPl512)).eq(amountW1);
      expect(balPl522.sub(balPl521)).eq(amountW2); // only w
      expect(balPl611.sub(balPl612)).eq(amountX1);
      expect(balPl621.sub(balPl622)).eq(0);
      expect(balPl711.sub(balPl712)).eq(amountY1);
      expect(balPl721.sub(balPl722)).eq(0);
      expect(balPl1011.sub(balPl1012)).eq(0);
      expect(balPl1031.sub(balPl1032)).eq(amountZ3);
      // deposit
      await expect(tx).to.emit(token2, "Transfer").withArgs(user5.address, nucleus.address, token2DepositAmount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, userLocExt, userLoc, token2DepositAmount);
      // w
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, userLoc, poolLoc5, amountW2);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLoc5, userLoc, amountW1);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID5, token1.address, token2.address, amountW1, amountW2, amountW2);
      // x
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, userLoc, poolLoc6, amountX2);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLoc6, userLoc, amountX1);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID6, token1.address, token2.address, amountX1, amountX2, amountX2);
      // y
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, userLoc, poolLoc7, amountY2);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLoc7, userLoc, amountY1);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID7, token1.address, token2.address, amountY1, amountY2, amountY2);
      // z
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, userLoc, poolLoc10, amountZ1);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token3.address, poolLoc10, userLoc, amountZ3);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID10, token3.address, token1.address, amountZ3, amountZ1, amountZ1);
    });
  });

  describe("updateLimitOrder part 1", function () {
    it("cannot update non existant pool", async function () {
      await expect(nucleus.connect(user1).updateLimitOrderPool({
        poolID: 0,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0, 0),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("cannot update not your pool", async function () {
      await expect(nucleus.connect(user1).updateLimitOrderPool({
        poolID: 3001,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0, 0),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
    });
    it("cannot update limit order to invalid location type", async function () {
      await expect(nucleus.connect(user1).updateLimitOrderPool({
        poolID: 1001,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0, 0),
        locationB: INVALID_LOCATION_6
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("cannot update limit order to invalid location external address zero", async function () {
      await expect(nucleus.connect(user1).updateLimitOrderPool({
        poolID: 1001,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0, 0),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(AddressZero)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot update limit order to invalid location internal address zero", async function () {
      await expect(nucleus.connect(user1).updateLimitOrderPool({
        poolID: 1001,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0, 0),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(AddressZero)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("can update pool", async function () {
      let poolID = 1001;
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(101234, 100000);
      let locationB = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let tx = await nucleus.connect(user1).updateLimitOrderPool({
        poolID: poolID,
        exchangeRate: exchangeRate,
        locationB: locationB
      });
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, locationB);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(token1.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
    });
    it("swaps execute at the new exchangeRate", async function () {
      // deposit more tokens
      let poolID = 1001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: WeiPerEther.mul(100),
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: poolLocation
      });
      // test
      let pool = await nucleus.getLimitOrderPool(poolID);
      let mtLocationA = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      let mtLocationB = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      let balNuA1 = await token1.balanceOf(nucleus.address);
      let balNuB1 = await token2.balanceOf(nucleus.address);
      let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB1 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB1 = await nucleus.getTokenBalance(token2.address, pool.locationB);
      let amountA = WeiPerEther.mul(10);
      let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, pool.exchangeRate);
      expect(amountA).eq(amountB.mul(101234).div(100000));
      expect(amountA).gt(0);
      expect(amountB).gt(0);
      expect(amountA).lte(balPlA1);
      expect(amountB).lte(balMtB1);
      let params = {
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: mtLocationA,
        locationB: mtLocationB,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user2).executeFlashSwap(params);
      let balNuA2 = await token1.balanceOf(nucleus.address);
      let balNuB2 = await token2.balanceOf(nucleus.address);
      let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB2 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB2 = await nucleus.getTokenBalance(token2.address, pool.locationB);
      expect(balNuA1.sub(balNuA2)).eq(amountA);
      expect(balPlA1.sub(balPlA2)).eq(amountA);
      expect(balMtA2.sub(balMtA1)).eq(amountA);
      expect(balNuB2.sub(balNuB1)).eq(amountB);
      expect(balPlB2.sub(balPlB1)).eq(0);
      expect(balMtB1.sub(balMtB2)).eq(amountB);
      expect(balMmB2.sub(balMmB1)).eq(amountB);
      await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amountA);
      await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationA, amountA);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationB, poolLocation, amountB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, poolLocation, pool.locationB, amountB);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountA, amountB, amountB);
    });
    it("can update pool 2", async function () {
      let poolID = 1001;
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(104321, 100000);
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let tx = await nucleus.connect(user1).updateLimitOrderPool({
        poolID: poolID,
        exchangeRate: exchangeRate,
        locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
      });
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, poolLocation);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(token1.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(poolLocation);
    });
  });

  describe("createGridOrderPool part 1", function () {
    before("create more limit orders", async function () {
      // poolID 11001
      await nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: WeiPerEther.mul(100),
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(151, 100),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      });
    });
    it("cannot create grid order using nucleus as erc20", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: nucleus.address,
          amount: 0,
          location: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
        }],
        tradeRequests: [],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [{
          tokenA: nucleus.address,
          tokenB: token2.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0,0),
          locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
        }],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: nucleus.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0,0),
          locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
        }],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot create grid order using same token", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token1.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0,0),
          locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
        }],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSameToken");
    });
    it("cannot create grid order using funds from external address that isn't msg.sender", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: token1.address,
          amount: 0,
          location: HydrogenNucleusHelper.externalAddressToLocation(user2.address)
        }],
        tradeRequests: [],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
    });
    it("cannot create grid order using funds from internal address that isn't msg.sender", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: token1.address,
          amount: 0,
          location: HydrogenNucleusHelper.internalAddressToLocation(user2.address)
        }],
        tradeRequests: [],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
    });
    it("cannot create grid order using funds from external address with insufficient balance", async function () {
      let loc = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let bal = await nucleus.getTokenBalance(token1.address, loc);
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: token1.address,
          amount: bal.add(1),
          location: loc
        }],
        tradeRequests: [],
        hptReceiver: user1.address
      })).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot create grid order using funds from external address with insufficient allowance", async function () {
      let loc = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let bal = await nucleus.getTokenBalance(token1.address, loc);
      await token1.connect(user1).approve(nucleus.address, bal.sub(1))
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: token1.address,
          amount: bal,
          location: loc
        }],
        tradeRequests: [],
        hptReceiver: user1.address
      })).to.be.revertedWith("ERC20: insufficient allowance");
    });
    it("cannot create grid order using funds from internal address with insufficient balance", async function () {
      let loc = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let bal = await nucleus.getTokenBalance(token1.address, loc);
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: token1.address,
          amount: bal.add(1),
          location: loc
        }],
        tradeRequests: [],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
    });
    it("cannot create grid order from invalid location type", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: token1.address,
          amount: 0,
          location: INVALID_LOCATION_6
        }],
        tradeRequests: [],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("cannot create grid order to invalid location type", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0,0),
          locationB: INVALID_LOCATION_6
        }],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("cannot create grid order from invalid external address", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: token1.address,
          amount: 0,
          location: INVALID_EXTERNAL_ADDRESS_LOCATION
        }],
        tradeRequests: [],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
    it("cannot create grid order to invalid external address", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0,0),
          locationB: INVALID_EXTERNAL_ADDRESS_LOCATION
        }],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
    it("cannot create grid order to external address zero", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0,0),
          locationB: HydrogenNucleusHelper.externalAddressToLocation(AddressZero)
        }],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot create grid order from invalid internal address", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: token1.address,
          amount: 0,
          location: INVALID_INTERNAL_ADDRESS_LOCATION
        }],
        tradeRequests: [],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
    it("cannot create grid order to invalid internal address", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0,0),
          locationB: INVALID_INTERNAL_ADDRESS_LOCATION
        }],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationToAddressCast");
    });
    it("cannot create grid order to internal address zero", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0,0),
          locationB: HydrogenNucleusHelper.internalAddressToLocation(AddressZero)
        }],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot create more than max num pools", async function () {
      // set totalSupply incredibly high to force revert
      let ts1 = await nucleus.totalSupply();
      // set
      let slotIndex = toBytes32(0);
      let desiredLength = toBytes32(BN.from(2).pow(248).div(1000));
      await setStorageAt(nucleus.address, slotIndex, desiredLength);
      let ts2 = await nucleus.totalSupply();
      expect(ts2).eq(desiredLength);
      // test
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenMaxPoolCount");
      // reset
      await setStorageAt(nucleus.address, slotIndex, toBytes32(ts1));
      let ts3 = await nucleus.totalSupply();
      expect(ts3).eq(ts1);
    });
    it("can create grid order 1", async function () {
      // empty
      let poolID = 12002;
      expect(await nucleus.totalSupply()).eq(11);
      expect(await nucleus.balanceOf(user1.address)).eq(4);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getGridOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let params = {
        tokenSources: [],
        tradeRequests: [],
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createGridOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createGridOrderPool(params);
      expect(await nucleus.totalSupply()).eq(12);
      expect(await nucleus.balanceOf(user1.address)).eq(5);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(2);
      let pool = await nucleus.getGridOrderPool(poolID);
      expect(pool.tokens).deep.eq([]);
      expect(pool.balances).deep.eq([]);
      expect(pool.tradeRequests).deep.eq([]);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest.amountA).eq(0);
      expect(tradeRequest.exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(tradeRequest.locationB).eq(NULL_LOCATION);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
    });
    it("can create grid order 2", async function () {
      // one trade request
      // external address to external address
      let poolID = 13002;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(100);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(15, 10);
      let locationA = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let locationB = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      expect(await nucleus.totalSupply()).eq(12);
      expect(await nucleus.balanceOf(user1.address)).eq(5);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getGridOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenSources: [{
          token: token1.address,
          amount: amountA,
          location: locationA
        }],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: exchangeRate,
          locationB: locationB
        }],
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createGridOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createGridOrderPool(params);
      expect(await nucleus.totalSupply()).eq(13);
      expect(await nucleus.balanceOf(user1.address)).eq(6);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(2);
      let pool = await nucleus.getGridOrderPool(poolID);
      expect(pool.tokens).deep.eq([token1.address, token2.address]);
      expect(pool.balances.length).eq(2);
      expect(pool.balances[0]).eq(amountA);
      expect(pool.balances[1]).eq(0);
      expect(pool.tradeRequests.length).eq(2);
      expect(pool.tradeRequests[0].tokenA).eq(token1.address);
      expect(pool.tradeRequests[0].tokenB).eq(token2.address);
      expect(pool.tradeRequests[0].exchangeRate).eq(exchangeRate);
      expect(pool.tradeRequests[0].locationB).eq(locationB);
      expect(pool.tradeRequests[1].tokenA).eq(token2.address);
      expect(pool.tradeRequests[1].tokenB).eq(token1.address);
      expect(pool.tradeRequests[1].exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(pool.tradeRequests[1].locationB).eq(NULL_LOCATION);
      let tradeRequest0 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest0.amountA).eq(amountA);
      expect(tradeRequest0.exchangeRate).eq(exchangeRate);
      expect(tradeRequest0.locationB).eq(locationB);
      let tradeRequest1 = await nucleus.getTradeRequest(poolID, token2.address, token1.address);
      expect(tradeRequest1.amountA).eq(0);
      expect(tradeRequest1.exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(tradeRequest1.locationB).eq(NULL_LOCATION);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user1.address);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(amountA);
      expect(balEA1.sub(balEA2)).eq(amountA);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.emit(token1, "Transfer").withArgs(user1.address, nucleus.address, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, locationB);
    });
    it("can create grid order 3", async function () {
      // setup balances
      let userLocation = HydrogenNucleusHelper.internalAddressToLocation(user1.address)
      let userLocationExt = HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      let amount11 = WeiPerEther.mul(100);
      let amount12 = WeiPerEther.mul(120);
      let amount13 = amount11.add(amount12);
      let amount2 = WeiPerEther.mul(10);
      await token1.mint(user1.address, amount13);
      await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount13,
        src: userLocationExt,
        dst: userLocation
      });
      await token2.mint(user1.address, amount2);
      // many trade requests
      // amounts go back into pool
      let poolID = 14002;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let exchangeRate12 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(101), WeiPerEther.mul(100));
      let exchangeRate21 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(100), WeiPerEther.mul(102));
      let exchangeRate13 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(103), WeiPerUsdc.mul(100));
      let exchangeRate31 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(100), WeiPerEther.mul(104));
      let exchangeRate23 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(105), WeiPerUsdc.mul(100));
      let exchangeRate32 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(100), WeiPerEther.mul(106));
      let locationA = userLocation;
      let locationB = poolLocation;
      expect(await nucleus.totalSupply()).eq(13);
      expect(await nucleus.balanceOf(user1.address)).eq(6);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getGridOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let balNu11 = await token1.balanceOf(nucleus.address);
      let balNu21 = await token2.balanceOf(nucleus.address);
      let balIA11 = await nucleus.getTokenBalance(token1.address, locationA);
      let balIA21 = await nucleus.getTokenBalance(token2.address, locationA);
      let balPL11 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPL21 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let params = {
        tokenSources: [{
          token: token1.address,
          amount: amount11,
          location: locationA
        },{
          token: token1.address,
          amount: amount12,
          location: locationA
        },{
          token: token2.address,
          amount: amount2,
          location: userLocationExt
        }],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: exchangeRate12,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        },{
          tokenA: token2.address,
          tokenB: token1.address,
          exchangeRate: exchangeRate21,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        },{
          tokenA: token3.address,
          tokenB: token1.address,
          exchangeRate: exchangeRate31,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        },{
          tokenA: token1.address,
          tokenB: token3.address,
          exchangeRate: exchangeRate13,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        },{
          tokenA: token2.address,
          tokenB: token3.address,
          exchangeRate: exchangeRate23,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        },{
          tokenA: token3.address,
          tokenB: token2.address,
          exchangeRate: exchangeRate32,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        }],
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createGridOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createGridOrderPool(params);
      expect(await nucleus.totalSupply()).eq(14);
      expect(await nucleus.balanceOf(user1.address)).eq(7);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(2);
      let pool = await nucleus.getGridOrderPool(poolID);
      expect(pool.tokens).deep.eq([token1.address, token2.address, token3.address]);
      expect(pool.balances.length).eq(3);
      expect(pool.balances[0]).eq(amount13);
      expect(pool.balances[1]).eq(amount2);
      expect(pool.balances[2]).eq(0);
      expect(pool.tradeRequests.length).eq(6);
      expect(pool.tradeRequests[0].tokenA).eq(token1.address);
      expect(pool.tradeRequests[0].tokenB).eq(token2.address);
      expect(pool.tradeRequests[0].exchangeRate).eq(exchangeRate12);
      expect(pool.tradeRequests[0].locationB).eq(locationB);
      expect(pool.tradeRequests[1].tokenA).eq(token1.address);
      expect(pool.tradeRequests[1].tokenB).eq(token3.address);
      expect(pool.tradeRequests[1].exchangeRate).eq(exchangeRate13);
      expect(pool.tradeRequests[1].locationB).eq(locationB);
      expect(pool.tradeRequests[2].tokenA).eq(token2.address);
      expect(pool.tradeRequests[2].tokenB).eq(token1.address);
      expect(pool.tradeRequests[2].exchangeRate).eq(exchangeRate21);
      expect(pool.tradeRequests[2].locationB).eq(locationB);
      expect(pool.tradeRequests[3].tokenA).eq(token2.address);
      expect(pool.tradeRequests[3].tokenB).eq(token3.address);
      expect(pool.tradeRequests[3].exchangeRate).eq(exchangeRate23);
      expect(pool.tradeRequests[3].locationB).eq(locationB);
      expect(pool.tradeRequests[4].tokenA).eq(token3.address);
      expect(pool.tradeRequests[4].tokenB).eq(token1.address);
      expect(pool.tradeRequests[4].exchangeRate).eq(exchangeRate31);
      expect(pool.tradeRequests[4].locationB).eq(locationB);
      expect(pool.tradeRequests[5].tokenA).eq(token3.address);
      expect(pool.tradeRequests[5].tokenB).eq(token2.address);
      expect(pool.tradeRequests[5].exchangeRate).eq(exchangeRate32);
      expect(pool.tradeRequests[5].locationB).eq(locationB);
      let tradeRequest0 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest0.amountA).eq(amount13);
      expect(tradeRequest0.exchangeRate).eq(exchangeRate12);
      expect(tradeRequest0.locationB).eq(poolLocation);
      let tradeRequest1 = await nucleus.getTradeRequest(poolID, token1.address, token3.address);
      expect(tradeRequest1.amountA).eq(amount13);
      expect(tradeRequest1.exchangeRate).eq(exchangeRate13);
      expect(tradeRequest1.locationB).eq(poolLocation);
      let tradeRequest2 = await nucleus.getTradeRequest(poolID, token2.address, token1.address);
      expect(tradeRequest2.amountA).eq(amount2);
      expect(tradeRequest2.exchangeRate).eq(exchangeRate21);
      expect(tradeRequest2.locationB).eq(poolLocation);
      let tradeRequest3 = await nucleus.getTradeRequest(poolID, token2.address, token3.address);
      expect(tradeRequest3.amountA).eq(amount2);
      expect(tradeRequest3.exchangeRate).eq(exchangeRate23);
      expect(tradeRequest3.locationB).eq(poolLocation);
      let tradeRequest4 = await nucleus.getTradeRequest(poolID, token3.address, token1.address);
      expect(tradeRequest4.amountA).eq(0);
      expect(tradeRequest4.exchangeRate).eq(exchangeRate31);
      expect(tradeRequest4.locationB).eq(poolLocation);
      let tradeRequest5 = await nucleus.getTradeRequest(poolID, token3.address, token2.address);
      expect(tradeRequest5.amountA).eq(0);
      expect(tradeRequest5.exchangeRate).eq(exchangeRate32);
      expect(tradeRequest5.locationB).eq(poolLocation);
      let balNu12 = await token1.balanceOf(nucleus.address);
      let balNu22 = await token2.balanceOf(nucleus.address);
      let balIA12 = await nucleus.getTokenBalance(token1.address, locationA);
      let balIA22 = await nucleus.getTokenBalance(token2.address, locationA);
      let balPL12 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPL22 = await nucleus.getTokenBalance(token2.address, poolLocation);
      expect(balNu12.sub(balNu11)).eq(0);
      expect(balNu22.sub(balNu21)).eq(amount2);
      expect(balIA11.sub(balIA12)).eq(amount13);
      expect(balIA21.sub(balIA22)).eq(0);
      expect(balPL12.sub(balPL11)).eq(amount13);
      expect(balPL22.sub(balPL21)).eq(amount2);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amount11);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amount12);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, userLocationExt, poolLocation, amount2);
      await expect(tx).to.not.emit(token1, "Transfer");
      await expect(tx).to.emit(token2, "Transfer").withArgs(user1.address, nucleus.address, amount2);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate12, locationB);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token2.address, token1.address, exchangeRate21, locationB);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token3.address, exchangeRate13, locationB);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token3.address, token1.address, exchangeRate31, locationB);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token2.address, token3.address, exchangeRate23, locationB);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token3.address, token2.address, exchangeRate32, locationB);
    });
    it("cannot create grid order with excessive number of tokens", async function () {
      // works with 20
      let tokenSources = [];
      let loc = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      for(let i = 0; i < 20; i++) {
        tokenSources.push({
          token: tokens[i].address,
          amount: 0,
          location: loc
        });
      }
      await nucleus.connect(user1).createGridOrderPool({
        tokenSources: tokenSources,
        tradeRequests: [],
        hptReceiver: user1.address
      });
      // fails at 21
      tokenSources.push({
        token: tokens[20].address,
        amount: 0,
        location: loc
      });
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: tokenSources,
        tradeRequests: [],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenMaxTokensPerGridOrder");
    });
  });

  describe("executeFlashSwap part 2", function () {
    it("can swap in a grid order", async function () {
      let poolID = 13002;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let pool = await nucleus.getGridOrderPool(poolID);
      let tradeRequest = pool.tradeRequests[0];
      let mtLocationA = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      let mtLocationB = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      let balNuA1 = await token1.balanceOf(nucleus.address);
      let balNuB1 = await token2.balanceOf(nucleus.address);
      let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB1 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB1 = await nucleus.getTokenBalance(token2.address, tradeRequest.locationB);
      let amountA = WeiPerEther.mul(10);
      let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, tradeRequest.exchangeRate);
      expect(amountA).gt(0);
      expect(amountB).gt(0);
      expect(amountA).lte(balPlA1);
      expect(amountB).lte(balMtB1);
      let params = {
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: mtLocationA,
        locationB: mtLocationB,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user2).executeFlashSwap(params);
      let pool2 = await nucleus.getGridOrderPool(poolID);
      let balNuA2 = await token1.balanceOf(nucleus.address);
      let balNuB2 = await token2.balanceOf(nucleus.address);
      let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB2 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB2 = await nucleus.getTokenBalance(token2.address, tradeRequest.locationB);
      expect(pool.balances[0].sub(pool2.balances[0])).eq(amountA);
      expect(balNuA1.sub(balNuA2)).eq(amountA);
      expect(balPlA1.sub(balPlA2)).eq(amountA);
      expect(balMtA2.sub(balMtA1)).eq(amountA);
      expect(balNuB2.sub(balNuB1)).eq(0);
      expect(balPlB2.sub(balPlB1)).eq(0);
      expect(balMtB1.sub(balMtB2)).eq(amountB);
      expect(balMmB2.sub(balMmB1)).eq(amountB);
      await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amountA);
      await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationA, amountA);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationB, poolLocation, amountB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, poolLocation, tradeRequest.locationB, amountB);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountA, amountB, amountB);
    });
    it("can swap in multiple orders", async function () {
      // swap tkn2 to tkn1 in poolID 13002 (w)
      // swap tkn1 to tkn3 in poolID 10001 (x)
      let poolIDW = 13002;
      let poolWLocation = HydrogenNucleusHelper.poolIDtoLocation(poolIDW);
      let poolW = await nucleus.getGridOrderPool(poolIDW);
      let poolIDX = 10001;
      let poolXLocation = HydrogenNucleusHelper.poolIDtoLocation(poolIDX);
      let poolX = await nucleus.getLimitOrderPool(poolIDX);
      let amount2 = WeiPerEther.mul(10);
      let amount1 = HydrogenNucleusHelper.calculateAmountA(amount2, poolW.tradeRequests[0].exchangeRate);
      let amount3 = HydrogenNucleusHelper.calculateAmountA(amount1, poolX.exchangeRate);
      let mtLocation = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let balPlW11 = await nucleus.getTokenBalance(token1.address, poolWLocation);
      let balPlW21 = await nucleus.getTokenBalance(token2.address, poolWLocation);
      let balPlX11 = await nucleus.getTokenBalance(token1.address, poolXLocation);
      let balPlX31 = await nucleus.getTokenBalance(token3.address, poolXLocation);
      let balMt11 = await nucleus.getTokenBalance(token1.address, mtLocation);
      let balMt21 = await nucleus.getTokenBalance(token2.address, mtLocation);
      let balMt31 = await nucleus.getTokenBalance(token3.address, mtLocation);
      let txdataW = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
        poolID: poolIDW,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amount1,
        amountB: amount2,
        locationA: mtLocation,
        locationB: mtLocation,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      }]);
      let txdataX = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
        poolID: poolIDX,
        tokenA: token3.address,
        tokenB: token1.address,
        amountA: amount3,
        amountB: amount1,
        locationA: mtLocation,
        locationB: mtLocation,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      }]);
      let tx = await nucleus.connect(user2).multicall([txdataW, txdataX]);
      let balPlW12 = await nucleus.getTokenBalance(token1.address, poolWLocation);
      let balPlW22 = await nucleus.getTokenBalance(token2.address, poolWLocation);
      let balPlX12 = await nucleus.getTokenBalance(token1.address, poolXLocation);
      let balPlX32 = await nucleus.getTokenBalance(token3.address, poolXLocation);
      let balMt12 = await nucleus.getTokenBalance(token1.address, mtLocation);
      let balMt22 = await nucleus.getTokenBalance(token2.address, mtLocation);
      let balMt32 = await nucleus.getTokenBalance(token3.address, mtLocation);
      expect(balPlW11.sub(balPlW12)).eq(amount1);
      expect(balPlW22.sub(balPlW21)).eq(0);
      expect(balPlX12.sub(balPlX11)).eq(0);
      expect(balPlX31.sub(balPlX32)).eq(amount3);
      expect(balMt11.sub(balMt12)).eq(0);
      expect(balMt21.sub(balMt22)).eq(amount2);
      expect(balMt32.sub(balMt31)).eq(amount3);
      // w
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolWLocation, mtLocation, amount1);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocation, poolWLocation, amount2);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolIDW, token1.address, token2.address, amount1, amount2, amount2);
      // x
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token3.address, poolXLocation, mtLocation, amount3);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, mtLocation, poolXLocation, amount1);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolIDX, token3.address, token1.address, amount3, amount1, amount1);
    });
    it("can swap multiple times in a single order", async function () {
      // using only poolID 14002
      // user has tkn3. swap to tkn1 then tkn2
      let poolID = 14002;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let pool = await nucleus.getGridOrderPool(poolID);
      let amount3 = WeiPerUsdc.mul(5);
      let amount1 = HydrogenNucleusHelper.calculateAmountA(amount3, pool.tradeRequests[1].exchangeRate);
      let amount2 = HydrogenNucleusHelper.calculateAmountA(amount1, pool.tradeRequests[2].exchangeRate);
      let mtLocation = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let balPl11 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPl21 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balPl31 = await nucleus.getTokenBalance(token3.address, poolLocation);
      let balMt11 = await nucleus.getTokenBalance(token1.address, mtLocation);
      let balMt21 = await nucleus.getTokenBalance(token2.address, mtLocation);
      let balMt31 = await nucleus.getTokenBalance(token3.address, mtLocation);
      expect(amount1).lte(balPl11);
      expect(amount2).lte(balPl21);
      let txdata0 = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token3.address,
        amountA: amount1,
        amountB: amount3,
        locationA: mtLocation,
        locationB: mtLocation,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      }]);
      let txdata1 = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
        poolID: poolID,
        tokenA: token2.address,
        tokenB: token1.address,
        amountA: amount2,
        amountB: amount1,
        locationA: mtLocation,
        locationB: mtLocation,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      }]);
      let tx = await nucleus.connect(user2).multicall([txdata0, txdata1]);
      // user has tkn3. swap to tkn1 then tkn2
      let balPl12 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPl22 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balPl32 = await nucleus.getTokenBalance(token3.address, poolLocation);
      let balMt12 = await nucleus.getTokenBalance(token1.address, mtLocation);
      let balMt22 = await nucleus.getTokenBalance(token2.address, mtLocation);
      let balMt32 = await nucleus.getTokenBalance(token3.address, mtLocation);
      expect(balPl11.sub(balPl12)).eq(0);
      expect(balPl21.sub(balPl22)).eq(amount2);
      expect(balPl32.sub(balPl31)).eq(amount3);
      expect(balMt11.sub(balMt12)).eq(0);
      expect(balMt22.sub(balMt21)).eq(amount2);
      expect(balMt31.sub(balMt32)).eq(amount3);
      // 0
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocation, amount1);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token3.address, mtLocation, poolLocation, amount3);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token3.address, amount1, amount3, amount3);
      // 1
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, poolLocation, mtLocation, amount2);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, mtLocation, poolLocation, amount1);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token2.address, token1.address, amount2, amount1, amount1);
    });
    //it("can chain callbacks", async function () {}); // todo
  });

  describe("updateGridOrderPool", function () {
    it("cannot update non existant pool", async function () {
      await expect(nucleus.connect(user1).updateGridOrderPool({
        poolID: 0,
        tokenSources: [],
        tradeRequests: []
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("cannot update not your pool", async function () {
      await expect(nucleus.connect(user2).updateGridOrderPool({
        poolID: 14002,
        tokenSources: [],
        tradeRequests: []
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
    });
    it("cannot update to invalid location type", async function () {
      await expect(nucleus.connect(user1).updateGridOrderPool({
        poolID: 14002,
        tokenSources: [],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0, 0),
          locationB: INVALID_LOCATION_0
        }]
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("cannot update to invalid location external address zero", async function () {
      await expect(nucleus.connect(user1).updateGridOrderPool({
        poolID: 14002,
        tokenSources: [],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0, 0),
          locationB: HydrogenNucleusHelper.externalAddressToLocation(AddressZero)
        }]
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot update to invalid location internal address zero", async function () {
      await expect(nucleus.connect(user1).updateGridOrderPool({
        poolID: 14002,
        tokenSources: [],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0, 0),
          locationB: HydrogenNucleusHelper.internalAddressToLocation(AddressZero)
        }]
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("can update pool", async function () {
      let poolID = 14002;
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(101234, 100000);
      let locationB = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let tx = await nucleus.connect(user1).updateGridOrderPool({
        poolID: poolID,
        tokenSources: [],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: exchangeRate,
          locationB: locationB
        }]
      });
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, locationB);
      let pool = await nucleus.getGridOrderPool(poolID);
      expect(pool.tradeRequests[0].tokenA).eq(token1.address);
      expect(pool.tradeRequests[0].tokenB).eq(token2.address);
      expect(pool.tradeRequests[0].exchangeRate).eq(exchangeRate);
      expect(pool.tradeRequests[0].locationB).eq(locationB);
    });
    it("swaps execute at the new exchangeRate", async function () {
      // deposit more tokens
      let poolID = 14002;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: WeiPerEther.mul(100),
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: poolLocation
      });
      // test
      let pool = await nucleus.getGridOrderPool(poolID);
      let mtLocationA = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      let mtLocationB = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      let balNuA1 = await token1.balanceOf(nucleus.address);
      let balNuB1 = await token2.balanceOf(nucleus.address);
      let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB1 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let amountA = WeiPerEther.mul(10);
      let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, pool.tradeRequests[0].exchangeRate);
      expect(amountA).eq(amountB.mul(101234).div(100000));
      expect(amountA).gt(0);
      expect(amountB).gt(0);
      expect(amountA).lte(balPlA1);
      expect(amountB).lte(balMtB1);
      let params = {
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        amountB: amountB,
        locationA: mtLocationA,
        locationB: mtLocationB,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user2).executeFlashSwap(params);
      let balNuA2 = await token1.balanceOf(nucleus.address);
      let balNuB2 = await token2.balanceOf(nucleus.address);
      let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB2 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      expect(balNuA1.sub(balNuA2)).eq(amountA);
      expect(balPlA1.sub(balPlA2)).eq(amountA);
      expect(balMtA2.sub(balMtA1)).eq(amountA);
      expect(balNuB2.sub(balNuB1)).eq(amountB);
      expect(balPlB2.sub(balPlB1)).eq(0);
      expect(balMtB1.sub(balMtB2)).eq(amountB);
      await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amountA);
      await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationA, amountA);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationB, poolLocation, amountB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, poolLocation, pool.tradeRequests[0].locationB, amountB);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountA, amountB, amountB);
    });
    it("cannot update grid order with excessive number of tokens", async function () {
      // works with 20
      let tokenSources = [];
      let loc = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      for(let i = 0; i < 20; i++) {
        tokenSources.push({
          token: tokens[i].address,
          amount: 0,
          location: loc
        });
      }
      await nucleus.connect(user1).updateGridOrderPool({
        poolID: 14002,
        tokenSources: tokenSources,
        tradeRequests: []
      });
      // fails at 21
      tokenSources.push({
        token: tokens[20].address,
        amount: 0,
        location: loc
      });
      await expect(nucleus.connect(user1).updateGridOrderPool({
        poolID: 14002,
        tokenSources: tokenSources,
        tradeRequests: []
      })).to.be.revertedWithCustomError(nucleus, "HydrogenMaxTokensPerGridOrder");
    });
  });

  describe("pool views", function () {
    it("cannot view a limit order as a grid order", async function () {
      await expect(nucleus.getGridOrderPool(1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotAGridOrderPool");
    });
    it("cannot view a grid order as a limit order", async function () {
      await expect(nucleus.getLimitOrderPool(12002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotALimitOrderPool");
    });
    it("cannot update a limit order as a grid order", async function () {
      await expect(nucleus.connect(user1).updateGridOrderPool({
        poolID: 1001,
        tokenSources: [],
        tradeRequests: []
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotAGridOrderPool");
    });
    it("cannot update a grid order as a limit order", async function () {
      await expect(nucleus.connect(user1).updateLimitOrderPool({
        poolID: 12002,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1,1),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotALimitOrderPool");
    });
    it("getTradeRequest must be in same direction as limit order", async function () {
      let bal = await nucleus.getTokenBalance(token2.address, HydrogenNucleusHelper.poolIDtoLocation(1001));
      let tradeRequest = await nucleus.getTradeRequest(1001, token2.address, token1.address);
      expect(tradeRequest.amountA).eq(bal);
      expect(tradeRequest.exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(tradeRequest.locationB).eq(NULL_LOCATION);
    });
  });

  describe("swap fees", function () {
    it("starts zero", async function () {
      let fees0 = await nucleus.getStoredSwapFeeForPair(token1.address, token2.address);
      expect(fees0.feePPM).eq(NULL_FEE);
      expect(fees0.receiverLocation).eq(NULL_LOCATION);
      let fees1 = await nucleus.getSwapFeeForPair(token1.address, token2.address);
      expect(fees1.feePPM).eq(0);
      expect(fees1.receiverLocation).eq(NULL_LOCATION);
    });
    it("cannot be set by non owner", async function () {
      await expect(nucleus.connect(user1).setSwapFeesForPairs([])).to.be.revertedWithCustomError(nucleus, "HydrogenNotContractOwner");
    });
    it("cannot be set to invalid location", async function () {
      await expect(nucleus.connect(owner).setSwapFeesForPairs([
        {
          // swaps from token2 to token1 cost 0.1%
          // note since 1->2 isn't set, it uses default fee
          tokenA: token1.address,
          tokenB: token2.address,
          feePPM: MAX_PPM.mul(1).div(1000),
          receiverLocation: INVALID_LOCATION_0
        }
      ])).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("can be set", async function () {
      let fee00 = MAX_PPM.mul(2).div(1000);
      let fee12 = MAX_PPM.mul(1).div(1000);
      let fee13 = MAX_PPM;
      let treasuryLocation = HydrogenNucleusHelper.internalAddressToLocation(owner.address);
      let deployerLocation = HydrogenNucleusHelper.internalAddressToLocation(deployer.address);
      let tx = await nucleus.connect(owner).setSwapFeesForPairs([
        {
          // default fee: 0.2%
          tokenA: AddressZero,
          tokenB: AddressZero,
          feePPM: fee00,
          receiverLocation: treasuryLocation
        },{
          // swaps from token2 to token1 cost 0.1%
          // note since 1->2 isn't set, it uses default fee
          tokenA: token1.address,
          tokenB: token2.address,
          feePPM: fee12,
          receiverLocation: deployerLocation
        },{
          // swaps from token3 to token1 cost 0.0%
          tokenA: token1.address,
          tokenB: token3.address,
          feePPM: fee13,
          receiverLocation: treasuryLocation
        }
      ]);

      let fees0 = await nucleus.getStoredSwapFeeForPair(AddressZero, AddressZero);
      expect(fees0.feePPM).eq(fee00);
      expect(fees0.receiverLocation).eq(treasuryLocation);
      let fees1 = await nucleus.getSwapFeeForPair(AddressZero, AddressZero);
      expect(fees1.feePPM).eq(fee00);
      expect(fees1.receiverLocation).eq(treasuryLocation);

      let fees2 = await nucleus.getStoredSwapFeeForPair(token1.address, token2.address);
      expect(fees2.feePPM).eq(fee12);
      expect(fees2.receiverLocation).eq(deployerLocation);
      let fees3 = await nucleus.getSwapFeeForPair(token1.address, token2.address);
      expect(fees3.feePPM).eq(fee12);
      expect(fees3.receiverLocation).eq(deployerLocation);

      let fees4 = await nucleus.getStoredSwapFeeForPair(token1.address, token3.address);
      expect(fees4.feePPM).eq(fee13);
      expect(fees4.receiverLocation).eq(treasuryLocation);
      let fees5 = await nucleus.getSwapFeeForPair(token1.address, token3.address);
      expect(fees5.feePPM).eq(0);
      expect(fees5.receiverLocation).eq(treasuryLocation);

      let fees6 = await nucleus.getStoredSwapFeeForPair(token2.address, token1.address);
      expect(fees6.feePPM).eq(0);
      expect(fees6.receiverLocation).eq(NULL_LOCATION);
      let fees7 = await nucleus.getSwapFeeForPair(token2.address, token1.address);
      expect(fees7.feePPM).eq(fee00);
      expect(fees7.receiverLocation).eq(treasuryLocation);

      await expect(tx).to.emit(nucleus, "SwapFeeSetForPair").withArgs(AddressZero, AddressZero, fee00, treasuryLocation);
      await expect(tx).to.emit(nucleus, "SwapFeeSetForPair").withArgs(token1.address, token2.address, fee12, deployerLocation);
      await expect(tx).to.emit(nucleus, "SwapFeeSetForPair").withArgs(token1.address, token3.address, fee13, treasuryLocation);
    });
    it("market orders accrue fees part 1", async function () {
      // default fee
      // trade token1 for token2 in poolID 8001
      await token2.connect(user2).approve(nucleus.address, MaxUint256);
      let fees = await nucleus.getSwapFeeForPair(token2.address, token1.address);
      let poolID = 8001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let pool = await nucleus.getLimitOrderPool(poolID);
      let mtLocationA = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let mtLocationB = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let balPlA1 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(token2.address, mtLocationA);
      let balMtB1 = await nucleus.getTokenBalance(token1.address, mtLocationB);
      let balMmB1 = await nucleus.getTokenBalance(token1.address, pool.locationB);
      let balFrA1 = await nucleus.getTokenBalance(token2.address, fees.receiverLocation);
      let balFrB1 = await nucleus.getTokenBalance(token1.address, fees.receiverLocation);
      let amountAMM = WeiPerEther.mul(10);
      let amountBMM = HydrogenNucleusHelper.calculateAmountB(amountAMM, pool.exchangeRate);
      let amountAMT = amountAMM;
      let amountBMT = amountBMM.mul(MAX_PPM).div(MAX_PPM.sub(fees.feePPM))
      let amountAFR = Zero;
      let amountBFR = amountBMT.mul(fees.feePPM).div(MAX_PPM);
      amountBMM = amountBMT.sub(amountBFR);
      expect(amountAMM).eq(amountBMM.mul(10).div(18));
      expect(amountAMM).gt(0);
      expect(amountBMM).gt(0);
      expect(amountAMT).gt(0);
      expect(amountBMT).gt(0);
      expect(amountBFR).gt(0);
      expect(amountAMM).lte(balPlA1);
      expect(amountBMT).lte(balMtB1);
      let params = {
        poolID: poolID,
        tokenA: token2.address,
        tokenB: token1.address,
        amountA: amountAMT,
        amountB: amountBMT,
        locationA: mtLocationA,
        locationB: mtLocationB,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user1).executeFlashSwap(params);
      let balPlA2 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(token2.address, mtLocationA);
      let balMtB2 = await nucleus.getTokenBalance(token1.address, mtLocationB);
      let balMmB2 = await nucleus.getTokenBalance(token1.address, pool.locationB);
      let balFrA2 = await nucleus.getTokenBalance(token2.address, fees.receiverLocation);
      let balFrB2 = await nucleus.getTokenBalance(token1.address, fees.receiverLocation);
      expect(balPlA1.sub(balPlA2)).eq(amountAMM);
      expect(balMtA2.sub(balMtA1)).eq(amountAMT);
      expect(balFrA2.sub(balFrA1)).eq(amountAFR);
      expect(balPlB2.sub(balPlB1)).eq(0);
      expect(balMtB1.sub(balMtB2)).eq(amountBMT);
      expect(balMmB2.sub(balMmB1)).eq(amountBMM);
      expect(balFrB2.sub(balFrB1)).eq(amountBFR);
      let pool2 = await nucleus.getLimitOrderPool(poolID);
      expect(pool2.tokenA).eq(pool.tokenA);
      expect(pool2.tokenB).eq(pool.tokenB);
      expect(pool2.amountA).eq(pool.amountA.sub(amountAMM));
      expect(pool2.exchangeRate).eq(pool.exchangeRate);
      expect(pool2.locationB).eq(pool.locationB);
      let tradeRequest2 = await nucleus.getTradeRequest(poolID, token2.address, token1.address);
      expect(tradeRequest2.amountA).eq(pool.amountA.sub(amountAMM));
      expect(tradeRequest2.exchangeRate).eq(pool.exchangeRate);
      expect(tradeRequest2.locationB).eq(pool.locationB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, poolLocation, mtLocationA, amountAMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, mtLocationB, poolLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, pool.locationB, amountBMM);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, mtLocationB, fees.receiverLocation, amountBFR);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token2.address, token1.address, amountAMM, amountBMT, amountBMM);
    });
    it("market orders accrue fees part 2", async function () {
      // fee for pair
      // trade token2 for token1 in poolID 4001
      let fees = await nucleus.getSwapFeeForPair(token1.address, token2.address);
      let poolID = 4001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let pool = await nucleus.getLimitOrderPool(poolID);
      let mtLocationA = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let mtLocationB = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB1 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB1 = await nucleus.getTokenBalance(token2.address, pool.locationB);
      let balFrA1 = await nucleus.getTokenBalance(token1.address, fees.receiverLocation);
      let balFrB1 = await nucleus.getTokenBalance(token2.address, fees.receiverLocation);
      let amountAMM = WeiPerEther.mul(10);
      let amountBMM = HydrogenNucleusHelper.calculateAmountB(amountAMM, pool.exchangeRate);
      let amountAMT = amountAMM;
      let amountBMT = amountBMM.mul(MAX_PPM).div(MAX_PPM.sub(fees.feePPM))
      let amountAFR = Zero;
      let amountBFR = amountBMT.mul(fees.feePPM).div(MAX_PPM);
      amountBMM = amountBMT.sub(amountBFR);
      expect(amountAMM).gt(0);
      expect(amountBMM).gt(0);
      expect(amountAMT).gt(0);
      expect(amountBMT).gt(0);
      expect(amountBFR).gt(0);
      expect(amountAMM).lte(balPlA1);
      expect(amountBMT).lte(balMtB1);
      let params = {
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountAMT,
        amountB: amountBMT,
        locationA: mtLocationA,
        locationB: mtLocationB,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user1).executeFlashSwap(params);
      let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB2 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB2 = await nucleus.getTokenBalance(token2.address, pool.locationB);
      let balFrA2 = await nucleus.getTokenBalance(token1.address, fees.receiverLocation);
      let balFrB2 = await nucleus.getTokenBalance(token2.address, fees.receiverLocation);
      expect(balPlA1.sub(balPlA2)).eq(amountAMM);
      expect(balMtA2.sub(balMtA1)).eq(amountAMT);
      expect(balFrA2.sub(balFrA1)).eq(amountAFR);
      expect(balPlB2.sub(balPlB1)).eq(0);
      expect(balMtB1.sub(balMtB2)).eq(amountBMT);
      expect(balMmB2.sub(balMmB1)).eq(amountBMM);
      expect(balFrB2.sub(balFrB1)).eq(amountBFR);
      let pool2 = await nucleus.getLimitOrderPool(poolID);
      expect(pool2.tokenA).eq(pool.tokenA);
      expect(pool2.tokenB).eq(pool.tokenB);
      expect(pool2.amountA).eq(pool.amountA.sub(amountAMM));
      expect(pool2.exchangeRate).eq(pool.exchangeRate);
      expect(pool2.locationB).eq(pool.locationB);
      let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest2.amountA).eq(pool.amountA.sub(amountAMM));
      expect(tradeRequest2.exchangeRate).eq(pool.exchangeRate);
      expect(tradeRequest2.locationB).eq(pool.locationB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationA, amountAMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationB, poolLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, poolLocation, pool.locationB, amountBMM);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationB, fees.receiverLocation, amountBFR);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountAMM, amountBMT, amountBMM);
    });
    it("market orders accrue fees part 3", async function () {
      // explicit zero
      // trade token3 for token1 in poolID 14002
      let fees = await nucleus.getSwapFeeForPair(token1.address, token3.address);
      let poolID = 14002;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token3.address);
      let mtLocationA = HydrogenNucleusHelper.internalAddressToLocation(user5.address);
      let mtLocationB = HydrogenNucleusHelper.internalAddressToLocation(user5.address);
      let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(token3.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB1 = await nucleus.getTokenBalance(token3.address, mtLocationB);
      let balMmB1 = await nucleus.getTokenBalance(token3.address, tradeRequest.locationB);
      let balFrA1 = await nucleus.getTokenBalance(token1.address, fees.receiverLocation);
      let balFrB1 = await nucleus.getTokenBalance(token3.address, fees.receiverLocation);
      let amountAMM = WeiPerEther.mul(10);
      let amountBMM = HydrogenNucleusHelper.calculateAmountB(amountAMM, tradeRequest.exchangeRate);
      let amountAMT = amountAMM;
      let amountBMT = amountBMM.mul(MAX_PPM).div(MAX_PPM.sub(fees.feePPM))
      let amountAFR = Zero;
      let amountBFR = amountBMT.mul(fees.feePPM).div(MAX_PPM);
      amountBMM = amountBMT.sub(amountBFR);
      expect(amountAMM).gt(0);
      expect(amountBMM).gt(0);
      expect(amountAMT).gt(0);
      expect(amountBMT).gt(0);
      expect(amountBFR).eq(0);
      expect(amountAMM).lte(balPlA1);
      expect(amountBMT).lte(balMtB1);
      let params = {
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token3.address,
        amountA: amountAMT,
        amountB: amountBMT,
        locationA: mtLocationA,
        locationB: mtLocationB,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user5).executeFlashSwap(params);
      let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(token3.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB2 = await nucleus.getTokenBalance(token3.address, mtLocationB);
      let balMmB2 = await nucleus.getTokenBalance(token3.address, tradeRequest.locationB);
      let balFrA2 = await nucleus.getTokenBalance(token1.address, fees.receiverLocation);
      let balFrB2 = await nucleus.getTokenBalance(token3.address, fees.receiverLocation);
      expect(balPlA1.sub(balPlA2)).eq(amountAMM);
      expect(balMtA2.sub(balMtA1)).eq(amountAMT);
      expect(balFrA2.sub(balFrA1)).eq(amountAFR);
      expect(balPlB2.sub(balPlB1)).eq(amountBMM);
      expect(balMtB1.sub(balMtB2)).eq(amountBMT);
      expect(balMmB2.sub(balMmB1)).eq(amountBMM);
      expect(balFrB2.sub(balFrB1)).eq(amountBFR);
      let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token3.address);
      expect(tradeRequest2.amountA).eq(tradeRequest.amountA.sub(amountAMM));
      expect(tradeRequest2.exchangeRate).eq(tradeRequest.exchangeRate);
      expect(tradeRequest2.locationB).eq(tradeRequest.locationB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationA, amountAMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token3.address, mtLocationB, poolLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token3.address, amountAMM, amountBMT, amountBMM);
    });
  });

  describe("multicall", function () {
    // only test failure cases. success cases are handled above
    it("can multicall receive", async function () {
      await expect(nucleus.multicall(["0x"])).to.not.be.reverted;
    });
    it("cannot call non existant function 2", async function () {
      await expect(nucleus.multicall(["0x12345678"])).to.be.revertedWithCustomError(nucleus, "HydrogenUnknownError");
    });
    it("can revert with known error", async function () {
      let txdata = nucleus.interface.encodeFunctionData("tokenTransfer", [{
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.externalAddressToLocation(user2.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user2.address)
      }])
      await expect(nucleus.connect(user1).multicall([txdata])).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
    });
    it("can revert with unknown error", async function () {
      let txdata = nucleus.interface.encodeFunctionData("tokenTransfer", [{
        token: user1.address,
        amount: 1,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      }])
      await expect(nucleus.connect(user1).multicall([txdata])).to.be.revertedWithCustomError(nucleus, "HydrogenUnknownError");
    });
  });

  describe("tokenTransfer part 3", function () {
    it("can transfer from known location to flag location external address", async function () {
      let src = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let dst = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(3);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS,
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu1.sub(balNu2)).eq(amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
    });
    it("can transfer from known location to flag location internal address", async function () {
      let src = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let dst = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(3);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: src,
        dst: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS,
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu2.sub(balNu1)).eq(amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
    });
    it("can transfer from flag location external address to known location", async function () {
      let src = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let dst = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(3);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS,
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
    });
    it("can transfer from flag location external address to flag location external address", async function () {
      let src = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let dst = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(3);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS,
        dst: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(0);
      expect(balDst2.sub(balDst1)).eq(0);
      expect(balNu2.sub(balNu1)).eq(0);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
    });
    it("can transfer from flag location external address to flag location internal address", async function () {
      let src = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let dst = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(3);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS,
        dst: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS,
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu2.sub(balNu1)).eq(amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
      await expect(tx).to.emit(token1, "Transfer").withArgs(user1.address, nucleus.address, amount);
    });
    it("can transfer from flag location internal address to known location", async function () {
      let src = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let dst = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(3);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS,
        dst: dst
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu2.sub(balNu1)).eq(0);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
    });
    it("can transfer from flag location internal address to flag location external address", async function () {
      let src = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let dst = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(3);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS,
        dst: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS,
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(amount);
      expect(balDst2.sub(balDst1)).eq(amount);
      expect(balNu1.sub(balNu2)).eq(amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
      await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user1.address, amount);
    });
    it("can transfer from flag location internal address to flag location internal address", async function () {
      let src = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let dst = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let balSrc1 = await nucleus.getTokenBalance(token1.address, src);
      let balDst1 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu1 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(3);
      let tx = await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: amount,
        src: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS,
        dst: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS,
      });
      let balSrc2 = await nucleus.getTokenBalance(token1.address, src);
      let balDst2 = await nucleus.getTokenBalance(token1.address, dst);
      let balNu2 = await token1.balanceOf(nucleus.address);
      expect(balSrc1.sub(balSrc2)).eq(0);
      expect(balDst2.sub(balDst1)).eq(0);
      expect(balNu1.sub(balNu2)).eq(0);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, src, dst, amount);
    });
    it("cannot transfer from flag location pool", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
      })).to.be.revertedWithCustomError(nucleus, "HydrogenMissingPoolContext");
    });
    it("cannot transfer to flag location pool", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
      })).to.be.revertedWithCustomError(nucleus, "HydrogenMissingPoolContext");
    });
    it("cannot transfer from invalid flag location", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: INVALID_LOCATION_FLAG,
        dst: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationFlag");
    });
    it("cannot transfer to invalid flag location", async function () {
      await expect(nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        amount: 1,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: INVALID_LOCATION_FLAG,
      })).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationFlag");
    });
  });

  describe("createLimitOrderPool part 2", function () {
    it("can create limit order funded by flag location external address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = (totalSupply+1) * 1000 + 1;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(5);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(1, 1);
      let locationA = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let locationB = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate,
        locationA: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS,
        locationB: locationB,
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createLimitOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createLimitOrderPool(params);
      expect(await nucleus.totalSupply()).eq(totalSupply+1);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(1);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(token1.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.amountA).eq(amountA);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest.amountA).eq(amountA);
      expect(tradeRequest.exchangeRate).eq(exchangeRate);
      expect(tradeRequest.locationB).eq(locationB);
      expect(await nucleus.getTokenBalance(token1.address, poolLocation)).eq(amountA);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user1.address);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(amountA);
      expect(balEA1.sub(balEA2)).eq(amountA);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.emit(token1, "Transfer").withArgs(user1.address, nucleus.address, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, params.locationB);
    });
    it("can create limit order funded by flag location internal address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = (totalSupply+1) * 1000 + 1;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(5);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(1, 1);
      let locationA = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let locationB = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate,
        locationA: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS,
        locationB: locationB,
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createLimitOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createLimitOrderPool(params);
      expect(await nucleus.totalSupply()).eq(totalSupply+1);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(1);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(token1.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.amountA).eq(amountA);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest.amountA).eq(amountA);
      expect(tradeRequest.exchangeRate).eq(exchangeRate);
      expect(tradeRequest.locationB).eq(locationB);
      expect(await nucleus.getTokenBalance(token1.address, poolLocation)).eq(amountA);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user1.address);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(0);
      expect(balEA1.sub(balEA2)).eq(0);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, params.locationB);
    });
    it("cannot create limit order funded by flag location pool", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1,1),
        locationA: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenMissingPoolContext");
    });
    it("can create limit order with output to flag location external address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = (totalSupply+1) * 1000 + 1;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(5);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(1, 1);
      let locationA = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let locationB = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate,
        locationA: locationA,
        locationB: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS,
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createLimitOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createLimitOrderPool(params);
      expect(await nucleus.totalSupply()).eq(totalSupply+1);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(1);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(token1.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.amountA).eq(amountA);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest.amountA).eq(amountA);
      expect(tradeRequest.exchangeRate).eq(exchangeRate);
      expect(tradeRequest.locationB).eq(locationB);
      expect(await nucleus.getTokenBalance(token1.address, poolLocation)).eq(amountA);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user1.address);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(0);
      expect(balEA1.sub(balEA2)).eq(0);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, locationB);
    });
    it("can create limit order with output to flag location internal address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = (totalSupply+1) * 1000 + 1;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(5);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(1, 1);
      let locationA = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let locationB = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate,
        locationA: locationA,
        locationB: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS,
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createLimitOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createLimitOrderPool(params);
      expect(await nucleus.totalSupply()).eq(totalSupply+1);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(1);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(token1.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.amountA).eq(amountA);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest.amountA).eq(amountA);
      expect(tradeRequest.exchangeRate).eq(exchangeRate);
      expect(tradeRequest.locationB).eq(locationB);
      expect(await nucleus.getTokenBalance(token1.address, poolLocation)).eq(amountA);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user1.address);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(amountA);
      expect(balEA1.sub(balEA2)).eq(amountA);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, locationB);
    });
    it("can create limit order with output to flag location pool", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = (totalSupply+1) * 1000 + 1;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(5);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(1, 1);
      let locationA = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let locationB = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate,
        locationA: locationA,
        locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createLimitOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createLimitOrderPool(params);
      expect(await nucleus.totalSupply()).eq(totalSupply+1);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(1);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(token1.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.amountA).eq(amountA);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest.amountA).eq(amountA);
      expect(tradeRequest.exchangeRate).eq(exchangeRate);
      expect(tradeRequest.locationB).eq(locationB);
      expect(await nucleus.getTokenBalance(token1.address, poolLocation)).eq(amountA);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user1.address);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(amountA);
      expect(balEA1.sub(balEA2)).eq(amountA);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, locationB);
    });
  });

  describe("updateLimitOrderPool part 2", function () {
    it("can set locationB to known location", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = totalSupply * 1000 + 1;
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(1,2);
      let locationB = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      let tx = await nucleus.connect(user1).updateLimitOrderPool({
        poolID: poolID,
        exchangeRate: exchangeRate,
        locationB: locationB
      });
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, locationB);
    });
    it("can set locationB to flag location external address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = totalSupply * 1000 + 1;
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(1,2);
      let locationB = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let tx = await nucleus.connect(user1).updateLimitOrderPool({
        poolID: poolID,
        exchangeRate: exchangeRate,
        locationB: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS
      });
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, locationB);
    });
    it("can set locationB to flag location internal address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = totalSupply * 1000 + 1;
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(1,2);
      let locationB = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let tx = await nucleus.connect(user1).updateLimitOrderPool({
        poolID: poolID,
        exchangeRate: exchangeRate,
        locationB: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS
      });
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, locationB);
    });
    it("can set locationB to flag location pool", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = totalSupply * 1000 + 1;
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(1,2);
      let locationB = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let tx = await nucleus.connect(user1).updateLimitOrderPool({
        poolID: poolID,
        exchangeRate: exchangeRate,
        locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
      });
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, locationB);
    });
  });

  describe("createGridOrderPool part 2", function () {
    // these tests also cover updateGridOrderPool() as the transform is applied in _updateGridOrderPool()
    before(async function () {
      await token1.connect(user1).mint(user1.address, WeiPerEther.mul(10_000));
      await nucleus.connect(user1).tokenTransfer({
        token: token1.address,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(user1.address),
        amount: WeiPerEther.mul(5_000)
      });
    });
    it("can create grid order funded by flag location external address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = (totalSupply+1) * 1000 + 2;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(100);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(15, 10);
      let locationA = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let locationB = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getGridOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenSources: [{
          token: token1.address,
          amount: amountA,
          location: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS
        }],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: exchangeRate,
          locationB: locationB
        }],
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createGridOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createGridOrderPool(params);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(2);
      let pool = await nucleus.getGridOrderPool(poolID);
      expect(pool.tokens).deep.eq([token1.address, token2.address]);
      expect(pool.balances.length).eq(2);
      expect(pool.balances[0]).eq(amountA);
      expect(pool.balances[1]).eq(0);
      expect(pool.tradeRequests.length).eq(2);
      expect(pool.tradeRequests[0].tokenA).eq(token1.address);
      expect(pool.tradeRequests[0].tokenB).eq(token2.address);
      expect(pool.tradeRequests[0].exchangeRate).eq(exchangeRate);
      expect(pool.tradeRequests[0].locationB).eq(locationB);
      expect(pool.tradeRequests[1].tokenA).eq(token2.address);
      expect(pool.tradeRequests[1].tokenB).eq(token1.address);
      expect(pool.tradeRequests[1].exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(pool.tradeRequests[1].locationB).eq(NULL_LOCATION);
      let tradeRequest0 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest0.amountA).eq(amountA);
      expect(tradeRequest0.exchangeRate).eq(exchangeRate);
      expect(tradeRequest0.locationB).eq(locationB);
      let tradeRequest1 = await nucleus.getTradeRequest(poolID, token2.address, token1.address);
      expect(tradeRequest1.amountA).eq(0);
      expect(tradeRequest1.exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(tradeRequest1.locationB).eq(NULL_LOCATION);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user1.address);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(amountA);
      expect(balEA1.sub(balEA2)).eq(amountA);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.emit(token1, "Transfer").withArgs(user1.address, nucleus.address, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, locationB);
    });
    it("can create grid order funded by flag location internal address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = (totalSupply+1) * 1000 + 2;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(100);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(15, 10);
      let locationA = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let locationB = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getGridOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenSources: [{
          token: token1.address,
          amount: amountA,
          location: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS
        }],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: exchangeRate,
          locationB: locationB
        }],
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createGridOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createGridOrderPool(params);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(2);
      let pool = await nucleus.getGridOrderPool(poolID);
      expect(pool.tokens).deep.eq([token1.address, token2.address]);
      expect(pool.balances.length).eq(2);
      expect(pool.balances[0]).eq(amountA);
      expect(pool.balances[1]).eq(0);
      expect(pool.tradeRequests.length).eq(2);
      expect(pool.tradeRequests[0].tokenA).eq(token1.address);
      expect(pool.tradeRequests[0].tokenB).eq(token2.address);
      expect(pool.tradeRequests[0].exchangeRate).eq(exchangeRate);
      expect(pool.tradeRequests[0].locationB).eq(locationB);
      expect(pool.tradeRequests[1].tokenA).eq(token2.address);
      expect(pool.tradeRequests[1].tokenB).eq(token1.address);
      expect(pool.tradeRequests[1].exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(pool.tradeRequests[1].locationB).eq(NULL_LOCATION);
      let tradeRequest0 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest0.amountA).eq(amountA);
      expect(tradeRequest0.exchangeRate).eq(exchangeRate);
      expect(tradeRequest0.locationB).eq(locationB);
      let tradeRequest1 = await nucleus.getTradeRequest(poolID, token2.address, token1.address);
      expect(tradeRequest1.amountA).eq(0);
      expect(tradeRequest1.exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(tradeRequest1.locationB).eq(NULL_LOCATION);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user1.address);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(0);
      expect(balEA1.sub(balEA2)).eq(0);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, locationB);
    });
    it("can create grid order with output to flag location external address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = (totalSupply+1) * 1000 + 2;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(100);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(15, 10);
      let locationA = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      let locationB = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getGridOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenSources: [{
          token: token1.address,
          amount: amountA,
          location: locationA
        }],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: exchangeRate,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS
        }],
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createGridOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createGridOrderPool(params);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(2);
      let pool = await nucleus.getGridOrderPool(poolID);
      expect(pool.tokens).deep.eq([token1.address, token2.address]);
      expect(pool.balances.length).eq(2);
      expect(pool.balances[0]).eq(amountA);
      expect(pool.balances[1]).eq(0);
      expect(pool.tradeRequests.length).eq(2);
      expect(pool.tradeRequests[0].tokenA).eq(token1.address);
      expect(pool.tradeRequests[0].tokenB).eq(token2.address);
      expect(pool.tradeRequests[0].exchangeRate).eq(exchangeRate);
      expect(pool.tradeRequests[0].locationB).eq(locationB);
      expect(pool.tradeRequests[1].tokenA).eq(token2.address);
      expect(pool.tradeRequests[1].tokenB).eq(token1.address);
      expect(pool.tradeRequests[1].exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(pool.tradeRequests[1].locationB).eq(NULL_LOCATION);
      let tradeRequest0 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest0.amountA).eq(amountA);
      expect(tradeRequest0.exchangeRate).eq(exchangeRate);
      expect(tradeRequest0.locationB).eq(locationB);
      let tradeRequest1 = await nucleus.getTradeRequest(poolID, token2.address, token1.address);
      expect(tradeRequest1.amountA).eq(0);
      expect(tradeRequest1.exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(tradeRequest1.locationB).eq(NULL_LOCATION);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user1.address);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(0);
      expect(balEA1.sub(balEA2)).eq(0);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, locationB);
    });
    it("can create grid order with output to flag location internal address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = (totalSupply+1) * 1000 + 2;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(100);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(15, 10);
      let locationA = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let locationB = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getGridOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenSources: [{
          token: token1.address,
          amount: amountA,
          location: locationA
        }],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: exchangeRate,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS
        }],
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createGridOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createGridOrderPool(params);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(2);
      let pool = await nucleus.getGridOrderPool(poolID);
      expect(pool.tokens).deep.eq([token1.address, token2.address]);
      expect(pool.balances.length).eq(2);
      expect(pool.balances[0]).eq(amountA);
      expect(pool.balances[1]).eq(0);
      expect(pool.tradeRequests.length).eq(2);
      expect(pool.tradeRequests[0].tokenA).eq(token1.address);
      expect(pool.tradeRequests[0].tokenB).eq(token2.address);
      expect(pool.tradeRequests[0].exchangeRate).eq(exchangeRate);
      expect(pool.tradeRequests[0].locationB).eq(locationB);
      expect(pool.tradeRequests[1].tokenA).eq(token2.address);
      expect(pool.tradeRequests[1].tokenB).eq(token1.address);
      expect(pool.tradeRequests[1].exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(pool.tradeRequests[1].locationB).eq(NULL_LOCATION);
      let tradeRequest0 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest0.amountA).eq(amountA);
      expect(tradeRequest0.exchangeRate).eq(exchangeRate);
      expect(tradeRequest0.locationB).eq(locationB);
      let tradeRequest1 = await nucleus.getTradeRequest(poolID, token2.address, token1.address);
      expect(tradeRequest1.amountA).eq(0);
      expect(tradeRequest1.exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(tradeRequest1.locationB).eq(NULL_LOCATION);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user1.address);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(amountA);
      expect(balEA1.sub(balEA2)).eq(amountA);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, locationB);
    });
    it("can create grid order with output to flag location pool", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = (totalSupply+1) * 1000 + 2;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(100);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(15, 10);
      let locationA = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      let locationB = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getGridOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let params = {
        tokenSources: [{
          token: token1.address,
          amount: amountA,
          location: locationA
        }],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: exchangeRate,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        }],
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createGridOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createGridOrderPool(params);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(2);
      let pool = await nucleus.getGridOrderPool(poolID);
      expect(pool.tokens).deep.eq([token1.address, token2.address]);
      expect(pool.balances.length).eq(2);
      expect(pool.balances[0]).eq(amountA);
      expect(pool.balances[1]).eq(0);
      expect(pool.tradeRequests.length).eq(2);
      expect(pool.tradeRequests[0].tokenA).eq(token1.address);
      expect(pool.tradeRequests[0].tokenB).eq(token2.address);
      expect(pool.tradeRequests[0].exchangeRate).eq(exchangeRate);
      expect(pool.tradeRequests[0].locationB).eq(locationB);
      expect(pool.tradeRequests[1].tokenA).eq(token2.address);
      expect(pool.tradeRequests[1].tokenB).eq(token1.address);
      expect(pool.tradeRequests[1].exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(pool.tradeRequests[1].locationB).eq(NULL_LOCATION);
      let tradeRequest0 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest0.amountA).eq(amountA);
      expect(tradeRequest0.exchangeRate).eq(exchangeRate);
      expect(tradeRequest0.locationB).eq(locationB);
      let tradeRequest1 = await nucleus.getTradeRequest(poolID, token2.address, token1.address);
      expect(tradeRequest1.amountA).eq(0);
      expect(tradeRequest1.exchangeRate).eq(NULL_EXCHANGE_RATE);
      expect(tradeRequest1.locationB).eq(NULL_LOCATION);
      let balNu2 = await token1.balanceOf(nucleus.address);
      let balEA2 = await token1.balanceOf(user1.address);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(amountA);
      expect(balEA1.sub(balEA2)).eq(amountA);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, locationB);
    });
  });

  describe("executeFlashSwap part 2", function () {
    it("can execute market order from flag location external address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = totalSupply * 1000 + 2;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      //let pool = await nucleus.getGridOrderPool(poolID);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      let mtLocationA = HydrogenNucleusHelper.internalAddressToLocation(user3.address);
      let mtLocationB = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      let balNuA1 = await token1.balanceOf(nucleus.address);
      let balNuB1 = await token2.balanceOf(nucleus.address);
      let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB1 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB1 = await nucleus.getTokenBalance(token2.address, tradeRequest.locationB);
      let amountAMT = WeiPerEther.mul(7);
      let { feePPM } = await nucleus.getSwapFeeForPair(token1.address, token2.address)
      let { amountBMT, amountBMM } = HydrogenNucleusHelper.calculateMarketOrderExactAMT(amountAMT, tradeRequest.exchangeRate, feePPM);
      expect(amountAMT).gt(0);
      expect(amountBMT).gt(0);
      expect(amountAMT).lte(balPlA1);
      expect(amountBMT).lte(balMtB1);
      let params = {
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountAMT,
        amountB: amountBMT,
        locationA: mtLocationA,
        locationB: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user2).executeFlashSwap(params);
      let balNuA2 = await token1.balanceOf(nucleus.address);
      let balNuB2 = await token2.balanceOf(nucleus.address);
      let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB2 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB2 = await nucleus.getTokenBalance(token2.address, tradeRequest.locationB);
      expect(balNuA1.sub(balNuA2)).eq(0);
      expect(balPlA1.sub(balPlA2)).eq(amountAMT);
      expect(balMtA2.sub(balMtA1)).eq(amountAMT);
      expect(balNuB2.sub(balNuB1)).eq(amountBMT);
      expect(balPlB2.sub(balPlB1)).eq(amountBMM);
      expect(balMtB1.sub(balMtB2)).eq(amountBMT);
      expect(balMmB2.sub(balMmB1)).eq(amountBMM);
      let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest2.amountA).eq(tradeRequest.amountA.sub(amountAMT));
      expect(tradeRequest2.exchangeRate).eq(tradeRequest.exchangeRate);
      expect(tradeRequest2.locationB).eq(tradeRequest.locationB);
      await expect(tx).to.not.emit(token1, "Transfer");
      await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountBMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationA, amountAMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationB, poolLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountAMT, amountBMT, amountBMM);
    });
    it("can execute market order from flag location internal address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = totalSupply * 1000 + 2;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      //let pool = await nucleus.getGridOrderPool(poolID);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      let mtLocationA = HydrogenNucleusHelper.internalAddressToLocation(user3.address);
      let mtLocationB = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let balNuA1 = await token1.balanceOf(nucleus.address);
      let balNuB1 = await token2.balanceOf(nucleus.address);
      let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB1 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB1 = await nucleus.getTokenBalance(token2.address, tradeRequest.locationB);
      let amountAMT = WeiPerEther.mul(7);
      let { feePPM } = await nucleus.getSwapFeeForPair(token1.address, token2.address)
      let { amountBMT, amountBMM } = HydrogenNucleusHelper.calculateMarketOrderExactAMT(amountAMT, tradeRequest.exchangeRate, feePPM);
      expect(amountAMT).gt(0);
      expect(amountBMT).gt(0);
      expect(amountAMT).lte(balPlA1);
      expect(amountBMT).lte(balMtB1);
      let params = {
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountAMT,
        amountB: amountBMT,
        locationA: mtLocationA,
        locationB: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user2).executeFlashSwap(params);
      let balNuA2 = await token1.balanceOf(nucleus.address);
      let balNuB2 = await token2.balanceOf(nucleus.address);
      let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB2 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB2 = await nucleus.getTokenBalance(token2.address, tradeRequest.locationB);
      expect(balNuA1.sub(balNuA2)).eq(0);
      expect(balPlA1.sub(balPlA2)).eq(amountAMT);
      expect(balMtA2.sub(balMtA1)).eq(amountAMT);
      expect(balNuB2.sub(balNuB1)).eq(0);
      expect(balPlB2.sub(balPlB1)).eq(amountBMM);
      expect(balMtB1.sub(balMtB2)).eq(amountBMT);
      expect(balMmB2.sub(balMmB1)).eq(amountBMM);
      let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest2.amountA).eq(tradeRequest.amountA.sub(amountAMT));
      expect(tradeRequest2.exchangeRate).eq(tradeRequest.exchangeRate);
      expect(tradeRequest2.locationB).eq(tradeRequest.locationB);
      await expect(tx).to.not.emit(token1, "Transfer");
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationA, amountAMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationB, poolLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountAMT, amountBMT, amountBMM);
    });
    it("can execute market order to flag location external address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = totalSupply * 1000 + 2;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      //let pool = await nucleus.getGridOrderPool(poolID);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      let mtLocationA = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      let mtLocationB = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let balNuA1 = await token1.balanceOf(nucleus.address);
      let balNuB1 = await token2.balanceOf(nucleus.address);
      let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB1 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB1 = await nucleus.getTokenBalance(token2.address, tradeRequest.locationB);
      let amountAMT = WeiPerEther.mul(7);
      let { feePPM } = await nucleus.getSwapFeeForPair(token1.address, token2.address)
      let { amountBMT, amountBMM } = HydrogenNucleusHelper.calculateMarketOrderExactAMT(amountAMT, tradeRequest.exchangeRate, feePPM);
      expect(amountAMT).gt(0);
      expect(amountBMT).gt(0);
      expect(amountAMT).lte(balPlA1);
      expect(amountBMT).lte(balMtB1);
      let params = {
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountAMT,
        amountB: amountBMT,
        locationA: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS,
        locationB: mtLocationB,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user2).executeFlashSwap(params);
      let balNuA2 = await token1.balanceOf(nucleus.address);
      let balNuB2 = await token2.balanceOf(nucleus.address);
      let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB2 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB2 = await nucleus.getTokenBalance(token2.address, tradeRequest.locationB);
      expect(balNuA1.sub(balNuA2)).eq(amountAMT);
      expect(balPlA1.sub(balPlA2)).eq(amountAMT);
      expect(balMtA2.sub(balMtA1)).eq(amountAMT);
      expect(balNuB2.sub(balNuB1)).eq(0);
      expect(balPlB2.sub(balPlB1)).eq(amountBMM);
      expect(balMtB1.sub(balMtB2)).eq(amountBMT);
      expect(balMmB2.sub(balMmB1)).eq(amountBMM);
      let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest2.amountA).eq(tradeRequest.amountA.sub(amountAMT));
      expect(tradeRequest2.exchangeRate).eq(tradeRequest.exchangeRate);
      expect(tradeRequest2.locationB).eq(tradeRequest.locationB);
      await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amountAMT);
      await expect(tx).to.not.emit(token2, "Transfer");
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationA, amountAMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationB, poolLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountAMT, amountBMT, amountBMM);
    });
    it("can execute market order from flag location internal address", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = totalSupply * 1000 + 2;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      //let pool = await nucleus.getGridOrderPool(poolID);
      let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      let mtLocationA = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let mtLocationB = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      let balNuA1 = await token1.balanceOf(nucleus.address);
      let balNuB1 = await token2.balanceOf(nucleus.address);
      let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB1 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB1 = await nucleus.getTokenBalance(token2.address, tradeRequest.locationB);
      let amountAMT = WeiPerEther.mul(7);
      let { feePPM } = await nucleus.getSwapFeeForPair(token1.address, token2.address)
      let { amountBMT, amountBMM } = HydrogenNucleusHelper.calculateMarketOrderExactAMT(amountAMT, tradeRequest.exchangeRate, feePPM);
      expect(amountAMT).gt(0);
      expect(amountBMT).gt(0);
      expect(amountAMT).lte(balPlA1);
      expect(amountBMT).lte(balMtB1);
      let params = {
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountAMT,
        amountB: amountBMT,
        locationA: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS,
        locationB: mtLocationB,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(user2).executeFlashSwap(params);
      let balNuA2 = await token1.balanceOf(nucleus.address);
      let balNuB2 = await token2.balanceOf(nucleus.address);
      let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(token1.address, mtLocationA);
      let balMtB2 = await nucleus.getTokenBalance(token2.address, mtLocationB);
      let balMmB2 = await nucleus.getTokenBalance(token2.address, tradeRequest.locationB);
      expect(balNuA1.sub(balNuA2)).eq(0);
      expect(balPlA1.sub(balPlA2)).eq(amountAMT);
      expect(balMtA2.sub(balMtA1)).eq(amountAMT);
      expect(balNuB2.sub(balNuB1)).eq(amountBMT);
      expect(balPlB2.sub(balPlB1)).eq(amountBMM);
      expect(balMtB1.sub(balMtB2)).eq(amountBMT);
      expect(balMmB2.sub(balMmB1)).eq(amountBMM);
      let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
      expect(tradeRequest2.amountA).eq(tradeRequest.amountA.sub(amountAMT));
      expect(tradeRequest2.exchangeRate).eq(tradeRequest.exchangeRate);
      expect(tradeRequest2.locationB).eq(tradeRequest.locationB);
      await expect(tx).to.not.emit(token1, "Transfer");
      await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountBMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationA, amountAMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationB, poolLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountAMT, amountBMT, amountBMM);
    });
    it("cannot execute market order from flag location pool", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = totalSupply * 1000 + 2;
      await expect(nucleus.connect(user2).executeFlashSwap({
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 0,
        amountB: 0,
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user2.address),
        locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenMissingPoolContext");
    });
    it("cannot execute market order to flag location pool", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolID = totalSupply * 1000 + 2;
      await expect(nucleus.connect(user2).executeFlashSwap({
        poolID: poolID,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 0,
        amountB: 0,
        locationA: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user2.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      })).to.be.revertedWithCustomError(nucleus, "HydrogenMissingPoolContext");
    });

  });

  describe("swap fees part 2", function () {
    it("can set swap fees to flag location external address", async function () {
      let tx = await nucleus.connect(owner).setSwapFeesForPairs([{
        tokenA: token1.address,
        tokenB: token2.address,
        feePPM: 1000,
        receiverLocation: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS
      }]);
      let fee1 = await nucleus.getSwapFeeForPair(token1.address, token2.address);
      expect(fee1.feePPM).eq(1000);
      expect(fee1.receiverLocation).eq(HydrogenNucleusHelper.externalAddressToLocation(owner.address));
      let fee2 = await nucleus.getStoredSwapFeeForPair(token1.address, token2.address);
      expect(fee2.feePPM).eq(1000);
      expect(fee2.receiverLocation).eq(HydrogenNucleusHelper.externalAddressToLocation(owner.address));
      await expect(tx).to.emit(nucleus, "SwapFeeSetForPair").withArgs(token1.address, token2.address, 1000, HydrogenNucleusHelper.externalAddressToLocation(owner.address));
    });
    it("can set swap fees to flag location internal address", async function () {
      let tx = await nucleus.connect(owner).setSwapFeesForPairs([{
        tokenA: token1.address,
        tokenB: token2.address,
        feePPM: 2000,
        receiverLocation: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS
      }]);
      let fee1 = await nucleus.getSwapFeeForPair(token1.address, token2.address);
      expect(fee1.feePPM).eq(2000);
      expect(fee1.receiverLocation).eq(HydrogenNucleusHelper.internalAddressToLocation(owner.address));
      let fee2 = await nucleus.getStoredSwapFeeForPair(token1.address, token2.address);
      expect(fee2.feePPM).eq(2000);
      expect(fee2.receiverLocation).eq(HydrogenNucleusHelper.internalAddressToLocation(owner.address));
      await expect(tx).to.emit(nucleus, "SwapFeeSetForPair").withArgs(token1.address, token2.address, 2000, HydrogenNucleusHelper.internalAddressToLocation(owner.address));
    });
    it("cannot set swap fees to flag location pool", async function () {
      await expect(nucleus.connect(owner).setSwapFeesForPairs([{
        tokenA: token1.address,
        tokenB: token2.address,
        feePPM: 2000,
        receiverLocation: HydrogenNucleusHelper.LOCATION_FLAG_POOL
      }])).to.be.revertedWithCustomError(nucleus, "HydrogenMissingPoolContext");
    });
  });

  describe("flash fees part 2", function () {
    it("can set flash loan fees to flag location external address", async function () {
      let tx = await nucleus.connect(owner).setFlashLoanFeesForTokens([{
        token: token1.address,
        feePPM: 1000,
        receiverLocation: HydrogenNucleusHelper.LOCATION_FLAG_EXTERNAL_ADDRESS
      }]);
      let fee1 = await nucleus.getFlashLoanFeeForToken(token1.address);
      expect(fee1.feePPM).eq(1000);
      expect(fee1.receiverLocation).eq(HydrogenNucleusHelper.externalAddressToLocation(owner.address));
      let fee2 = await nucleus.getStoredFlashLoanFeeForToken(token1.address);
      expect(fee2.feePPM).eq(1000);
      expect(fee2.receiverLocation).eq(HydrogenNucleusHelper.externalAddressToLocation(owner.address));
      await expect(tx).to.emit(nucleus, "FlashLoanFeeSetForToken").withArgs(token1.address, 1000, HydrogenNucleusHelper.externalAddressToLocation(owner.address));
    });
    it("can set flash loan fees to flag location internal address", async function () {
      let tx = await nucleus.connect(owner).setFlashLoanFeesForTokens([{
        token: token1.address,
        feePPM: 2000,
        receiverLocation: HydrogenNucleusHelper.LOCATION_FLAG_INTERNAL_ADDRESS
      }]);
      let fee1 = await nucleus.getFlashLoanFeeForToken(token1.address);
      expect(fee1.feePPM).eq(2000);
      expect(fee1.receiverLocation).eq(HydrogenNucleusHelper.internalAddressToLocation(owner.address));
      let fee2 = await nucleus.getStoredFlashLoanFeeForToken(token1.address);
      expect(fee2.feePPM).eq(2000);
      expect(fee2.receiverLocation).eq(HydrogenNucleusHelper.internalAddressToLocation(owner.address));
      await expect(tx).to.emit(nucleus, "FlashLoanFeeSetForToken").withArgs(token1.address, 2000, HydrogenNucleusHelper.internalAddressToLocation(owner.address));
    });
    it("cannot set flash loan fees to flag location pool", async function () {
      await expect(nucleus.connect(owner).setFlashLoanFeesForTokens([{
        token: token1.address,
        feePPM: 2000,
        receiverLocation: HydrogenNucleusHelper.LOCATION_FLAG_POOL
      }])).to.be.revertedWithCustomError(nucleus, "HydrogenMissingPoolContext");
    });
  });

  describe("events", function () {
    before(async function () {
      await nucleus.connect(user1).approve(user2.address, 1001)
    });
    it("can fetch account balances", async function () {
      let accounts:any = {deployer, owner, user1, user2, user3, user4, user5};
      let accountNames = Object.keys(accounts);
      console.log("fetching account balances")
      const tokens:any = {token1, token2, token3}
      const tokenNames = Object.keys(tokens);
      for(let i = 0; i < accountNames.length; i++) {
        console.log(`\nuser: ${accountNames[i]}`);
        let accountAddress = accounts[accountNames[i]].address;
        for(let j = 0; j < tokenNames.length; j++) {
          console.log(`  token: ${tokenNames[j]}`);
          let token = tokens[tokenNames[j]];
          let balExt = await nucleus.getTokenBalance(token.address, HydrogenNucleusHelper.externalAddressToLocation(accountAddress))
          let balInt = await nucleus.getTokenBalance(token.address, HydrogenNucleusHelper.internalAddressToLocation(accountAddress))
          let decimals = await token.decimals();
          console.log(`    external balance: ${ethers.utils.formatUnits(balExt, decimals)}`)
          console.log(`    internal balance: ${ethers.utils.formatUnits(balInt, decimals)}`)
        }
      }
    });
    it("can fetch pool balances", async function () {
      let totalSupply = (await nucleus.totalSupply()).toNumber();
      let poolIDs = [];
      for(let i = 0; i < totalSupply; i++) {
        let poolID = (i+1)*1000 + 1;
        if(await nucleus.exists(poolID)) poolIDs.push(poolID) // limit order
        else poolIDs.push(poolID+1) // grid order
        //poolIDs.push(await nucleus.tokenByIndex(i))
      }
      const tokens:any = {token1, token2, token3}
      const tokenNames = Object.keys(tokens);
      console.log("fetching pool balances")
      for(let i = 0; i < poolIDs.length; i++) {
        let poolID = poolIDs[i];
        console.log(`\npoolID: ${poolID}`);
        for(let j = 0; j < tokenNames.length; j++) {
          console.log(`  token: ${tokenNames[j]}`);
          let token = tokens[tokenNames[j]];
          let bal = await nucleus.getTokenBalance(token.address, HydrogenNucleusHelper.poolIDtoLocation(poolID))
          let decimals = await token.decimals();
          console.log(`    pool balance: ${ethers.utils.formatUnits(bal, decimals)}`)
        }
      }
    });
    /*
    it("can fetch and log pools", async function () {
      await HydrogenNucleusHelper.logPools(nucleus);
    });
    */
    it("can fetch and parse events", async function () {
      let eventLogger = new HydrogenNucleusEventLogger(nucleus, provider, chainID);
      await eventLogger.fetchAndLogEvents()
    });
  });

});
