import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();

const accounts = JSON.parse(process.env.ACCOUNTS || "{}");
const deployer = new ethers.Wallet(accounts.deployer.key, provider);

import { HydrogenNucleus } from "./../../typechain-types";
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
let NUCLEUS_ADDRESS = "0xe0A81641Db430a4D8E4c76bb8eB71755E24B6c9b";

async function main() {
  let deployerAddress = await deployer.getAddress();
  console.log(`Using ${deployerAddress} as deployer and owner`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(80001, "mumbai")) throw("Only run this on Polygon Mumbai or a local fork of Mumbai");

  await deployNucleus();
  //await configureNucleus();
  await logAddresses();
}

async function deployNucleus() {
  if(await isDeployed(NUCLEUS_ADDRESS)) {
    nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS) as HydrogenNucleus;
  } else {
    console.log("Deploying HydrogenNucleus");
    let args = [accounts.deployer.address];
    nucleus = await deployContract(deployer, "HydrogenNucleus", args, {...networkSettings.overrides, gasLimit: 10000000}, networkSettings.confirmations) as HydrogenNucleus;
    console.log(`Deployed HydrogenNucleus to ${nucleus.address}`);
    if(chainID != 31337) await verifyContract(nucleus.address, args);
  }
}

async function configureNucleus() {
  console.log("Configuring Nucleus");
  let txdata0 = nucleus.interface.encodeFunctionData("setBaseURI", ["https://hydrogenanalytics.hysland.finance/pools/?chainID=80001&poolID="]);
  let dai = "0xF59FD8840DC9bb2d00Fe5c0BE0EdF637ACeC77E1";
  let usdc = "0xA9DC572c76Ead4197154d36bA3f4D0839353abbb";
  let usdt = "0x7a49D1804434Ad537e4cC0061865727b87E71cd8";
  let stables = [dai, usdc, usdt];
  let treasuryLocation = HydrogenNucleusHelper.internalAddressToLocation(accounts.deployer.address);
  let swapFees = [{
    // default fee: 0.2%
    tokenA: AddressZero,
    tokenB: AddressZero,
    feePPM: 2000,
    receiverLocation: treasuryLocation
  }];
  for(let i = 0; i < stables.length; ++i) {
    for(let j = 0; j < stables.length; ++j) {
      if(i == j) continue;
      swapFees.push({
        // stable-stable fee: 0.01%
        tokenA: stables[i],
        tokenB: stables[j],
        feePPM: 100,
        receiverLocation: treasuryLocation
      });
    }
  }
  let txdata1 = nucleus.interface.encodeFunctionData("setSwapFeesForPairs", [swapFees]);
  let txdata2 = nucleus.interface.encodeFunctionData("setFlashLoanFeesForTokens", [[{
    // default fee: 0.09%
    token: AddressZero,
    feePPM: 900,
    receiverLocation: treasuryLocation
  }]]);
  let tx = await nucleus.connect(deployer).multicall([txdata0, txdata1, txdata2], {...networkSettings.overrides, gasLimit: 10000000});
  await tx.wait(networkSettings.confirmations);
  console.log("Configured Nucleus");
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("HydrogenNucleus", nucleus.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
