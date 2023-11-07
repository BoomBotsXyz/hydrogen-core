import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { config as dotenv_config } from "dotenv";
dotenv_config();

const accounts = JSON.parse(process.env.ACCOUNTS || "{}");
const hydrogendeployer = new ethers.Wallet(accounts.hydrogendeployer.key, provider);

import { HydrogenNucleus } from "./../../typechain-types";
import { isDeployed } from "./../utilities/expectDeployed";
import { logContractAddress } from "./../utilities/logContractAddress";
import { getNetworkSettings } from "./../utils/getNetworkSettings";
import { deployContractUsingContractFactory, verifyContract } from "./../utils/deployContract";
import { toBytes32 } from "../utilities/setStorage";

let networkSettings: any;
let chainID: number;

let nucleus: HydrogenNucleus;
const NUCLEUS_ADDRESS = "0x49FD8f704a54FB6226e2F14B4761bf6Be84ADF15";

async function main() {
  console.log(`Using ${hydrogendeployer.address} as deployer and owner`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(80001, "mumbai")) throw("Only run this on Polygon Mumbai or a local fork of Mumbai");

  await deployNucleus();
  await logAddresses();
}

async function deployNucleus() {
  if(await isDeployed(NUCLEUS_ADDRESS)) {
    nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS) as HydrogenNucleus;
  } else {
    console.log("Deploying HydrogenNucleus");
    let args = [accounts.hydrogendeployer.address];
    nucleus = await deployContractUsingContractFactory(hydrogendeployer, "HydrogenNucleus", args, toBytes32(0), undefined, {...networkSettings.overrides, gasLimit: 10_000_000}, networkSettings.confirmations) as HydrogenNucleus;
    console.log(`Deployed HydrogenNucleus to ${nucleus.address}`);
    if(chainID != 31337) await verifyContract(nucleus.address, args);
    if(!!NUCLEUS_ADDRESS && nucleus.address != NUCLEUS_ADDRESS) throw new Error(`Deployed nucleus to ${nucleus.address}, expected ${NUCLEUS_ADDRESS}`)
  }
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
