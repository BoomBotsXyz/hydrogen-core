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
  if(!isChain(84531, "basegoerli")) throw("Only run this on Base Goerli or a local fork of Base Goerli");

  await expectDeployed(NUCLEUS_ADDRESS);
  nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS) as HydrogenNucleus;
  await configureNucleus();
  await logAddresses();
}

async function configureNucleus() {
  console.log("Configuring Nucleus");
  let txdata0 = nucleus.interface.encodeFunctionData("setWrappedGasToken", ["0x4200000000000000000000000000000000000006"])
  let txdata1 = nucleus.interface.encodeFunctionData("setContractURI", ["https://stats-cdn.hydrogendefi.xyz/contractURI.json"]);
  let txdata2 = nucleus.interface.encodeFunctionData("setBaseURI", ["https://stats.hydrogendefi.xyz/pools/metadata/?chainID=84531&v=1.0.1&poolID="]);

  let treasuryLocation = HydrogenNucleusHelper.internalAddressToLocation(accounts.hydrogendeployer.address);
  let swapFees = [{
    // default fee: 20 BPS
    tokenA: AddressZero,
    tokenB: AddressZero,
    feePPM: 2000,
    receiverLocation: treasuryLocation
  }];
  let dai  = "0x7D691e6b03b46B5A5769299fC9a32EaC690B7abc";
  let usdc = "0x35CD54a3547190056A0F690357b1B2692B90Fb00";
  let usdt = "0x70BF48BcfFcFcca6123fFeD4d4EC4Ec6eb31BA00";
  let frax = "0x1C6319Cf1F0b4b4109088B8e626D0b0aD0431253";
  let usdpegs = [dai, usdc, usdt, frax];
  for(let i = 0; i < usdpegs.length; ++i) {
    for(let j = 0; j < usdpegs.length; ++j) {
      if(i == j) continue;
      swapFees.push({
        // stable-stable fee: 0.1 BPS
        tokenA: usdpegs[i],
        tokenB: usdpegs[j],
        feePPM: 10,
        receiverLocation: treasuryLocation
      });
    }
  }
  let weth    = "0x4200000000000000000000000000000000000006";
  let mweth   = "0x421EcD2E7e5BfE4E5b0Aa8Bbf894Da3fadF6Dd93";
  let wsteth  = "0x2d98B318998386A69782f776a96664AA41286efA";
  let reth    = "0x9D668d07B45a700aEA6CaE697ac675e3C1a43091";
  let sfrxeth = "0xfE9d41Bd9ccCAaf80a3905dc23Db2ddcAd015f73";
  let cbeth   = "0xbAA901115eeAbC312C63dF708f4D6aB2ceb8eEbA";
  let iceth   = "0x34173c7EEe379B45117429f2F2bB635190EAc36B";
  let ethpegs = [weth, mweth, wsteth, reth, sfrxeth, cbeth, iceth]
  for(let i = 0; i < ethpegs.length; ++i) {
    for(let j = 0; j < ethpegs.length; ++j) {
      if(i == j) continue;
      swapFees.push({
        // eth-eth fee: 0.1 BPS
        tokenA: ethpegs[i],
        tokenB: ethpegs[j],
        feePPM: 10,
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
