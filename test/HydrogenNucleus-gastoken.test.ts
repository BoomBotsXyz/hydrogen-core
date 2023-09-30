/* global describe it before ethers */

import hre from "hardhat";
const { ethers } = hre;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;

import { HydrogenNucleus, MockERC20, MockFlashLoanBorrower9, WrappedGasToken, MockGasTokenReceiver, MockFaultyGasTokenReceiver1, MockFaultyGasTokenReceiver2, MockFaultyGasTokenReceiver3 } from "./../typechain-types";

import { expectDeployed } from "./../scripts/utilities/expectDeployed";
import { getNetworkSettings } from "../scripts/utils/getNetworkSettings";
import HydrogenNucleusHelper from "../scripts/utils/HydrogenNucleusHelper";
import HydrogenNucleusEventLogger from "../scripts/utils/HydrogenNucleusEventLogger";
import { setStorageAt, toBytes32 } from "../scripts/utilities/setStorage";
import { decimalsToAmount } from "../scripts/utils/price";
import { deployContract } from "../scripts/utils/deployContract";
import { abiEncodeArgs } from "../scripts/utils/strings";

const { AddressZero, WeiPerEther, MaxUint256, Zero } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const MAX_PPM = BN.from(1_000_000); // parts per million

const INVALID_LOCATION_0 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const INVALID_LOCATION_6 = "0x0600000000000000000000000000000000000000000000000000000000000000";
const INVALID_EXTERNAL_ADDRESS_LOCATION = "0x01ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const INVALID_INTERNAL_ADDRESS_LOCATION = "0x02ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const NULL_LOCATION = "0x0000000000000000000000000000000000000000000000000000000000000000";
const NULL_EXCHANGE_RATE = "0x0000000000000000000000000000000000000000000000000000000000000000";
const NULL_FEE = "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("HydrogenNucleus-gastoken", function () {
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
  let treasuryLocation: string;

  let nucleus: HydrogenNucleus;
  /*
  let swapCallee1: MockFlashSwapCallee1;
  let swapCallee2: MockFlashSwapCallee2;
  let swapCallee3: MockFlashSwapCallee3;
  let swapCallee4: MockFlashSwapCallee4;
  let swapCallee5: MockFlashSwapCallee5;
  let swapCallee6: MockFlashSwapCallee6;
  let swapCallee7: MockFlashSwapCallee7;
  let swapCallee8: MockFlashSwapCallee8;
  */
  let borrower9: MockFlashLoanBorrower9;

  let gasReceiver: MockGasTokenReceiver;
  let faultyGasReceiver1: MockFaultyGasTokenReceiver1;
  let faultyGasReceiver2: MockFaultyGasTokenReceiver2;
  let faultyGasReceiver3: MockFaultyGasTokenReceiver3;

  let wgas: WrappedGasToken;
  let token1: MockERC20;
  let token2: MockERC20;
  let token3: MockERC20;
  let tokens:any[] = [];

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

    wgas = await deployContract(deployer, "WrappedGasToken") as WrappedGasToken;

    while(tokens.length < 3) {
      let token = await deployContract(deployer, "MockERC20", [`Token${tokens.length+1}`, `TKN${tokens.length+1}`, 18]) as MockERC20;
      tokens.push(token);
    }
    [token1, token2, token3] = tokens;

    gasReceiver = await deployContract(deployer, "MockGasTokenReceiver") as MockGasTokenReceiver;
    faultyGasReceiver1 = await deployContract(deployer, "MockFaultyGasTokenReceiver1") as MockFaultyGasTokenReceiver1;
    faultyGasReceiver2 = await deployContract(deployer, "MockFaultyGasTokenReceiver2") as MockFaultyGasTokenReceiver2;
    faultyGasReceiver3 = await deployContract(deployer, "MockFaultyGasTokenReceiver3") as MockFaultyGasTokenReceiver3;
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("should deploy successfully", async function () {
      nucleus = await deployContract(deployer, "HydrogenNucleus", [owner.address]) as HydrogenNucleus;
    });
    it("should deploy callback contracts", async function () {
      /*
      swapCallee1 = await deployContract(deployer, "MockFlashSwapCallee1", [nucleus.address]) as MockFlashSwapCallee1;
      swapCallee2 = await deployContract(deployer, "MockFlashSwapCallee2", [nucleus.address]) as MockFlashSwapCallee2;
      swapCallee3 = await deployContract(deployer, "MockFlashSwapCallee3", [nucleus.address]) as MockFlashSwapCallee3;
      swapCallee4 = await deployContract(deployer, "MockFlashSwapCallee4", [nucleus.address]) as MockFlashSwapCallee4;
      swapCallee5 = await deployContract(deployer, "MockFlashSwapCallee5", [nucleus.address]) as MockFlashSwapCallee5;
      swapCallee6 = await deployContract(deployer, "MockFlashSwapCallee6", [nucleus.address]) as MockFlashSwapCallee6;
      swapCallee7 = await deployContract(deployer, "MockFlashSwapCallee7", [nucleus.address]) as MockFlashSwapCallee7;
      swapCallee8 = await deployContract(deployer, "MockFlashSwapCallee8", [nucleus.address]) as MockFlashSwapCallee8;
      */
      borrower9 = await deployContract(deployer, "MockFlashLoanBorrower9", [nucleus.address]) as MockFlashLoanBorrower9;

      user1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      user1InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      user2ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      user2InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      user3ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user3.address);
      user3InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user3.address);
      treasuryLocation = HydrogenNucleusHelper.internalAddressToLocation(owner.address);
    });
  });

  describe("initial state", function () {
    it("should have no internal token balances", async function () {
      expect(await provider.getBalance(nucleus.address)).eq(0);
      expect(await nucleus.getTokenBalance(wgas.address, user1InternalLocation)).to.eq(0);
      expect(await nucleus.getTokenBalance(wgas.address, HydrogenNucleusHelper.poolIDtoLocation(0))).to.eq(0);
    });
    it("may have external token balances", async function () {
      expect(await provider.getBalance(user1.address)).eq(WeiPerEther.mul(10_000));
      expect(await wgas.balanceOf(user1.address)).to.eq(0);
      expect(await nucleus.getTokenBalance(wgas.address, user1ExternalLocation)).to.eq(0);
      let amount = WeiPerEther;
      await wgas.connect(user1).deposit({value: amount});
      expect(await wgas.balanceOf(user1.address)).to.eq(amount);
      expect(await nucleus.getTokenBalance(wgas.address, user1ExternalLocation)).to.eq(amount);
      //expect(await nucleus.getTokenBalance(wgas.address, HydrogenNucleusHelper.externalAddressToLocation(nucleus.address))).to.eq(amount);
      expect(await wgas.balanceOf(nucleus.address)).eq(0);
    });
    it("cannot get balance of nucleus", async function () {
      await expect(nucleus.getTokenBalance(wgas.address, HydrogenNucleusHelper.externalAddressToLocation(nucleus.address))).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.getTokenBalance(wgas.address, HydrogenNucleusHelper.internalAddressToLocation(nucleus.address))).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("wrapped gas token should not be set", async function() {
      expect(await nucleus.wrappedGasToken()).eq(AddressZero);
    });
  });

  describe("setup", function () {
    it("should set swap fees", async function () {
      await nucleus.connect(owner).setSwapFeesForPairs([{
        tokenA: AddressZero,
        tokenB: AddressZero,
        feePPM: 2000, // 0.2%
        receiverLocation: treasuryLocation
      }]);
    });
    it("create pools", async function () {
      // limit order buy wgas
      await token1.mint(user1.address, WeiPerEther.mul(10_000));
      await token1.connect(user1).approve(nucleus.address, MaxUint256)
      await nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: wgas.address,
        locationA: user1ExternalLocation,
        locationB: user1InternalLocation,
        amountA: WeiPerEther.mul(100),
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(100), WeiPerEther.mul(1500)),
        hptReceiver: user1.address
      })
    });
  });

  describe("receive", function () {
    it("can receive the gas token", async function () {
      await user1.sendTransaction({to: nucleus.address, value: 1, data: "0x"});
      expect(await provider.getBalance(nucleus.address)).eq(1);
      await user1.sendTransaction({to: nucleus.address, value: 2, data: "0x"});
      expect(await provider.getBalance(nucleus.address)).eq(3);
    });
  });

  describe("wrapped gas token", function () {
    before("approve", async function () {
      await wgas.connect(user1).approve(nucleus.address, MaxUint256);
    })
    it("cannot wrap before address set", async function () {
      await expect(nucleus.connect(user1).wrapGasToken(user1ExternalLocation)).to.be.revertedWithCustomError(nucleus, "HydrogenWrappedGasTokenNotSet");
    });
    it("cannot unwrap before address set", async function () {
      await expect(nucleus.connect(user1).unwrapGasToken(WeiPerEther, user1ExternalLocation, user1ExternalLocation)).to.be.revertedWithCustomError(nucleus, "HydrogenWrappedGasTokenNotSet");
    });
    it("non owner cannot set address", async function () {
      await expect(nucleus.connect(user1).setWrappedGasToken(token1.address)).to.be.revertedWithCustomError(nucleus, "HydrogenNotContractOwner");
    });
    it("cannot set to address zero", async function () {
      await expect(nucleus.connect(owner).setWrappedGasToken(AddressZero)).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("owner can set address", async function () {
      let tx = await nucleus.connect(owner).setWrappedGasToken(wgas.address);
      await expect(tx).to.emit(nucleus, "WrappedGasTokenSet").withArgs(wgas.address);
      expect(await nucleus.wrappedGasToken()).eq(wgas.address);
    });
    it("cannot reset address", async function () {
      await expect(nucleus.connect(owner).setWrappedGasToken(token1.address)).to.be.revertedWithCustomError(nucleus, "HydrogenWrappedGasTokenAlreadySet");
    });
    it("can wrap after address set", async function () {
      let gasBalance0 = await provider.getBalance(nucleus.address);
      let wgasBalance0 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      let tx = await nucleus.connect(user1).wrapGasToken(user1InternalLocation);
      let gasBalance1 = await provider.getBalance(nucleus.address);
      let wgasBalance1 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1ExternalLocation, user1InternalLocation, gasBalance0);
      expect(gasBalance0).eq(3);
      expect(gasBalance1).eq(0);
      expect(wgasBalance1.sub(wgasBalance0)).eq(gasBalance0);
    });
    it("can wrap freshly deposited gas token", async function () {
      let gasBalance0 = await provider.getBalance(nucleus.address);
      let wgasBalance0 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      let amount = WeiPerEther.mul(10);
      let tx = await nucleus.connect(user1).wrapGasToken(user1InternalLocation, {value: amount});
      let gasBalance1 = await provider.getBalance(nucleus.address);
      let wgasBalance1 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      await expect(tx).to.emit(wgas, "Transfer").withArgs(AddressZero, nucleus.address, amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1ExternalLocation, user1InternalLocation, amount);
      expect(gasBalance0).eq(0);
      expect(gasBalance1).eq(0);
      expect(wgasBalance1.sub(wgasBalance0)).eq(amount);
    });
    it("can unwrap to EOA external", async function () {
      let amount = WeiPerEther;
      let walletGasBalance0 = await provider.getBalance(user2.address);
      let wgasBalance0 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      let tx = await nucleus.connect(user1).unwrapGasToken(amount, user1InternalLocation, user2ExternalLocation);
      let walletGasBalance1 = await provider.getBalance(user2.address);
      let gasBalance1 = await provider.getBalance(nucleus.address);
      let wgasBalance1 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      await expect(tx).to.emit(wgas, "Transfer").withArgs(nucleus.address, AddressZero, amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1InternalLocation, user2ExternalLocation, amount);
      expect(gasBalance1).eq(0);
      expect(wgasBalance0.sub(wgasBalance1)).eq(amount);
      expect(walletGasBalance1.sub(walletGasBalance0)).eq(amount);
    });
    it("can unwrap to EOA internal", async function () {
      let amount = WeiPerEther;
      let walletGasBalance0 = await provider.getBalance(user2.address);
      let wgasBalance0 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      let wgasBalance21 = await nucleus.getTokenBalance(wgas.address, user2InternalLocation);
      let tx = await nucleus.connect(user1).unwrapGasToken(amount, user1InternalLocation, user2InternalLocation);
      let walletGasBalance1 = await provider.getBalance(user2.address);
      let gasBalance1 = await provider.getBalance(nucleus.address);
      let wgasBalance1 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      let wgasBalance22 = await nucleus.getTokenBalance(wgas.address, user2InternalLocation);
      await expect(tx).to.not.emit(wgas, "Transfer");
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1InternalLocation, user2InternalLocation, amount);
      expect(gasBalance1).eq(0);
      expect(wgasBalance0.sub(wgasBalance1)).eq(amount);
      expect(wgasBalance22.sub(wgasBalance21)).eq(amount);
      expect(walletGasBalance1.sub(walletGasBalance0)).eq(0);
    });
    it("can unwrap to receiver contract", async function () {
      let amount = WeiPerEther;
      let walletGasBalance0 = await provider.getBalance(gasReceiver.address);
      let wgasBalance0 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      let receiverLocation = HydrogenNucleusHelper.externalAddressToLocation(gasReceiver.address);
      let tx = await nucleus.connect(user1).unwrapGasToken(amount, user1InternalLocation, receiverLocation);
      let walletGasBalance1 = await provider.getBalance(gasReceiver.address);
      let gasBalance1 = await provider.getBalance(nucleus.address);
      let wgasBalance1 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      await expect(tx).to.emit(wgas, "Transfer").withArgs(nucleus.address, AddressZero, amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1InternalLocation, receiverLocation, amount);
      expect(gasBalance1).eq(0);
      expect(wgasBalance0.sub(wgasBalance1)).eq(amount);
      expect(walletGasBalance1.sub(walletGasBalance0)).eq(amount);
    });
    it("cannot unwrap to address zero", async function () {
      await expect(nucleus.connect(user1).unwrapGasToken(1, user1InternalLocation, HydrogenNucleusHelper.externalAddressToLocation(AddressZero))).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.connect(user1).unwrapGasToken(1, user1InternalLocation, HydrogenNucleusHelper.internalAddressToLocation(AddressZero))).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot unwrap to nucleus", async function () {
      await expect(nucleus.connect(user1).unwrapGasToken(1, user1InternalLocation, HydrogenNucleusHelper.externalAddressToLocation(nucleus.address))).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user1).unwrapGasToken(1, user1InternalLocation, HydrogenNucleusHelper.internalAddressToLocation(nucleus.address))).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot unwrap to wgas", async function () {
      await expect(nucleus.connect(user1).unwrapGasToken(1, user1InternalLocation, HydrogenNucleusHelper.externalAddressToLocation(wgas.address))).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidTransferToWgas");
    });
    it("cannot unwrap to not receiver contract", async function () {
      await expect(nucleus.connect(user1).unwrapGasToken(1, user1InternalLocation, HydrogenNucleusHelper.externalAddressToLocation(token1.address))).to.be.revertedWithCustomError(nucleus, "HydrogenGasTokenTransferFailed");
    });
    it("cannot unwrap to faulty receiver contract 1", async function () {
      await expect(nucleus.connect(user1).unwrapGasToken(1, user1InternalLocation, HydrogenNucleusHelper.externalAddressToLocation(faultyGasReceiver1.address))).to.be.reverted;
    });
    it("cannot unwrap to faulty receiver contract 2", async function () {
      await expect(nucleus.connect(user1).unwrapGasToken(1, user1InternalLocation, HydrogenNucleusHelper.externalAddressToLocation(faultyGasReceiver2.address))).to.be.revertedWith("MockFaultyGasTokenReceiver2: force revert");
    });
    it("cannot unwrap to faulty receiver contract 3", async function () {
      await expect(nucleus.connect(user1).unwrapGasToken(1, user1InternalLocation, HydrogenNucleusHelper.externalAddressToLocation(faultyGasReceiver3.address))).to.be.reverted;
    });
    it("can unwrap to faulty receiver contract internal", async function () {
      // not a common pattern, test anyways
      let amount = WeiPerEther;
      let receiverLocation = HydrogenNucleusHelper.internalAddressToLocation(faultyGasReceiver3.address);
      let walletGasBalance0 = await provider.getBalance(faultyGasReceiver3.address);
      let wgasBalance0 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      let wgasBalance21 = await nucleus.getTokenBalance(wgas.address, receiverLocation);
      let tx = await nucleus.connect(user1).unwrapGasToken(amount, user1InternalLocation, receiverLocation);
      let walletGasBalance1 = await provider.getBalance(faultyGasReceiver3.address);
      let gasBalance1 = await provider.getBalance(nucleus.address);
      let wgasBalance1 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      let wgasBalance22 = await nucleus.getTokenBalance(wgas.address, receiverLocation);
      await expect(tx).to.not.emit(wgas, "Transfer");
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1InternalLocation, receiverLocation, amount);
      expect(gasBalance1).eq(0);
      expect(wgasBalance0.sub(wgasBalance1)).eq(amount);
      expect(wgasBalance22.sub(wgasBalance21)).eq(amount);
      expect(walletGasBalance1.sub(walletGasBalance0)).eq(0);
    });
    it("can unwrap to pool", async function () {
      // not a common pattern, test anyways
      let amount = WeiPerEther;
      let receiverLocation = HydrogenNucleusHelper.internalAddressToLocation(faultyGasReceiver3.address);
      let walletGasBalance0 = await provider.getBalance(faultyGasReceiver3.address);
      let wgasBalance0 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      let wgasBalance21 = await nucleus.getTokenBalance(wgas.address, receiverLocation);
      let tx = await nucleus.connect(user1).unwrapGasToken(amount, user1InternalLocation, receiverLocation);
      let walletGasBalance1 = await provider.getBalance(faultyGasReceiver3.address);
      let gasBalance1 = await provider.getBalance(nucleus.address);
      let wgasBalance1 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      let wgasBalance22 = await nucleus.getTokenBalance(wgas.address, receiverLocation);
      await expect(tx).to.not.emit(wgas, "Transfer");
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1InternalLocation, receiverLocation, amount);
      expect(gasBalance1).eq(0);
      expect(wgasBalance0.sub(wgasBalance1)).eq(amount);
      expect(wgasBalance22.sub(wgasBalance21)).eq(amount);
      expect(walletGasBalance1.sub(walletGasBalance0)).eq(0);
    });
  });

  describe("double spend", function () {
    it("cannot double spend deposit", async function () {
      // address(this).balance is used in the first call and zero in the second call
      let gasBalance0 = await provider.getBalance(nucleus.address);
      let wgasBalance0 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      let amount = WeiPerEther.mul(10);
      //let tx = await nucleus.connect(user1).wrapGasToken(user1InternalLocation, {value: amount});
      let txdata = nucleus.interface.encodeFunctionData("wrapGasToken", [user1InternalLocation])
      let txdatas = [txdata, txdata]
      let tx = await nucleus.connect(user1).multicall(txdatas, {value: amount})
      let gasBalance1 = await provider.getBalance(nucleus.address);
      let wgasBalance1 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation);
      await expect(tx).to.emit(wgas, "Transfer").withArgs(AddressZero, nucleus.address, amount);
      await expect(tx).to.emit(wgas, "Transfer").withArgs(AddressZero, nucleus.address, 0);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1ExternalLocation, user1InternalLocation, amount);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1ExternalLocation, user1InternalLocation, 0);
      expect(gasBalance0).eq(0);
      expect(gasBalance1).eq(0);
      expect(wgasBalance1.sub(wgasBalance0)).eq(amount);
    });
  });

  describe("multicall deposit and use", function () {
    it("can use with tokenTransfer()", async function () {
      let bal00 = await wgas.balanceOf(nucleus.address);
      let bal10 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal20 = await nucleus.getTokenBalance(wgas.address, user2InternalLocation)
      let txdata0 = nucleus.interface.encodeFunctionData("wrapGasToken", [user1InternalLocation])
      let txdata1 = nucleus.interface.encodeFunctionData("tokenTransfer", [{
        token: wgas.address,
        amount: WeiPerEther,
        src: user1InternalLocation,
        dst: user2InternalLocation,
      }])
      let txdatas = [txdata0, txdata1]
      let tx = await nucleus.connect(user1).multicall(txdatas, { value: WeiPerEther.mul(3) })
      let bal01 = await wgas.balanceOf(nucleus.address);
      let bal11 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal21 = await nucleus.getTokenBalance(wgas.address, user2InternalLocation)
      expect(bal01.sub(bal00)).eq(WeiPerEther.mul(3))
      expect(bal11.sub(bal10)).eq(WeiPerEther.mul(2))
      expect(bal21.sub(bal20)).eq(WeiPerEther.mul(1))
      expect(await provider.getBalance(nucleus.address)).eq(0)
      await expect(tx).to.emit(wgas, "Transfer").withArgs(AddressZero, nucleus.address, WeiPerEther.mul(3));
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1ExternalLocation, user1InternalLocation, WeiPerEther.mul(3));
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1InternalLocation, user2InternalLocation, WeiPerEther.mul(1));
    });
    it("can use with createLimitOrderPool()", async function () {
      let bal00 = await wgas.balanceOf(nucleus.address);
      let bal10 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let txdata0 = nucleus.interface.encodeFunctionData("wrapGasToken", [user1InternalLocation])
      let amountA = WeiPerEther.mul(2)
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(3), WeiPerEther.mul(5))
      let params = {
        tokenA: wgas.address,
        tokenB: token1.address,
        locationA: user1InternalLocation,
        locationB: user1ExternalLocation,
        amountA: amountA,
        exchangeRate: exchangeRate,
        hptReceiver: user1.address
      }
      let txdata1 = nucleus.interface.encodeFunctionData("createLimitOrderPool", [params])
      let txdatas = [txdata0, txdata1]
      let tx = await nucleus.connect(user1).multicall(txdatas, { value: amountA })
      //let receipt = await tx.wait() as any
      //let poolID = receipt.events.filter((event:any) => event.event == "PoolCreated")[0].args[0]
      let poolID = 2001
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID)
      let bal01 = await wgas.balanceOf(nucleus.address);
      let bal11 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let balPool = await nucleus.getTokenBalance(wgas.address, poolLocation)
      expect(bal01.sub(bal00)).eq(amountA)
      expect(bal11.sub(bal10)).eq(0)
      expect(balPool).eq(amountA)
      expect(await provider.getBalance(nucleus.address)).eq(0)
      await expect(tx).to.emit(wgas, "Transfer").withArgs(AddressZero, nucleus.address, amountA);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1ExternalLocation, user1InternalLocation, amountA);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1InternalLocation, poolLocation, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, params.locationB);
    });
    it("can use with updateLimitOrderPool()", async function () {
      let poolID = 2001
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID)
      let bal00 = await wgas.balanceOf(nucleus.address);
      let bal10 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal20 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      let txdata0 = nucleus.interface.encodeFunctionData("wrapGasToken", [poolLocation])
      let amountA = WeiPerEther.mul(1)
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(3), WeiPerEther.mul(7))
      let params = {
        poolID: poolID,
        locationB: user1InternalLocation,
        exchangeRate: exchangeRate,
      }
      let txdata1 = nucleus.interface.encodeFunctionData("updateLimitOrderPool", [params])
      let txdatas = [txdata0, txdata1]
      let tx = await nucleus.connect(user1).multicall(txdatas, { value: amountA })
      let bal01 = await wgas.balanceOf(nucleus.address);
      let bal11 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal21 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      expect(bal01.sub(bal00)).eq(amountA)
      expect(bal11.sub(bal10)).eq(0)
      expect(bal21.sub(bal20)).eq(amountA)
      expect(await provider.getBalance(nucleus.address)).eq(0)
      await expect(tx).to.emit(wgas, "Transfer").withArgs(AddressZero, nucleus.address, amountA);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1ExternalLocation, poolLocation, amountA);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, wgas.address, token1.address, params.exchangeRate, params.locationB);
    });
    it("can use with createGridOrderPool()", async function () {
      let bal00 = await wgas.balanceOf(nucleus.address);
      let bal10 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let txdata0 = nucleus.interface.encodeFunctionData("wrapGasToken", [user1InternalLocation])
      let amountA = WeiPerEther.mul(2)
      let exchangeRateXY = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(3), WeiPerEther.mul(5).mul(10100).div(10000))
      let exchangeRateYX = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(5), WeiPerEther.mul(3).mul(10100).div(10000))
      let params = {
        tokenSources: [{
          token: wgas.address,
          amount: amountA,
          location: user1InternalLocation
        }],
        tradeRequests: [{
          tokenA: wgas.address,
          tokenB: token1.address,
          exchangeRate: exchangeRateXY,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        },{
          tokenA: token1.address,
          tokenB: wgas.address,
          exchangeRate: exchangeRateYX,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        }],
        hptReceiver: user1.address
      }
      let txdata1 = nucleus.interface.encodeFunctionData("createGridOrderPool", [params])
      let txdatas = [txdata0, txdata1]
      let tx = await nucleus.connect(user1).multicall(txdatas, { value: amountA })
      let poolID = 3002
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID)
      let bal01 = await wgas.balanceOf(nucleus.address);
      let bal11 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let balPool = await nucleus.getTokenBalance(wgas.address, poolLocation)
      expect(bal01.sub(bal00)).eq(amountA)
      expect(bal11.sub(bal10)).eq(0)
      expect(balPool).eq(amountA)
      expect(await provider.getBalance(nucleus.address)).eq(0)
      await expect(tx).to.emit(wgas, "Transfer").withArgs(AddressZero, nucleus.address, amountA);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1ExternalLocation, user1InternalLocation, amountA);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1InternalLocation, poolLocation, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, wgas.address, token1.address, exchangeRateXY, poolLocation);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, wgas.address, exchangeRateYX, poolLocation);
    });
    it("can use with updateGridOrderPool()", async function () {
      let poolID = 3002
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID)
      let bal00 = await wgas.balanceOf(nucleus.address);
      let bal10 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal20 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      let txdata0 = nucleus.interface.encodeFunctionData("wrapGasToken", [poolLocation])
      let amountA = WeiPerEther.mul(1)
      let exchangeRateXY = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(3), WeiPerEther.mul(7).mul(10100).div(10000))
      let exchangeRateYX = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(7), WeiPerEther.mul(3).mul(10100).div(10000))
      let params = {
        poolID: poolID,
        tokenSources: [],
        tradeRequests: [{
          tokenA: wgas.address,
          tokenB: token1.address,
          exchangeRate: exchangeRateXY,
          locationB: poolLocation
        },{
          tokenA: token1.address,
          tokenB: wgas.address,
          exchangeRate: exchangeRateYX,
          locationB: poolLocation
        }]
      }
      let txdata1 = nucleus.interface.encodeFunctionData("updateGridOrderPool", [params])
      let txdatas = [txdata0, txdata1]
      let tx = await nucleus.connect(user1).multicall(txdatas, { value: amountA })
      let bal01 = await wgas.balanceOf(nucleus.address);
      let bal11 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal21 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      expect(bal01.sub(bal00)).eq(amountA)
      expect(bal11.sub(bal10)).eq(0)
      expect(bal21.sub(bal20)).eq(amountA)
      expect(await provider.getBalance(nucleus.address)).eq(0)
      await expect(tx).to.emit(wgas, "Transfer").withArgs(AddressZero, nucleus.address, amountA);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1ExternalLocation, poolLocation, amountA);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, wgas.address, token1.address, exchangeRateXY, poolLocation);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, wgas.address, exchangeRateYX, poolLocation);
    });
    it("can use with executeMarketOrder()", async function () {
      let poolID = 1001
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID)
      let bal00 = await wgas.balanceOf(nucleus.address);
      let bal10 = await nucleus.getTokenBalance(wgas.address, user2InternalLocation)
      let bal20 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      let txdata0 = nucleus.interface.encodeFunctionData("wrapGasToken", [user2InternalLocation])
      let pool = await nucleus.getLimitOrderPool(poolID)
      let amountBMT = WeiPerEther.mul(1)
      let { amountAMT, amountBMM, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactBMT(amountBMT, pool.exchangeRate, 2000)
      let params = {
        poolID,
        tokenA: token1.address,
        tokenB: wgas.address,
        amountA: amountAMT,
        amountB: amountBMT,
        locationA: user2ExternalLocation,
        locationB: user2InternalLocation,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      }
      let txdata1 = nucleus.interface.encodeFunctionData("executeMarketOrder", [params])
      let txdatas = [txdata0, txdata1]
      let tx = await nucleus.connect(user2).multicall(txdatas, { value: amountBMT })
      let bal01 = await wgas.balanceOf(nucleus.address);
      let bal11 = await nucleus.getTokenBalance(wgas.address, user2InternalLocation)
      let bal21 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      expect(bal01.sub(bal00)).eq(amountBMT)
      expect(bal11.sub(bal10)).eq(0)
      expect(bal21.sub(bal20)).eq(0)
      expect(await provider.getBalance(nucleus.address)).eq(0)
      await expect(tx).to.emit(wgas, "Transfer").withArgs(AddressZero, nucleus.address, amountBMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user2ExternalLocation, user2InternalLocation, amountBMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user2InternalLocation, poolLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, poolLocation, user1InternalLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user2InternalLocation, treasuryLocation, amountBFR);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, user2ExternalLocation, amountAMT);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, wgas.address, amountAMT, amountBMT, amountBMM);
    });
    it("can use with flashLoan()", async function () {
      // not a common pattern, test anyways
      let poolID = 2001
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID)
      let bal00 = await wgas.balanceOf(nucleus.address);
      let bal10 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal30 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      let args = '0x'+abiEncodeArgs([0,poolLocation])
      let txdata0 = nucleus.interface.encodeFunctionData("wrapGasToken", [poolLocation])
      let txdata1 = nucleus.interface.encodeFunctionData("flashLoan", [borrower9.address, token1.address, 0, args])
      let txdatas = [txdata0, txdata1]
      let tx = await nucleus.connect(user1).multicall(txdatas, { value: WeiPerEther })
      let bal01 = await wgas.balanceOf(nucleus.address);
      let bal11 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal31 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      expect(bal01.sub(bal00)).eq(WeiPerEther.mul(1))
      expect(bal11.sub(bal10)).eq(0)
      expect(bal31.sub(bal30)).eq(WeiPerEther.mul(1))
      expect(await provider.getBalance(nucleus.address)).eq(0)
    });
  });

  describe("multicall use and withdraw", function () {
    before("load up pool", async function () {
      let poolID = 1001
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID)
      await nucleus.connect(user1).wrapGasToken(poolLocation, {value: WeiPerEther.mul(10)})
    });
    it("can use with tokenTransfer()", async function () {
      let poolID = 1001
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID)
      let bal00 = await wgas.balanceOf(nucleus.address);
      let bal10 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal20 = await provider.getBalance(user2.address)
      let bal30 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      let txdata0 = nucleus.interface.encodeFunctionData("tokenTransfer", [{
        token: wgas.address,
        amount: WeiPerEther.mul(3),
        src: poolLocation,
        dst: user1InternalLocation,
      }])
      let txdata1 = nucleus.interface.encodeFunctionData("unwrapGasToken", [WeiPerEther.mul(2), user1InternalLocation, user2ExternalLocation])
      let txdatas = [txdata0, txdata1]
      let tx = await nucleus.connect(user1).multicall(txdatas, { value: 0 })
      let bal01 = await wgas.balanceOf(nucleus.address);
      let bal11 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal21 = await provider.getBalance(user2.address)
      let bal31 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      expect(bal00.sub(bal01)).eq(WeiPerEther.mul(2))
      expect(bal11.sub(bal10)).eq(WeiPerEther.mul(1))
      expect(bal21.sub(bal20)).eq(WeiPerEther.mul(2))
      expect(bal30.sub(bal31)).eq(WeiPerEther.mul(3))
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, poolLocation, user1InternalLocation, WeiPerEther.mul(3));
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1InternalLocation, user2ExternalLocation, WeiPerEther.mul(2));
    });
    //it("can use with createLimitOrderPool()", async function () {}); // not a common pattern. assume working if other tests pass
    //it("can use with updateLimitOrderPool()", async function () {}); // not a common pattern. assume working if other tests pass
    //it("can use with createGridOrderPool()", async function () {}); // not a common pattern. assume working if other tests pass
    //it("can use with updateGridOrderPool()", async function () {}); // not a common pattern. assume working if other tests pass
    it("can use with executeMarketOrder()", async function () {
      let poolID = 2001
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID)
      let bal00 = await wgas.balanceOf(nucleus.address);
      let bal10 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal20 = await provider.getBalance(user2.address)
      let bal30 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      let pool = await nucleus.getLimitOrderPool(poolID)
      let amountBMT = WeiPerEther.mul(1)
      let { amountAMM, amountAMT, amountBMM, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactBMT(amountBMT, pool.exchangeRate, 2000)
      let params = {
        poolID,
        tokenA: wgas.address,
        tokenB: token1.address,
        amountA: amountAMT,
        amountB: amountBMT,
        locationA: user1InternalLocation,
        locationB: user1ExternalLocation,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      }
      let txdata0 = nucleus.interface.encodeFunctionData("executeMarketOrder", [params])
      let txdata1 = nucleus.interface.encodeFunctionData("unwrapGasToken", [amountAMT, user1InternalLocation, user2ExternalLocation])
      let txdatas = [txdata0, txdata1]
      let tx = await nucleus.connect(user1).multicall(txdatas, { value: 0 })
      let bal01 = await wgas.balanceOf(nucleus.address);
      let bal11 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal21 = await provider.getBalance(user2.address)
      let bal31 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      expect(bal00.sub(bal01)).eq(amountAMT)
      expect(bal11.sub(bal10)).eq(0)
      expect(bal21.sub(bal20)).eq(amountAMT)
      expect(bal30.sub(bal31)).eq(amountAMT)
      expect(await provider.getBalance(nucleus.address)).eq(0)
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, poolLocation, user1InternalLocation, amountAMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, user1ExternalLocation, poolLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, user1ExternalLocation, treasuryLocation, amountBFR);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, wgas.address, token1.address, amountAMT, amountBMT, amountBMM);
      await expect(tx).to.emit(wgas, "Transfer").withArgs(nucleus.address, AddressZero, amountAMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1InternalLocation, user2ExternalLocation, amountAMT);
    });
    it("can use with flashLoan()", async function () {
      await user1.sendTransaction({to: borrower9.address, value: WeiPerEther.mul(3)});
      let poolID = 2001
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID)
      let bal00 = await wgas.balanceOf(nucleus.address);
      let bal10 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal20 = await provider.getBalance(user2.address)
      let bal30 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      let args = '0x'+abiEncodeArgs([WeiPerEther.mul(3),poolLocation])
      let txdata0 = nucleus.interface.encodeFunctionData("flashLoan", [borrower9.address, token1.address, 0, args])
      let txdata1 = nucleus.interface.encodeFunctionData("unwrapGasToken", [WeiPerEther.mul(2), poolLocation, user2ExternalLocation])
      let txdatas = [txdata0, txdata1]
      let tx = await nucleus.connect(user1).multicall(txdatas, { value: 0 })
      let bal01 = await wgas.balanceOf(nucleus.address);
      let bal11 = await nucleus.getTokenBalance(wgas.address, user1InternalLocation)
      let bal21 = await provider.getBalance(user2.address)
      let bal31 = await nucleus.getTokenBalance(wgas.address, poolLocation)
      expect(bal01.sub(bal00)).eq(WeiPerEther.mul(1))
      expect(bal11.sub(bal10)).eq(0)
      expect(bal21.sub(bal20)).eq(WeiPerEther.mul(2))
      expect(bal31.sub(bal30)).eq(WeiPerEther.mul(1))
      expect(await provider.getBalance(nucleus.address)).eq(0)
    });
  });
});
