import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract } from "ethers";
import axios from "axios"
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
import { getTokensBySymbol, getTokensByAddress } from "../utils/getTokens";
import { leftPad } from "../utils/strings";

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const WeiPerWbtc = BN.from(100_000_000); // 8 decimals

let networkSettings: any;
let chainID: number;

let nucleus: HydrogenNucleus;
let NUCLEUS_ADDRESS = "0x49FD8f704a54FB6226e2F14B4761bf6Be84ADF15";

let tokenMetadatas = getTokensByAddress(8453);

let nucleusState: any;

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

  await fetchNucleusState();
  //await configureNucleus();
  await setFees();
  await logAddresses();
}

async function fetchNucleusState() {
  let url = "https://stats.hydrogendefi.xyz/state/?chainID=8453&v=v1.0.1"
  let res = await axios.get(url);
  nucleusState = res.data;
  //console.log("nucleus state")
  //console.log(nucleusState)
}
//  8771381374048674
// 44171942650316400
async function configureNucleus() {
  console.log("Configuring Nucleus");
  let txdata0 = nucleus.interface.encodeFunctionData("setWrappedGasToken", ["0x4200000000000000000000000000000000000006"])
  let txdata1 = nucleus.interface.encodeFunctionData("setContractURI", ["https://stats-cdn.hydrogendefi.xyz/contractURI.json"]);
  let txdata2 = nucleus.interface.encodeFunctionData("setBaseURI", ["https://stats.hydrogendefi.xyz/pools/metadata/?chainID=8453&v=1.0.1&poolID="]);
  let tx = await nucleus.connect(hydrogendeployer).multicall([txdata0, txdata1, txdata2], {...networkSettings.overrides, gasLimit: 1_000_000});
  console.log("tx:", tx);
  await tx.wait(networkSettings.confirmations);
  console.log("Configured Nucleus");
}

async function setFees() {
  console.log("Setting fees")
  let currentSwapFees = nucleusState.swapFees
  let treasuryLocation = HydrogenNucleusHelper.internalAddressToLocation(accounts.hydrogendeployer.address);
  /*
  let swapFees = [{
    // default fee: 20 BPS
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
  */
  function getTokenSymbolOrAddress(token: string) {
    try {
      return leftPad(tokenMetadatas[token].symbol, 7) || token
    } catch(e) {
      return token
    }
  }
  function isSetCorrectly(tokenA: string, tokenB: string, feePPM: string, receiverLocation: string) {
    try {
      if(!currentSwapFees) return false
      if(!currentSwapFees.hasOwnProperty(tokenA)) return false
      if(!currentSwapFees[tokenA]) return false
      if(!currentSwapFees[tokenA].hasOwnProperty(tokenB)) return false
      if(!currentSwapFees[tokenA][tokenB]) return false
      if(currentSwapFees[tokenA][tokenB].feePPM != feePPM) return false
      if(currentSwapFees[tokenA][tokenB].receiverLocation != receiverLocation) return false
      return true
    } catch(e) {
      return false
    }
  }
  let swapFeesToSet:any[] = []
  function checkIsSet(tokenA: string, tokenB: string, feePPM: string, receiverLocation: string) {
    let s = `Checking ${getTokenSymbolOrAddress(tokenA)}-${getTokenSymbolOrAddress(tokenB)}. `
    if(!isSetCorrectly(tokenA, tokenB, feePPM, receiverLocation)) {
      swapFeesToSet.push({ tokenA, tokenB, feePPM, receiverLocation })
      s += 'Was NOT set correctly'
    } else {
      s += 'Was set correctly'
    }
    console.log(s)
  }
  // check default fee
  checkIsSet(AddressZero, AddressZero, "2000", treasuryLocation)
  let usdpegs = [
    "0x7f5373AE26c3E8FfC4c77b7255DF7eC1A9aF52a6", // axlUSDT
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
    "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", // USDbC
    "0xEB466342C4d449BC9f53A865D5Cb90586f405215", // axlUSDC
    "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI
    //"0x5C7e299CF531eb66f2A1dF637d37AbB78e6200C7", // axlDAI
    //"0x406Cde76a3fD20e48bc1E0F60651e60Ae204B040", // axlFRAX
    "0xbf1aeA8670D2528E08334083616dD9C5F3B087aE", // MAI
    "0x4A3A6Dd60A34bB2Aba60D73B4C88315E9CeB6A3D", // MIM
    "0x417Ac0e078398C154EdFadD9Ef675d30Be60Af93", // crvUSD
    "0x4621b7A9c75199271F773Ebd9A499dbd165c3191", // DOLA
    "0xA61BeB4A3d02decb01039e378237032B351125B4", // agEUR
  ]
  for(let i = 0; i < usdpegs.length; ++i) {
    for(let j = 0; j < usdpegs.length; ++j) {
      if(i == j) continue;
      /*
      swapFees.push({
        // stable-stable fee: 0.1 BPS
        tokenA: usdpegs[i],
        tokenB: usdpegs[j],
        feePPM: 100,
        receiverLocation: treasuryLocation
      });
      */
      checkIsSet(usdpegs[i], usdpegs[j], "10", treasuryLocation)
    }
  }
  let ethpegs = [
    "0x4200000000000000000000000000000000000006", // WETH
    "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452", // wstETH
    "0xB6fe221Fe9EeF5aBa221c348bA20A1Bf5e73624c", // rETH
    "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", // cbETH
  ]
  for(let i = 0; i < ethpegs.length; ++i) {
    for(let j = 0; j < ethpegs.length; ++j) {
      if(i == j) continue;
      /*
      swapFees.push({
        // eth-eth fee: 0.1 BPS
        tokenA: ethpegs[i],
        tokenB: ethpegs[j],
        feePPM: 100,
        receiverLocation: treasuryLocation
      });
      */
      checkIsSet(ethpegs[i], ethpegs[j], "10", treasuryLocation)
    }
  }
  console.log("num swap fees to set:", swapFeesToSet.length)
  if(swapFeesToSet.length > 0) {
    console.log("Setting swap fees")
    let tx = await nucleus.connect(hydrogendeployer).setSwapFeesForPairs(swapFeesToSet, {...networkSettings.overrides, gasLimit: 60_000*swapFeesToSet.length+40_000});
    await tx.wait(networkSettings.confirmations)
    console.log("Set fees")
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
