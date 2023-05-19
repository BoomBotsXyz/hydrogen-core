import hardhat from "hardhat";
const { ethers } = hardhat;
import { Wallet } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { expectDeployed } from "../utilities/expectDeployed";
import { toBytes32 } from "../utilities/setStorage";

export async function deployContract(deployer:Wallet|SignerWithAddress, contractName:string, args:any=[], overrides:any={}, confirmations:number=0) {
  let factory = await ethers.getContractFactory(contractName, deployer);
  let contract = await factory.deploy(...args, overrides);
  await contract.deployed();
  let tx = contract.deployTransaction;
  await tx.wait(confirmations);
  await expectDeployed(contract.address);
  return contract;
}
exports.deployContract = deployContract

export async function verifyContract(address: string, constructorArguments: any) {
  console.log("Verifying contract");
  async function _sleeper(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  await _sleeper(30000); // likely just deployed a contract, let etherscan index it
  var verifyArgs: any = {
    address: address,
    constructorArguments: constructorArguments
  };
  try {
    await hardhat.run("verify:verify", verifyArgs);
    console.log("Verified")
  } catch(e) { /* probably already verified */ }
}
exports.verifyContract
