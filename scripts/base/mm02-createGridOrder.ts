import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract, Wallet } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();

const accounts = JSON.parse(process.env.ACCOUNTS || "{}");
const trader1 = new ethers.Wallet(accounts.trader1.key, provider);
const bill = new ethers.Wallet(accounts.bill.key, provider);

import { HydrogenNucleus, MockERC20 } from "./../../typechain-types";
import { expectDeployed, isDeployed } from "./../utilities/expectDeployed";
import { logContractAddress } from "./../utilities/logContractAddress";
import { getNetworkSettings } from "./../utils/getNetworkSettings";
import { deployContract, verifyContract } from "./../utils/deployContract";
import HydrogenNucleusHelper from "../utils/HydrogenNucleusHelper";
import { getTokensBySymbol } from "../utils/getTokens";
import { decimalsToAmount } from "../utils/price";
import { leftPad } from "../utils/strings";

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const WeiPerWbtc = BN.from(100_000_000); // 8 decimals

let networkSettings: any;
let chainID: number;

let nucleus: HydrogenNucleus;
let NUCLEUS_ADDRESS = "0x49FD8f704a54FB6226e2F14B4761bf6Be84ADF15";

let tokenMetadatas = getTokensBySymbol(8453);

async function main() {
  console.log(`Using ${trader1.address} as trader1`);
  console.log(`Bill's wallet: ${bill.address}`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(8453, "base")) throw("Only run this on Base Mainnet or a local fork of Base");

  await verifyDeployments()
  nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS, trader1) as HydrogenNucleus;

  //await createGridOrder3002();
  //await updateGridOrder3002()
  await createGridOrder16002();
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

async function checkTokenBalancesAndAllowance(token:Contract, user:Wallet, amount:BN) {
  // check balance
  let balance = await token.balanceOf(user.address);
  if(balance.lt(amount)) {
    throw new Error(`insufficient balance. requested ${amount.toString()} have ${balance.toString()}`)
  }
  // check allowance
  let allowance = await token.allowance(user.address, nucleus.address);
  if(allowance.lt(amount)) {
    console.log("approving token");
    let tx = await token.connect(user).approve(nucleus.address, MaxUint256, {...networkSettings.overrides, gasLimit: 80_000});
    console.log("tx:", tx);
    await tx.wait(networkSettings.confirmations);
    console.log("approved token");
  }
}

async function createGridOrder(params:any) {
  console.log("Creating grid order pool");
  let tx = await nucleus.connect(trader1).createGridOrderPool(params, networkSettings.overrides);
  await watchTxForCreatedPoolID(tx);
}

async function createGridOrderCompact(params:any) {
  console.log("Creating grid order pool");
  let tx = await nucleus.connect(trader1).createGridOrderPoolCompact(params, {...networkSettings.overrides, value: params.gasValue||0, gasLimit: 1_000_000});
  await watchTxForCreatedPoolID(tx);
}

async function watchTxForCreatedPoolID(tx:any) {
  console.log("tx:", tx);
  let receipt = await tx.wait(networkSettings.confirmations);
  if(!receipt || !receipt.events || receipt.events.length == 0) {
    console.log(receipt)
    throw new Error("events not found");
  }
  let createEvent = (receipt.events as any).filter((event:any) => event.event == 'PoolCreated')[0];
  let poolID = createEvent.args.poolID;
  console.log(`Created grid order pool ${poolID}`);
}

