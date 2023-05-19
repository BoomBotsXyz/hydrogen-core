// utils for signing ERC2612.permit()

import { ethers } from "hardhat";
import { BigNumber as BN, BigNumberish, constants, Signature, Wallet, Contract, utils } from "ethers";
const MaxUint256 = constants.MaxUint256;
import { splitSignature } from "ethers/lib/utils";

// signs an approval of tokens using ERC2612 permit()
// returns { v, r, s } of signature
export async function getERC2612PermitASignature(
  owner: Wallet | Contract,
  spender: Wallet | Contract | string,
  token: Contract,
  amount: BigNumberish,
  overrides: any = {}
): Promise<any> {
  return splitSignature(await getERC2612PermitBSignature(owner, spender, token, amount, overrides));
}

// signs an approval of tokens using ERC2612 permit()
// returns bytes65 of signature
export async function getERC2612PermitBSignature(
  owner: Wallet | Contract,
  spender: Wallet | Contract | string,
  token: Contract,
  amount: BigNumberish,
  overrides: any = {}
): Promise<any> {
  const spender2 = (typeof spender === "string") ? spender : spender.address;
  const [name, nonce, chainId, version, deadline] = await Promise.all([
    useOrFetchName(overrides.name, token),
    useOrFetchNonce(overrides.nonce, token, owner.address),
    useOrFetchChainID(overrides.chainID, owner),
    useOrFetchVersion(overrides.version),
    useOrFetchDeadline(overrides.deadline, overrides.expiry)
  ]);
  const verifyingContract = token.address;
  // sign message
  const signature = await owner._signTypedData(
    constructDomain({ name, version, chainId, verifyingContract, }, overrides),
    {
      Permit: [
        { name: "owner",    type: "address", },
        { name: "spender",  type: "address", },
        { name: "value",    type: "uint256", },
        { name: "nonce",    type: "uint256", },
        { name: "deadline", type: "uint256", },
      ],
    },
    {
      owner: owner.address,
      spender: spender2,
      value: amount,
      nonce: nonce,
      deadline: deadline,
    }
  );
  return signature;
}

// signs an approval of tokens using an old version of ERC2612 permit()
// returns { v, r, s } of signature
export async function getERC2612PermitCSignature(
  holder: Wallet | Contract,
  spender: Wallet | Contract | string,
  token: Contract,
  allowed: boolean,
  overrides: any = {}
): Promise<any> {
  const spender2 = (typeof spender === "string") ? spender : spender.address;
  const [name, nonce, chainId, version, deadline] = await Promise.all([
    useOrFetchName(overrides.name, token),
    useOrFetchNonce(overrides.nonce, token, holder.address),
    useOrFetchChainID(overrides.chainID, holder),
    useOrFetchVersion(overrides.version),
    useOrFetchDeadline(overrides.deadline, overrides.expiry)
  ]);
  const verifyingContract = token.address;
  // sign message
  const signature = await holder._signTypedData(
    constructDomain({ name, version, chainId, verifyingContract, }, overrides),
    {
      Permit: [
        { name: "holder",  type: "address", },
        { name: "spender", type: "address", },
        { name: "nonce",   type: "uint256", },
        { name: "expiry",  type: "uint256", },
        { name: "allowed", type: "bool", },
      ],
    },
    {
      holder: holder.address,
      spender: spender2,
      nonce: nonce,
      expiry: deadline,
      allowed: allowed,
    }
  );
  return splitSignature(signature);
}

function constructDomain(block1: any, overrides: any) {
  if(overrides.domainTypehashType === "B") {
    return {
      name: block1.name,
      chainId: block1.chainId,
      verifyingContract: block1.verifyingContract
    };
  } else { return block1; }
}

// calculates the EIP712 domain separator
export function calculateDomainSeparator(
  name: string,
  contractAddress: string,
  chainId: number,
  version: string="1"
) {
    return utils.keccak256(
        utils.defaultAbiCoder.encode(
        ["bytes32", "bytes32", "bytes32", "uint256", "address"],
        [
            utils.keccak256(utils.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
            utils.keccak256(utils.toUtf8Bytes(name)),
            utils.keccak256(utils.toUtf8Bytes(version)),
            chainId,
            contractAddress,
        ]
        )
    )
}
/*
export function calculateDomainSeparator2(
  name: string,
  contractAddress: string,
  chainId: number
) {
    return utils.keccak256(
        utils.defaultAbiCoder.encode(
        ["bytes32", "bytes32", "uint256", "address"],
        [
            utils.keccak256(utils.toUtf8Bytes("EIP712Domain(string name,uint256 chainId,address verifyingContract)")),
            utils.keccak256(utils.toUtf8Bytes(name)),
            chainId,
            contractAddress,
        ]
        )
    )
}
*/
// keccak256("EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)")

// not all tokens conform to the ERC2612 standard. may need to try alternate function names
const permitAbi = [
  {"name":"nonces","inputs":[{"internalType":"address","name":"owner","type":"address"}],"outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"name":"_nonces","inputs":[{"internalType":"address","name":"owner","type":"address"}],"outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"name":"getNonce","inputs":[{"internalType":"address","name":"owner","type":"address"}],"outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"name":"DOMAIN_SEPARATOR","inputs":[],"outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},
  {"name":"getDomainSeparator","inputs":[],"outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},
]

// finds a user's ERC2612 permit nonce
export async function getNonce(tokenAddress:string, holder: string) {
  const token = await ethers.getContractAt(permitAbi, tokenAddress);
  const funcs = [token.nonces, token._nonces, token.getNonce];
  for(let i = 0; i < funcs.length; ++i) {
    try {
      return await funcs[i](holder);
    } catch(e) {}
  }
  throw(`Could not find nonce function for token ${token.address}`);
}

// not all tokens conform to the ERC2612 standard. may need to try alternate function names
export async function getDomainSeparator(tokenAddress:string) {
  const token = await ethers.getContractAt(permitAbi, tokenAddress);
  const funcs = [token.DOMAIN_SEPARATOR, token.getDomainSeparator];
  for(let i = 0; i < funcs.length; ++i) {
    try {
      return await funcs[i]();
    } catch(e) {}
  }
  throw(`Could not find domain separator function for token ${token.address}`);
}

async function useOrFetchName(name:any, token:Contract) {
  if(typeof name === 'string') return name;
  return await token.name();
}

async function useOrFetchNonce(nonce:any, token:Contract, holder:any) {
  if(isBigNumberish(nonce)) return nonce;
  return await getNonce(token.address, holder);
}

async function useOrFetchChainID(chainID:any, wallet:any) {
  if(typeof chainID === 'string' || typeof chainID === 'number') return chainID;
  return await wallet.getChainId();
}

async function useOrFetchVersion(version:any) {
  if(typeof version === "string") return version;
  return "1";
}

async function useOrFetchDeadline(deadline:any, expiry:any) {
  if(isBigNumberish(deadline)) return deadline; // different name same meaning
  if(isBigNumberish(expiry)) return expiry;
  return MaxUint256;
}

function isBigNumberish(num:any) {
  try {
    BN.from(num);
    return true;
  } catch(e) {
    return false;
  }
}
