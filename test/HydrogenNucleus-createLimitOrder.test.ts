/* global describe it before ethers */

import hre from "hardhat";
const { ethers } = hre;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;

import { HydrogenNucleus, MockERC20, MockERC20NoReturnsSuccess, MockERC20NoReturnsRevert, MockERC20NoReturnsRevertWithError, MockERC20SuccessFalse, MockFlashSwapCallee1, MockFlashSwapCallee2, MockFlashSwapCallee3, MockFlashSwapCallee4, MockFlashSwapCallee5, MockFlashSwapCallee6, MockFlashSwapCallee7, MockFlashSwapCallee8, WrappedGasToken } from "./../typechain-types";

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

describe("HydrogenNucleus-createLimitOrder", function () {
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

  let nucleus: HydrogenNucleus;

  let swapCallee1: MockFlashSwapCallee1;
  let swapCallee2: MockFlashSwapCallee2;
  let swapCallee3: MockFlashSwapCallee3;
  let swapCallee4: MockFlashSwapCallee4;
  let swapCallee5: MockFlashSwapCallee5;
  let swapCallee6: MockFlashSwapCallee6;
  let swapCallee7: MockFlashSwapCallee7;
  let swapCallee8: MockFlashSwapCallee8;

  let wgas: WrappedGasToken;
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

  let l1DataFeeAnalyzer = new L1DataFeeAnalyzer();

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

    nonstandardToken1 = await deployContract(deployer, "MockERC20NoReturnsSuccess", [`NonstandardToken1`, `NSTKN1`, 18]) as MockERC20NoReturnsSuccess;
    nonstandardToken2 = await deployContract(deployer, "MockERC20NoReturnsRevert", [`NonstandardToken2`, `NSTKN2`, 18]) as MockERC20NoReturnsRevert;
    nonstandardToken3 = await deployContract(deployer, "MockERC20NoReturnsRevertWithError", [`NonstandardToken3`, `NSTKN3`, 18]) as MockERC20NoReturnsRevertWithError;
    nonstandardToken4 = await deployContract(deployer, "MockERC20SuccessFalse", [`NonstandardToken4`, `NSTKN4`, 18]) as MockERC20SuccessFalse;

    nucleus = await deployContract(deployer, "HydrogenNucleus", [owner.address]) as HydrogenNucleus;

    swapCallee1 = await deployContract(deployer, "MockFlashSwapCallee1", [nucleus.address]) as MockFlashSwapCallee1;
    swapCallee2 = await deployContract(deployer, "MockFlashSwapCallee2", [nucleus.address]) as MockFlashSwapCallee2;
    swapCallee3 = await deployContract(deployer, "MockFlashSwapCallee3", [nucleus.address]) as MockFlashSwapCallee3;
    swapCallee4 = await deployContract(deployer, "MockFlashSwapCallee4", [nucleus.address]) as MockFlashSwapCallee4;
    swapCallee5 = await deployContract(deployer, "MockFlashSwapCallee5", [nucleus.address]) as MockFlashSwapCallee5;
    swapCallee6 = await deployContract(deployer, "MockFlashSwapCallee6", [nucleus.address]) as MockFlashSwapCallee6;
    swapCallee7 = await deployContract(deployer, "MockFlashSwapCallee7", [nucleus.address]) as MockFlashSwapCallee7;
    swapCallee8 = await deployContract(deployer, "MockFlashSwapCallee8", [nucleus.address]) as MockFlashSwapCallee8;

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
    it("should have no internal token balances", async function () {
      await expect(nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user1.address))).to.not.be.reverted;
      expect(await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.internalAddressToLocation(user1.address))).to.eq(0);
      await expect(nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.poolIDtoLocation(0))).to.not.be.reverted;
      expect(await nucleus.getTokenBalance(token1.address, HydrogenNucleusHelper.poolIDtoLocation(0))).to.eq(0);
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
      await token1.connect(user1).approve(nucleus.address, MaxUint256);
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
      l1DataFeeAnalyzer.register("createLimitOrderPool", tx);
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
      l1DataFeeAnalyzer.register("createLimitOrderPool", tx);
    });
    it("can create limit order 3", async function () {
      expect(await nucleus.reentrancyGuardState()).eq(1);
      // from internal address to external address
      let poolID = 3001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(400);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(0, 0);
      await token1.connect(user2).mint(user2.address, WeiPerEther.mul(10000))
      await token1.connect(user2).approve(nucleus.address, MaxUint256);
      await nucleus.connect(user2).tokenTransferIn({
        token: token1.address,
        amount: WeiPerEther.mul(2000)
      });
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
      l1DataFeeAnalyzer.register("createLimitOrderPool", tx);
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
      l1DataFeeAnalyzer.register("createLimitOrderPool", tx);
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
      l1DataFeeAnalyzer.register("createLimitOrderPool", tx);
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
      await token1.connect(user4).mint(user4.address, WeiPerEther.mul(10000))
      await token1.connect(user4).approve(nucleus.address, MaxUint256);
      await nucleus.connect(user4).tokenTransferIn({
        token: token1.address,
        amount: WeiPerEther.mul(2000)
      });
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
      l1DataFeeAnalyzer.register("multicall", tx);
    });
  });

  describe("createLimitOrderPoolCompact", function () {
    it("cannot create limit order using not contract as erc20", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPoolCompact({
        tokenA: user1.address,
        tokenB: token1.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot create limit order using not token as erc20", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPoolCompact({
        tokenA: swapCallee1.address,
        tokenB: token1.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot create limit order using nucleus as erc20", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPoolCompact({
        tokenA: nucleus.address,
        tokenB: token1.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user1).createLimitOrderPoolCompact({
        tokenA: token1.address,
        tokenB: nucleus.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot create limit order using same token", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPoolCompact({
        tokenA: token1.address,
        tokenB: token1.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSameToken");
    });
    it("cannot create limit order with insufficient balance", async function () {
      let balanceExt = await nucleus.getTokenBalance(token2.address, user1ExternalLocation);
      let balanceInt = await nucleus.getTokenBalance(token2.address, user1InternalLocation);
      let balance = balanceExt.add(balanceInt);
      await token2.connect(user1).approve(nucleus.address, MaxUint256);
      await expect(nucleus.connect(user1).createLimitOrderPoolCompact({
        tokenA: token2.address,
        tokenB: token1.address,
        amountA: balance.add(1),
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
      })).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot create limit order with insufficient allowance", async function () {
      await token2.mint(user1.address, WeiPerEther);
      await token2.connect(user1).approve(nucleus.address, 0);
      let balanceInt = await nucleus.getTokenBalance(token2.address, user1InternalLocation);
      await expect(nucleus.connect(user1).createLimitOrderPoolCompact({
        tokenA: token2.address,
        tokenB: token1.address,
        amountA: balanceInt.add(1),
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
      })).to.be.revertedWith("ERC20: insufficient allowance");
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
      await expect(nucleus.connect(user1).createLimitOrderPoolCompact({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenMaxPoolCount");
      // reset
      await setStorageAt(nucleus.address, slotIndex, toBytes32(ts1));
      let ts3 = await nucleus.totalSupply();
      expect(ts3).eq(ts1);
    });
    it("can create limit order pool using funds from internal balance", async function () {
      let poolID = 8001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(103, 100);
      let locationA = user1InternalLocation;
      let locationB = user1ExternalLocation;
      await nucleus.connect(user1).tokenTransferIn({
        token: token1.address,
        amount: WeiPerEther.mul(10)
      })
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(2);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balIA1 = await nucleus.getTokenBalance(token1.address, locationA);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balIA1).gt(WeiPerEther);
      let amountA = balIA1.div(3);
      let params = {
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createLimitOrderPoolCompact(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createLimitOrderPoolCompact(params);
      expect(await nucleus.totalSupply()).eq(8);
      expect(await nucleus.balanceOf(user1.address)).eq(3);
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
      let balIA2 = await nucleus.getTokenBalance(token1.address, locationA);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(0);
      expect(balEA1.sub(balEA2)).eq(0);
      expect(balIA1.sub(balIA2)).eq(amountA);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, locationA, poolLocation, amountA);
      await expect(tx).to.not.emit(token1, "Transfer");
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, locationB);
      l1DataFeeAnalyzer.register("createLimitOrderPoolCompact", tx);
    });
    it("can create limit order pool using funds from both internal and external balance", async function () {
      let poolID = 9001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(103, 100);
      let locationA = user1InternalLocation;
      let locationB = user1ExternalLocation;
      expect(await nucleus.totalSupply()).eq(8);
      expect(await nucleus.balanceOf(user1.address)).eq(3);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balIA1 = await nucleus.getTokenBalance(token1.address, locationA);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balEA1).gt(WeiPerEther);
      expect(balIA1).gt(WeiPerEther);
      let amountInt = balIA1;
      let amountExt = WeiPerEther;
      let amountA = amountInt.add(amountExt);
      let params = {
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createLimitOrderPoolCompact(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createLimitOrderPoolCompact(params);
      expect(await nucleus.totalSupply()).eq(9);
      expect(await nucleus.balanceOf(user1.address)).eq(4);
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
      let balIA2 = await nucleus.getTokenBalance(token1.address, locationA);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(amountExt);
      expect(balEA1.sub(balEA2)).eq(amountExt);
      expect(balIA1.sub(balIA2)).eq(amountInt);
      expect(balIA2).eq(0);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, user1ExternalLocation, user1InternalLocation, amountExt);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, user1InternalLocation, poolLocation, amountA);
      await expect(tx).to.emit(token1, "Transfer").withArgs(user1.address, nucleus.address, amountExt);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, locationB);
      l1DataFeeAnalyzer.register("createLimitOrderPoolCompact", tx);
    });
    it("can create limit order pool using funds from external balance", async function () {
      let poolID = 10001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(103, 100);
      let locationA = user1InternalLocation;
      let locationB = user1ExternalLocation;
      expect(await nucleus.totalSupply()).eq(9);
      expect(await nucleus.balanceOf(user1.address)).eq(4);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted
      let balNu1 = await token1.balanceOf(nucleus.address);
      let balEA1 = await token1.balanceOf(user1.address);
      let balIA1 = await nucleus.getTokenBalance(token1.address, locationA);
      let balPL1 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balEA1).gt(WeiPerEther);
      expect(balIA1).eq(0);
      let amountA = WeiPerEther;
      let params = {
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createLimitOrderPoolCompact(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createLimitOrderPoolCompact(params);
      expect(await nucleus.totalSupply()).eq(10);
      expect(await nucleus.balanceOf(user1.address)).eq(5);
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
      let balIA2 = await nucleus.getTokenBalance(token1.address, locationA);
      let balPL2 = await nucleus.getTokenBalance(token1.address, poolLocation);
      expect(balNu2.sub(balNu1)).eq(amountA);
      expect(balEA1.sub(balEA2)).eq(amountA);
      expect(balIA1.sub(balIA2)).eq(0);
      expect(balIA2).eq(0);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, user1ExternalLocation, poolLocation, amountA);
      await expect(tx).to.emit(token1, "Transfer").withArgs(user1.address, nucleus.address, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, locationB);
      l1DataFeeAnalyzer.register("createLimitOrderPoolCompact", tx);
    });
    it("will not attempt to wrap gas token if address unknown", async function () {
      expect(await nucleus.wrappedGasToken()).eq(AddressZero);
      let params = {
        tokenA: wgas.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(103, 100)
      };
      await expect(nucleus.connect(user1).createLimitOrderPoolCompact(params, {value:1})).to.be.revertedWith("ERC20: insufficient allowance");
    });
    it("can wrap gas token and use wgas in same call 1", async function () {
      await nucleus.connect(owner).setWrappedGasToken(wgas.address);
      expect(await nucleus.wrappedGasToken()).eq(wgas.address);

      let poolID = 11001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(103, 100);
      let locationA = user1InternalLocation;
      let locationB = user1ExternalLocation;
      expect(await nucleus.totalSupply()).eq(10);
      expect(await nucleus.balanceOf(user1.address)).eq(5);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, wgas.address, token2.address)).to.be.reverted
      let balNug1 = await provider.getBalance(nucleus.address);
      let balNu1 = await wgas.balanceOf(nucleus.address);
      let balEA1 = await wgas.balanceOf(user1.address);
      let balIA1 = await nucleus.getTokenBalance(wgas.address, locationA);
      let balPL1 = await nucleus.getTokenBalance(wgas.address, poolLocation);
      expect(balNug1).eq(0);
      expect(balEA1).eq(0);
      expect(balIA1).eq(0);
      let amountA = WeiPerEther;
      let params = {
        tokenA: wgas.address,
        tokenB: token2.address,
        amountA: amountA,
        exchangeRate: exchangeRate
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createLimitOrderPoolCompact(params, {value:amountA});
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createLimitOrderPoolCompact(params, {value:amountA});
      expect(await nucleus.totalSupply()).eq(11);
      expect(await nucleus.balanceOf(user1.address)).eq(6);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(1);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(wgas.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.amountA).eq(amountA);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      let tradeRequest = await nucleus.getTradeRequest(poolID, wgas.address, token2.address);
      expect(tradeRequest.amountA).eq(amountA);
      expect(tradeRequest.exchangeRate).eq(exchangeRate);
      expect(tradeRequest.locationB).eq(locationB);
      expect(await nucleus.getTokenBalance(wgas.address, poolLocation)).eq(amountA);
      let balNug2 = await provider.getBalance(nucleus.address);
      let balNu2 = await wgas.balanceOf(nucleus.address);
      let balEA2 = await wgas.balanceOf(user1.address);
      let balIA2 = await nucleus.getTokenBalance(wgas.address, locationA);
      let balPL2 = await nucleus.getTokenBalance(wgas.address, poolLocation);
      expect(balNug2).eq(0);
      expect(balNu2.sub(balNu1)).eq(amountA);
      expect(balEA1.sub(balEA2)).eq(0);
      expect(balIA1.sub(balIA2)).eq(0);
      expect(balIA2).eq(0);
      expect(balPL2.sub(balPL1)).eq(amountA);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1ExternalLocation, user1InternalLocation, amountA);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1InternalLocation, poolLocation, amountA);
      await expect(tx).to.emit(wgas, "Deposit").withArgs(nucleus.address, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, locationB);
      l1DataFeeAnalyzer.register("createLimitOrderPoolCompact", tx);
    });
    it("can wrap gas token and use wgas in same call 2", async function () {
      // wrap more than required for limit order
      // leave change in internal address
      let poolID = 12001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(103, 100);
      let locationA = user1InternalLocation;
      let locationB = user1ExternalLocation;
      expect(await nucleus.totalSupply()).eq(11);
      expect(await nucleus.balanceOf(user1.address)).eq(6);
      expect(await nucleus.exists(poolID)).eq(false);
      await expect(nucleus.ownerOf(poolID)).to.be.reverted;
      await expect(nucleus.getPoolType(poolID)).to.be.reverted;
      await expect(nucleus.getLimitOrderPool(poolID)).to.be.reverted;
      await expect(nucleus.getTradeRequest(poolID, wgas.address, token2.address)).to.be.reverted
      let balNug1 = await provider.getBalance(nucleus.address);
      let balNu1 = await wgas.balanceOf(nucleus.address);
      let balEA1 = await wgas.balanceOf(user1.address);
      let balIA1 = await nucleus.getTokenBalance(wgas.address, locationA);
      let balPL1 = await nucleus.getTokenBalance(wgas.address, poolLocation);
      expect(balNug1).eq(0);
      expect(balEA1).eq(0);
      expect(balIA1).eq(0);
      let amountGas = WeiPerEther.mul(3);
      let amountWgas = WeiPerEther.mul(2);
      let params = {
        tokenA: wgas.address,
        tokenB: token2.address,
        amountA: amountWgas,
        exchangeRate: exchangeRate
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createLimitOrderPoolCompact(params, {value:amountGas});
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createLimitOrderPoolCompact(params, {value:amountGas});
      expect(await nucleus.totalSupply()).eq(12);
      expect(await nucleus.balanceOf(user1.address)).eq(7);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.getPoolType(poolID)).eq(1);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(wgas.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.amountA).eq(amountWgas);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      let tradeRequest = await nucleus.getTradeRequest(poolID, wgas.address, token2.address);
      expect(tradeRequest.amountA).eq(amountWgas);
      expect(tradeRequest.exchangeRate).eq(exchangeRate);
      expect(tradeRequest.locationB).eq(locationB);
      expect(await nucleus.getTokenBalance(wgas.address, poolLocation)).eq(amountWgas);
      let balNug2 = await provider.getBalance(nucleus.address);
      let balNu2 = await wgas.balanceOf(nucleus.address);
      let balEA2 = await wgas.balanceOf(user1.address);
      let balIA2 = await nucleus.getTokenBalance(wgas.address, locationA);
      let balPL2 = await nucleus.getTokenBalance(wgas.address, poolLocation);
      expect(balNug2).eq(0);
      expect(balNu2.sub(balNu1)).eq(amountGas);
      expect(balEA1.sub(balEA2)).eq(0);
      expect(balIA2.sub(balIA1)).eq(amountGas.sub(amountWgas));
      expect(balIA2).eq(amountGas.sub(amountWgas));
      expect(balPL2.sub(balPL1)).eq(amountWgas);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1ExternalLocation, user1InternalLocation, amountGas);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wgas.address, user1InternalLocation, poolLocation, amountWgas);
      await expect(tx).to.emit(wgas, "Deposit").withArgs(nucleus.address, amountGas);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, params.tokenA, params.tokenB, params.exchangeRate, locationB);
      l1DataFeeAnalyzer.register("createLimitOrderPoolCompact", tx);
    });
  });

  describe("update limit order", function () {
    it("cannot update non existant pool", async function () {
      await expect(nucleus.connect(user2).updateLimitOrderPool({
        poolID: 999,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 0),
        locationB: user2ExternalLocation
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("cannot update not your pool", async function () {
      await expect(nucleus.connect(user2).updateLimitOrderPool({
        poolID: 1001,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 0),
        locationB: user2ExternalLocation
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
    it("cannot update a grid order as a limit order 1", async function () {
      await nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [],
        hptReceiver: user1.address
      });
      let poolID = (await nucleus.totalSupply()).mul(1000).add(2);
      await expect(nucleus.connect(user1).updateLimitOrderPool({
        poolID,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1,1),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotALimitOrderPool");
    });
    it("cannot update a grid order as a limit order 2", async function () {
      await nucleus.connect(user1).createGridOrderPoolCompact({
        tokenSources: [],
        exchangeRates: [],
      });
      let poolID = (await nucleus.totalSupply()).mul(1000).add(2);
      await expect(nucleus.connect(user1).updateLimitOrderPool({
        poolID,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1,1),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotALimitOrderPool");
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
      l1DataFeeAnalyzer.register("updateLimitOrderPool", tx);
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
      l1DataFeeAnalyzer.register("updateLimitOrderPool", tx);
    });
  });

  describe("update limit order compact", function () {
    it("cannot update non existant pool", async function () {
      await expect(nucleus.connect(user2).updateLimitOrderPoolCompact({
        poolID: 999,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 0),
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("cannot update not your pool", async function () {
      await expect(nucleus.connect(user2).updateLimitOrderPoolCompact({
        poolID: 1001,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 0),
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
    });
    it("cannot update a grid order as a limit order 1", async function () {
      await nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [],
        hptReceiver: user1.address
      });
      let poolID = (await nucleus.totalSupply()).mul(1000).add(2);
      await expect(nucleus.connect(user1).updateLimitOrderPoolCompact({
        poolID,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1,1),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotALimitOrderPool");
    });
    it("cannot update a grid order as a limit order 2", async function () {
      await nucleus.connect(user1).createGridOrderPoolCompact({
        tokenSources: [],
        exchangeRates: [],
      });
      let poolID = (await nucleus.totalSupply()).mul(1000).add(2);
      await expect(nucleus.connect(user1).updateLimitOrderPoolCompact({
        poolID,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1,1),
        locationB: HydrogenNucleusHelper.externalAddressToLocation(user1.address)
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotALimitOrderPool");
    });
    it("can update pool", async function () {
      let poolID = 1001;
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(10123477, 10000077);
      let pool0 = await nucleus.getLimitOrderPool(poolID);
      let locationB = pool0.locationB;
      let tx = await nucleus.connect(user1).updateLimitOrderPoolCompact({
        poolID: poolID,
        exchangeRate: exchangeRate,
      });
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate, locationB);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(token1.address);
      expect(pool.tokenB).eq(token2.address);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.locationB).eq(locationB);
      l1DataFeeAnalyzer.register("updateLimitOrderPoolCompact", tx);
    });
  });

  describe("L1 gas fees", function () {
    it("calculate", async function () {
      l1DataFeeAnalyzer.analyze()
    });
  });
});
