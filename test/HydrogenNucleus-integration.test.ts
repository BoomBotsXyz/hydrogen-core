/* global describe it before ethers */

import hre from "hardhat";
const { ethers } = hre;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;
import fs from "fs";

import { HydrogenNucleus, WrappedGasToken, MockERC20, MockERC20PermitA, MockERC20PermitB, MockERC20PermitC } from "./../typechain-types";

import { expectDeployed } from "./../scripts/utilities/expectDeployed";
import { getNetworkSettings } from "../scripts/utils/getNetworkSettings";
import HydrogenNucleusHelper from "../scripts/utils/HydrogenNucleusHelper";
import HydrogenNucleusEventLogger from "../scripts/utils/HydrogenNucleusEventLogger";
import { findERC20BalanceOfSlot, manipulateERC20BalanceOf, setStorageAt, toBytes32 } from "../scripts/utilities/setStorage";
import { decimalsToAmount } from "../scripts/utils/price";
import { deployContract } from "../scripts/utils/deployContract";

const { AddressZero, WeiPerEther, MaxUint256, Zero } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const WeiPerWbtc = BN.from(100_000_000); // 8 decimals
const MAX_PPM = BN.from(1_000_000); // parts per million

const INVALID_LOCATION_0 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const INVALID_LOCATION_6 = "0x0600000000000000000000000000000000000000000000000000000000000000";
const INVALID_EXTERNAL_ADDRESS_LOCATION = "0x01ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const INVALID_INTERNAL_ADDRESS_LOCATION = "0x02ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const NULL_LOCATION = "0x0000000000000000000000000000000000000000000000000000000000000000";
const NULL_EXCHANGE_RATE = "0x0000000000000000000000000000000000000000000000000000000000000000";
const NULL_FEE = "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("HydrogenNucleus Integration", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dave: SignerWithAddress;
  let edgar: SignerWithAddress;

  let nucleus: HydrogenNucleus;

  let nucleusExternalLocation: string;
  let nucleusInternalLocation: string;
  let feeReceiverLocation: string;
  let aliceExternalLocation: string;
  let aliceInternalLocation: string;
  let bobExternalLocation: string;
  let bobInternalLocation: string;

  let defaultFeePPM = BN.from(2000);

  // fetch tokens
  let tokens: any[] = [];
  function isChain(chainid: number, chainName: string) {
    //return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
    return (process.env.FORK_NETWORK === chainName);
  }
  if(isChain(1, "ethereum")) tokens = JSON.parse(fs.readFileSync("./data/tokens/1.json").toString().trim());
  else if(isChain(5, "goerli")) tokens = JSON.parse(fs.readFileSync("./data/tokens/5.json").toString().trim());
  else if(isChain(137, "polygon")) tokens = JSON.parse(fs.readFileSync("./data/tokens/137.json").toString().trim());
  else if(isChain(80001, "mumbai")) tokens = JSON.parse(fs.readFileSync("./data/tokens/80001.json").toString().trim());
  else return;

  let dai: any;
  let usdc: any;
  let usdt: any;
  let wbtc: any;

  let chainID: number;
  let networkSettings: any;
  let snapshot: BN;

  before(async function () {
    [deployer, owner, alice, bob, charlie, dave, edgar] = await ethers.getSigners();
    chainID = (await provider.getNetwork()).chainId;
    networkSettings = getNetworkSettings(chainID);
    if(!networkSettings.isTestnet) throw new Error("Do not run tests on production networks");
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // fetch tokens
    let tokens: any[] = [];
    function isChain(chainid: number, chainName: string) {
      //return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
      return (process.env.FORK_NETWORK === chainName);
    }
    if(isChain(1, "ethereum")) tokens = JSON.parse(fs.readFileSync("./data/tokens/1.json").toString().trim());
    else if(isChain(5, "goerli")) tokens = JSON.parse(fs.readFileSync("./data/tokens/5.json").toString().trim());
    else if(isChain(137, "polygon")) tokens = JSON.parse(fs.readFileSync("./data/tokens/137.json").toString().trim());
    else if(isChain(80001, "mumbai")) tokens = JSON.parse(fs.readFileSync("./data/tokens/80001.json").toString().trim());
    else throw new Error(`chain '${process.env.FORK_NETWORK}' cannot be used in this test`);
    for(let i = 0; i < tokens.length; ++i) {
      let token = tokens[i];
      await expectDeployed(token.address);
      if(!token.special) token.special = [];
      // fetch contract
      let tokenContract: Contract;
      if(token.special.includes("wgas")) tokenContract = await ethers.getContractAt("WrappedGasToken", token.address) as WrappedGasToken;
      else if(!token.permit) tokenContract = await ethers.getContractAt("MockERC20", token.address) as MockERC20;
      else if(token.permit.permitType === "A") tokenContract = await ethers.getContractAt("MockERC20PermitA", token.address) as MockERC20PermitA;
      else if(token.permit.permitType === "B") tokenContract = await ethers.getContractAt("MockERC20PermitB", token.address) as MockERC20PermitB;
      else if(token.permit.permitType === "C") tokenContract = await ethers.getContractAt("MockERC20PermitC", token.address) as MockERC20PermitC;
      else tokenContract = await ethers.getContractAt("MockERC20", token.address) as MockERC20;
      token.contract = tokenContract;

      // zero balances
      let users = [owner, alice, bob, charlie, dave, edgar];
      for(var j = 0; j < users.length; ++j) {
        let bal = await tokenContract.balanceOf(users[j].address);
        if(bal.gt(0)) await tokenContract.connect(users[j]).transfer("0x000000000000000000000000000000000000dEaD", bal);
      }

      // find balanceOf slot
      if(token.balanceOfSlot === undefined || token.balanceOfSlot === -1) {
        let isVyper = token.special.includes("vyper");
        token.balanceOfSlot = await findERC20BalanceOfSlot(token.address, isVyper);
        console.log(`balanceOf slot: ${token.balanceOfSlot}`);
      }
      // tokens by symbol
      if(token.symbol === "DAI") dai = token;
      if(token.symbol === "USDC") usdc = token;
      if(token.symbol === "USDT") usdt = token;
      if(token.symbol === "WBTC") wbtc = token;
    }
    let requiredTokens = { dai, usdc, usdt, wbtc } as any;
    let symbols = Object.keys(requiredTokens);
    let missingTokens = [] as string[];
    symbols.forEach(sym => { if(!requiredTokens[sym]) missingTokens.push(sym)});
    if(missingTokens.length > 0) throw new Error(`missing tokens: ${missingTokens.join(", ")}`);

    // locations
    aliceExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(alice.address);
    aliceInternalLocation = HydrogenNucleusHelper.internalAddressToLocation(alice.address);
    bobExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(bob.address);
    bobInternalLocation = HydrogenNucleusHelper.internalAddressToLocation(bob.address);
    feeReceiverLocation = HydrogenNucleusHelper.internalAddressToLocation(owner.address);
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("should deploy successfully", async function () {
      nucleus = await deployContract(deployer, "HydrogenNucleus", [owner.address]) as HydrogenNucleus;
      nucleusExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(nucleus.address);
      nucleusInternalLocation = HydrogenNucleusHelper.internalAddressToLocation(nucleus.address);
    });
  });

  describe("setup", function () {
    it("should set fees", async function () {
      // default swap fee 0.2%
      await nucleus.connect(owner).setSwapFeesForPairs([{
        tokenA: AddressZero,
        tokenB: AddressZero,
        feePPM: defaultFeePPM,
        receiverLocation: feeReceiverLocation
      }]);
    });
  });

  describe("scenarios", function () {
    it("scenario 1: create limit order", async function () {
      // Alice is a first time Hydrogen user and wants to place a limit order to buy WBTC using USDC. She has 10,000 USDC in her wallet and is willing to pay 25,000 USDC/WBTC, expecting to receive 0.4 WBTC.
      let amountA = WeiPerUsdc.mul(10_000);
      let amountB = WeiPerWbtc.mul(4).div(10);
      let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(amountA, amountB);
      await mintTokens(usdc, alice.address, amountA);
      await usdc.contract.connect(alice).approve(nucleus.address, MaxUint256);
      // alice creates a limit order
      let params = {
        tokenA: usdc.address,
        tokenB: wbtc.address,
        amountA: amountA,
        exchangeRate: exchangeRate,
        locationA: aliceExternalLocation,
        locationB: aliceExternalLocation,
        hptReceiver: alice.address
      };
      let poolID = await nucleus.connect(alice).callStatic.createLimitOrderPool(params);
      let tx = await nucleus.connect(alice).createLimitOrderPool(params);
      // checks
      expect(poolID).eq(1001);
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      expect(await nucleus.getTokenBalance(usdc.address, aliceExternalLocation)).eq(0);
      expect(await nucleus.getTokenBalance(usdc.address, poolLocation)).eq(amountA);
      expect(await nucleus.getTokenBalance(usdc.address, nucleusExternalLocation)).eq(amountA);
      let pool = await nucleus.getLimitOrderPool(poolID);
      expect(pool.tokenA).eq(usdc.address);
      expect(pool.tokenB).eq(wbtc.address);
      expect(pool.exchangeRate).eq(exchangeRate);
      expect(pool.amountA).eq(amountA);
      expect(pool.locationB).eq(aliceExternalLocation);
      expect(await nucleus.ownerOf(poolID)).eq(alice.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, alice.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(usdc.address, aliceExternalLocation, poolLocation, amountA);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, usdc.address, wbtc.address, exchangeRate, aliceExternalLocation);
      //await expect(tx).to.emit(usdc, "Transfer").withArgs(alice.address, nucleus.address, amountA); // cannot fetch events from contract off fork network
    });
    it("scenario 2.1: partially fill limit order", async function () {
      // Bob wants to sell his WBTC for USDC at the best available price. He has 0.1 WBTC in his wallet that he wants to sell. He sees Alice's limit order (10,000 USDC to WBTC @ 25,000 USDC/WBTC). He is willing to partially fill that order and after a 0.2% swap fee expects to receive 2,495 USDC.
      let poolID = 1001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let pool = await nucleus.getLimitOrderPool(poolID);
      let amountBMT = WeiPerWbtc.mul(1).div(10);
      let amountBFR = amountBMT.mul(defaultFeePPM).div(MAX_PPM);
      let amountBMM = amountBMT.sub(amountBFR);
      let amountAMM = HydrogenNucleusHelper.calculateAmountA(amountBMM, pool.exchangeRate);
      let amountAMT = amountAMM;
      let amountAFR = Zero;
      expect(amountAMM).eq(WeiPerUsdc.mul(2495));
      await mintTokens(wbtc, bob.address, amountBMT);
      await wbtc.contract.connect(bob).approve(nucleus.address, MaxUint256);
      let balPlA1 = await nucleus.getTokenBalance(usdc.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(wbtc.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(usdc.address, bobExternalLocation);
      let balMtB1 = await nucleus.getTokenBalance(wbtc.address, bobExternalLocation);
      let balMmA1 = await nucleus.getTokenBalance(usdc.address, pool.locationB);
      let balMmB1 = await nucleus.getTokenBalance(wbtc.address, pool.locationB);
      let balFrA1 = await nucleus.getTokenBalance(usdc.address, feeReceiverLocation);
      let balFrB1 = await nucleus.getTokenBalance(wbtc.address, feeReceiverLocation);
      // bob executes a market order
      let params = {
        poolID: poolID,
        tokenA: usdc.address,
        tokenB: wbtc.address,
        amountA: amountAMT,
        amountB: amountBMT,
        locationA: bobExternalLocation,
        locationB: bobExternalLocation,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(bob).executeFlashSwap(params);
      // checks
      let balPlA2 = await nucleus.getTokenBalance(usdc.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(wbtc.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(usdc.address, bobExternalLocation);
      let balMtB2 = await nucleus.getTokenBalance(wbtc.address, bobExternalLocation);
      let balMmA2 = await nucleus.getTokenBalance(usdc.address, pool.locationB);
      let balMmB2 = await nucleus.getTokenBalance(wbtc.address, pool.locationB);
      let balFrA2 = await nucleus.getTokenBalance(usdc.address, feeReceiverLocation);
      let balFrB2 = await nucleus.getTokenBalance(wbtc.address, feeReceiverLocation);
      expect(balPlA1.sub(balPlA2)).eq(amountAMM);
      expect(balPlB2.sub(balPlB1)).eq(0);
      expect(balMtA2.sub(balMtA1)).eq(amountAMT);
      expect(balMtB1.sub(balMtB2)).eq(amountBMT);
      expect(balMmA1.sub(balMmA2)).eq(0);
      expect(balMmB2.sub(balMmB1)).eq(amountBMM);
      expect(balFrA2.sub(balFrA1)).eq(amountAFR);
      expect(balFrB2.sub(balFrB1)).eq(amountBFR);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(usdc.address, poolLocation, bobExternalLocation, amountAMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wbtc.address, bobExternalLocation, poolLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wbtc.address, poolLocation, aliceExternalLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wbtc.address, bobExternalLocation, feeReceiverLocation, amountBFR);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, usdc.address, wbtc.address, amountAMT, amountBMT, amountBMM);
    });
    it("scenario 2.2: completely fill limit order", async function () {
      let poolID = 1001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let pool = await nucleus.getLimitOrderPool(poolID);
      let amountAMM = await nucleus.getTokenBalance(usdc.address, poolLocation);
      let amountAMT = amountAMM;
      let amountBMM = HydrogenNucleusHelper.calculateAmountB(amountAMM, pool.exchangeRate);
      let amountBMT = amountBMM.mul(MAX_PPM).div(MAX_PPM.sub(defaultFeePPM))
      let amountBFR = amountBMT.mul(defaultFeePPM).div(MAX_PPM);
      let amountAFR = Zero;
      await mintTokens(wbtc, bob.address, amountBMT);
      let balPlA1 = await nucleus.getTokenBalance(usdc.address, poolLocation);
      let balPlB1 = await nucleus.getTokenBalance(wbtc.address, poolLocation);
      let balMtA1 = await nucleus.getTokenBalance(usdc.address, bobExternalLocation);
      let balMtB1 = await nucleus.getTokenBalance(wbtc.address, bobExternalLocation);
      let balMmA1 = await nucleus.getTokenBalance(usdc.address, pool.locationB);
      let balMmB1 = await nucleus.getTokenBalance(wbtc.address, pool.locationB);
      let balFrA1 = await nucleus.getTokenBalance(usdc.address, feeReceiverLocation);
      let balFrB1 = await nucleus.getTokenBalance(wbtc.address, feeReceiverLocation);
      // bob executes a market order
      let params = {
        poolID: poolID,
        tokenA: usdc.address,
        tokenB: wbtc.address,
        amountA: amountAMT,
        amountB: amountBMT,
        locationA: bobExternalLocation,
        locationB: bobExternalLocation,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(bob).executeFlashSwap(params);
      // checks
      let balPlA2 = await nucleus.getTokenBalance(usdc.address, poolLocation);
      let balPlB2 = await nucleus.getTokenBalance(wbtc.address, poolLocation);
      let balMtA2 = await nucleus.getTokenBalance(usdc.address, bobExternalLocation);
      let balMtB2 = await nucleus.getTokenBalance(wbtc.address, bobExternalLocation);
      let balMmA2 = await nucleus.getTokenBalance(usdc.address, pool.locationB);
      let balMmB2 = await nucleus.getTokenBalance(wbtc.address, pool.locationB);
      let balFrA2 = await nucleus.getTokenBalance(usdc.address, feeReceiverLocation);
      let balFrB2 = await nucleus.getTokenBalance(wbtc.address, feeReceiverLocation);
      expect(balPlA1.sub(balPlA2)).eq(amountAMM);
      expect(balPlB2.sub(balPlB1)).eq(0);
      expect(balMtA2.sub(balMtA1)).eq(amountAMT);
      expect(balMtB1.sub(balMtB2)).eq(amountBMT);
      expect(balMmA1.sub(balMmA2)).eq(0);
      expect(balMmB2.sub(balMmB1)).eq(amountBMM);
      expect(balFrA2.sub(balFrA1)).eq(amountAFR);
      expect(balFrB2.sub(balFrB1)).eq(amountBFR);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(usdc.address, poolLocation, bobExternalLocation, amountAMT);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wbtc.address, bobExternalLocation, poolLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wbtc.address, poolLocation, aliceExternalLocation, amountBMM);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wbtc.address, bobExternalLocation, feeReceiverLocation, amountBFR);
      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, usdc.address, wbtc.address, amountAMT, amountBMT, amountBMM);
    });
    it("scenario 3: create wbtc-usdc grid order", async function () {
      let exchangeRateSellUsdcBuyWbtc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(25_000), WeiPerWbtc);
      let exchangeRateSellWbtcBuyUsdc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerWbtc, WeiPerUsdc.mul(30_000));
      let amountUsdcDeposit = WeiPerUsdc.mul(10_000);
      let amountWbtcDeposit = WeiPerWbtc;
      await mintTokens(usdc, alice.address, amountUsdcDeposit);
      await mintTokens(wbtc, alice.address, amountWbtcDeposit);
      await usdc.contract.connect(alice).approve(nucleus.address, MaxUint256);
      await wbtc.contract.connect(alice).approve(nucleus.address, MaxUint256);
      // alice creates a grid order
      let params = {
        tokenSources: [{
          token: usdc.address,
          amount: amountUsdcDeposit,
          location: aliceExternalLocation
        },{
          token: wbtc.address,
          amount: amountWbtcDeposit,
          location: aliceExternalLocation
        }],
        tradeRequests: [{
          tokenA: usdc.address,
          tokenB: wbtc.address,
          exchangeRate: exchangeRateSellUsdcBuyWbtc,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        },{
          tokenA: wbtc.address,
          tokenB: usdc.address,
          exchangeRate: exchangeRateSellWbtcBuyUsdc,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        }],
        hptReceiver: alice.address
      };
      let poolID = await nucleus.connect(alice).callStatic.createGridOrderPool(params);
      let tx = await nucleus.connect(alice).createGridOrderPool(params);
      // checks
      expect(poolID).eq(2002);
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      expect(await nucleus.getTokenBalance(usdc.address, poolLocation)).eq(amountUsdcDeposit);
      expect(await nucleus.getTokenBalance(wbtc.address, poolLocation)).eq(amountWbtcDeposit);
      let pool = await nucleus.getGridOrderPool(poolID);
      expect(pool.tokens.length).eq(2);
      expect(pool.tokens[0]).eq(usdc.address);
      expect(pool.tokens[1]).eq(wbtc.address);
      expect(pool.balances.length).eq(2);
      expect(pool.balances[0]).eq(amountUsdcDeposit);
      expect(pool.balances[1]).eq(amountWbtcDeposit);
      expect(pool.tradeRequests.length).eq(2);
      expect(pool.tradeRequests[0].tokenA).eq(usdc.address);
      expect(pool.tradeRequests[0].tokenB).eq(wbtc.address);
      expect(pool.tradeRequests[0].exchangeRate).eq(exchangeRateSellUsdcBuyWbtc);
      expect(pool.tradeRequests[0].locationB).eq(poolLocation);
      expect(pool.tradeRequests[1].tokenA).eq(wbtc.address);
      expect(pool.tradeRequests[1].tokenB).eq(usdc.address);
      expect(pool.tradeRequests[1].exchangeRate).eq(exchangeRateSellWbtcBuyUsdc);
      expect(pool.tradeRequests[1].locationB).eq(poolLocation);
      expect(await nucleus.ownerOf(poolID)).eq(alice.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, alice.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(usdc.address, aliceExternalLocation, poolLocation, amountUsdcDeposit);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wbtc.address, aliceExternalLocation, poolLocation, amountWbtcDeposit);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, usdc.address, wbtc.address, exchangeRateSellUsdcBuyWbtc, poolLocation);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, wbtc.address, usdc.address, exchangeRateSellWbtcBuyUsdc, poolLocation);
      //await expect(tx).to.emit(usdc, "Transfer").withArgs(alice.address, nucleus.address, amountA); // cannot fetch events from contract off fork network
    });
    it("scenario 4: create dai-usdc-usdt grid order", async function () {
      // buy each for 0.99 of the other
      let exchangeRateSellDaiBuyUsdc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(99), WeiPerUsdc.mul(100));
      let exchangeRateSellUsdcBuyDai = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerEther.mul(100));
      let exchangeRateSellDaiBuyUsdt = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(99), WeiPerUsdc.mul(100));
      let exchangeRateSellUsdtBuyDai = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerEther.mul(100));
      let exchangeRateSellUsdcBuyUsdt = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerUsdc.mul(100));
      let exchangeRateSellUsdtBuyUsdc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerUsdc.mul(100));
      let amountDaiDeposit = WeiPerEther.mul(10_000);
      let amountUsdcDeposit = WeiPerUsdc.mul(10_000);
      let amountUsdtDeposit = WeiPerUsdc.mul(10_000);
      await mintTokens(dai, alice.address, amountDaiDeposit);
      await mintTokens(usdc, alice.address, amountUsdcDeposit);
      await mintTokens(usdt, alice.address, amountUsdtDeposit);
      await dai.contract.connect(alice).approve(nucleus.address, MaxUint256);
      await usdc.contract.connect(alice).approve(nucleus.address, MaxUint256);
      await usdt.contract.connect(alice).approve(nucleus.address, MaxUint256);
      // alice creates a limit order
      let params = {
        tokenSources: [{
          token: dai.address,
          amount: amountDaiDeposit,
          location: aliceExternalLocation
        },{
          token: usdc.address,
          amount: amountUsdcDeposit,
          location: aliceExternalLocation
        },{
          token: usdt.address,
          amount: amountUsdtDeposit,
          location: aliceExternalLocation
        }],
        tradeRequests: [{
          tokenA: dai.address,
          tokenB: usdc.address,
          exchangeRate: exchangeRateSellDaiBuyUsdc,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        },{
          tokenA: usdc.address,
          tokenB: dai.address,
          exchangeRate: exchangeRateSellUsdcBuyDai,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        },{
          tokenA: dai.address,
          tokenB: usdt.address,
          exchangeRate: exchangeRateSellDaiBuyUsdt,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        },{
          tokenA: usdt.address,
          tokenB: dai.address,
          exchangeRate: exchangeRateSellUsdtBuyDai,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        },{
          tokenA: usdc.address,
          tokenB: usdt.address,
          exchangeRate: exchangeRateSellUsdcBuyUsdt,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        },{
          tokenA: usdt.address,
          tokenB: usdc.address,
          exchangeRate: exchangeRateSellUsdtBuyUsdc,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        }],
        hptReceiver: alice.address
      };
      let poolID = await nucleus.connect(alice).callStatic.createGridOrderPool(params);
      let tx = await nucleus.connect(alice).createGridOrderPool(params);
      // checks
      expect(poolID).eq(3002);
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      expect(await nucleus.getTokenBalance(dai.address, poolLocation)).eq(amountDaiDeposit);
      expect(await nucleus.getTokenBalance(usdc.address, poolLocation)).eq(amountUsdcDeposit);
      expect(await nucleus.getTokenBalance(usdt.address, poolLocation)).eq(amountUsdtDeposit);
      let pool = await nucleus.getGridOrderPool(poolID);
      expect(pool.tokens.length).eq(3);
      expect(pool.tokens[0]).eq(dai.address);
      expect(pool.tokens[1]).eq(usdc.address);
      expect(pool.tokens[2]).eq(usdt.address);
      expect(pool.balances.length).eq(3);
      expect(pool.balances[0]).eq(amountDaiDeposit);
      expect(pool.balances[1]).eq(amountUsdcDeposit);
      expect(pool.balances[2]).eq(amountUsdtDeposit);
      expect(pool.tradeRequests.length).eq(6);
      expect(pool.tradeRequests[0].tokenA).eq(dai.address);
      expect(pool.tradeRequests[0].tokenB).eq(usdc.address);
      expect(pool.tradeRequests[0].exchangeRate).eq(exchangeRateSellDaiBuyUsdc);
      expect(pool.tradeRequests[0].locationB).eq(poolLocation);
      expect(pool.tradeRequests[1].tokenA).eq(dai.address);
      expect(pool.tradeRequests[1].tokenB).eq(usdt.address);
      expect(pool.tradeRequests[1].exchangeRate).eq(exchangeRateSellDaiBuyUsdt);
      expect(pool.tradeRequests[1].locationB).eq(poolLocation);
      expect(pool.tradeRequests[2].tokenA).eq(usdc.address);
      expect(pool.tradeRequests[2].tokenB).eq(dai.address);
      expect(pool.tradeRequests[2].exchangeRate).eq(exchangeRateSellUsdcBuyDai);
      expect(pool.tradeRequests[2].locationB).eq(poolLocation);
      expect(pool.tradeRequests[3].tokenA).eq(usdc.address);
      expect(pool.tradeRequests[3].tokenB).eq(usdt.address);
      expect(pool.tradeRequests[3].exchangeRate).eq(exchangeRateSellUsdcBuyUsdt);
      expect(pool.tradeRequests[3].locationB).eq(poolLocation);
      expect(pool.tradeRequests[4].tokenA).eq(usdt.address);
      expect(pool.tradeRequests[4].tokenB).eq(dai.address);
      expect(pool.tradeRequests[4].exchangeRate).eq(exchangeRateSellUsdtBuyDai);
      expect(pool.tradeRequests[4].locationB).eq(poolLocation);
      expect(pool.tradeRequests[5].tokenA).eq(usdt.address);
      expect(pool.tradeRequests[5].tokenB).eq(usdc.address);
      expect(pool.tradeRequests[5].exchangeRate).eq(exchangeRateSellUsdtBuyUsdc);
      expect(pool.tradeRequests[5].locationB).eq(poolLocation);
      expect(await nucleus.ownerOf(poolID)).eq(alice.address);
      await expect(tx).to.emit(nucleus, "Transfer").withArgs(AddressZero, alice.address, poolID);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(dai.address, aliceExternalLocation, poolLocation, amountDaiDeposit);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(usdc.address, aliceExternalLocation, poolLocation, amountUsdcDeposit);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(usdt.address, aliceExternalLocation, poolLocation, amountUsdtDeposit);
      await expect(tx).to.emit(nucleus, "PoolCreated").withArgs(poolID);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, dai.address, usdc.address, exchangeRateSellDaiBuyUsdc, poolLocation);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, dai.address, usdt.address, exchangeRateSellDaiBuyUsdt, poolLocation);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, usdc.address, dai.address, exchangeRateSellUsdcBuyDai, poolLocation);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, usdc.address, usdt.address, exchangeRateSellUsdcBuyUsdt, poolLocation);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, usdt.address, dai.address, exchangeRateSellUsdtBuyDai, poolLocation);
      await expect(tx).to.emit(nucleus, "TradeRequestUpdated").withArgs(poolID, usdt.address, usdc.address, exchangeRateSellUsdtBuyUsdc, poolLocation);
    });
  });

  describe("events", function () {
    it("can fetch account balances", async function () {
      let accounts:any = { nucleus, deployer, owner, alice, bob };
      let accountNames = Object.keys(accounts);
      console.log("fetching account balances")
      const tokens:any = { dai: dai.contract, usdc: usdc.contract, usdt: usdt.contract, wbtc: wbtc.contract };
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
        poolIDs.push(await nucleus.tokenByIndex(i))
      }
      const tokens:any = { dai: dai.contract, usdc: usdc.contract, usdt: usdt.contract, wbtc: wbtc.contract };
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
    it("can fetch and log pools", async function () {
      await HydrogenNucleusHelper.logPools(nucleus);
    });
    it("can fetch and parse events", async function () {
      let eventLogger = new HydrogenNucleusEventLogger(nucleus, provider, chainID);
      await eventLogger.fetchAndLogEvents()
    });
  })

  async function mintTokens(token:any, receiver:string, amount: BigNumberish) {
    if(!!token.special && token.special.includes("wgas")) {
      await token.contract.deposit({value: amount});
      await token.contract.transfer(receiver, amount);
    } else {
      let bal1 = await token.contract.balanceOf(receiver);
      let bal2 = bal1.add(amount);
      let isVyper = !!token.special && token.special.includes("vyper");
      await manipulateERC20BalanceOf(token.address, token.balanceOfSlot, receiver, bal2, isVyper);
    }
  }
});
