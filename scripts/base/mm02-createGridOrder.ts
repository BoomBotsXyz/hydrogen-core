import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract, Wallet } from "ethers";
import axios from "axios"
import { config as dotenv_config } from "dotenv";
dotenv_config();

const accounts = JSON.parse(process.env.ACCOUNTS || "{}");
const trader1 = new ethers.Wallet(accounts.trader1.key, provider);

import { HydrogenNucleus, MockERC20 } from "./../../typechain-types";
import { expectDeployed, isDeployed } from "./../utilities/expectDeployed";
import { logContractAddress } from "./../utilities/logContractAddress";
import { getNetworkSettings } from "./../utils/getNetworkSettings";
import { deployContract, verifyContract } from "./../utils/deployContract";
import HydrogenNucleusHelper from "../utils/HydrogenNucleusHelper";
import { getTokensBySymbol } from "../utils/getTokens";
import { decimalsToAmount } from "../utils/price";

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const WeiPerWbtc = BN.from(100_000_000); // 8 decimals

let networkSettings: any;
let chainID: number;

let nucleus: HydrogenNucleus;
let NUCLEUS_ADDRESS = "0x1Caba1EaA6F14b94EF732624Db1702eA41b718ff";

let tokenMetadatas = getTokensBySymbol(8453);

let nucleusState: any;

async function main() {
  console.log(`Using ${trader1.address} as trader1`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(8453, "base")) throw("Only run this on Base Mainnet or a local fork of Base");

  await verifyDeployments()
  nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS, trader1) as HydrogenNucleus;
  await fetchNucleusState();

  //await createGridOrder3002();
  //await updateGridOrder3002()
}

async function verifyDeployments() {
  let nonDeploys:string[] = []
  if(!await isDeployed(NUCLEUS_ADDRESS)) nonDeploys.push("HydrogenNucleus")
  let symbols = Object.keys(tokenMetadatas);
  for(let i = 0; i < symbols.length; ++i) {
    if(!await isDeployed(tokenMetadatas[symbols[i]].address)) nonDeploys.push(symbols[i])
  }
  if(nonDeploys.length > 0) throw new Error(`${nonDeploys.join(", ")} not deployed`);
}

async function fetchNucleusState() {
  let url = "https://stats.hydrogendefi.xyz/state/?chainID=8453"
  let res = await axios.get(url);
  nucleusState = res.data;
}

async function checkTokenBalancesAndAllowance(token:Contract, user:Wallet, amount:BN) {
  // check balance
  let balance = await token.balanceOf(user.address);
  if(balance.lt(amount)) {
    console.log("minting token");
    let tx = await token.connect(user).mint(user.address, amount, networkSettings.overrides);
    console.log("tx:", tx);
    await tx.wait(networkSettings.confirmations);
    console.log("minted token");
  }
  // check allowance
  let allowance = await token.allowance(user.address, nucleus.address);
  if(allowance.lt(amount)) {
    console.log("approving token");
    let tx = await token.connect(user).approve(nucleus.address, MaxUint256, networkSettings.overrides);
    console.log("tx:", tx);
    await tx.wait(networkSettings.confirmations);
    console.log("approved token");
  }
}

async function createGridOrder(params:any) {
  console.log("Creating grid order pool");
  let tx = await nucleus.connect(trader1).createGridOrderPool(params, networkSettings.overrides);
  console.log("tx:", tx);
  let receipt = await tx.wait(networkSettings.confirmations);
  if(!receipt || !receipt.events || receipt.events.length == 0) {
    console.log(receipt)
    throw new Error("events not found");
  }
  let poolID = (receipt.events as any)[0].args.poolID;
  console.log(`Created grid order pool ${poolID}`);
}

