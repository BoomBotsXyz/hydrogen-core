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

let tokenMetadatas = getTokensBySymbol(8453);

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

  await createLimitOrder1();
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
  // sell eth for usdbc at 1 eth = 2000 usdbc
  // tokenA = weth
  // tokenB = usdbc
  // amountA = 0.1 weth
  // amountB = 200 usdc
  let amountA = WeiPerEther.div(10);
  let amountB = WeiPerUsdc.mul(200);
  let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(amountA, amountB);
  // create pool
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  let trader1InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(trader1.address);
  let params = {
    tokenA: tokenMetadatas["WETH"].address,
    tokenB: tokenMetadatas["USDbC"].address,
    exchangeRate: exchangeRate,
    amountA: amountA,
    gasValue: amountA
  }
  await createLimitOrderCompact(params);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
