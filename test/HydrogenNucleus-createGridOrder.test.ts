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

describe("HydrogenNucleus-createGridOrder", function () {
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
    while(tokens.length < 21) {
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

  describe("createGridOrderPool part 1", function () {
    before("mint", async function () {
      await token1.mint(user1.address, WeiPerEther.mul(10000));
    });
    it("cannot create grid order using not contract as erc20", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: user1.address,
          amount: 0,
          location: user1ExternalLocation
        }],
        tradeRequests: [],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
      /* // won't revert - doesn't call token. also creates useless order
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [{
          tokenA: user1.address,
          tokenB: token1.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1,1),
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        }],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
      */
    });
    it("cannot create grid order using not token as erc20", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: swapCallee1.address,
          amount: 0,
          location: user1ExternalLocation
        }],
        tradeRequests: [],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
      /* // won't revert - doesn't call token. also creates useless order
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [{
          tokenA: swapCallee1.address,
          tokenB: token1.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1,1),
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        }],
        hptReceiver: user1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
      */
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
      await token1.connect(user1).approve(nucleus.address, MaxUint256);
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
      let ts1 = await nucleus.totalSupply();
      let bal1 = await nucleus.balanceOf(user1.address);
      let poolID = ts1.add(1).mul(1000).add(2);
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
      let ts2 = await nucleus.totalSupply();
      let bal2 = await nucleus.balanceOf(user1.address);
      expect(ts2).eq(ts1.add(1));
      expect(bal2).eq(bal1.add(1));
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
      l1DataFeeAnalyzer.register("createGridOrderPool(0,0)", tx);
    });
    it("can create grid order 2", async function () {
      // one trade request
      // external address to external address
      let ts1 = await nucleus.totalSupply();
      let bal1 = await nucleus.balanceOf(user1.address);
      let poolID = ts1.add(1).mul(1000).add(2);
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let amountA = WeiPerEther.mul(100);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(15, 10);
      let locationA = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
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
          locationB: locationB
        }],
        hptReceiver: user1.address
      };
      let poolIDout = await nucleus.connect(user1).callStatic.createGridOrderPool(params);
      expect(poolIDout).eq(poolID);
      let tx = await nucleus.connect(user1).createGridOrderPool(params);
      let ts2 = await nucleus.totalSupply();
      let bal2 = await nucleus.balanceOf(user1.address);
      expect(ts2).eq(ts1.add(1));
      expect(bal2).eq(bal1.add(1));
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
      l1DataFeeAnalyzer.register("createGridOrderPool(1,1)", tx);
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
      await token2.connect(user1).approve(nucleus.address, MaxUint256);
      // many trade requests
      // amounts go back into pool
      let ts1 = await nucleus.totalSupply();
      let bal1 = await nucleus.balanceOf(user1.address);
      let poolID = ts1.add(1).mul(1000).add(2);
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let exchangeRate12 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(101), WeiPerEther.mul(100));
      let exchangeRate21 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(100), WeiPerEther.mul(102));
      let exchangeRate13 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(103), WeiPerUsdc.mul(100));
      let exchangeRate31 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(100), WeiPerEther.mul(104));
      let exchangeRate23 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(105), WeiPerUsdc.mul(100));
      let exchangeRate32 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(100), WeiPerEther.mul(106));
      let locationA = userLocation;
      let locationB = poolLocation;
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
      let ts2 = await nucleus.totalSupply();
      let bal2 = await nucleus.balanceOf(user1.address);
      expect(ts2).eq(ts1.add(1));
      expect(bal2).eq(bal1.add(1));
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
      l1DataFeeAnalyzer.register("createGridOrderPool(3,6)", tx);
    });
    for(let numTokens = 0; numTokens < 16; numTokens++) { // over block gas limit at 16
      it(`can create grid order with ${numTokens} tokens`, async function () {
        if(numTokens == 0) {
          for(let i = 0; i < 21; i++) {
            await tokens[i].connect(user1).mint(user1.address, WeiPerEther.mul(1000));
            await tokens[i].connect(user1).approve(nucleus.address, MaxUint256);
          }
        }
        let tokenSources = []
        let tradeRequests = []
        for(let i = 0; i < numTokens; i++) {
          tokenSources.push({
            token: tokens[i].address,
            amount: WeiPerEther,
            location: user1ExternalLocation
          });
          for(let j = 0; j < numTokens; j++) {
            if(i == j) continue
            tradeRequests.push({
              tokenA: tokens[i].address,
              tokenB: tokens[j].address,
              exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerEther),
              locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
            });
          }
        }
        let tx = await nucleus.connect(user1).createGridOrderPool({
          tokenSources,
          tradeRequests,
          hptReceiver: user1.address
        })
        l1DataFeeAnalyzer.register(`createGridOrderPool(${tokenSources.length},${tradeRequests.length})`, tx);
      });
    }
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
      let tx = await nucleus.connect(user1).createGridOrderPool({
        tokenSources: tokenSources,
        tradeRequests: [],
        hptReceiver: user1.address
      });
      l1DataFeeAnalyzer.register("createGridOrderPool(20,0)", tx);
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
      l1DataFeeAnalyzer.register("createGridOrderPool(1,1)", tx);
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
      l1DataFeeAnalyzer.register("createGridOrderPool(1,1)", tx);
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
      l1DataFeeAnalyzer.register("createGridOrderPool(1,1)", tx);
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
      l1DataFeeAnalyzer.register("createGridOrderPool(1,1)", tx);
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
      l1DataFeeAnalyzer.register("createGridOrderPool(1,1)", tx);
    });
  });

  describe("createGridOrderPoolCompact part 1", function () {
    before("mint", async function () {
      await token1.mint(user1.address, WeiPerEther.mul(10000));
    });
    it("cannot create grid order using not contract as erc20", async function () {
      await expect(nucleus.connect(user1).createGridOrderPoolCompact({
        tokenSources: [{
          token: user1.address,
          amount: 1,
        }],
        exchangeRates: [],
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot create grid order using not token as erc20", async function () {
      await expect(nucleus.connect(user1).createGridOrderPoolCompact({
        tokenSources: [{
          token: swapCallee1.address,
          amount: 1,
        }],
        exchangeRates: [],
      })).to.be.revertedWithCustomError(nucleus, "HydrogenERC20TransferFailed");
    });
    it("cannot create grid order using nucleus as erc20", async function () {
      await expect(nucleus.connect(user1).createGridOrderPoolCompact({
        tokenSources: [{
          token: nucleus.address,
          amount: 0,
        }],
        exchangeRates: [],
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot create grid order with insufficient balance", async function () {
      await token1.connect(user1).approve(nucleus.address, MaxUint256);
      let balE = await nucleus.getTokenBalance(token1.address, user1ExternalLocation);
      let balI = await nucleus.getTokenBalance(token1.address, user1InternalLocation);
      let bal = balE.add(balI);
      expect(balE).gt(0);
      expect(balI).gt(0);
      await expect(nucleus.connect(user1).createGridOrderPoolCompact({
        tokenSources: [{
          token: token1.address,
          amount: bal.add(1),
        }],
        exchangeRates: [],
      })).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot create grid order with insufficient allowance", async function () {
      let balE = await nucleus.getTokenBalance(token1.address, user1ExternalLocation);
      let balI = await nucleus.getTokenBalance(token1.address, user1InternalLocation);
      let bal = balE.add(balI);
      expect(balE).gt(0);
      expect(balI).gt(0);
      await token1.connect(user1).approve(nucleus.address, balE.sub(1))
      await expect(nucleus.connect(user1).createGridOrderPoolCompact({
        tokenSources: [{
          token: token1.address,
          amount: bal,
        }],
        exchangeRates: [],
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
      await expect(nucleus.connect(user1).createGridOrderPoolCompact({
        tokenSources: [],
        exchangeRates: [],
      })).to.be.revertedWithCustomError(nucleus, "HydrogenMaxPoolCount");
      // reset
      await setStorageAt(nucleus.address, slotIndex, toBytes32(ts1));
      let ts3 = await nucleus.totalSupply();
      expect(ts3).eq(ts1);
    });
    it("cannot create grid order with length mismatch", async function () {
      for(let numTokens = 0; numTokens <= 20; numTokens++) {
        let tokenSources = []
        let exchangeRates = []
        for(let i = 0; i < numTokens; i++) {
          tokenSources.push({
            token: tokens[i].address,
            amount: 0
          });
          for(let j = 0; j < numTokens; j++) {
            if(i == j) continue;
            exchangeRates.push(HydrogenNucleusHelper.encodeExchangeRate(1,1))
          }
        }
        exchangeRates.push(HydrogenNucleusHelper.encodeExchangeRate(1,1))
        await expect(nucleus.connect(user1).createGridOrderPoolCompact({
          tokenSources,
          exchangeRates,
        })).to.be.revertedWithCustomError(nucleus, "HydrogenLengthMismatch");
      }
    });
    for(let numTokens = 0; numTokens <= 20; numTokens++) {
      it(`can create grid order with ${numTokens} tokens`, async function () {
        // pre
        let ts1 = await nucleus.totalSupply();
        let bal1 = await nucleus.balanceOf(user1.address);
        let poolID = ts1.add(1).mul(1000).add(2);
        let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
        expect(await nucleus.exists(poolID)).eq(false);
        await expect(nucleus.ownerOf(poolID)).to.be.reverted;
        await expect(nucleus.getPoolType(poolID)).to.be.reverted;
        await expect(nucleus.getGridOrderPool(poolID)).to.be.reverted;
        await expect(nucleus.getTradeRequest(poolID, token1.address, token2.address)).to.be.reverted;
        // create
        let tokenSources = []
        let exchangeRates = []
        let tradeRequests = []
        for(let i = 0; i < numTokens; i++) {
          tokenSources.push({
            token: tokens[i].address,
            amount: WeiPerEther.mul(i+1),
          });
          for(let j = 0; j < numTokens; j++) {
            if(i == j) continue;
            let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(i+1,j+1)
            exchangeRates.push(exchangeRate)
            tradeRequests.push({
              tokenA: tokens[i].address,
              tokenB: tokens[j].address,
              amountA: WeiPerEther.mul(i+1),
              exchangeRate: exchangeRate,
              locationB: poolLocation,
            })
          }
        }
        let params = {
          tokenSources,
          exchangeRates,
        }
        let poolIDout = await nucleus.connect(user1).callStatic.createGridOrderPoolCompact(params);
        expect(poolIDout).eq(poolID);
        let tx = await nucleus.connect(user1).createGridOrderPoolCompact(params);
        // post
        let ts2 = await nucleus.totalSupply();
        let bal2 = await nucleus.balanceOf(user1.address);
        expect(ts2).eq(ts1.add(1));
        expect(bal2).eq(bal1.add(1));
        expect(await nucleus.exists(poolID)).eq(true);
        expect(await nucleus.ownerOf(poolID)).eq(user1.address);
        expect(await nucleus.getPoolType(poolID)).eq(2);
        let pool = await nucleus.getGridOrderPool(poolID);
        expect(pool.tokens).deep.eq(tokenSources.map(src => src.token));
        expect(pool.balances).deep.eq(tokenSources.map(src => src.amount));
        for(let i = 0; i < tradeRequests.length; i++) {
          let tr1 = tradeRequests[i];
          let tr2 = pool.tradeRequests[i];
          expect(tr1.tokenA).eq(tr2.tokenA);
          expect(tr1.tokenB).eq(tr2.tokenB);
          expect(tr1.exchangeRate).eq(tr2.exchangeRate);
          expect(tr1.locationB).eq(tr2.locationB);
          if(i < 25) {
            let tr3 = await nucleus.getTradeRequest(poolID, tr1.tokenA, tr1.tokenB);
            expect(tr1.amountA).eq(tr3.amountA);
            expect(tr1.exchangeRate).eq(tr3.exchangeRate);
            expect(tr1.locationB).eq(tr3.locationB);
            await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, tr1.tokenA, tr1.tokenB, tr1.exchangeRate, poolLocation);
          }
        }
        await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
        await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
        l1DataFeeAnalyzer.register(`createGridOrderPoolCompact(${tokenSources.length},${exchangeRates.length})`, tx);
      });
    }
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
        poolID: 1002,
        tokenSources: [],
        tradeRequests: []
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
    });
    it("cannot update to invalid location type", async function () {
      await expect(nucleus.connect(user1).updateGridOrderPool({
        poolID: 1002,
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
        poolID: 1002,
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
        poolID: 1002,
        tokenSources: [],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0, 0),
          locationB: HydrogenNucleusHelper.internalAddressToLocation(AddressZero)
        }]
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot update a limit order as a grid order 1", async function () {
      await nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0,0),
        amountA: 0,
        locationA: user1InternalLocation,
        locationB: user1InternalLocation,
        hptReceiver: user1.address
      });
      let poolID = (await nucleus.totalSupply()).mul(1000).add(1);
      await expect(nucleus.connect(user1).updateGridOrderPool({
        poolID,
        tokenSources: [],
        tradeRequests: [],
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotAGridOrderPool");
    });
    it("cannot update a limit order as a grid order 2", async function () {
      await nucleus.connect(user1).createLimitOrderPoolCompact({
        tokenA: token1.address,
        tokenB: token2.address,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0,0),
        amountA: 0,
      });
      let poolID = (await nucleus.totalSupply()).mul(1000).add(1);
      await expect(nucleus.connect(user1).updateGridOrderPool({
        poolID,
        tokenSources: [],
        tradeRequests: [],
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotAGridOrderPool");
    });
    it("can update pool", async function () {
      let poolID = 1002;
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
      l1DataFeeAnalyzer.register("updateGridOrderPool(0,1)", tx);
    });
    it("can update pool 2", async function () {
      let poolID = 1002;
      let exchangeRate12 = HydrogenNucleusHelper.encodeExchangeRate(104321, 100000);
      let exchangeRate21 = HydrogenNucleusHelper.encodeExchangeRate(100000, 109999);
      let locationB = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let tx = await nucleus.connect(user1).updateGridOrderPool({
        poolID: poolID,
        tokenSources: [],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: exchangeRate12,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
        },{
          tokenA: token2.address,
          tokenB: token1.address,
          exchangeRate: exchangeRate21,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
        }]
      });
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate12, locationB);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token2.address, token1.address, exchangeRate21, locationB);
      let pool = await nucleus.getGridOrderPool(poolID);
      expect(pool.tradeRequests[0].tokenA).eq(token1.address);
      expect(pool.tradeRequests[0].tokenB).eq(token2.address);
      expect(pool.tradeRequests[0].exchangeRate).eq(exchangeRate12);
      expect(pool.tradeRequests[0].locationB).eq(locationB);
      expect(pool.tradeRequests[1].tokenA).eq(token2.address);
      expect(pool.tradeRequests[1].tokenB).eq(token1.address);
      expect(pool.tradeRequests[1].exchangeRate).eq(exchangeRate21);
      expect(pool.tradeRequests[1].locationB).eq(locationB);
      l1DataFeeAnalyzer.register("updateGridOrderPool(0,2)", tx);
    });
    for(let numTokens = 0; numTokens < 18; numTokens++) { // out of gas at 18
      it(`can update pool with ${numTokens} tokens`, async function () {
        let tokenSources = []
        let exchangeRates2 = []
        let tradeRequests = []
        let poolID = (await nucleus.totalSupply()).add(1).mul(1000).add(2);
        let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
        for(let i = 0; i < numTokens; i++) {
          tokenSources.push({
            token: tokens[i].address,
            amount: 0,
            location: user1InternalLocation
          });
          for(let j = 0; j < numTokens; j++) {
            if(i == j) continue;
            let exchangeRate2 = HydrogenNucleusHelper.encodeExchangeRate(i*17+1,j*19+1)
            exchangeRates2.push(exchangeRate2)
            tradeRequests.push({
              tokenA: tokens[i].address,
              tokenB: tokens[j].address,
              amountA: 0,
              exchangeRate: exchangeRate2,
              locationB: poolLocation,
            })
          }
        }
        let createParams = {
          tokenSources,
          tradeRequests: [],
          hptReceiver: user1.address
        }
        await nucleus.connect(user1).createGridOrderPool(createParams);
        let updateParams = {
          poolID: poolID,
          tokenSources: [],
          tradeRequests,
        }
        let tx = await nucleus.connect(user1).updateGridOrderPool(updateParams);
        // post
        let pool = await nucleus.getGridOrderPool(poolID);
        expect(pool.tokens).deep.eq(tokenSources.map(src => src.token));
        expect(pool.balances).deep.eq(tokenSources.map(src => src.amount));
        for(let i = 0; i < tradeRequests.length; i++) {
          let tr1 = tradeRequests[i];
          let tr2 = pool.tradeRequests[i];
          expect(tr1.tokenA).eq(tr2.tokenA);
          expect(tr1.tokenB).eq(tr2.tokenB);
          expect(tr1.exchangeRate).eq(tr2.exchangeRate);
          expect(tr1.locationB).eq(tr2.locationB);
          if(i < 25) {
            let tr3 = await nucleus.getTradeRequest(poolID, tr1.tokenA, tr1.tokenB);
            expect(tr1.exchangeRate).eq(tr3.exchangeRate);
            expect(tr1.locationB).eq(tr3.locationB);
            await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, tr1.tokenA, tr1.tokenB, tr1.exchangeRate, poolLocation);
          }
        }
        l1DataFeeAnalyzer.register(`updateGridOrderPool(${0},t${numTokens})`, tx);
      });
    }
  });

  describe("updateGridOrderPoolCompact", function () {
    it("cannot update non existant pool", async function () {
      await expect(nucleus.connect(user1).updateGridOrderPoolCompact({
        poolID: 0,
        exchangeRates: [],
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("cannot update not your pool", async function () {
      await expect(nucleus.connect(user2).updateGridOrderPoolCompact({
        poolID: 1002,
        exchangeRates: [],
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
    });
    it("cannot update a limit order as a grid order 1", async function () {
      await nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0,0),
        amountA: 0,
        locationA: user1InternalLocation,
        locationB: user1InternalLocation,
        hptReceiver: user1.address
      });
      let poolID = (await nucleus.totalSupply()).mul(1000).add(1);
      await expect(nucleus.connect(user1).updateGridOrderPoolCompact({
        poolID,
        exchangeRates: [],
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotAGridOrderPool");
    });
    it("cannot update a limit order as a grid order 2", async function () {
      await nucleus.connect(user1).createLimitOrderPoolCompact({
        tokenA: token1.address,
        tokenB: token2.address,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0,0),
        amountA: 0,
      });
      let poolID = (await nucleus.totalSupply()).mul(1000).add(1);
      await expect(nucleus.connect(user1).updateGridOrderPoolCompact({
        poolID,
        exchangeRates: []
      })).to.be.revertedWithCustomError(nucleus, "HydrogenNotAGridOrderPool");
    });
    it("can update pool", async function () {
      let poolID = 1002;
      let exchangeRate12 = HydrogenNucleusHelper.encodeExchangeRate(122222, 100000);
      let exchangeRate21 = HydrogenNucleusHelper.encodeExchangeRate(100000, 133333);
      let locationB = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let tx = await nucleus.connect(user1).updateGridOrderPoolCompact({
        poolID: poolID,
        exchangeRates: [exchangeRate12, exchangeRate21],
      });
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token1.address, token2.address, exchangeRate12, locationB);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, token2.address, token1.address, exchangeRate21, locationB);
      let pool = await nucleus.getGridOrderPool(poolID);
      expect(pool.tradeRequests[0].tokenA).eq(token1.address);
      expect(pool.tradeRequests[0].tokenB).eq(token2.address);
      expect(pool.tradeRequests[0].exchangeRate).eq(exchangeRate12);
      expect(pool.tradeRequests[0].locationB).eq(locationB);
      expect(pool.tradeRequests[1].tokenA).eq(token2.address);
      expect(pool.tradeRequests[1].tokenB).eq(token1.address);
      expect(pool.tradeRequests[1].exchangeRate).eq(exchangeRate21);
      expect(pool.tradeRequests[1].locationB).eq(locationB);
      l1DataFeeAnalyzer.register("updateGridOrderPoolCompact(0,2)", tx);
    });
    for(let numTokens = 0; numTokens <= 20; numTokens++) {
      let tokenSources = []
      let exchangeRates1 = []
      let exchangeRates2 = []
      let tradeRequests = []
      let poolID: any
      let poolLocation: string
      it(`can update pool with ${numTokens} tokens`, async function () {
        poolID = (await nucleus.totalSupply()).add(1).mul(1000).add(2);
        poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
        for(let i = 0; i < numTokens; i++) {
          tokenSources.push({
            token: tokens[i].address,
            amount: WeiPerEther.mul(i+1)
          });
          for(let j = 0; j < numTokens; j++) {
            if(i == j) continue;
            let exchangeRate1 = HydrogenNucleusHelper.encodeExchangeRate(i+1,j+1)
            exchangeRates1.push(exchangeRate1)
            let exchangeRate2 = HydrogenNucleusHelper.encodeExchangeRate(i*15+1,j*13+1)
            exchangeRates2.push(exchangeRate2)
            tradeRequests.push({
              tokenA: tokens[i].address,
              tokenB: tokens[j].address,
              amountA: WeiPerEther.mul(i+1),
              exchangeRate: exchangeRate2,
              locationB: poolLocation,
            })
          }
        }
        await nucleus.connect(user1).createGridOrderPoolCompact({
          tokenSources,
          exchangeRates: exchangeRates1,
        })
        let tx = await nucleus.connect(user1).updateGridOrderPoolCompact({
          poolID: poolID,
          exchangeRates: exchangeRates2,
        });
        // post
        let pool = await nucleus.getGridOrderPool(poolID);
        expect(pool.tokens).deep.eq(tokenSources.map(src => src.token));
        expect(pool.balances).deep.eq(tokenSources.map(src => src.amount));
        for(let i = 0; i < tradeRequests.length; i++) {
          let tr1 = tradeRequests[i];
          let tr2 = pool.tradeRequests[i];
          expect(tr1.tokenA).eq(tr2.tokenA);
          expect(tr1.tokenB).eq(tr2.tokenB);
          expect(tr1.exchangeRate).eq(tr2.exchangeRate);
          expect(tr1.locationB).eq(tr2.locationB);
          if(i < 25) {
            let tr3 = await nucleus.getTradeRequest(poolID, tr1.tokenA, tr1.tokenB);
            expect(tr1.amountA).eq(tr3.amountA);
            expect(tr1.exchangeRate).eq(tr3.exchangeRate);
            expect(tr1.locationB).eq(tr3.locationB);
            await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, tr1.tokenA, tr1.tokenB, tr1.exchangeRate, poolLocation);
          }
        }
        l1DataFeeAnalyzer.register(`updateGridOrderPoolCompact(${0},t${numTokens})`, tx);
      });
      it(`cannot update pool with ${numTokens} and a length mismatch`, async function () {
        exchangeRates2.push(HydrogenNucleusHelper.encodeExchangeRate(11,12))
        await expect(nucleus.connect(user1).updateGridOrderPoolCompact({
          poolID,
          exchangeRates: exchangeRates2,
        })).to.be.revertedWithCustomError(nucleus, "HydrogenLengthMismatch");
      });
    }
  });

  describe("L1 gas fees", function () {
    it("calculate", async function () {
      l1DataFeeAnalyzer.analyze()
    });
  });
});
