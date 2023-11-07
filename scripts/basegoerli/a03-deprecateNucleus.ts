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
let NUCLEUS_ADDRESS = "0x49FD8f704a54FB6226e2F14B4761bf6Be84ADF15";
/*
const currentAddresses = {
  "80001": "0xd2174BfC96C96608C2EC7Bd8b5919f9e3603d37f",
  "84531": "0xfE4d3341B87e106fD718f71B71c5430082f01836",
}
const currentAddresses = {
  "8453":  "0x1Caba1EaA6F14b94EF732624Db1702eA41b718ff",
  "84531": "0x49FD8f704a54FB6226e2F14B4761bf6Be84ADF15",
  "80001": "0x1Caba1EaA6F14b94EF732624Db1702eA41b718ff",
}
https://stats.hydrogendefi.xyz/deprecation_notice/?chainID=80001
*/

async function main() {
  console.log(`Using ${hydrogendeployer.address} as deployer and owner`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(84531, "basegoerli")) throw("Only run this on Base Goerli or a local fork of Base Goerli");

  await expectDeployed(NUCLEUS_ADDRESS);
  nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS) as HydrogenNucleus;
  await configureNucleus();
  await logAddresses();
}

async function configureNucleus() {
  console.log("Configuring Nucleus");
  let txdata1 = nucleus.interface.encodeFunctionData("setContractURI", ["https://stats-cdn.hydrogendefi.xyz/contractURI.json"]);
  let txdata2 = nucleus.interface.encodeFunctionData("setBaseURI", ["https://stats.hydrogendefi.xyz/pools/metadata/?chainID=84531&v=1.0.1&poolID="]);
  //let tx = await nucleus.connect(hydrogendeployer).multicall([txdata0], {...networkSettings.overrides, gasLimit: 10000000});
  console.log("tx:", tx);
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
