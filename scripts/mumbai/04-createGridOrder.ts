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

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const WeiPerWbtc = BN.from(100_000_000); // 8 decimals

let networkSettings: any;
let chainID: number;

let nucleus: HydrogenNucleus;
let NUCLEUS_ADDRESS = "0xd2174BfC96C96608C2EC7Bd8b5919f9e3603d37f";

const LOCATION_THIS_POOL = "0x0000000000000000000000000000000000000000000000000000000000000001";

let tokenMetadatas:any = {
  "DAI": {"name":"Dai Stablecoin", "symbol":"DAI", "decimals":18, "artifact":"MockERC20PermitC", "address":"0xF59FD8840DC9bb2d00Fe5c0BE0EdF637ACeC77E1", "mintAmount":WeiPerEther.mul(1000)},
  "USDC": {"name":"USDCoin", "symbol":"USDC", "decimals":6, "artifact":"MockERC20PermitA", "address":"0xA9DC572c76Ead4197154d36bA3f4D0839353abbb", "mintAmount":WeiPerUsdc.mul(1000)},
  "USDT": {"name":"Tether USD", "symbol":"USDT", "decimals":6, "artifact":"MockERC20", "address":"0x7a49D1804434Ad537e4cC0061865727b87E71cd8", "mintAmount":WeiPerUsdc.mul(1000)},
  "DOGE": {"name":"Dogecoin", "symbol":"DOGE", "decimals":8, "artifact":"MockERC20", "address":"0xbb8fD2d558206E3CB68038A338718359a96e0C44", "mintAmount":WeiPerWbtc.mul(10000)},
  "WBTC": {"name":"Wrapped Bitcoin", "symbol":"WBTC", "decimals":8, "artifact":"MockERC20", "address":"0x1C9b3500bF4B13BB338DC4F4d4dB1dEAF0638a1c", "mintAmount":WeiPerWbtc.mul(1).div(10)},
  "WETH": {"name":"Wrapped Ether", "symbol":"WETH", "decimals":18, "artifact":"MockERC20", "address":"0x09db75630A9b2e66F220531B77080282371156FE", "mintAmount":WeiPerEther.mul(1)},
};

async function main() {
  console.log(`Using ${trader1.address} as trader1`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(80001, "mumbai")) throw("Only run this on Polygon Mumbai or a local fork of Mumbai");

  await verifyDeployments()
  nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS, trader1) as HydrogenNucleus;

  await createGridOrder1();
  await createGridOrder2();
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
    //let tx = await token.connect(user).mint(user.address, amount, {...networkSettings.overrides, nonce:7, maxFeePerGas:3000000001, maxPriorityFeePerGas:3000000000});
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

async function createGridOrder1() {
  // wbtc-usdc
  let usdc = await ethers.getContractAt("MockERC20", tokenMetadatas["USDC"].address, trader1) as MockERC20;
  let wbtc = await ethers.getContractAt("MockERC20", tokenMetadatas["WBTC"].address, trader1) as MockERC20;
  let exchangeRateSellUsdcBuyWbtc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(25_000), WeiPerWbtc);
  let exchangeRateSellWbtcBuyUsdc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerWbtc, WeiPerUsdc.mul(26_000));
  let amountUsdcDeposit = WeiPerUsdc.mul(10_000);
  let amountWbtcDeposit = WeiPerWbtc;
  await checkTokenBalancesAndAllowance(usdc, trader1, amountUsdcDeposit);
  await checkTokenBalancesAndAllowance(wbtc, trader1, amountWbtcDeposit);
  // create pool
  console.log("Creating grid order pool");
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  let params = {
    tokenSources: [{
      token: usdc.address,
      amount: amountUsdcDeposit,
      location: trader1ExternalLocation
    },{
      token: wbtc.address,
      amount: amountWbtcDeposit,
      location: trader1ExternalLocation
    }],
    tradeRequests: [{
      tokenA: usdc.address,
      tokenB: wbtc.address,
      exchangeRate: exchangeRateSellUsdcBuyWbtc,
      locationB: LOCATION_THIS_POOL
    },{
      tokenA: wbtc.address,
      tokenB: usdc.address,
      exchangeRate: exchangeRateSellWbtcBuyUsdc,
      locationB: LOCATION_THIS_POOL
    }],
    hptReceiver: trader1.address
  };
  await createGridOrder(params);
}

async function createGridOrder2() {
  // dai-usdc-usdt
  let dai = await ethers.getContractAt("MockERC20", tokenMetadatas["DAI"].address, trader1) as MockERC20;
  let usdc = await ethers.getContractAt("MockERC20", tokenMetadatas["USDC"].address, trader1) as MockERC20;
  let usdt = await ethers.getContractAt("MockERC20", tokenMetadatas["USDT"].address, trader1) as MockERC20;
  let exchangeRateSellDaiBuyUsdc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(99), WeiPerUsdc.mul(100));
  let exchangeRateSellUsdcBuyDai = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerEther.mul(100));
  let exchangeRateSellDaiBuyUsdt = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(99), WeiPerUsdc.mul(100));
  let exchangeRateSellUsdtBuyDai = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerEther.mul(100));
  let exchangeRateSellUsdcBuyUsdt = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerUsdc.mul(100));
  let exchangeRateSellUsdtBuyUsdc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerUsdc.mul(100));
  let amountDaiDeposit = WeiPerEther.mul(10_000);
  let amountUsdcDeposit = WeiPerUsdc.mul(10_000);
  let amountUsdtDeposit = WeiPerUsdc.mul(10_000);
  await checkTokenBalancesAndAllowance(dai, trader1, amountDaiDeposit);
  await checkTokenBalancesAndAllowance(usdc, trader1, amountUsdcDeposit);
  await checkTokenBalancesAndAllowance(usdt, trader1, amountUsdtDeposit);
  // create pool
  console.log("Creating grid order pool");
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  let params = {
    tokenSources: [{
      token: dai.address,
      amount: amountDaiDeposit,
      location: trader1ExternalLocation
    },{
      token: usdc.address,
      amount: amountUsdcDeposit,
      location: trader1ExternalLocation
    },{
      token: usdt.address,
      amount: amountUsdtDeposit,
      location: trader1ExternalLocation
    }],
    tradeRequests: [{
      tokenA: dai.address,
      tokenB: usdc.address,
      exchangeRate: exchangeRateSellDaiBuyUsdc,
      locationB: LOCATION_THIS_POOL
    },{
      tokenA: usdc.address,
      tokenB: dai.address,
      exchangeRate: exchangeRateSellUsdcBuyDai,
      locationB: LOCATION_THIS_POOL
    },{
      tokenA: dai.address,
      tokenB: usdt.address,
      exchangeRate: exchangeRateSellDaiBuyUsdt,
      locationB: LOCATION_THIS_POOL
    },{
      tokenA: usdt.address,
      tokenB: dai.address,
      exchangeRate: exchangeRateSellUsdtBuyDai,
      locationB: LOCATION_THIS_POOL
    },{
      tokenA: usdc.address,
      tokenB: usdt.address,
      exchangeRate: exchangeRateSellUsdcBuyUsdt,
      locationB: LOCATION_THIS_POOL
    },{
      tokenA: usdt.address,
      tokenB: usdc.address,
      exchangeRate: exchangeRateSellUsdtBuyUsdc,
      locationB: LOCATION_THIS_POOL
    }],
    hptReceiver: trader1.address
  };
  await createGridOrder(params);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
