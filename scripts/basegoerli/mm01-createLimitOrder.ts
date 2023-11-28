import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract, Wallet } from "ethers";
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

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const WeiPerWbtc = BN.from(100_000_000); // 8 decimals

let networkSettings: any;
let chainID: number;

let nucleus: HydrogenNucleus;
let NUCLEUS_ADDRESS = "0x49FD8f704a54FB6226e2F14B4761bf6Be84ADF15";

let tokenMetadatas = getTokensBySymbol(84531);

async function main() {
  console.log(`Using ${trader1.address} as trader1`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(84531, "basegoerli")) throw("Only run this on Base Goerli or a local fork of Base Goerli");

  await verifyDeployments()
  nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS, trader1) as HydrogenNucleus;

  await createLimitOrder1();
  await createLimitOrder2();
  await createLimitOrder3();
  await createLimitOrder4();
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
    let tx = await token.connect(user).approve(nucleus.address, MaxUint256, {...networkSettings.overrides, gasLimit: 80_000});
    console.log("tx:", tx);
    await tx.wait(networkSettings.confirmations);
    console.log("approved token");
  }
}

async function createLimitOrder(params:any) {
  console.log("Creating limit order pool");
  let tx = await nucleus.connect(trader1).createLimitOrderPool(params, {...networkSettings.overrides, gasLimit: 300_000});
  await watchTxForCreatedPoolID(tx);
}

async function createLimitOrderCompact(params:any) {
  console.log("Creating limit order pool");
  let tx = await nucleus.connect(trader1).createLimitOrderPoolCompact(params, {...networkSettings.overrides, gasLimit: 300_000, value: params.gasValue||0});
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
  console.log(`Created limit order pool ${poolID}`);
}

async function createLimitOrder1() {
  // Alice is a first time Hydrogen user and wants to place a limit order to buy WBTC using USDC. She has 10,000 USDC in her wallet and is willing to pay 25,000 USDC/WBTC, expecting to receive 0.4 WBTC.
  // tokenA = USDC, tokenB = WBTC
  let usdc = await ethers.getContractAt("MockERC20", tokenMetadatas["USDC"].address, trader1) as MockERC20;
  let amountA = WeiPerUsdc.mul(10_000);
  let amountB = WeiPerWbtc.mul(4).div(10);
  let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(amountA, amountB);
  await checkTokenBalancesAndAllowance(usdc, trader1, amountA);
  // create pool
  let params = {
    tokenA: tokenMetadatas["USDC"].address,
    tokenB: tokenMetadatas["WBTC"].address,
    exchangeRate: exchangeRate,
    amountA: amountA,
  }
  await createLimitOrderCompact(params);
}

async function createLimitOrder2() {
  // sell doge for usdt at $0.10
  let doge = await ethers.getContractAt("MockERC20", tokenMetadatas["DOGE"].address, trader1) as MockERC20;
  let amountA = WeiPerWbtc.mul(10_000);
  let amountB = WeiPerUsdc.mul(1_000);
  let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(amountA, amountB);
  await checkTokenBalancesAndAllowance(doge, trader1, amountA);
  // create pool
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  let trader1InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(trader1.address);
  let params = {
    tokenA: tokenMetadatas["DOGE"].address,
    tokenB: tokenMetadatas["USDT"].address,
    exchangeRate: exchangeRate,
    locationA: trader1ExternalLocation,
    locationB: trader1InternalLocation,
    amountA: amountA,
    hptReceiver: trader1.address
  }
  await createLimitOrder(params);
}

async function createLimitOrder3() {
  // use eth to create a limit order for dai
  let amountA = WeiPerEther.div(1000);
  let amountB = WeiPerEther.mul(1800).div(1000);
  let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(amountA, amountB);
  // create pool
  let params = {
    tokenA: tokenMetadatas["WETH"].address,
    tokenB: tokenMetadatas["DAI"].address,
    exchangeRate: exchangeRate,
    amountA: amountA,
    gasValue: amountA,
  }
  await createLimitOrderCompact(params);
}

async function createLimitOrder4() {
  // buy weth using dai
  let amountA = WeiPerEther.mul(1600);
  let amountB = WeiPerEther;
  let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(amountA, amountB);
  let dai = await ethers.getContractAt("MockERC20", tokenMetadatas["DAI"].address, trader1) as MockERC20;
  await checkTokenBalancesAndAllowance(dai, trader1, amountA);
  // create pool
  let params = {
    tokenA: tokenMetadatas["DAI"].address,
    tokenB: tokenMetadatas["WETH"].address,
    exchangeRate: exchangeRate,
    amountA: amountA,
  }
  await createLimitOrderCompact(params);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
