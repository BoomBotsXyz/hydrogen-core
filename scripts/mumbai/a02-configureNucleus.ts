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

async function main() {
  console.log(`Using ${hydrogendeployer.address} as deployer and owner`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(80001, "mumbai")) throw("Only run this on Polygon Mumbai or a local fork of Mumbai");

  await expectDeployed(NUCLEUS_ADDRESS);
  nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS) as HydrogenNucleus;
  await configureNucleus();
  await logAddresses();
}

async function configureNucleus() {
  console.log("Configuring Nucleus");
  let txdata0 = nucleus.interface.encodeFunctionData("setWrappedGasToken", ["0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889"])
  let txdata1 = nucleus.interface.encodeFunctionData("setContractURI", ["https://stats-cdn.hydrogendefi.xyz/contractURI.json"]);
  let txdata2 = nucleus.interface.encodeFunctionData("setBaseURI", ["https://stats.hydrogendefi.xyz/pools/metadata/?chainID=80001&v=1.0.1&poolID="]);

  let treasuryLocation = HydrogenNucleusHelper.internalAddressToLocation(accounts.hydrogendeployer.address);
  let swapFees = [{
    // default fee: 20 BPS
    tokenA: AddressZero,
    tokenB: AddressZero,
    feePPM: 2000,
    receiverLocation: treasuryLocation
  }];
  let dai  = "0xF59FD8840DC9bb2d00Fe5c0BE0EdF637ACeC77E1";
  let usdc = "0xA9DC572c76Ead4197154d36bA3f4D0839353abbb";
  let usdt = "0x7a49D1804434Ad537e4cC0061865727b87E71cd8";
  let frax = "0x39FbfBa00de6f464e26f9983cB9C79A82442FaCc";
  let usdpegs = [dai, usdc, usdt, frax];
  for(let i = 0; i < usdpegs.length; ++i) {
    for(let j = 0; j < usdpegs.length; ++j) {
      if(i == j) continue;
      swapFees.push({
        // stable-stable fee: 0.1 BPS
        tokenA: usdpegs[i],
        tokenB: usdpegs[j],
        feePPM: 100,
        receiverLocation: treasuryLocation
      });
    }
  }
  let txdata3 = nucleus.interface.encodeFunctionData("setSwapFeesForPairs", [swapFees]);
  let txdata4 = nucleus.interface.encodeFunctionData("setFlashLoanFeesForTokens", [[{
    // default fee: 0.09%
    token: AddressZero,
    feePPM: 900,
    receiverLocation: treasuryLocation
  }]]);
  let tx = await nucleus.connect(hydrogendeployer).multicall([txdata0, txdata1, txdata2, txdata3, txdata4], {...networkSettings.overrides, gasLimit: 10000000});
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
