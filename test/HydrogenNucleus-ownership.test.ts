/* global describe it before ethers */

import hre from "hardhat";
const { ethers } = hre;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;

import { HydrogenNucleus } from "./../typechain-types";

import { getNetworkSettings } from "../scripts/utils/getNetworkSettings";
import { deployContract } from "../scripts/utils/deployContract";

const { AddressZero, WeiPerEther, MaxUint256, Zero } = ethers.constants;

describe("HydrogenNucleus-ownership", function () {
  let deployer: SignerWithAddress;
  let owner1: SignerWithAddress;
  let owner2: SignerWithAddress;
  let user: SignerWithAddress;

  let nucleus: HydrogenNucleus;

  let chainID: number;
  let networkSettings: any;
  let snapshot: BN;

  before(async function () {
    [deployer, owner1, owner2, user] = await ethers.getSigners();
    chainID = (await provider.getNetwork()).chainId;
    networkSettings = getNetworkSettings(chainID);
    if(!networkSettings.isTestnet) throw new Error("Do not run tests on production networks");
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("should deploy successfully", async function () {
      nucleus = await deployContract(deployer, "HydrogenNucleus", [owner1.address]) as HydrogenNucleus;
    });
  });

  describe("ownership", function () {
    it("should initialize correctly", async function () {
      expect(await nucleus.owner()).eq(owner1.address);
      expect(await nucleus.pendingOwner()).eq(AddressZero);
    });
    it("non owner cannot transfer ownership", async function () {
      await expect(nucleus.connect(user).transferOwnership(user.address)).to.be.revertedWithCustomError(nucleus, "HydrogenNotContractOwner");
    });
    it("owner can start ownership transfer", async function () {
      let tx = await nucleus.connect(owner1).transferOwnership(owner2.address);
      expect(await nucleus.owner()).eq(owner1.address);
      expect(await nucleus.pendingOwner()).eq(owner2.address);
      await expect(tx).to.emit(nucleus, "OwnershipTransferStarted").withArgs(owner1.address, owner2.address);
    });
    it("non pending owner cannot accept ownership", async function () {
      await expect(nucleus.connect(user).acceptOwnership()).to.be.revertedWithCustomError(nucleus, "HydrogenNotPendingContractOwner");
    });
    it("new owner can accept ownership", async function () {
      let tx = await nucleus.connect(owner2).acceptOwnership();
      expect(await nucleus.owner()).eq(owner2.address);
      expect(await nucleus.pendingOwner()).eq(owner2.address);
      await expect(tx).to.emit(nucleus, "OwnershipTransferred").withArgs(owner1.address, owner2.address);
    });
    it("non owner cannot renounce ownership", async function () {
      await expect(nucleus.connect(user).renounceOwnership()).to.be.revertedWithCustomError(nucleus, "HydrogenNotContractOwner");
    });
    it("owner can renounce ownership", async function () {
      let tx = await nucleus.connect(owner2).renounceOwnership();
      expect(await nucleus.owner()).eq(AddressZero);
      expect(await nucleus.pendingOwner()).eq(AddressZero);
      await expect(tx).to.emit(nucleus, "OwnershipTransferred").withArgs(owner2.address, AddressZero);
    });
  });
});
  /*
  describe("flash swap callbacks", function () {

    let amountA1001 = WeiPerEther.mul(10);
    let amountB1001 = WeiPerEther.mul(15);
    let exchangeRate1001 = HydrogenNucleusHelper.encodeExchangeRate(amountA1001, amountB1001);

    let amountA2001 = WeiPerEther.mul(17);
    let amountB2001 = WeiPerEther.mul(10);
    let exchangeRate2001 = HydrogenNucleusHelper.encodeExchangeRate(amountA2001, amountB2001);

    let expectedProfit1 = amountA2001.sub(amountB1001);

    it("should setup pools", async function () {
      expect(await nucleus.totalSupply()).eq(0);
      // poolID 1001. wants to buy token2 by selling token1
      await token1.connect(user1).mint(user1.address, WeiPerEther.mul(10000));
      await token1.connect(user1).approve(nucleus.address, MaxUint256);
      await nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA1001,
        exchangeRate: exchangeRate1001,
        locationA: user1ExternalLocation,
        locationB: user1InternalLocation,
        hptReceiver: user1.address
      });
      // poolID 2001. wants to buy token1 by selling token2
      await token2.connect(user2).mint(user2.address, WeiPerEther.mul(10000));
      await token2.connect(user2).approve(nucleus.address, MaxUint256);
      await nucleus.connect(user2).createLimitOrderPool({
        tokenA: token2.address,
        tokenB: token1.address,
        amountA: amountA2001,
        exchangeRate: exchangeRate2001,
        locationA: user2ExternalLocation,
        locationB: user2InternalLocation,
        hptReceiver: user2.address
      });
    });
    it("can use callback to arbitrage between two pools", async function () {
      console.log("user1    :", user1.address)
      console.log("user2    :", user2.address)
      console.log("user3    :", user3.address)
      console.log("token1   :", token1.address)
      console.log("token2   :", token2.address)
      console.log("callback :", swapCallback.address)
      // 1. encode the token1 -> pool 2001 -> token2 market order
      const call12 = {
        target: nucleus.address,
        callData: nucleus.interface.encodeFunctionData('executeFlashSwap', [{
          poolID: 2001,
          tokenA: token2.address,
          tokenB: token1.address,
          amountA: amountA2001,
          amountB: amountB2001,
          locationA: user3InternalLocation,
          locationB: callbackInternalLocation,
          flashSwapCallee: AddressZero,
          callbackData: "0x",
        }])
      }
      const calls12 = [call12, ]
      const functionCall12 = swapCallback.interface.encodeFunctionData('aggregate', [calls12])
      const callbackData12 = `0x${functionCall12.substring(10)}`
      // 2. encode the tokenX -> pool0 -> tokenY market order
      let tx = await nucleus.connect(user3).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA1001,
        amountB: amountB1001,
        locationA: callbackInternalLocation,
        locationB: user3InternalLocation,
        flashSwapCallee: swapCallback.address,
        callbackData: callbackData12,
      })
      //console.log("tx")
      //console.log(tx)
      //let receipt = await tx.wait()
      //console.log("receipt")
      //console.log(receipt)
      // checks
      expect(await nucleus.getTokenBalance(token2.address, user1InternalLocation)).eq(amountB1001);
      expect(await nucleus.getTokenBalance(token1.address, user2InternalLocation)).eq(amountB2001);
      expect(await nucleus.getTokenBalance(token2.address, user3InternalLocation)).eq(expectedProfit1);
    });
  });
});
*/
