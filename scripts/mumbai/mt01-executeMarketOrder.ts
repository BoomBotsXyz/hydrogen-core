import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract, Wallet } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();

const accounts = JSON.parse(process.env.ACCOUNTS || "{}");
const trader1 = new ethers.Wallet(accounts.trader1.key, provider);
const trader2 = new ethers.Wallet(accounts.trader2.key, provider);

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
const MAX_PPM = BN.from(1_000_000); // parts per million

let trader2ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader2.address);
let trader2InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(trader2.address);

let networkSettings: any;
let chainID: number;

let nucleus: HydrogenNucleus;
let NUCLEUS_ADDRESS = "0x49FD8f704a54FB6226e2F14B4761bf6Be84ADF15";

let tokenMetadatas = getTokensBySymbol(80001);

async function main() {
  console.log(`Using ${trader2.address} as trader2`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(80001, "mumbai")) throw("Only run this on Polygon Mumbai or a local fork of Mumbai");

  await verifyDeployments()
  nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS, trader2) as HydrogenNucleus;

  await executeMarketOrder1();
  //await executeMarketOrder2();
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
    let tx = await token.connect(user).approve(nucleus.address, MaxUint256, networkSettings.overrides);
    console.log("tx:", tx);
    await tx.wait(networkSettings.confirmations);
    console.log("approved token");
  }
}

async function executeMarketOrder(params:any) {
  console.log("Executing market order");
  let gasValue = params.gasValue || 0
  let tx: any
  if(gasValue > 0) {
    let txdata0 = nucleus.interface.encodeFunctionData("wrapGasToken", [trader2InternalLocation])
    let params2 = {...params, locationB: trader2InternalLocation}
    let txdata1 = nucleus.interface.encodeFunctionData("executeMarketOrder", [params2])
    let txdatas = [txdata0, txdata1]
    tx = await nucleus.connect(trader2).multicall(txdatas, {...networkSettings.overrides, gasLimit:1000000, value: gasValue});
  } else {
    tx = await nucleus.connect(trader2).executeMarketOrder(params, {...networkSettings.overrides, gasLimit:1000000});
  }
  console.log("tx:", tx);
  await tx.wait(networkSettings.confirmations);
  console.log("Executed market order");
}

async function executeMarketOrderDstExt(params:any) {
  console.log("Executing market order");
  let tx = await nucleus.connect(trader2).executeMarketOrderDstExt(params, {...networkSettings.overrides, gasLimit:1000000, value: params.gasValue || 0});
  console.log("tx:", tx);
  await tx.wait(networkSettings.confirmations);
  console.log("Executed market order");
}

async function executeMarketOrderDstInt(params:any) {
  console.log("Executing market order");
  let tx = await nucleus.connect(trader2).executeMarketOrderDstInt(params, {...networkSettings.overrides, gasLimit:1000000, value: params.gasValue || 0});
  console.log("tx:", tx);
  await tx.wait(networkSettings.confirmations);
  console.log("Executed market order");
}

async function executeFlashSwap(params:any) {
  console.log("Executing market order");
  let gasValue = params.gasValue || 0
  let tx: any
  if(gasValue > 0) {
    let txdata0 = nucleus.interface.encodeFunctionData("wrapGasToken", [trader2InternalLocation])
    let params2 = {...params, locationB: trader2InternalLocation}
    let txdata1 = nucleus.interface.encodeFunctionData("executeFlashSwap", [params2])
    let txdatas = [txdata0, txdata1]
    tx = await nucleus.connect(trader2).multicall(txdatas, {...networkSettings.overrides, gasLimit:1000000, value: gasValue});
  } else {
    tx = await nucleus.connect(trader2).executeFlashSwap(params, {...networkSettings.overrides, gasLimit:1000000});
  }
  console.log("tx:", tx);
  await tx.wait(networkSettings.confirmations);
  console.log("Executed market order");
}

async function executeMarketOrder1() {
  // Bob wants to sell his WBTC for USDC at the best available price. He has 0.1 WBTC in his wallet that he wants to sell. He sees Alice's limit order (10,000 USDC to WBTC @ 25,000 USDC/WBTC). He is willing to partially fill that order and after a 0.2% swap fee expects to receive 2,495 USDC.
  let usdc = await ethers.getContractAt("MockERC20", tokenMetadatas["USDC"].address, trader2) as MockERC20;
  let wbtc = await ethers.getContractAt("MockERC20", tokenMetadatas["WBTC"].address, trader2) as MockERC20;
  let poolID = 1001;
  let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
  let pool = await nucleus.getLimitOrderPool(poolID);
  let fees = await nucleus.getSwapFeeForPair(usdc.address, wbtc.address);
  let amountBMT = WeiPerWbtc.mul(1).div(10);
  let { amountAMT } = HydrogenNucleusHelper.calculateMarketOrderExactBMT(amountBMT, pool.exchangeRate, fees.feePPM);
  let poolBalance = await nucleus.getTokenBalance(usdc.address, poolLocation);
  if(poolBalance.lt(amountAMT.mul(4))) throw new Error("insufficient capacity for trade");
  await checkTokenBalancesAndAllowance(wbtc, trader2, amountBMT.mul(4));
  // execute market order
  let params = {
    poolID: poolID,
    tokenA: usdc.address,
    tokenB: wbtc.address,
    amountA: amountAMT,
    amountB: amountBMT,
    locationA: trader2ExternalLocation,
    locationB: trader2ExternalLocation,
    flashSwapCallee: AddressZero,
    callbackData: "0x"
  };
  // test all variations
  await executeMarketOrder(params);
  await executeMarketOrderDstExt(params);
  await executeMarketOrderDstInt(params);
  await executeFlashSwap(params);
}

async function executeMarketOrder2() {
  // sell eth to buy dai
  let dai = await ethers.getContractAt("MockERC20", tokenMetadatas["DAI"].address, trader2) as MockERC20;
  let weth = await ethers.getContractAt("MockERC20", tokenMetadatas["WETH"].address, trader2) as MockERC20;
  let poolID = 10001;
  let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
  let pool = await nucleus.getLimitOrderPool(poolID);
  let fees = await nucleus.getSwapFeeForPair(dai.address, weth.address);
  let amountBMT = WeiPerEther.div(1000);
  let { amountAMT } = HydrogenNucleusHelper.calculateMarketOrderExactBMT(amountBMT, pool.exchangeRate, fees.feePPM);
  let poolBalance = await nucleus.getTokenBalance(dai.address, poolLocation);
  if(poolBalance.lt(amountAMT)) throw new Error("insufficient capacity for trade");
  // execute market order
  let params = {
    poolID: poolID,
    tokenA: dai.address,
    tokenB: weth.address,
    amountA: amountAMT,
    amountB: amountBMT,
    locationA: trader2ExternalLocation,
    locationB: trader2ExternalLocation,
    flashSwapCallee: AddressZero,
    callbackData: "0x",
    gasValue: amountBMT,
  };
  // test all variations
  await executeMarketOrder(params);
  await executeMarketOrderDstExt(params);
  await executeMarketOrderDstInt(params);
  await executeFlashSwap(params);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