async function createGridOrder3002() {
  // stable pool 3002
  const symbols = ["USDC", "USDbC", "axlUSDC", "DAI"]
  const depositAmounts = [0, WeiPerUsdc.mul(50), 0, WeiPerEther.mul(50)]
  // token sources
  const tokenSources = []
  for(let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i]
    const depositAmount = depositAmounts[i]
    if(!tokenMetadatas[symbol].contract) tokenMetadatas[symbol].contract = await ethers.getContractAt("MockERC20", tokenMetadatas[symbol].address, trader1) as MockERC20;
    tokenSources.push({
      token: tokenMetadatas[symbol].address,
      amount: depositAmount,
    })
    await checkTokenBalancesAndAllowance(tokenMetadatas[symbol].contract, trader1, depositAmount);
  }
  // exchange rates
  const exchangeRates = []
  for(const symbolA of symbols) {
    for(const symbolB of symbols) {
      if(symbolA == symbolB) continue;
      const exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(decimalsToAmount(tokenMetadatas[symbolA].decimals), decimalsToAmount(tokenMetadatas[symbolB].decimals).mul(100005).div(100000))
      exchangeRates.push(exchangeRate);
    }
  }
  // assemble
  let params = {
    tokenSources,
    exchangeRates,
  };
  await createGridOrderCompact(params);
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
  let poolInfo = await nucleus.getGridOrderPool(poolID)
  let currentTradeRequests = poolInfo.tradeRequests
  //console.log(poolInfo)
  //console.log(currentTradeRequests)
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
      let trs = currentTradeRequests.filter(tr => tr.tokenA == tradeRequest.tokenA && tr.tokenB == tradeRequest.tokenB)
      if(trs.length == 0) return false
      let currentTradeRequest = trs[0]
      if(currentTradeRequest.exchangeRate != tradeRequest.exchangeRate) return false
      if(currentTradeRequest.locationB != tradeRequest.locationB) return false
      return true
    } catch(e) {
      return false
    }
  }
  let tradeRequestsToSet:any[] = []
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

async function createGridOrder16002() {
  let amountETH = WeiPerEther.mul(5).div(100); // 0.05 ETH
  let exchangeRate6 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerUsdc.mul(2100)); // 1 WETH -> 2100 USDC
  let exchangeRate18 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerEther.mul(2100)); // 1 WETH -> 2100 DAI
  let externalLocation = HydrogenNucleusHelper.externalAddressToLocation(bill.address);
  let internalLocation = HydrogenNucleusHelper.internalAddressToLocation(bill.address);
  let createParams = {
    tokenSources: [{
      token: tokenMetadatas["WETH"].address,
      amount: amountETH,
      location: internalLocation
    }],
    tradeRequests: [{
      tokenA: tokenMetadatas["WETH"].address,
      tokenB: tokenMetadatas["USDC"].address,
      exchangeRate: exchangeRate6,
      locationB: externalLocation,
    },{
      tokenA: tokenMetadatas["WETH"].address,
      tokenB: tokenMetadatas["USDbC"].address,
      exchangeRate: exchangeRate6,
      locationB: externalLocation,
    },{
      tokenA: tokenMetadatas["WETH"].address,
      tokenB: tokenMetadatas["axlUSDC"].address,
      exchangeRate: exchangeRate6,
      locationB: externalLocation,
    },{
      tokenA: tokenMetadatas["WETH"].address,
      tokenB: tokenMetadatas["DAI"].address,
      exchangeRate: exchangeRate18,
      locationB: externalLocation,
    },{
      tokenA: tokenMetadatas["WETH"].address,
      tokenB: tokenMetadatas["crvUSD"].address,
      exchangeRate: exchangeRate18,
      locationB: externalLocation,
    },{
      tokenA: tokenMetadatas["WETH"].address,
      tokenB: tokenMetadatas["MIM"].address,
      exchangeRate: exchangeRate18,
      locationB: externalLocation,
    },{
      tokenA: tokenMetadatas["WETH"].address,
      tokenB: tokenMetadatas["DOLA"].address,
      exchangeRate: exchangeRate18,
      locationB: externalLocation,
    }],
    hptReceiver: bill.address
  }
  console.log("createParams")
  console.log(createParams)
  let txdata0 = nucleus.interface.encodeFunctionData("wrapGasToken", [internalLocation]);
  let txdata1 = nucleus.interface.encodeFunctionData("createGridOrderPool", [createParams]);
  let txdatas = [txdata0, txdata1];
  let tx = await nucleus.connect(bill).multicall(txdatas, {...networkSettings.overrides, gasLimit: 1_000_000, value: amountETH});
  await watchTxForCreatedPoolID(tx);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
