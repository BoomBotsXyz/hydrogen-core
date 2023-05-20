import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();

const accounts = JSON.parse(process.env.ACCOUNTS || "{}");
const deployer = new ethers.Wallet(accounts.deployer.key, provider);
const trader1 = new ethers.Wallet(accounts.trader1.key, provider);
import { getNetworkSettings } from "./../utils/getNetworkSettings";

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;

let networkSettings: any;
let chainID: number;

async function main() {
  let deployerAddress = await deployer.getAddress();
  console.log(`Using ${deployerAddress} as deployer and owner`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(80001, "mumbai")) throw("Only run this on Polygon Mumbai or a local fork of Mumbai");

  await transfer();
}

async function transfer() {
  console.log("transferring matic")
  let tx = await deployer.sendTransaction({
    to: accounts.deployer.address,
    value: WeiPerEther.mul(1).div(10),
    gasLimit: 21000,
  });
  console.log(tx);
  await tx.wait(networkSettings.confirmations);
  console.log("transferred matic")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
