import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract, Wallet } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();

const accounts = JSON.parse(process.env.ACCOUNTS || "{}");
const trader2 = new ethers.Wallet(accounts.trader2.key, provider);

import { HydrogenNucleus, MockERC20 } from "./../../typechain-types";
import { expectDeployed, isDeployed } from "./../utilities/expectDeployed";
import { logContractAddress } from "./../utilities/logContractAddress";
import { getNetworkSettings } from "./../utils/getNetworkSettings";
import { deployContract, verifyContract } from "./../utils/deployContract";
import HydrogenNucleusHelper from "../utils/HydrogenNucleusHelper";

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const WeiPerWbtc = BN.from(100_000_000); // 8 decimals
const MAX_PPM = BN.from(1_000_000); // parts per million

let networkSettings: any;
let chainID: number;

let nucleus: HydrogenNucleus;
let NUCLEUS_ADDRESS = "0xfE4d3341B87e106fD718f71B71c5430082f01836";

let tokenMetadatas:any = {
  "DAI": {"name":"Dai Stablecoin", "symbol":"DAI", "decimals":18, "artifact":"MockERC20PermitC", "address":"0x7D691e6b03b46B5A5769299fC9a32EaC690B7abc", "mintAmount":WeiPerEther.mul(1000)},
  "USDC": {"name":"USDCoin", "symbol":"USDC", "decimals":6, "artifact":"MockERC20PermitA", "address":"0x35CD54a3547190056A0F690357b1B2692B90Fb00", "mintAmount":WeiPerUsdc.mul(1000)},
  "USDT": {"name":"Tether USD", "symbol":"USDT", "decimals":6, "artifact":"MockERC20", "address":"0x70BF48BcfFcFcca6123fFeD4d4EC4Ec6eb31BA00", "mintAmount":WeiPerUsdc.mul(1000)},
  "DOGE": {"name":"Dogecoin", "symbol":"DOGE", "decimals":8, "artifact":"MockERC20", "address":"0xFF0f9D4956f5f7f1Ea076d015f0a3c7185c5fc4f", "mintAmount":WeiPerWbtc.mul(10000)},
  "WBTC": {"name":"Wrapped Bitcoin", "symbol":"WBTC", "decimals":8, "artifact":"MockERC20", "address":"0x2E6365CfB7de7F00478C02485Ca56a975369d2B8", "mintAmount":WeiPerWbtc.mul(1).div(10)},
  "WETH": {"name":"Wrapped Ether", "symbol":"WETH", "decimals":18, "artifact":"MockERC20", "address":"0xEa0B5E9AFa37C1cA61779deAB8527eAE62b30367", "mintAmount":WeiPerEther.mul(1)},
};

async function main() {
  console.log(`Using ${trader2.address} as trader2`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(84531, "basegoerli")) throw("Only run this on Base Goerli or a local fork of Base Goerli");

  await verifyDeployments()
  nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS, trader2) as HydrogenNucleus;

  await executeMarketOrder1();
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
  let tx = await nucleus.connect(trader2).executeMarketOrder(params);
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
  if(poolBalance.lt(amountAMT)) throw new Error("insufficient capacity for trade");
  await checkTokenBalancesAndAllowance(wbtc, trader2, amountBMT);
  let trader2ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader2.address);
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
  await executeMarketOrder(params);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