async function createGridOrder3002() {
  // stable pool 3002
  let symbols = ["DAI", "USDbC", "axlUSDC"]
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  for(const symbol of symbols) {
    if(!tokenMetadatas[symbol].contract) tokenMetadatas[symbol].contract = await ethers.getContractAt("MockERC20", tokenMetadatas[symbol].address, trader1) as MockERC20;
  }
  console.log(`Creating grid order pool with ${symbols.join(", ")}`)
  let tokenSources = symbols.map((symbol,tokenIndex) => {
    return {
      token: tokenMetadatas[symbol].address,
      amount: 0,//depositAmounts[tokenIndex],
      location: trader1ExternalLocation
    }
  })
  let tradeRequests = []
  for(const symbolA of symbols) {
    for(const symbolB of symbols) {
      if(symbolA == symbolB) continue;
      tradeRequests.push({
        tokenA: tokenMetadatas[symbolA].address,
        tokenB: tokenMetadatas[symbolB].address,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(decimalsToAmount(tokenMetadatas[symbolA].decimals), decimalsToAmount(tokenMetadatas[symbolB].decimals).mul(10006).div(10000)),
        locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
      })
    }
  }
  let params = {
    tokenSources,
    tradeRequests,
    hptReceiver: trader1.address
  };
  await createGridOrder(params);
}

async function updateGridOrder3002() {
  // stable pool 3002
  console.log(`Updating pool 3002`)
  let symbols = ["DAI", "USDbC", "axlUSDC", "USDC"]
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  for(const symbol of symbols) {
    if(!tokenMetadatas[symbol].contract) tokenMetadatas[symbol].contract = await ethers.getContractAt("MockERC20", tokenMetadatas[symbol].address, trader1) as MockERC20;
  }
  let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(3002)
  let tradeRequests = []
  for(const symbolA of symbols) {
    for(const symbolB of symbols) {
      if(symbolA == symbolB) continue;
      tradeRequests.push({
        tokenA: tokenMetadatas[symbolA].address,
        tokenB: tokenMetadatas[symbolB].address,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(decimalsToAmount(tokenMetadatas[symbolA].decimals), decimalsToAmount(tokenMetadatas[symbolB].decimals).mul(10006).div(10000)),
        locationB: poolLocation
      })
    }
  }
  await verifyTradeRequests(3002, tradeRequests)
}

async function verifyTradeRequests(poolID: number, tradeRequests: any[]) {
  let currentTradeRequests = nucleusState.pools[poolID].tradeRequests
  function getTokenSymbolOrAddress(token: string) {
    try {
      return leftPad(tokenMetadatas[token].symbol, 7) || token
    } catch(e) {
      return token
    }
  }
  function isSetCorrectly(tradeRequest: any) {
    try {
      if(!currentTradeRequests) return false
      if(!currentTradeRequests.hasOwnProperty(tradeRequest.tokenA)) return false
      if(!currentTradeRequests[tradeRequest.tokenA]) return false
      if(!currentTradeRequests[tradeRequest.tokenA].hasOwnProperty(tradeRequest.tokenB)) return false
      if(!currentTradeRequests[tradeRequest.tokenA][tradeRequest.tokenB]) return false
      if(currentTradeRequests[tradeRequest.tokenA][tradeRequest.tokenB].exchangeRate != tradeRequest.exchangeRate) return false
      if(currentTradeRequests[tradeRequest.tokenA][tradeRequest.tokenB].locationB != tradeRequest.locationB) return false
      return true
    } catch(e) {
      return false
    }
  }
  let tradeRequestsToSet = []
  function checkIsSet(tradeRequest: any) {
    let s = `Checking ${getTokenSymbolOrAddress(tradeRequest.tokenA)}-${getTokenSymbolOrAddress(tradeRequest.tokenB)}. `
    if(!isSetCorrectly(tradeRequest)) {
      tradeRequestsToSet.push(tradeRequest)
      s += 'Was NOT set correctly'
    } else {
      s += 'Was set correctly'
    }
    console.log(s)
  }
  for(const tradeRequest of tradeRequests) {
    checkIsSet(tradeRequest)
  }
  console.log("num trade requests to set:", tradeRequestsToSet.length)
  if(tradeRequestsToSet.length > 0) {
    console.log("Setting trade requests")
    let params = {
      poolID,
      tokenSources: [],
      tradeRequests: tradeRequestsToSet
    }
    let tx = await nucleus.connect(trader1).updateGridOrderPool(params, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations)
    console.log("Set trade requests")
  }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
