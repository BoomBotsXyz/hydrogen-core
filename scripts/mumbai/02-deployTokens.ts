import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();

const accounts = JSON.parse(process.env.ACCOUNTS || "{}");
const deployer = new ethers.Wallet(accounts.deployer.key, provider);

import { MockERC20, MockERC20PermitA, MockERC20PermitB, MockERC20PermitC } from "./../../typechain-types";
import { expectDeployed, isDeployed } from "./../utilities/expectDeployed";
import { logContractAddress } from "./../utilities/logContractAddress";
import { getNetworkSettings } from "./../utils/getNetworkSettings";
import { deployContract, verifyContract } from "./../utils/deployContract";

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const WeiPerWbtc = BN.from(100_000_000); // 8 decimals

let networkSettings: any;
let chainID: number;

let tokenMetadatas = [
  {"name":"Dai Stablecoin", "symbol":"DAI", "decimals":18, "artifact":"MockERC20PermitC", "address":"0xF59FD8840DC9bb2d00Fe5c0BE0EdF637ACeC77E1", "mintAmount":WeiPerEther.mul(10000)},
  {"name":"USDCoin", "symbol":"USDC", "decimals":6, "artifact":"MockERC20PermitA", "address":"0xA9DC572c76Ead4197154d36bA3f4D0839353abbb", "mintAmount":WeiPerUsdc.mul(10000)},
  {"name":"Tether USD", "symbol":"USDT", "decimals":6, "artifact":"MockERC20", "address":"0x7a49D1804434Ad537e4cC0061865727b87E71cd8", "mintAmount":WeiPerUsdc.mul(10000)},
  {"name":"Dogecoin", "symbol":"DOGE", "decimals":8, "artifact":"MockERC20", "address":"0xbb8fD2d558206E3CB68038A338718359a96e0C44", "mintAmount":WeiPerWbtc.mul(100000)},
  {"name":"Wrapped Bitcoin", "symbol":"WBTC", "decimals":8, "artifact":"MockERC20", "address":"0x1C9b3500bF4B13BB338DC4F4d4dB1dEAF0638a1c", "mintAmount":WeiPerWbtc.mul(1).div(10)},
  {"name":"Wrapped Ether", "symbol":"WETH", "decimals":18, "artifact":"MockERC20", "address":"0x09db75630A9b2e66F220531B77080282371156FE", "mintAmount":WeiPerEther.mul(1)},
];

async function main() {
  console.log(`Using ${deployer.address} as deployer and owner`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(80001, "mumbai")) throw("Only run this on Polygon Mumbai or a local fork of Mumbai");

  await deployTokens();
  await mintTokens();
  await logAddresses();
}

async function deployTokens() {
  for(let i = 0; i < tokenMetadatas.length; ++i) {
    let metadata = tokenMetadatas[i];
    if(await isDeployed(metadata.address)) {
      console.log(`${metadata.symbol} already deployed at ${metadata.address}, skipping`);
      continue;
    }
    console.log(`Deploying ${metadata.symbol}`);
    let args = [metadata.name, metadata.symbol, metadata.decimals];
    let token = await deployContract(deployer, metadata.artifact, args, {...networkSettings.overrides, gasLimit: 10000000}, networkSettings.confirmations);
    console.log(`Deployed ${metadata.symbol} to ${token.address}`);
    metadata.address = token.address;
    if(chainID != 31337) await verifyContract(token.address, args);
  }
}

async function mintTokens() {
  let receivers = [
    //accounts.deployer.address,
    //accounts.trader1.address,
    //accounts.trader2.address,
  ];
  for(let i = 0; i < tokenMetadatas.length; ++i) {
    let metadata = tokenMetadatas[i];
    let token = await ethers.getContractAt(metadata.artifact, metadata.address, deployer) as any;
    for(var j = 0; j < receivers.length; ++j) {
      console.log(`minting ${metadata.symbol} to ${receivers[j]}`);
      let tx = await token.mint(receivers[j], metadata.mintAmount, networkSettings.overrides);
      await tx.wait(networkSettings.confirmations);
    }
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  for(let i = 0; i < tokenMetadatas.length; ++i) {
    let metadata = tokenMetadatas[i];
    logContractAddress(metadata.symbol, metadata.address);
  }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
