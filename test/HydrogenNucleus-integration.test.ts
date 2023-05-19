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

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const WeiPerWbtc = BN.from(100_000_000); // 8 decimals
const MAX_PPM = BN.from(1_000_000); // parts per million

const LOCATION_THIS_POOL = "0x0000000000000000000000000000000000000000000000000000000000000001";
const INVALID_LOCATION_0 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const INVALID_LOCATION_4 = "0x0400000000000000000000000000000000000000000000000000000000000000";
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

  let usdc: any;
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
      if(token.symbol === "WBTC") wbtc = token;
      if(token.symbol === "USDC") usdc = token;
    }
    let requiredTokens = { wbtc, usdc } as any;
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
        feePPM: 2000,
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
      let receipt = await tx.wait();
      console.log(receipt.events[0].event)
      console.log(receipt.events[0].args.poolID)
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
    it("scenario 2: fill limit order", async function () {
      // Bob wants to sell his WBTC for USDC at the best available price. He has 0.1 WBTC in his wallet that he wants to sell. He sees Alice's limit order (10,000 USDC to WBTC @ 25,000 USDC/WBTC). He is willing to partially fill that order and after a 0.2% swap fee expects to receive 2,495 USDC.
      let poolID = 1001;
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      let pool = await nucleus.getLimitOrderPool(poolID);
      let amountB = WeiPerWbtc.mul(1).div(10);
      let amountAFromPool = HydrogenNucleusHelper.calculateAmountA(amountB, pool.exchangeRate);
      let amountAToFeeReceiver = amountAFromPool.mul(2000).div(MAX_PPM);
      let amountAToMarketTaker = amountAFromPool.sub(amountAToFeeReceiver);
      expect(amountAFromPool).eq(WeiPerUsdc.mul(2500));
      expect(amountAToFeeReceiver).eq(WeiPerUsdc.mul(5));
      expect(amountAToMarketTaker).eq(WeiPerUsdc.mul(2495));
      await mintTokens(wbtc, bob.address, amountB);
      await wbtc.contract.connect(bob).approve(nucleus.address, MaxUint256);
      // bob executes a market order
      let params = {
        poolID: poolID,
        tokenA: usdc.address,
        tokenB: wbtc.address,
        amountA: amountAToMarketTaker,
        amountB: amountB,
        locationA: bobExternalLocation,
        locationB: bobExternalLocation,
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      };
      let tx = await nucleus.connect(bob).executeMarketOrder(params);
      // checks
      let amountAInPool = WeiPerUsdc.mul(7500);
      expect(await nucleus.getTokenBalance(usdc.address, aliceExternalLocation)).eq(0);
      expect(await nucleus.getTokenBalance(usdc.address, poolLocation)).eq(amountAInPool);
      expect(await nucleus.getTokenBalance(usdc.address, nucleusExternalLocation)).eq(amountAInPool.add(amountAToFeeReceiver));
      expect(await nucleus.getTokenBalance(usdc.address, bobExternalLocation)).eq(amountAToMarketTaker);
      expect(await nucleus.getTokenBalance(usdc.address, feeReceiverLocation)).eq(amountAToFeeReceiver);
      expect(await nucleus.getTokenBalance(wbtc.address, aliceExternalLocation)).eq(amountB);
      expect(await nucleus.getTokenBalance(wbtc.address, poolLocation)).eq(0);
      expect(await nucleus.getTokenBalance(wbtc.address, nucleusExternalLocation)).eq(0);
      expect(await nucleus.getTokenBalance(wbtc.address, bobExternalLocation)).eq(0);
      expect(await nucleus.getTokenBalance(wbtc.address, feeReceiverLocation)).eq(0);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(usdc.address, poolLocation, bobExternalLocation, amountAToMarketTaker);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(usdc.address, poolLocation, feeReceiverLocation, amountAToFeeReceiver);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wbtc.address, bobExternalLocation, poolLocation, amountB);
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(wbtc.address, poolLocation, aliceExternalLocation, amountB);
    });
  });

  describe("events", function () {
    it("can fetch account balances", async function () {
      let accounts:any = { nucleus, deployer, owner, alice, bob };
      let accountNames = Object.keys(accounts);
      console.log("fetching account balances")
      const tokens:any = { wbtc: wbtc.contract, usdc: usdc.contract };
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
      const tokens:any = { wbtc: wbtc.contract, usdc: usdc.contract };
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

//describe("", function () {});
//it("", async function () {});
