import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract, Wallet } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();

const accounts = JSON.parse(process.env.ACCOUNTS || "{}");
const trader2 = new ethers.Wallet(accounts.trader2.key, provider);
let trader2Address: string;

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
let NUCLEUS_ADDRESS = "0xe0A81641Db430a4D8E4c76bb8eB71755E24B6c9b";

let tokenMetadatas = {
  "DAI": {"name":"Dai Stablecoin", "symbol":"DAI", "decimals":18, "artifact":"MockERC20PermitC", "address":"0xF59FD8840DC9bb2d00Fe5c0BE0EdF637ACeC77E1", "mintAmount":WeiPerEther.mul(1000)},
  "USDC": {"name":"USDCoin", "symbol":"USDC", "decimals":6, "artifact":"MockERC20PermitA", "address":"0xA9DC572c76Ead4197154d36bA3f4D0839353abbb", "mintAmount":WeiPerUsdc.mul(1000)},
  "USDT": {"name":"Tether USD", "symbol":"USDT", "decimals":6, "artifact":"MockERC20", "address":"0x7a49D1804434Ad537e4cC0061865727b87E71cd8", "mintAmount":WeiPerUsdc.mul(1000)},
  "DOGE": {"name":"Dogecoin", "symbol":"DOGE", "decimals":8, "artifact":"MockERC20", "address":"0xbb8fD2d558206E3CB68038A338718359a96e0C44", "mintAmount":WeiPerWbtc.mul(10000)},
  "WBTC": {"name":"Wrapped Bitcoin", "symbol":"WBTC", "decimals":8, "artifact":"MockERC20", "address":"0x1C9b3500bF4B13BB338DC4F4d4dB1dEAF0638a1c", "mintAmount":WeiPerWbtc.mul(1).div(10)},
  "WETH": {"name":"Wrapped Ether", "symbol":"WETH", "decimals":18, "artifact":"MockERC20", "address":"0x09db75630A9b2e66F220531B77080282371156FE", "mintAmount":WeiPerEther.mul(1)},
};

async function main() {
  trader2Address = await trader2.getAddress();
  console.log(`Using ${trader2Address} as trader2`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(80001, "mumbai")) throw("Only run this on Polygon Mumbai or a local fork of Mumbai");

  if(!await isDeployed(NUCLEUS_ADDRESS)) throw new Error("HydrogenNucleus not deployed");
  if(!await isDeployed(tokenMetadatas["USDC"].address)) throw new Error("USDC not deployed");
  if(!await isDeployed(tokenMetadatas["WBTC"].address)) throw new Error("WBTC not deployed");
  nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS, trader2) as HydrogenNucleus;

  await executeMarketOrder1();
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

async function executeMarketOrder1() {
  // Bob wants to sell his WBTC for USDC at the best available price. He has 0.1 WBTC in his wallet that he wants to sell. He sees Alice's limit order (10,000 USDC to WBTC @ 25,000 USDC/WBTC). He is willing to partially fill that order and after a 0.2% swap fee expects to receive 2,495 USDC.
  let poolID = 1001;
  let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
  let pool = await nucleus.getLimitOrderPool(poolID);
  let amountB = WeiPerWbtc.mul(1).div(10);
  let amountAFromPool = HydrogenNucleusHelper.calculateAmountA(amountB, pool.exchangeRate);
  let amountAToFeeReceiver = amountAFromPool.mul(2000).div(MAX_PPM);
  let amountAToMarketTaker = amountAFromPool.sub(amountAToFeeReceiver);
  let usdc = await ethers.getContractAt("MockERC20", tokenMetadatas["USDC"].address, trader2) as MockERC20;
  let wbtc = await ethers.getContractAt("MockERC20", tokenMetadatas["WBTC"].address, trader2) as MockERC20;
  await checkTokenBalancesAndAllowance(wbtc, trader2, amountB);
  let trader2ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader2Address);
  // execute market order
  console.log("Executing market order");
  let params = {
    poolID: poolID,
    tokenA: usdc.address,
    tokenB: wbtc.address,
    amountA: amountAToMarketTaker,
    amountB: amountB,
    locationA: trader2ExternalLocation,
    locationB: trader2ExternalLocation,
    flashSwapCallee: AddressZero,
    callbackData: "0x"
  };
  let tx = await nucleus.connect(trader2).executeMarketOrder(params);
  console.log("tx:", tx);
  let receipt = await tx.wait(networkSettings.confirmations);
  console.log("Executed market order");
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
