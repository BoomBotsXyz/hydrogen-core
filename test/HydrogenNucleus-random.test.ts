/* global describe it before ethers */

import hre from "hardhat";
const { ethers } = hre;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish } from "ethers";
const { randomBytes, formatUnits } = ethers.utils;
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;

import { HydrogenNucleus, MockERC20 } from "./../typechain-types";

import { getNetworkSettings } from "../scripts/utils/getNetworkSettings";
import HydrogenNucleusHelper from "../scripts/utils/HydrogenNucleusHelper";
import { deployContract } from "../scripts/utils/deployContract";

const { AddressZero, WeiPerEther, MaxUint256, Zero } = ethers.constants;
const MAX_PPM = BN.from(1_000_000); // parts per million

// a series of random cases to test math
describe("HydrogenNucleus-random", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let nucleus: HydrogenNucleus;

  let numTokens = 5;
  let tokens:any[] = [];

  let chainID: number;
  let networkSettings: any;
  let snapshot: BN;

  let feeReceiverLocation: string;
  let user1ExternalLocation: string;
  let user1InternalLocation: string;
  let user2ExternalLocation: string;
  let user2InternalLocation: string;

  before(async function () {
    [deployer, owner, user1, user2] = await ethers.getSigners();
    chainID = (await provider.getNetwork()).chainId;
    networkSettings = getNetworkSettings(chainID);
    if(!networkSettings.isTestnet) throw new Error("Do not run tests on production networks");
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    while(tokens.length < numTokens) {
      let token = await deployContract(deployer, "MockERC20", [`Token${tokens.length+1}`, `TKN${tokens.length+1}`, 18]) as MockERC20;
      tokens.push(token);
    }

    feeReceiverLocation = HydrogenNucleusHelper.internalAddressToLocation(owner.address);
    user1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
    user1InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
    user2ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
    user2InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("should deploy successfully", async function () {
      nucleus = await deployContract(deployer, "HydrogenNucleus", [owner.address]) as HydrogenNucleus;
    });
  });

  describe("random cases", function () {
    before(async function () {
      let mintAmount = BN.from(10).pow(32);
      for(let i = 0; i < tokens.length; ++i) {
        await tokens[i].connect(user1).mint(user1.address, mintAmount);
        await tokens[i].connect(user2).mint(user2.address, mintAmount);
        await tokens[i].connect(user1).approve(nucleus.address, MaxUint256);
        await tokens[i].connect(user2).approve(nucleus.address, MaxUint256);
        await nucleus.connect(user1).tokenTransfer({ token: tokens[i].address, src: user1ExternalLocation, dst: user1InternalLocation, amount: mintAmount });
        await nucleus.connect(user2).tokenTransfer({ token: tokens[i].address, src: user2ExternalLocation, dst: user2InternalLocation, amount: mintAmount });
      }
    });
    let numCases = 3;
    for(let i = 0; i < numCases; i++) {
      describe(`random case ${i+1}/${numCases}`, createRandomCase());
    }
  });

  function createRandomCase() {
    function f() {
      let tokenIndices = randomTokenPairIndices();
      let amountASeed = randomTokenAmount();
      let amountBSeed = randomTokenAmount();
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(amountASeed, amountBSeed);
      let feePPM = randomSwapFee();
      let poolID: number;
      let poolLocation: string;
      let tokenA: MockERC20;
      let tokenB: MockERC20;

      before(async function () {
        tokenA = tokens[tokenIndices[0]];
        tokenB = tokens[tokenIndices[1]];
        await nucleus.connect(owner).setSwapFeesForPairs([{
          tokenA: tokenA.address,
          tokenB: tokenB.address,
          feePPM: feePPM,
          receiverLocation: feeReceiverLocation
        }])
      });
      it("can create limit order", async function () {
        let tx = await nucleus.connect(user1).createLimitOrderPool({
          tokenA: tokenA.address,
          tokenB: tokenB.address,
          amountA: amountASeed,
          exchangeRate: exchangeRate,
          locationA: user1InternalLocation,
          locationB: user1InternalLocation,
          hptReceiver: user1.address
        });
        let receipt = await tx.wait();
        poolID = receipt.events[0].args[0].toNumber();
        poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      });
      it("cannot swap with price mismatch - exact A", async function () {
        let amountAMT = amountASeed.div(2).mul(BN.from(randomBytes(32))).div(MaxUint256);
        let amountAMM = amountAMT;
        let amountBMM = HydrogenNucleusHelper.calculateAmountB(amountAMM, exchangeRate);
        amountBMM = amountBMM.sub(1);
        let amountBMT = amountBMM.mul(MAX_PPM).div(MAX_PPM.sub(feePPM));
        await expect(nucleus.connect(user2).executeMarketOrder({
          poolID: poolID,
          tokenA: tokenA.address,
          tokenB: tokenB.address,
          amountA: amountAMT,
          amountB: amountBMT,
          locationA: user2InternalLocation,
          locationB: user2InternalLocation,
          flashSwapCallee: AddressZero,
          callbackData: "0x"
        })).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
      });
      it("cannot swap with price mismatch - exact B", async function () {
        let amountBMM = amountBSeed.div(2).mul(BN.from(randomBytes(32))).div(MaxUint256);
        let amountBMT = amountBMM.mul(MAX_PPM).div(MAX_PPM.sub(feePPM));
        let amountAMM = HydrogenNucleusHelper.calculateAmountA(amountBMM, exchangeRate);
        amountAMM = amountAMM.add(1);
        let amountAMT = amountAMM;
        await expect(nucleus.connect(user2).executeMarketOrder({
          poolID: poolID,
          tokenA: tokenA.address,
          tokenB: tokenB.address,
          amountA: amountAMT,
          amountB: amountBMT,
          locationA: user2InternalLocation,
          locationB: user2InternalLocation,
          flashSwapCallee: AddressZero,
          callbackData: "0x"
        })).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
      });
      it("can swap at exact price - exact A, partial fill", async function () {
        let amountAMT = amountASeed.div(2).mul(BN.from(randomBytes(32))).div(MaxUint256);
        let { amountAMM, amountBMM, amountBMT, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactAMT(amountAMT, exchangeRate, feePPM);
        await tryMarketOrder({ amountAMT, amountAMM, amountBMM, amountBMT, amountBFR });
      });
      it("can swap at exact price - exact B, partial fill", async function () {
        let amountBMT = amountBSeed.div(2).mul(BN.from(randomBytes(32))).div(MaxUint256);
        let { amountAMM, amountAMT, amountBMM, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactBMT(amountBMT, exchangeRate, feePPM);
        await tryMarketOrder({ amountAMT, amountAMM, amountBMM, amountBMT, amountBFR });
      });
      it("can swap at exact price - exact A, complete fill", async function () {
        let amountAMT = await nucleus.getTokenBalance(tokenA.address, poolLocation);
        let { amountAMM, amountBMM, amountBMT, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactAMT(amountAMT, exchangeRate, feePPM);
        await tryMarketOrder({ amountAMT, amountAMM, amountBMM, amountBMT, amountBFR });
      });
      async function tryMarketOrder(params:any) {
        let { amountAMT, amountAMM, amountBMM, amountBMT, amountBFR } = params;
        try {
          let balPlA1 = await nucleus.getTokenBalance(tokenA.address, poolLocation);
          let balPlB1 = await nucleus.getTokenBalance(tokenB.address, poolLocation);
          let balMmA1 = await nucleus.getTokenBalance(tokenA.address, user1InternalLocation);
          let balMmB1 = await nucleus.getTokenBalance(tokenB.address, user1InternalLocation);
          let balMtA1 = await nucleus.getTokenBalance(tokenA.address, user2InternalLocation);
          let balMtB1 = await nucleus.getTokenBalance(tokenB.address, user2InternalLocation);
          let balFrA1 = await nucleus.getTokenBalance(tokenA.address, feeReceiverLocation);
          let balFrB1 = await nucleus.getTokenBalance(tokenB.address, feeReceiverLocation);
          let tx = await nucleus.connect(user2).executeMarketOrder({
            poolID: poolID,
            tokenA: tokenA.address,
            tokenB: tokenB.address,
            amountA: amountAMT,
            amountB: amountBMT,
            locationA: user2InternalLocation,
            locationB: user2InternalLocation,
            flashSwapCallee: AddressZero,
            callbackData: "0x"
          });
          let balPlA2 = await nucleus.getTokenBalance(tokenA.address, poolLocation);
          let balPlB2 = await nucleus.getTokenBalance(tokenB.address, poolLocation);
          let balMmA2 = await nucleus.getTokenBalance(tokenA.address, user1InternalLocation);
          let balMmB2 = await nucleus.getTokenBalance(tokenB.address, user1InternalLocation);
          let balMtA2 = await nucleus.getTokenBalance(tokenA.address, user2InternalLocation);
          let balMtB2 = await nucleus.getTokenBalance(tokenB.address, user2InternalLocation);
          let balFrA2 = await nucleus.getTokenBalance(tokenA.address, feeReceiverLocation);
          let balFrB2 = await nucleus.getTokenBalance(tokenB.address, feeReceiverLocation);
          expect(balPlA1.sub(balPlA2)).eq(amountAMM);
          expect(balPlB1.sub(balPlB2)).eq(0);
          expect(balMmA1.sub(balMmA2)).eq(0);
          expect(balMmB2.sub(balMmB1)).eq(amountBMM);
          expect(balMtA2.sub(balMtA1)).eq(amountAMT);
          expect(balMtB1.sub(balMtB2)).eq(amountBMT);
          expect(balFrA2.sub(balFrA1)).eq(0);
          expect(balFrB2.sub(balFrB1)).eq(amountBFR);
          await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(tokenA.address, poolLocation, user2InternalLocation, amountAMT);
          await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(tokenB.address, user2InternalLocation, poolLocation, amountBMM);
          await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(tokenB.address, poolLocation, user1InternalLocation, amountBMM);
          if(amountBFR.gt(0)) await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(tokenB.address, user2InternalLocation, feeReceiverLocation, amountBFR);
          await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, tokenA.address, tokenB.address, amountAMM, amountBMT, amountBMM);
        } catch(e) {
          console.error("Error. Case details:\n" +
            `user1     : ${user1.address}\n` +
            `user2     : ${user2.address}\n` +
            `tokenA    : ${tokenA.address}\n` +
            `tokenB    : ${tokenB.address}\n` +
            `amountAMM : ${amountAMM.toString()}\n` +
            `amountAMT : ${amountAMT.toString()}\n` +
            `amountBMM : ${amountBMM.toString()}\n` +
            `amountBMT : ${amountBMT.toString()}\n` +
            `amountBFR : ${amountBFR.toString()}\n` +
            `poolLoc   : ${poolLocation}`
          );
          throw(e);
        }
      }
    }
    return f;
  }

  function randomTokenAmount() {
    const MIN_DECIMALS = 2;
    const MAX_DECIMALS = 28;
    let amount = Zero;
    while(amount.eq(0)) {
      let decimals = Math.floor(Math.random() * (MAX_DECIMALS - MIN_DECIMALS)) + MIN_DECIMALS + 1;
      let base = BN.from(10).pow(decimals);
      amount = base.mul(BN.from(randomBytes(32))).div(MaxUint256);
    }
    return amount
  }

  function randomTokenPairIndices() {
    let selections = [0, 0];
    while(selections[0] == selections[1]) {
      selections[0] = Math.floor(Math.random() * numTokens);
      selections[1] = Math.floor(Math.random() * numTokens);
    }
    return selections
  }

  function randomSwapFee() {
    const MAX_SWAP_FEE_PPM = BN.from(10000); // 1%
    let feePPM = MAX_SWAP_FEE_PPM.mul(BN.from(randomBytes(32))).div(MaxUint256);
    return feePPM;
  }
});
