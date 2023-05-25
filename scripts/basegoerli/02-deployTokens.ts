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
  {"name":"Dai Stablecoin", "symbol":"DAI", "decimals":18, "artifact":"MockERC20PermitC", "address":"0x7D691e6b03b46B5A5769299fC9a32EaC690B7abc", "mintAmount":WeiPerEther.mul(100000)},
  {"name":"USDCoin", "symbol":"USDC", "decimals":6, "artifact":"MockERC20PermitA", "address":"0x35CD54a3547190056A0F690357b1B2692B90Fb00", "mintAmount":WeiPerUsdc.mul(100000)},
  {"name":"Tether USD", "symbol":"USDT", "decimals":6, "artifact":"MockERC20", "address":"0x70BF48BcfFcFcca6123fFeD4d4EC4Ec6eb31BA00", "mintAmount":WeiPerUsdc.mul(100000)},
  {"name":"Dogecoin", "symbol":"DOGE", "decimals":8, "artifact":"MockERC20", "address":"0xFF0f9D4956f5f7f1Ea076d015f0a3c7185c5fc4f", "mintAmount":WeiPerWbtc.mul(1000000)},
  {"name":"Wrapped Bitcoin", "symbol":"WBTC", "decimals":8, "artifact":"MockERC20", "address":"0x2E6365CfB7de7F00478C02485Ca56a975369d2B8", "mintAmount":WeiPerWbtc.mul(1)},
  {"name":"Wrapped Ether", "symbol":"WETH", "decimals":18, "artifact":"MockERC20", "address":"0xEa0B5E9AFa37C1cA61779deAB8527eAE62b30367", "mintAmount":WeiPerEther.mul(10)},
];

async function main() {
  console.log(`Using ${deployer.address} as deployer and owner`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(84531, "basegoerli")) throw("Only run this on Base Goerli or a local fork of Base Goerli");

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
  let receivers:string[] = [
    //accounts.deployer.address,
    accounts.trader1.address,
    accounts.trader2.address,
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
