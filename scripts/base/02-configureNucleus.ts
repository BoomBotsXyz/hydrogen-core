import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();
import fs from "fs";

const accounts = JSON.parse(process.env.ACCOUNTS || "{}");
const hydrogendeployer = new ethers.Wallet(accounts.hydrogendeployer.key, provider);

import { HydrogenNucleus } from "./../../typechain-types";
import { expectDeployed, isDeployed } from "./../utilities/expectDeployed";
import { logContractAddress } from "./../utilities/logContractAddress";
import { getNetworkSettings } from "./../utils/getNetworkSettings";
import { deployContract, deployContractUsingContractFactory, verifyContract } from "./../utils/deployContract";
import HydrogenNucleusHelper from "../utils/HydrogenNucleusHelper";
import { toBytes32 } from "../utilities/setStorage";

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const WeiPerWbtc = BN.from(100_000_000); // 8 decimals

let networkSettings: any;
let chainID: number;

let nucleus: HydrogenNucleus;
let NUCLEUS_ADDRESS = "0x1Caba1EaA6F14b94EF732624Db1702eA41b718ff";

async function main() {
  console.log(`Using ${hydrogendeployer.address} as deployer and owner`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(8453, "base")) throw("Only run this on Base Mainnet or a local fork of Base");

  await expectDeployed(NUCLEUS_ADDRESS);
  nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS) as HydrogenNucleus;

  await configureNucleus();
  await setFees();
  await logAddresses();
}

async function configureNucleus() {
  console.log("Configuring Nucleus");
  let txdata0 = nucleus.interface.encodeFunctionData("setWrappedGasToken", ["0x4200000000000000000000000000000000000006"])
  let txdata1 = nucleus.interface.encodeFunctionData("setContractURI", ["https://stats-cdn.hydrogendefi.xyz/contractURI.json"]);
  let txdata2 = nucleus.interface.encodeFunctionData("setBaseURI", ["https://stats.hydrogendefi.xyz/pools/metadata/?chainID=8453&v=1.0.0&poolID="]);
  let tx = await nucleus.connect(hydrogendeployer).multicall([txdata0, txdata1, txdata2], {...networkSettings.overrides, gasLimit: 1_000_000});
  console.log("tx:", tx);
  await tx.wait(networkSettings.confirmations);
  console.log("Configured Nucleus");
}

async function setFees() {
  console.log("Setting fees")
  let treasuryLocation = HydrogenNucleusHelper.internalAddressToLocation(accounts.hydrogendeployer.address);
  let swapFees = [{
    // default fee: 0.2%
    tokenA: AddressZero,
    tokenB: AddressZero,
    feePPM: 2000,
    receiverLocation: treasuryLocation
  }];
  let txdata3 = nucleus.interface.encodeFunctionData("setSwapFeesForPairs", [swapFees]);
  let txdata4 = nucleus.interface.encodeFunctionData("setFlashLoanFeesForTokens", [[{
    // default fee: 0.09%
    token: AddressZero,
    feePPM: 900,
    receiverLocation: treasuryLocation
  }]]);
  let tx = await nucleus.connect(hydrogendeployer).multicall([txdata3, txdata4], {...networkSettings.overrides, gasLimit: 1_000_000});
  console.log("Set fees")
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
