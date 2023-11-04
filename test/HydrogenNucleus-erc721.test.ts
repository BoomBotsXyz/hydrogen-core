/* global describe it before ethers */

import hre from "hardhat";
const { ethers } = hre;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;
import { splitSignature } from "ethers/lib/utils";

import { HydrogenNucleus, MockERC20, MockERC721Receiver1, MockERC721Receiver2, MockERC721Receiver3, MockERC721Receiver7, MockERC721Receiver8, MockERC721Receiver10 } from "./../typechain-types";

import { expectDeployed } from "./../scripts/utilities/expectDeployed";
import { getNetworkSettings } from "../scripts/utils/getNetworkSettings";
import HydrogenNucleusHelper from "../scripts/utils/HydrogenNucleusHelper";
import HydrogenNucleusEventLogger from "../scripts/utils/HydrogenNucleusEventLogger";
import { setStorageAt, toBytes32 } from "../scripts/utilities/setStorage";
import { decimalsToAmount } from "../scripts/utils/price";
import { deployContract } from "../scripts/utils/deployContract";
import L1DataFeeAnalyzer from "../scripts/utils/L1DataFeeAnalyzer";

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const MAX_PPM = BN.from(1_000_000); // parts per million

describe("HydrogenNucleus-erc721", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let user4: SignerWithAddress;

  let user1ExternalLocation: string;
  let user1InternalLocation: string;
  let user2ExternalLocation: string;
  let user2InternalLocation: string;
  let user3ExternalLocation: string;
  let user3InternalLocation: string;

  let nucleus: HydrogenNucleus;

  let receiver1: MockERC721Receiver1;
  let receiver2: MockERC721Receiver2;
  let receiver3: MockERC721Receiver3;
  let receiver7: MockERC721Receiver7;
  let receiver8: MockERC721Receiver8;
  let receiver10: MockERC721Receiver10;

  let token1: MockERC20;
  let token2: MockERC20;
  let token3: MockERC20;
  let tokens:any[] = [];

  let chainID: number;
  let networkSettings: any;
  let snapshot: BN;

  let l1DataFeeAnalyzer = new L1DataFeeAnalyzer();

  before(async function () {
    [deployer, owner, user1, user2, user3, user4] = await ethers.getSigners();
    chainID = (await provider.getNetwork()).chainId;
    networkSettings = getNetworkSettings(chainID);
    if(!networkSettings.isTestnet) throw new Error("Do not run tests on production networks");
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    nucleus = await deployContract(deployer, "HydrogenNucleus", [owner.address]) as HydrogenNucleus;

    receiver1 = await deployContract(deployer, "MockERC721Receiver1", [nucleus.address]) as MockERC721Receiver1;
    receiver2 = await deployContract(deployer, "MockERC721Receiver2", [nucleus.address]) as MockERC721Receiver2;
    receiver3 = await deployContract(deployer, "MockERC721Receiver3", [nucleus.address]) as MockERC721Receiver3;
    receiver7 = await deployContract(deployer, "MockERC721Receiver7", [nucleus.address]) as MockERC721Receiver7;
    receiver8 = await deployContract(deployer, "MockERC721Receiver8", [nucleus.address]) as MockERC721Receiver8;
    receiver10 = await deployContract(deployer, "MockERC721Receiver10", [nucleus.address]) as MockERC721Receiver10;

    while(tokens.length < 3) {
      let token = await deployContract(deployer, "MockERC20", [`Token${tokens.length+1}`, `TKN${tokens.length+1}`, 18]) as MockERC20;
      tokens.push(token);
    }
    [token1, token2, token3] = tokens;

    await token1.mint(user1.address, WeiPerEther.mul(10_000));
    await token1.mint(user2.address, WeiPerEther.mul(10_000));
    await token2.mint(user1.address, WeiPerEther.mul(10_000));
    await token2.mint(user2.address, WeiPerEther.mul(10_000));
    await token3.mint(user1.address, WeiPerEther.mul(10_000));
    await token3.mint(user2.address, WeiPerEther.mul(10_000));
    await token1.connect(user1).approve(nucleus.address, MaxUint256);
    await token1.connect(user2).approve(nucleus.address, MaxUint256);
    await token2.connect(user1).approve(nucleus.address, MaxUint256);
    await token2.connect(user2).approve(nucleus.address, MaxUint256);
    await token3.connect(user1).approve(nucleus.address, MaxUint256);
    await token3.connect(user2).approve(nucleus.address, MaxUint256);

    user1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
    user1InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
    user2ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
    user2InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
    user3ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user3.address);
    user3InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user3.address);
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("initial state", function () {
    it("should have no pools", async function () {
      expect(await nucleus.totalSupply()).eq(0);
      expect(await nucleus.balanceOf(user1.address)).eq(0);
      expect(await nucleus.exists(0)).eq(false);
      expect(await nucleus.exists(1001)).eq(false);
      await expect(nucleus.ownerOf(0)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.balanceOf(AddressZero)).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.getPoolType(0)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.getPoolType(1)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.getLimitOrderPool(0)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.getGridOrderPool(0)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.getTradeRequest(0, token1.address, token2.address)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("cannot fetch balanceOf address zero", async function () {
      await expect(nucleus.balanceOf(AddressZero)).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot fetch balanceOf nucleus address", async function () {
      await expect(nucleus.balanceOf(nucleus.address)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
  });

  describe("mint", function () {
    it("cannot create limit order to address zero", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: user1ExternalLocation,
        locationB: user1ExternalLocation,
        hptReceiver: AddressZero
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot create limit order to nucleus address", async function () {
      await expect(nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: user1ExternalLocation,
        locationB: user1ExternalLocation,
        hptReceiver: nucleus.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("cannot create grid order to address zero", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [],
        hptReceiver: AddressZero
      })).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot create grid order to address zero", async function () {
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [],
        tradeRequests: [],
        hptReceiver: nucleus.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("can create a limit order 1", async function () {
      let tx = await nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        locationA: user1ExternalLocation,
        locationB: user1ExternalLocation,
        hptReceiver: user1.address
      });
      let poolID = 1001;
      expect(await nucleus.totalSupply()).eq(1);
      expect(await nucleus.balanceOf(user1.address)).eq(1);
      expect(await nucleus.balanceOf(user2.address)).eq(0);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      l1DataFeeAnalyzer.register("createLimitOrderPool", tx);
    });
    it("can create a limit order 2", async function () {
      let tx = await nucleus.connect(user1).createLimitOrderPool({
        tokenB: token2.address,
        tokenA: token1.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(2, 3),
        locationA: user1ExternalLocation,
        locationB: user1ExternalLocation,
        hptReceiver: user2.address
      });
      let poolID = 2001;
      expect(await nucleus.totalSupply()).eq(2);
      expect(await nucleus.balanceOf(user1.address)).eq(1);
      expect(await nucleus.balanceOf(user2.address)).eq(1);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user2.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user2.address, poolID);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      l1DataFeeAnalyzer.register("createLimitOrderPool", tx);
    });
    it("can create a grid order 1", async function () {
      let tx = await nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: token1.address,
          location: user1ExternalLocation,
          amount: 1
        }],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
        }],
        hptReceiver: user1.address
      });
      let poolID = 3002;
      expect(await nucleus.totalSupply()).eq(3);
      expect(await nucleus.balanceOf(user1.address)).eq(2);
      expect(await nucleus.balanceOf(user2.address)).eq(1);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      l1DataFeeAnalyzer.register("createGridOrderPool", tx);
    });
    it("can create a grid order 2", async function () {
      let tx = await nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: token2.address,
          location: user1ExternalLocation,
          amount: 1
        }],
        tradeRequests: [{
          tokenA: token2.address,
          tokenB: token1.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(2, 3),
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
        }],
        hptReceiver: user2.address
      });
      let poolID = 4002;
      expect(await nucleus.totalSupply()).eq(4);
      expect(await nucleus.balanceOf(user1.address)).eq(2);
      expect(await nucleus.balanceOf(user2.address)).eq(2);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user2.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user2.address, poolID);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      l1DataFeeAnalyzer.register("createGridOrderPool", tx);
    });
    it("can create a limit order 3", async function () {
      // to contract, even if it doesnt support erc721 receiver
      let tx = await nucleus.connect(user1).createLimitOrderPool({
        tokenB: token2.address,
        tokenA: token3.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(2, 5),
        locationA: user1ExternalLocation,
        locationB: user1ExternalLocation,
        hptReceiver: receiver1.address
      });
      let poolID = 5001;
      expect(await nucleus.totalSupply()).eq(5);
      expect(await nucleus.balanceOf(user1.address)).eq(2);
      expect(await nucleus.balanceOf(user2.address)).eq(2);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.balanceOf(receiver1.address)).eq(1);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(receiver1.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, receiver1.address, poolID);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      l1DataFeeAnalyzer.register("createLimitOrderPool", tx);
    });
    it("can create a grid order 3", async function () {
      // to contract, even if it doesnt support erc721 receiver
      let tx = await nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: token2.address,
          location: user1ExternalLocation,
          amount: 1
        }],
        tradeRequests: [{
          tokenA: token2.address,
          tokenB: token1.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(2, 3),
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
        }],
        hptReceiver: receiver1.address
      });
      let poolID = 6002;
      expect(await nucleus.totalSupply()).eq(6);
      expect(await nucleus.balanceOf(user1.address)).eq(2);
      expect(await nucleus.balanceOf(user2.address)).eq(2);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.balanceOf(receiver1.address)).eq(2);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(receiver1.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, receiver1.address, poolID);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      l1DataFeeAnalyzer.register("createGridOrderPool", tx);
    });
    it("can create a limit order 4", async function () {
      let tx = await nucleus.connect(user1).createLimitOrderPool({
        tokenB: token2.address,
        tokenA: token3.address,
        amountA: 1,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(2, 5),
        locationA: user1ExternalLocation,
        locationB: user1ExternalLocation,
        hptReceiver: user1.address
      });
      let poolID = 7001;
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(3);
      expect(await nucleus.balanceOf(user2.address)).eq(2);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.balanceOf(receiver1.address)).eq(2);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, user1.address, poolID);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
    });
    it("cannot create limit order with duplicate poolID", async function () {
      // set totalSupply lower to force revert
      let ts1 = await nucleus.totalSupply();
      // set
      let slotIndex = toBytes32(0);
      let desiredLength = toBytes32(1);
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
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolAlreadyExists");
      // reset
      await setStorageAt(nucleus.address, slotIndex, toBytes32(ts1));
      let ts3 = await nucleus.totalSupply();
      expect(ts3).eq(ts1);
    });
    it("cannot create grid order with duplicate poolID", async function () {
      // set totalSupply lower to force revert
      let ts1 = await nucleus.totalSupply();
      // set
      let slotIndex = toBytes32(0);
      let desiredLength = toBytes32(2);
      await setStorageAt(nucleus.address, slotIndex, desiredLength);
      let ts2 = await nucleus.totalSupply();
      expect(ts2).eq(desiredLength);
      // test
      await expect(nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: token2.address,
          location: user1ExternalLocation,
          amount: 1
        }],
        tradeRequests: [{
          tokenA: token2.address,
          tokenB: token1.address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(2, 3),
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
        }],
        hptReceiver: receiver1.address
      })).to.be.revertedWithCustomError(nucleus, "HydrogenPoolAlreadyExists");
      // reset
      await setStorageAt(nucleus.address, slotIndex, toBytes32(ts1));
      let ts3 = await nucleus.totalSupply();
      expect(ts3).eq(ts1);
    });
  });

  describe("transferFrom", function () {
    it("cannot transfer non existant pool", async function () {
      await expect(nucleus.connect(user1).transferFrom(user1.address, user2.address, 0)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.connect(user1).transferFrom(user1.address, user2.address, 1002)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.connect(user1).transferFrom(user1.address, user2.address, 9001)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.connect(user1).transferFrom(user1.address, user2.address, 9002)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("cannot transfer pool not owned or operated by msg.sender", async function () {
      await expect(nucleus.connect(user2).transferFrom(user1.address, user1.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2).transferFrom(user1.address, user2.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2).transferFrom(user1.address, user3.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1).transferFrom(user2.address, user1.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1).transferFrom(user2.address, user2.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1).transferFrom(user2.address, user3.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2).transferFrom(user1.address, user1.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2).transferFrom(user1.address, user2.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2).transferFrom(user1.address, user3.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1).transferFrom(user2.address, user1.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1).transferFrom(user2.address, user1.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1).transferFrom(user2.address, user3.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
    });
    it("cannot transfer from not pool owner", async function () {
      await expect(nucleus.connect(user1).transferFrom(user2.address, user1.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user1).transferFrom(user2.address, user2.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2).transferFrom(user1.address, user1.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2).transferFrom(user1.address, user2.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user1).transferFrom(user2.address, user1.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user1).transferFrom(user2.address, user2.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user1).transferFrom(user2.address, user3.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user1).transferFrom(user3.address, user1.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user1).transferFrom(user3.address, user2.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user1).transferFrom(user3.address, user3.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2).transferFrom(user3.address, user1.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2).transferFrom(user3.address, user2.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2).transferFrom(user3.address, user3.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
    });
    it("cannot transfer to address zero", async function () {
      await expect(nucleus.connect(user1).transferFrom(user1.address, AddressZero, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.connect(user2).transferFrom(user2.address, AddressZero, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.connect(user1).transferFrom(user1.address, AddressZero, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.connect(user2).transferFrom(user2.address, AddressZero, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot transfer to nucleus address", async function () {
      await expect(nucleus.connect(user1).transferFrom(user1.address, nucleus.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user2).transferFrom(user2.address, nucleus.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user1).transferFrom(user1.address, nucleus.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user2).transferFrom(user2.address, nucleus.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("can transfer your pool 1", async function () {
      let poolID = 1001;
      let tx = await nucleus.connect(user1).transferFrom(user1.address, user3.address, poolID);
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(2);
      expect(await nucleus.balanceOf(user2.address)).eq(2);
      expect(await nucleus.balanceOf(user3.address)).eq(1);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user3.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(user1.address, user3.address, poolID);
      l1DataFeeAnalyzer.register("transferFrom", tx);
    });
    it("can transfer your pool 2", async function () {
      let poolID = 3002;
      let tx = await nucleus.connect(user1).transferFrom(user1.address, user2.address, poolID);
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(1);
      expect(await nucleus.balanceOf(user2.address)).eq(3);
      expect(await nucleus.balanceOf(user3.address)).eq(1);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user2.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(user1.address, user2.address, poolID);
      l1DataFeeAnalyzer.register("transferFrom", tx);
    });
    it("can transfer your pool 3", async function () {
      let poolID = 3002;
      let tx = await nucleus.connect(user2).transferFrom(user2.address, user3.address, poolID);
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(1);
      expect(await nucleus.balanceOf(user2.address)).eq(2);
      expect(await nucleus.balanceOf(user3.address)).eq(2);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user3.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(user2.address, user3.address, poolID);
      l1DataFeeAnalyzer.register("transferFrom", tx);
    });
    it("can transfer your pool 4", async function () {
      // to contract, even if it doesnt support erc721 receiver
      let poolID = 7001;
      let tx = await nucleus.connect(user1).transferFrom(user1.address, receiver1.address, poolID);
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(0);
      expect(await nucleus.balanceOf(user2.address)).eq(2);
      expect(await nucleus.balanceOf(user3.address)).eq(2);
      expect(await nucleus.balanceOf(receiver1.address)).eq(3);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(receiver1.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(user1.address, receiver1.address, poolID);
      l1DataFeeAnalyzer.register("transferFrom", tx);
    });
    it("cannot transfer a pool you used to own", async function () {
      await expect(nucleus.connect(user1).transferFrom(user3.address, user1.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1).transferFrom(user1.address, user1.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1).transferFrom(user3.address, user3.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1).transferFrom(user3.address, user1.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1).transferFrom(user1.address, user1.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1).transferFrom(user3.address, user3.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2).transferFrom(user3.address, user2.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2).transferFrom(user2.address, user2.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2).transferFrom(user3.address, user3.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
    });
  });

  describe("safeTransferFrom", function () {
    it("cannot transfer non existant pool", async function () {
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 0)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 1002)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 9001)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 9002)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user2.address, 0, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user2.address, 1002, "0x00")).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user2.address, 9001, "0xab")).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user2.address, 9002, "0xabcd")).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("cannot transfer pool not owned or operated by msg.sender", async function () {
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user1.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user3.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user3.address, user1.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user3.address, user2.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user3.address, user3.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user2.address, user1.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user2.address, user2.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user2.address, user3.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user1.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, user3.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user3.address, user1.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user3.address, user2.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user3.address, user3.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user1.address, user1.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user1.address, user3.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user3.address, user1.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user3.address, user2.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user3.address, user3.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user2.address, user1.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user2.address, user1.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user2.address, user3.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user1.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user2.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user3.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, user1.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, user2.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, user3.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, user1.address, 2001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, user2.address, 2001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, user3.address, 2001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user1.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user2.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user3.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, user1.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, user2.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, user3.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user1.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user2.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user3.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, user1.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, user2.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, user3.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, user1.address, 4002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, user1.address, 4002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, user3.address, 4002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
    });
    it("cannot transfer from not pool owner", async function () {
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user1.address, user1.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user1.address, user3.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user2.address, user1.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user2.address, user2.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user2.address, user3.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user1.address, user1.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user1.address, user1.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user1.address, user3.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user2.address, user1.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user2.address, user2.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user2.address, user3.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user3.address, user1.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user3.address, user2.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user3.address, user3.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user1.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user2.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user3.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, user1.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, user2.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, user3.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user1.address, 2001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user2.address, 2001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user1.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user2.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, user3.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, user1.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, user2.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, user3.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, user1.address, 4002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, user2.address, 4002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, user3.address, 4002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwner");
    });
    it("cannot transfer to address zero", async function () {
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user3.address, AddressZero, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user2.address, AddressZero, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user3.address, AddressZero, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user2.address, AddressZero, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, AddressZero, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, AddressZero, 2001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, AddressZero, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, AddressZero, 4002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
    });
    it("cannot transfer to nucleus address", async function () {
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user3.address, nucleus.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user2.address, nucleus.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user3.address, nucleus.address, 3002)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256)"](user2.address, nucleus.address, 4002)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, nucleus.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, nucleus.address, 2001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, nucleus.address, 3002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, nucleus.address, 4002, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("can safeTransferFrom to eoa 1", async function () {
      let poolID = 1001;
      let tx = await nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user3.address, user1.address, poolID);
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(1);
      expect(await nucleus.balanceOf(user2.address)).eq(2);
      expect(await nucleus.balanceOf(user3.address)).eq(1);
      expect(await nucleus.balanceOf(receiver1.address)).eq(3);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(user3.address, user1.address, poolID);
      l1DataFeeAnalyzer.register("safeTransferFrom(3)", tx);
    });
    it("can safeTransferFrom to eoa 2", async function () {
      let poolID = 3002;
      let tx = await nucleus.connect(user3)["safeTransferFrom(address,address,uint256,bytes)"](user3.address, user2.address, poolID, "0x");
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(1);
      expect(await nucleus.balanceOf(user2.address)).eq(3);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.balanceOf(receiver1.address)).eq(3);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user2.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(user3.address, user2.address, poolID);
      l1DataFeeAnalyzer.register("safeTransferFrom(4)", tx);
    });
    it("can safeTransferFrom to eoa 3", async function () {
      let poolID = 3002;
      let tx = await nucleus.connect(user2)["safeTransferFrom(address,address,uint256,bytes)"](user2.address, user3.address, poolID, "0x");
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(1);
      expect(await nucleus.balanceOf(user2.address)).eq(2);
      expect(await nucleus.balanceOf(user3.address)).eq(1);
      expect(await nucleus.balanceOf(receiver1.address)).eq(3);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user3.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(user2.address, user3.address, poolID);
      l1DataFeeAnalyzer.register("safeTransferFrom(4)", tx);
    });
    it("can safeTransferFrom to eoa 4", async function () {
      let poolID = 3002;
      let tx = await nucleus.connect(user3)["safeTransferFrom(address,address,uint256)"](user3.address, user1.address, poolID);
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(2);
      expect(await nucleus.balanceOf(user2.address)).eq(2);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.balanceOf(receiver1.address)).eq(3);
      expect(await nucleus.balanceOf(receiver3.address)).eq(0);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(user3.address, user1.address, poolID);
      l1DataFeeAnalyzer.register("safeTransferFrom(3)", tx);
    });
    it("cannot safeTransferFrom to not receiver contract", async function () {
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, token1.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotERC721Receiver");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, receiver1.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotERC721Receiver");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, receiver2.address, 1001)).to.be.revertedWith("MockERC721Receiver2: force revert");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, receiver7.address, 1001)).to.be.reverted;
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, receiver8.address, 1001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotERC721Receiver");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, token1.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotERC721Receiver");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, receiver1.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotERC721Receiver");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, receiver2.address, 1001, "0x")).to.be.revertedWith("MockERC721Receiver2: force revert");
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, receiver7.address, 1001, "0x")).to.be.reverted;
      await expect(nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, receiver8.address, 1001, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenNotERC721Receiver");
    });
    it("can safeTransferFrom to receiver contract 1", async function () {
      let poolID = 1001;
      let tx = await nucleus.connect(user1)["safeTransferFrom(address,address,uint256)"](user1.address, receiver3.address, poolID);
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(1);
      expect(await nucleus.balanceOf(user2.address)).eq(2);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.balanceOf(receiver1.address)).eq(3);
      expect(await nucleus.balanceOf(receiver3.address)).eq(1);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(receiver3.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(user1.address, receiver3.address, poolID);
      await expect(tx).to.emit(receiver3, "Callback");
      l1DataFeeAnalyzer.register("safeTransferFrom(3)", tx);
    });
    it("can safeTransferFrom to receiver contract 2", async function () {
      let poolID = 3002;
      let tx = await nucleus.connect(user1)["safeTransferFrom(address,address,uint256,bytes)"](user1.address, receiver3.address, poolID, "0x");
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(0);
      expect(await nucleus.balanceOf(user2.address)).eq(2);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.balanceOf(receiver1.address)).eq(3);
      expect(await nucleus.balanceOf(receiver3.address)).eq(2);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(receiver3.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(user1.address, receiver3.address, poolID);
      await expect(tx).to.emit(receiver3, "Callback");
      l1DataFeeAnalyzer.register("safeTransferFrom(4)", tx);
    });
  });

  describe("approval for one", function () {
    it("cannot get approval of nonexistant pool", async function () {
      await expect(nucleus.getApproved(0)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.getApproved(999)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.getApproved(1002)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.getApproved(3001)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      await expect(nucleus.getApproved(9001)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
    });
    it("approval starts zero", async function () {
      expect(await nucleus.getApproved(2001)).eq(AddressZero);
    });
    it("cannot be approved by non pool owner or approved", async function () {
      await expect(nucleus.connect(user3).approve(user1.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenNotPoolOwnerOrOperator");
    });
    it("can be approved by pool owner", async function () {
      let tx = await nucleus.connect(user2).approve(user3.address, 2001);
      expect(await nucleus.getApproved(2001)).eq(user3.address);
      await expect(tx).to.emit(nucleus, "Approval").withArgs(user2.address, user3.address, 2001);
      l1DataFeeAnalyzer.register("approve", tx);
    });
    it("can be revoked by pool owner", async function () {
      let tx = await nucleus.connect(user2).approve(AddressZero, 2001);
      expect(await nucleus.getApproved(2001)).eq(AddressZero);
      await expect(tx).to.emit(nucleus, "Approval").withArgs(user2.address, AddressZero, 2001);
      l1DataFeeAnalyzer.register("approve", tx);
    });
    it("transfer zeros approval", async function () {
      let tx1 = await nucleus.connect(user2).approve(user3.address, 2001);
      expect(await nucleus.getApproved(2001)).eq(user3.address);
      let tx2 = await nucleus.connect(user2).transferFrom(user2.address, user1.address, 2001);
      expect(await nucleus.getApproved(2001)).eq(AddressZero);
      l1DataFeeAnalyzer.register("approve", tx1);
      l1DataFeeAnalyzer.register("transferFrom", tx2);
    });
    it("can use approval to transfer", async function () {
      let tx1 = await nucleus.connect(user1).approve(user3.address, 2001);
      expect(await nucleus.getApproved(2001)).eq(user3.address);
      let tx2 = await nucleus.connect(user3).transferFrom(user1.address, user4.address, 2001);
      expect(await nucleus.getApproved(2001)).eq(AddressZero);
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(0);
      expect(await nucleus.balanceOf(user2.address)).eq(1);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.balanceOf(user4.address)).eq(1);
      expect(await nucleus.balanceOf(receiver1.address)).eq(3);
      expect(await nucleus.balanceOf(receiver3.address)).eq(2);
      expect(await nucleus.exists(2001)).eq(true);
      expect(await nucleus.ownerOf(2001)).eq(user4.address);
      await expect(tx2).to.emit(nucleus, "Transfer").withArgs(user1.address, user4.address, 2001);
      l1DataFeeAnalyzer.register("approve", tx1);
      l1DataFeeAnalyzer.register("transferFrom", tx2);
    });
    it("cannot approve to pool owner", async function () {
      await expect(nucleus.connect(user4).approve(user4.address, 2001)).to.be.revertedWithCustomError(nucleus, "HydrogenApprovePoolToOwner");
    });
  });

  describe("approval for all", function () {
    it("starts unapproved", async function () {
      expect(await nucleus.isApprovedForAll(user1.address, user2.address)).eq(false);
    });
    it("cannot approve to self", async function () {
      await expect(nucleus.connect(user1).setApprovalForAll(user1.address, false)).to.be.revertedWithCustomError(nucleus, "HydrogenApprovePoolToOwner");
      await expect(nucleus.connect(user1).setApprovalForAll(user1.address, true)).to.be.revertedWithCustomError(nucleus, "HydrogenApprovePoolToOwner");
    });
    it("can approve", async function () {
      let tx = await nucleus.connect(user1).setApprovalForAll(user2.address, true);
      expect(await nucleus.isApprovedForAll(user1.address, user2.address)).eq(true);
      await expect(tx).to.emit(nucleus, "ApprovalForAll").withArgs(user1.address, user2.address, true);
      l1DataFeeAnalyzer.register("setApprovalForAll", tx);
    });
    it("can revoke", async function () {
      let tx = await nucleus.connect(user1).setApprovalForAll(user2.address, false);
      expect(await nucleus.isApprovedForAll(user1.address, user2.address)).eq(false);
      await expect(tx).to.emit(nucleus, "ApprovalForAll").withArgs(user1.address, user2.address, false);
      l1DataFeeAnalyzer.register("setApprovalForAll", tx);
    });
    it("can use approval to transfer", async function () {
      let poolID = 4002;
      let tx1 = await nucleus.connect(user2).setApprovalForAll(user3.address, true);
      expect(await nucleus.isApprovedForAll(user2.address, user3.address)).eq(true);
      expect(await nucleus.isApprovedForAll(user2.address, user4.address)).eq(false);
      expect(await nucleus.getApproved(poolID)).eq(AddressZero);
      let tx2 = await nucleus.connect(user3).transferFrom(user2.address, user4.address, poolID);
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(0);
      expect(await nucleus.balanceOf(user2.address)).eq(0);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.balanceOf(user4.address)).eq(2);
      expect(await nucleus.balanceOf(receiver1.address)).eq(3);
      expect(await nucleus.balanceOf(receiver3.address)).eq(2);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user4.address);
      expect(await nucleus.isApprovedForAll(user2.address, user3.address)).eq(true);
      expect(await nucleus.isApprovedForAll(user2.address, user4.address)).eq(false);
      expect(await nucleus.getApproved(poolID)).eq(AddressZero);
      await expect(tx2).to.emit(nucleus, "Transfer").withArgs(user2.address, user4.address, poolID);
      l1DataFeeAnalyzer.register("setApprovalForAll", tx1);
      l1DataFeeAnalyzer.register("transferFrom", tx2);
    });
    it("can use approval to approve one then transfer", async function () {
      let poolID = 4002;
      let tx0 = await nucleus.connect(user4).setApprovalForAll(user3.address, true);
      expect(await nucleus.isApprovedForAll(user4.address, user3.address)).eq(true);
      expect(await nucleus.isApprovedForAll(user4.address, user1.address)).eq(false);
      expect(await nucleus.getApproved(poolID)).eq(AddressZero);
      let tx1 = await nucleus.connect(user3).approve(user1.address, poolID);
      expect(await nucleus.getApproved(poolID)).eq(user1.address);
      expect(await nucleus.isApprovedForAll(user4.address, user1.address)).eq(false);
      await expect(tx1).to.emit(nucleus, "Approval").withArgs(user4.address, user1.address, poolID);
      let tx2 = await nucleus.connect(user1).transferFrom(user4.address, user1.address, poolID);
      expect(await nucleus.totalSupply()).eq(7);
      expect(await nucleus.balanceOf(user1.address)).eq(1);
      expect(await nucleus.balanceOf(user2.address)).eq(0);
      expect(await nucleus.balanceOf(user3.address)).eq(0);
      expect(await nucleus.balanceOf(user4.address)).eq(1);
      expect(await nucleus.balanceOf(receiver1.address)).eq(3);
      expect(await nucleus.balanceOf(receiver3.address)).eq(2);
      expect(await nucleus.exists(poolID)).eq(true);
      expect(await nucleus.ownerOf(poolID)).eq(user1.address);
      expect(await nucleus.isApprovedForAll(user4.address, user3.address)).eq(true);
      expect(await nucleus.isApprovedForAll(user4.address, user1.address)).eq(false);
      expect(await nucleus.getApproved(poolID)).eq(AddressZero);
      await expect(tx2).to.emit(nucleus, "Transfer").withArgs(user4.address, user1.address, poolID);
      l1DataFeeAnalyzer.register("setApprovalForAll", tx0);
      l1DataFeeAnalyzer.register("approve", tx1);
      l1DataFeeAnalyzer.register("transferFrom", tx2);
    });
  });

  describe("metadata", function () {
    it("has the correct name", async function () {
      expect(await nucleus.name()).eq("Hydrogen Pool Token");
    });
    it("has the correct symbol", async function () {
      expect(await nucleus.symbol()).eq("HPT");
    });
    it("supports the correct interfaces", async function () {
      expect(await nucleus.supportsInterface("0x00000000")).eq(false);
      expect(await nucleus.supportsInterface("0xffffffff")).eq(false);
      expect(await nucleus.supportsInterface("0x780e9d63")).eq(false); // not erc721 enumerable
      expect(await nucleus.supportsInterface("0x01ffc9a7")).eq(true); // erc165
      expect(await nucleus.supportsInterface("0x80ac58cd")).eq(true); // erc721
      expect(await nucleus.supportsInterface("0x5b5e139f")).eq(true); // erc721 metadata
      expect(await nucleus.supportsInterface("0x4f558e79")).eq(true); // erc721 exists
    });

    describe("tokenURI", function () {
      let base = "https://stats.hydrogendefi.xyz/pools/?chainID=31337&poolID=";
      let uri = "https://stats.hydrogendefi.xyz/pools/?chainID=31337&poolID=1001";
      it("starts as id", async function () {
        expect(await nucleus.baseURI()).eq("");
        expect(await nucleus.tokenURI(1001)).eq("1001");
      });
      it("non owner cannot set base", async function () {
        await expect(nucleus.connect(user1).setBaseURI(base)).to.be.revertedWithCustomError(nucleus, "HydrogenNotContractOwner");
      });
      it("owner can set base", async function () {
        let tx = await nucleus.connect(owner).setBaseURI(base);
        await expect(tx).to.emit(nucleus, "BaseURISet").withArgs(base);
        l1DataFeeAnalyzer.register("setBaseURI", tx);
      });
      it("can get new uri", async function () {
        expect(await nucleus.baseURI()).eq(base);
        expect(await nucleus.tokenURI(1001)).eq(uri);
      });
      it("cannot get uri of nonexistant token", async function () {
        await expect(nucleus.tokenURI(999)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
        await expect(nucleus.tokenURI(1002)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
        await expect(nucleus.tokenURI(3001)).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
      });
    });

    describe("contractURI", function () {
      let uri = "https://stats-cdn.hydrogendefi.xyz/contract-uri.json";
      it("starts null", async function () {
        expect(await nucleus.contractURI()).eq("");
      });
      it("non owner cannot set uri", async function () {
        await expect(nucleus.connect(user1).setContractURI(uri)).to.be.revertedWithCustomError(nucleus, "HydrogenNotContractOwner");
      });
      it("owner can set uri", async function () {
        let tx = await nucleus.connect(owner).setContractURI(uri);
        await expect(tx).to.emit(nucleus, "ContractURISet").withArgs(uri);
        l1DataFeeAnalyzer.register("setContractURI", tx);
      });
      it("can get new uri", async function () {
        expect(await nucleus.contractURI()).eq(uri);
      });
    });
  });

  describe("L1 gas fees", function () {
    it("calculate", async function () {
      l1DataFeeAnalyzer.analyze()
    });
  });
});
