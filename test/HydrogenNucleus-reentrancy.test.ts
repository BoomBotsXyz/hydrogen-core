/* global describe it before ethers */

import hre from "hardhat";
const { ethers } = hre;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;

import { HydrogenNucleus, MockERC20, MockERC20WithTransferHook, MockERC20PermitAWithPermitHook, MockERC20PermitBWithPermitHook, MockERC20PermitCWithPermitHook, WrappedGasToken, MockGasTokenReceiverWithReceiveHook, MockERC721Receiver4, MockERC721Receiver10, MockFlashSwapCallee4, MockFlashSwapCallee10, MockFlashLoanBorrower4, MockFlashLoanBorrower10 } from "./../typechain-types";

import { getNetworkSettings } from "../scripts/utils/getNetworkSettings";
import HydrogenNucleusHelper from "../scripts/utils/HydrogenNucleusHelper";
import { deployContract } from "../scripts/utils/deployContract";
import { getERC2612PermitASignature, getERC2612PermitBSignature, getERC2612PermitCSignature, getNonce } from "../scripts/utilities/getERC2612PermitSignature";
import L1DataFeeAnalyzer from "../scripts/utils/L1DataFeeAnalyzer";

const { AddressZero, WeiPerEther, MaxUint256, Zero } = ethers.constants;

describe("HydrogenNucleus-reentrancy", function () {
  let deployer: SignerWithAddress;
  let owner1: SignerWithAddress;
  let owner2: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  let user1ExternalLocation: string;
  let user1InternalLocation: string;
  let user2ExternalLocation: string;
  let user2InternalLocation: string;
  let user3ExternalLocation: string;
  let user3InternalLocation: string;

  let nucleus: HydrogenNucleus;

  // standard tokens and callbacks
  let wgas: WrappedGasToken;
  let token1: MockERC20;
  let token2: MockERC20;
  let token3: MockERC20;
  let tokens:any[] = [];
  let swapCallee4: MockFlashSwapCallee4;
  let borrower4: MockFlashLoanBorrower4;
  let erc721Receiver4: MockERC721Receiver4;

  // poisoned tokens and callbacks
  let poisonToken1: MockERC20WithTransferHook;
  let poisonTokenA: MockERC20PermitAWithPermitHook;
  let poisonTokenB: MockERC20PermitBWithPermitHook;
  let poisonTokenC: MockERC20PermitCWithPermitHook;
  let poisonGasTokenReceiver: MockGasTokenReceiverWithReceiveHook;
  let poisonERC721Receiver: MockERC721Receiver10;
  let poisonFlashSwapCallee: MockFlashSwapCallee10;
  let poisonFlashLoanBorrower: MockFlashLoanBorrower10;

  let chainID: number;
  let networkSettings: any;
  let snapshot: BN;

  let l1DataFeeAnalyzer = new L1DataFeeAnalyzer();

  let functionsByName: any = {};
  let functionsList: any[] = [
    {
      "name": "acceptOwnership",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "approve[0]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "approve[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "balanceOf",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "baseURI",
      "stateMutability": "view",
      "hasReentrancyGuard": false,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "contractURI",
      "stateMutability": "view",
      "hasReentrancyGuard": false,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "createGridOrderPool[0]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // deposit standard erc20
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "createGridOrderPool[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true, // deposit poisoned erc20
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "createGridOrderPool[2]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false, // no deposit
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true, // called by flash callback
    },
    {
      "name": "createGridOrderPoolCompact[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true, // deposit poisoned erc20 from external balance
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "createGridOrderPoolCompact[2]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false, // no deposit
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true, // called by flash callback
    },
    {
      "name": "createGridOrderPoolCompact[3]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // deposit poisoned erc20 from internal balance
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "createLimitOrderPool[0]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // deposit standard erc20
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "createLimitOrderPool[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true, // deposit poisoned erc20 from external balance
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "createLimitOrderPool[2]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // deposit standard erc20
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true, // called by flash callback
    },
    {
      "name": "createLimitOrderPool[3]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // deposit poisoned erc20 from internal balance
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "createLimitOrderPoolCompact[0]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // deposit standard erc20
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "createLimitOrderPoolCompact[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true, // deposit poisoned erc20
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "createLimitOrderPoolCompact[2]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // deposit standard erc20
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true, // called by flash callback
    },
    {
      "name": "erc2612PermitA",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "erc2612PermitB",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "erc2612PermitC",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "executeMarketOrder[0]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "executeMarketOrder[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "executeMarketOrder[2]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "executeMarketOrderDstExt[0]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "executeMarketOrderDstExt[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "executeMarketOrderDstExt[2]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "executeMarketOrderDstInt[0]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "executeMarketOrderDstInt[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "executeMarketOrderDstInt[2]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "executeFlashSwap[0]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "executeFlashSwap[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "executeFlashSwap[2]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "executeFlashSwap[3]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": true, // flash swap
      "flashCallOutReenters": false, // against external market
      "canBeFlashInnerCall": true,
    },
    {
      "name": "executeFlashSwap[4]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": true, // flash swap
      "flashCallOutReenters": true, // reenters
      "canBeFlashInnerCall": true,
    },
    {
      "name": "exists",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "flashFee",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "flashLoan[0]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // test standard erc20
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": true,
      "flashCallOutReenters": false, // does not reenter
      "canBeFlashInnerCall": true,
    },
    {
      "name": "flashLoan[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true, // test poisoned erc20
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": true,
      "flashCallOutReenters": false, // does not reenter
      "canBeFlashInnerCall": false,
    },
    {
      "name": "flashLoan[2]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // test standard erc20
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": true,
      "flashCallOutReenters": true, // reenters
      "canBeFlashInnerCall": true,
    },
    {
      "name": "getApproved",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "getFlashLoanFeeForToken",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "getGridOrderPool",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "getLimitOrderPool",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "getPoolType",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "getStoredFlashLoanFeeForToken",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "getStoredSwapFeeForPair",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "getSwapFeeForPair",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "getTokenBalance",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "getTradeRequest",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "isApprovedForAll",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "maxFlashLoan",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "multicall",
      "stateMutability": "payable",
      "hasReentrancyGuard": false,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "name",
      "stateMutability": "pure",
      "hasReentrancyGuard": false,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "owner",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "ownerOf",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "pendingOwner",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "reentrancyGuardState",
      "stateMutability": "view",
      "hasReentrancyGuard": false,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "renounceOwnership",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": true,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "safeTransferFrom[0]", // safeTransferFrom(address,address,uint256) to EOA
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "safeTransferFrom[1]", // safeTransferFrom(address,address,uint256,bytes) to EOA
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "safeTransferFrom[2]", // safeTransferFrom(address,address,uint256) to poison receiver
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": true,
      "flashCallOutReenters": true, // with reentry
      "canBeFlashInnerCall": false,
    },
    {
      "name": "safeTransferFrom[3]", // safeTransferFrom(address,address,uint256,bytes) to poison receiver
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": true,
      "flashCallOutReenters": true, // with reentry
      "canBeFlashInnerCall": false,
    },
    {
      "name": "safeTransferFrom[4]", // safeTransferFrom(address,address,uint256) to EOA
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true, // flash
    },
    {
      "name": "safeTransferFrom[5]", // safeTransferFrom(address,address,uint256,bytes) to EOA
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true, // flash
    },
    {
      "name": "safeTransferFrom[6]", // safeTransferFrom(address,address,uint256) to standard receiver
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": true,
      "flashCallOutReenters": false, // no reentry
      "canBeFlashInnerCall": false,
    },
    {
      "name": "safeTransferFrom[7]", // safeTransferFrom(address,address,uint256,bytes) to standard receiver
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": true,
      "flashCallOutReenters": false, // no reentry
      "canBeFlashInnerCall": false,
    },
    {
      "name": "setApprovalForAll",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "setBaseURI",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "setContractURI",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "setFlashLoanFeesForTokens",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "setSwapFeesForPairs",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "setWrappedGasToken",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": true,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "supportsInterface",
      "stateMutability": "pure",
      "hasReentrancyGuard": false,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "symbol",
      "stateMutability": "pure",
      "hasReentrancyGuard": false,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "tokenTransfer[0]", // external balance to internal balance
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "tokenTransfer[1]", // internal balance to external balance
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "tokenTransfer[2]", // internal balance to internal balance. does not call out
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "tokenTransfer[3]", // internal balance to internal balance. does not call out
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true, // from callback
    },
    {
      "name": "tokenTransfer[4]", // external balance to internal balance, non poison token
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "tokenTransferIn[0]", // external balance to internal balance, non poison token
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "tokenTransferIn[1]", // external balance to internal balance, poison token
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "tokenTransferOut[0]", // internal balance to external balance, non poison token
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "tokenTransferOut[1]", // internal balance to external balance, poison token
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "tokenURI",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "totalSupply",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "transferFrom[0]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "transferFrom[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "transferOwnership",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "unwrapGasToken[0]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // assuming wgas set correctly
      "hasTransferGasTokenOut": true,
      "externalCallToGasTokenCanBePoisoned": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "unwrapGasToken[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // assuming wgas set correctly
      "hasTransferGasTokenOut": true,
      "externalCallToGasTokenCanBePoisoned": true,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "unwrapGasToken[2]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // assuming wgas set correctly
      "hasTransferGasTokenOut": true,
      "externalCallToGasTokenCanBePoisoned": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true, // in flash
    },
    {
      "name": "updateGridOrderPool[0]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // deposit standard erc20
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "updateGridOrderPool[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": true,// deposit poison erc20
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "updateGridOrderPool[2]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false, // no deposits
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true, // flash
    },
    {
      "name": "updateLimitOrderPool[0]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": false,
    },
    {
      "name": "updateLimitOrderPool[1]",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "wrapGasToken",
      "stateMutability": "payable",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": true,
      "externalCallToERC20CanBePoisoned": false, // assuming wgas set correctly
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "wrappedGasToken",
      "stateMutability": "view",
      "hasReentrancyGuard": true,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    },
    {
      "name": "receive",
      "stateMutability": "payable",
      "hasReentrancyGuard": false,
      "canOnlyBeCalledOnce": false,
      "hasExternalCallToERC20": false,
      "hasTransferGasTokenOut": false,
      "hasFlashCallOut": false,
      "canBeFlashInnerCall": true,
    }
  ]



  before(async function () {
    [deployer, owner1, owner2, user1, user2, user3] = await ethers.getSigners();
    chainID = (await provider.getNetwork()).chainId;
    networkSettings = getNetworkSettings(chainID);
    if(!networkSettings.isTestnet) throw new Error("Do not run tests on production networks");
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    user1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
    user1InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
    user2ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
    user2InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
    user3ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user3.address);
    user3InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user3.address);

    nucleus = await deployContract(deployer, "HydrogenNucleus", [owner1.address]) as HydrogenNucleus;

    wgas = await deployContract(deployer, "WrappedGasToken") as WrappedGasToken;

    await nucleus.connect(owner1).setWrappedGasToken(wgas.address);

    while(tokens.length < 3) {
      let token = await deployContract(deployer, "MockERC20", [`Token${tokens.length+1}`, `TKN${tokens.length+1}`, 18]) as MockERC20;
      tokens.push(token);
    }
    [token1, token2, token3] = tokens;

    swapCallee4 = await deployContract(deployer, "MockFlashSwapCallee4", [nucleus.address]) as MockFlashSwapCallee4;
    borrower4 = await deployContract(deployer, "MockFlashLoanBorrower4", [nucleus.address]) as MockFlashLoanBorrower4;
    erc721Receiver4 = await deployContract(deployer, "MockERC721Receiver4", [nucleus.address]) as MockERC721Receiver4;

    poisonToken1 = await deployContract(deployer, "MockERC20WithTransferHook", [`poisonToken1`, `PZN`, 18]) as MockERC20WithTransferHook;
    poisonTokenA = await deployContract(deployer, "MockERC20PermitAWithPermitHook", [`poisonTokenA`, `PZNA`, 18]) as MockERC20PermitAWithPermitHook;
    poisonTokenB = await deployContract(deployer, "MockERC20PermitBWithPermitHook", [`poisonTokenB`, `PZNB`, 18]) as MockERC20PermitBWithPermitHook;
    poisonTokenC = await deployContract(deployer, "MockERC20PermitCWithPermitHook", [`poisonTokenC`, `PZNC`, 18]) as MockERC20PermitCWithPermitHook;

    poisonGasTokenReceiver = await deployContract(deployer, "MockGasTokenReceiverWithReceiveHook") as MockGasTokenReceiverWithReceiveHook;
    poisonERC721Receiver = await deployContract(deployer, "MockERC721Receiver10", [nucleus.address]) as MockERC721Receiver10;
    poisonFlashSwapCallee = await deployContract(deployer, "MockFlashSwapCallee10", [nucleus.address]) as MockFlashSwapCallee10;
    poisonFlashLoanBorrower = await deployContract(deployer, "MockFlashLoanBorrower10", [nucleus.address]) as MockFlashLoanBorrower10;
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("should setup functions", async function () {
      functionsByName = {
        // viewFunctionNamesWithGuard
        "getTokenBalance": { name: "getTokenBalance", calldata: nucleus.interface.encodeFunctionData("getTokenBalance", [token1.address, user2ExternalLocation]) },
        "exists": { name: "exists", calldata: nucleus.interface.encodeFunctionData("exists", [1001]) },
        "getPoolType": { name: "getPoolType", calldata: nucleus.interface.encodeFunctionData("getPoolType", [1001]) },
        "getTradeRequest": { name: "getTradeRequest", calldata: nucleus.interface.encodeFunctionData("getTradeRequest", [1001, token1.address, token2.address]) },
        "getLimitOrderPool": { name: "getLimitOrderPool", calldata: nucleus.interface.encodeFunctionData("getLimitOrderPool", [1001]) },
        "getGridOrderPool": { name: "getGridOrderPool", calldata: nucleus.interface.encodeFunctionData("getGridOrderPool", [2002]) },
        "getSwapFeeForPair": { name: "getSwapFeeForPair", calldata: nucleus.interface.encodeFunctionData("getSwapFeeForPair", [token1.address, token2.address]) },
        "getStoredSwapFeeForPair": { name: "getStoredSwapFeeForPair", calldata: nucleus.interface.encodeFunctionData("getStoredSwapFeeForPair", [token1.address, token2.address]) },
        "maxFlashLoan": { name: "maxFlashLoan", calldata: nucleus.interface.encodeFunctionData("maxFlashLoan", [token1.address]) },
        "flashFee": { name: "flashFee", calldata: nucleus.interface.encodeFunctionData("flashFee", [token1.address, 0]) },
        "getFlashLoanFeeForToken": { name: "getFlashLoanFeeForToken", calldata: nucleus.interface.encodeFunctionData("getFlashLoanFeeForToken", [token1.address]) },
        "getStoredFlashLoanFeeForToken": { name: "getStoredFlashLoanFeeForToken", calldata: nucleus.interface.encodeFunctionData("getStoredFlashLoanFeeForToken", [token1.address]) },
        "tokenURI": { name: "tokenURI", calldata: nucleus.interface.encodeFunctionData("tokenURI", [1001]) },
        "owner": { name: "owner", calldata: nucleus.interface.encodeFunctionData("owner") },
        "pendingOwner": { name: "pendingOwner", calldata: nucleus.interface.encodeFunctionData("pendingOwner") },
        "ownerOf": { name: "ownerOf", calldata: nucleus.interface.encodeFunctionData("ownerOf", [1001]) },
        "balanceOf": { name: "balanceOf", calldata: nucleus.interface.encodeFunctionData("balanceOf", [user1.address]) },
        "getApproved": { name: "getApproved", calldata: nucleus.interface.encodeFunctionData("getApproved", [1001]) },
        "isApprovedForAll": { name: "isApprovedForAll", calldata: nucleus.interface.encodeFunctionData("isApprovedForAll", [user1.address, user2.address]) },
        "totalSupply": { name: "totalSupply", calldata: nucleus.interface.encodeFunctionData("totalSupply") },
        "wrappedGasToken": { name: "wrappedGasToken", calldata: nucleus.interface.encodeFunctionData("wrappedGasToken") },
        // viewFunctionNamesWithoutGuard
        "reentrancyGuardState": { name: "reentrancyGuardState", calldata: nucleus.interface.encodeFunctionData("reentrancyGuardState") },
        "name": { name: "name", calldata: nucleus.interface.encodeFunctionData("name") },
        "symbol": { name: "symbol", calldata: nucleus.interface.encodeFunctionData("symbol") },
        "baseURI": { name: "baseURI", calldata: nucleus.interface.encodeFunctionData("baseURI") },
        "contractURI": { name: "contractURI", calldata: nucleus.interface.encodeFunctionData("contractURI") },
        "supportsInterface": { name: "supportsInterface", calldata: nucleus.interface.encodeFunctionData("supportsInterface", ["0x12345678"]) },
        // mutator functions
        "acceptOwnership": { name: "acceptOwnership", constructTransaction: async () => {
          let pendingOwner = await nucleus.pendingOwner()
          let wallet = undefined
          if(pendingOwner == owner1.address) wallet = owner1;
          else if(pendingOwner == owner2.address) wallet = owner2;
          else throw new Error("pending contract owner unknown")
          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("acceptOwnership")
          }
        }},
        "approve[0]": { name: "approve[0]", constructTransaction: async () => {
          let owner = await nucleus.ownerOf(3001)
          let wallet = undefined
          if(owner == owner1.address) wallet = owner1;
          else if(owner == owner2.address) wallet = owner2;
          else if(owner == user1.address) wallet = user1;
          else if(owner == user2.address) wallet = user2;
          else if(owner == user3.address) wallet = user3;
          else if(owner == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(owner == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;
          else throw new Error("hpt owner unknown")
          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("approve", [user2.address, 1001])
          }
        }},
        "approve[1]": { name: "approve[1]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let poolID = await createGridOrderPoolFor(addr);
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;
          //else throw new Error("hpt owner unknown")
          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("approve", [user2.address, poolID])
          }
        }},
        "createGridOrderPool[0]": { name: "createGridOrderPool[0]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("createGridOrderPool", [{
            tokenSources: [{
              token: token1.address,
              location: user1ExternalLocation,
              amount: 1
            }],
            tradeRequests: [{
              tokenA: poisonToken1.address,
              tokenB: token1.address,
              locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
              exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
            },{
              tokenA: token1.address,
              tokenB: poisonToken1.address,
              locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
              exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
            }],
            hptReceiver: user1.address
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "createGridOrderPool[1]": { name: "createGridOrderPool[1]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("createGridOrderPool", [{
            tokenSources: [{
              token: poisonToken1.address,
              location: user1ExternalLocation,
              amount: 1
            }],
            tradeRequests: [{
              tokenA: poisonToken1.address,
              tokenB: token1.address,
              locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
              exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
            },{
              tokenA: token1.address,
              tokenB: poisonToken1.address,
              locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
              exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
            }],
            hptReceiver: user1.address
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "createGridOrderPool[2]": { name: "createGridOrderPool[2]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("createGridOrderPool", [{
            tokenSources: [],
            tradeRequests: [],
            hptReceiver: addr
          }])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "createGridOrderPoolCompact[1]": { name: "createGridOrderPoolCompact[1]", constructTransaction: async () => {
          let balI = await nucleus.getTokenBalance(poisonToken1.address, user1InternalLocation);
          let data = nucleus.interface.encodeFunctionData("createGridOrderPoolCompact", [{
            tokenSources: [{
              token: poisonToken1.address,
              amount: balI.add(1)
            },{
              token: token1.address,
              amount: 1
            }],
            exchangeRates: [
              HydrogenNucleusHelper.encodeExchangeRate(1, 1),
              HydrogenNucleusHelper.encodeExchangeRate(1, 1),
            ],
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "createGridOrderPoolCompact[2]": { name: "createGridOrderPoolCompact[2]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("createGridOrderPoolCompact", [{
            tokenSources: [],
            exchangeRates: [],
          }])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "createGridOrderPoolCompact[3]": { name: "createGridOrderPoolCompact[3]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("createGridOrderPoolCompact", [{
            tokenSources: [{
              token: poisonToken1.address,
              amount: 1
            },{
              token: token1.address,
              amount: 1
            }],
            exchangeRates: [
              HydrogenNucleusHelper.encodeExchangeRate(1, 1),
              HydrogenNucleusHelper.encodeExchangeRate(1, 1),
            ],
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "createLimitOrderPool[0]": { name: "createLimitOrderPool[0]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("createLimitOrderPool", [{
            tokenA: token1.address,
            tokenB: poisonToken1.address,
            locationA: user1ExternalLocation,
            locationB: user1ExternalLocation,
            amountA: 1,
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
            hptReceiver: user1.address
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "createLimitOrderPool[1]": { name: "createLimitOrderPool[1]", constructTransaction: async () => {
          let balI = await nucleus.getTokenBalance(poisonToken1.address, user1InternalLocation);
          let data = nucleus.interface.encodeFunctionData("createLimitOrderPool", [{
            tokenA: poisonToken1.address,
            tokenB: token1.address,
            locationA: user1ExternalLocation,
            locationB: user1ExternalLocation,
            amountA: balI.add(1),
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
            hptReceiver: user1.address
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "createLimitOrderPool[2]": { name: "createLimitOrderPool[2]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("createLimitOrderPool", [{
            tokenA: token1.address,
            tokenB: token2.address,
            locationA: HydrogenNucleusHelper.externalAddressToLocation(addr),
            locationB: HydrogenNucleusHelper.externalAddressToLocation(addr),
            amountA: 0,
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
            hptReceiver: addr
          }])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "createLimitOrderPool[3]": { name: "createLimitOrderPool[3]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("createLimitOrderPool", [{
            tokenA: poisonToken1.address,
            tokenB: token1.address,
            locationA: user1ExternalLocation,
            locationB: user1ExternalLocation,
            amountA: 1,
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
            hptReceiver: user1.address
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "createLimitOrderPoolCompact[0]": { name: "createLimitOrderPoolCompact[0]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("createLimitOrderPoolCompact", [{
            tokenA: token1.address,
            tokenB: poisonToken1.address,
            amountA: 1,
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "createLimitOrderPoolCompact[1]": { name: "createLimitOrderPoolCompact[1]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("createLimitOrderPoolCompact", [{
            tokenA: poisonToken1.address,
            tokenB: token1.address,
            amountA: 1,
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "createLimitOrderPoolCompact[2]": { name: "createLimitOrderPoolCompact[2]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("createLimitOrderPoolCompact", [{
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: 0,
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
          }])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "erc2612PermitA": { name: "erc2612PermitA", constructTransaction: async () => {
          let permitAmount = WeiPerEther;
          let { v, r, s } = await getERC2612PermitASignature(user1 as any, nucleus.address, poisonTokenA, permitAmount, { permitType: "A", version: "1", chainID: 31337 } );
          let data = nucleus.interface.encodeFunctionData("erc2612Permit(address,address,uint256,uint256,uint8,bytes32,bytes32)", [user1.address, poisonTokenA.address, permitAmount, MaxUint256, v, r, s]);
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "erc2612PermitB": { name: "erc2612PermitB", constructTransaction: async () => {
          let permitAmount = WeiPerEther;
          let sig = await getERC2612PermitBSignature(user1 as any, nucleus.address, poisonTokenB, permitAmount, { permitType: "B", version: "1", chainID: 31337 });
          let data = nucleus.interface.encodeFunctionData("erc2612Permit(address,address,uint256,uint256,bytes)", [user1.address, poisonTokenB.address, permitAmount, MaxUint256, sig]);
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "erc2612PermitC": { name: "erc2612PermitC", constructTransaction: async () => {
          let nonce = await getNonce(poisonTokenC.address, user1.address);
          let { v, r, s } = await getERC2612PermitCSignature(user1 as any, nucleus.address, poisonTokenC, true, { permitType: "C", version: "1", chainID: 31337, nonce: nonce });
          let data = nucleus.interface.encodeFunctionData("erc2612Permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)", [user1.address, poisonTokenC.address, nonce, MaxUint256, true, v, r, s]);
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "executeMarketOrder[0]": { name: "executeMarketOrder[0]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("executeMarketOrder", [{
            poolID: 5002,
            tokenA: poisonToken1.address,
            tokenB: token1.address,
            amountA: 1,
            amountB: 1,
            locationA: user1ExternalLocation,
            locationB: user1ExternalLocation,
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "executeMarketOrder[1]": { name: "executeMarketOrder[1]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("executeMarketOrder", [{
            poolID: 5002,
            tokenA: token1.address,
            tokenB: poisonToken1.address,
            amountA: 1,
            amountB: 1,
            locationA: user1ExternalLocation,
            locationB: user1ExternalLocation,
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "executeMarketOrder[2]": { name: "executeMarketOrder[2]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("executeMarketOrder", [{
            poolID: 1001,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: 0,
            amountB: 0,
            locationA: HydrogenNucleusHelper.externalAddressToLocation(addr),
            locationB: HydrogenNucleusHelper.externalAddressToLocation(addr),
          }])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "executeMarketOrderDstExt[0]": { name: "executeMarketOrderDstExt[0]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("executeMarketOrderDstExt", [{
            poolID: 5002,
            tokenA: poisonToken1.address,
            tokenB: token1.address,
            amountA: 1,
            amountB: 1,
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "executeMarketOrderDstExt[1]": { name: "executeMarketOrderDstExt[1]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("executeMarketOrderDstExt", [{
            poolID: 5002,
            tokenA: token1.address,
            tokenB: poisonToken1.address,
            amountA: 1,
            amountB: 1,
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "executeMarketOrderDstExt[2]": { name: "executeMarketOrderDstExt[2]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("executeMarketOrderDstExt", [{
            poolID: 1001,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: 0,
            amountB: 0,
          }])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "executeMarketOrderDstInt[0]": { name: "executeMarketOrderDstInt[0]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("executeMarketOrderDstInt", [{
            poolID: 5002,
            tokenA: poisonToken1.address,
            tokenB: token1.address,
            amountA: 1,
            amountB: 1,
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "executeMarketOrderDstInt[1]": { name: "executeMarketOrderDstInt[1]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("executeMarketOrderDstInt", [{
            poolID: 5002,
            tokenA: token1.address,
            tokenB: poisonToken1.address,
            amountA: 1,
            amountB: 1,
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "executeMarketOrderDstInt[2]": { name: "executeMarketOrderDstInt[2]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("executeMarketOrderDstInt", [{
            poolID: 1001,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: 0,
            amountB: 0,
          }])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "executeFlashSwap[0]": { name: "executeFlashSwap[0]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
            poolID: 5002,
            tokenA: poisonToken1.address,
            tokenB: token1.address,
            amountA: 1,
            amountB: 1,
            locationA: user1ExternalLocation,
            locationB: user1ExternalLocation,
            flashSwapCallee: AddressZero,
            callbackData: "0x"
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "executeFlashSwap[1]": { name: "executeFlashSwap[1]", constructTransaction: async () => {
          let data = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
            poolID: 5002,
            tokenA: token1.address,
            tokenB: poisonToken1.address,
            amountA: 1,
            amountB: 1,
            locationA: user1ExternalLocation,
            locationB: user1ExternalLocation,
            flashSwapCallee: AddressZero,
            callbackData: "0x"
          }])
          return {
            "wallet": user1,
            to: nucleus.address,
            data,
          }
        }},
        "executeFlashSwap[2]": { name: "executeFlashSwap[2]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
            poolID: 1001,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: 0,
            amountB: 0,
            locationA: HydrogenNucleusHelper.externalAddressToLocation(addr),
            locationB: HydrogenNucleusHelper.externalAddressToLocation(addr),
            flashSwapCallee: AddressZero,
            callbackData: "0x"
          }])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "executeFlashSwap[3]": { name: "executeFlashSwap[3]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
            poolID: 1001,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: 0,
            amountB: 0,
            locationA: HydrogenNucleusHelper.externalAddressToLocation(addr),
            locationB: HydrogenNucleusHelper.externalAddressToLocation(addr),
            flashSwapCallee: swapCallee4.address,
            callbackData: "0x"
          }])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "executeFlashSwap[4]": { name: "executeFlashSwap[4]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
            poolID: 1001,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: 0,
            amountB: 0,
            locationA: HydrogenNucleusHelper.externalAddressToLocation(addr),
            locationB: HydrogenNucleusHelper.externalAddressToLocation(addr),
            flashSwapCallee: poisonFlashSwapCallee.address,
            callbackData: "0x"
          }])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "flashLoan[0]": { name: "flashLoan[0]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == erc721Receiver4.address) wallet = erc721Receiver4;
          else if(addr == swapCallee4.address) wallet = swapCallee4;
          else if(addr == borrower4.address) wallet = borrower4;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;
          else if(addr == poisonFlashLoanBorrower.address) wallet = poisonFlashLoanBorrower;

          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("flashLoan", [borrower4.address, token1.address, 0, "0x"])
          }
        }},
        "flashLoan[1]": { name: "flashLoan[1]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == erc721Receiver4.address) wallet = erc721Receiver4;
          else if(addr == swapCallee4.address) wallet = swapCallee4;
          else if(addr == borrower4.address) wallet = borrower4;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;
          else if(addr == poisonFlashLoanBorrower.address) wallet = poisonFlashLoanBorrower;

          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("flashLoan", [borrower4.address, poisonToken1.address, 0, "0x"])
          }
        }},
        "flashLoan[2]": { name: "flashLoan[2]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == erc721Receiver4.address) wallet = erc721Receiver4;
          else if(addr == swapCallee4.address) wallet = swapCallee4;
          else if(addr == borrower4.address) wallet = borrower4;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;
          else if(addr == poisonFlashLoanBorrower.address) wallet = poisonFlashLoanBorrower;

          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("flashLoan", [poisonFlashLoanBorrower.address, token1.address, 0, "0x"])
          }
        }},
        "multicall": { name: "multicall", calldata: nucleus.interface.encodeFunctionData("multicall", [[]]) },
        "renounceOwnership": { name: "renounceOwnership", calldata: nucleus.interface.encodeFunctionData("renounceOwnership") },
        "safeTransferFrom[0]": { name: "safeTransferFrom[0]", constructTransaction: async () => {
          let owner = await nucleus.ownerOf(3001);
          let wallet = undefined;
          let newOwner = user1;
          if(owner == owner1.address) wallet = owner1;
          else if(owner == owner2.address) wallet = owner2;
          else if(owner == user1.address) { wallet = user1; newOwner = user2; }
          else if(owner == user2.address) wallet = user2;
          else if(owner == user3.address) wallet = user3;
          else throw new Error("hpt owner unknown")
          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("safeTransferFrom(address,address,uint256)", [owner, newOwner.address, 3001])
          }
        }},
        "safeTransferFrom[1]": { name: "safeTransferFrom[1]", constructTransaction: async () => {
          let owner = await nucleus.ownerOf(3001);
          let wallet = undefined;
          let newOwner = user1;
          if(owner == owner1.address) wallet = owner1;
          else if(owner == owner2.address) wallet = owner2;
          else if(owner == user1.address) { wallet = user1; newOwner = user2; }
          else if(owner == user2.address) wallet = user2;
          else if(owner == user3.address) wallet = user3;
          else throw new Error("hpt owner unknown")
          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("safeTransferFrom(address,address,uint256,bytes)", [owner, newOwner.address, 3001, "0x"])
          }
        }},
        "safeTransferFrom[2]": { name: "safeTransferFrom[2]", constructTransaction: async () => {
          let owner = await nucleus.ownerOf(3001);
          let wallet = undefined;
          if(owner == owner1.address) wallet = owner1;
          else if(owner == owner2.address) wallet = owner2;
          else if(owner == user1.address) wallet = user1;
          else if(owner == user2.address) wallet = user2;
          else if(owner == user3.address) wallet = user3;
          else throw new Error("hpt owner unknown")
          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("safeTransferFrom(address,address,uint256)", [owner, poisonERC721Receiver.address, 3001])
          }
        }},
        "safeTransferFrom[3]": { name: "safeTransferFrom[3]", constructTransaction: async () => {
          let owner = await nucleus.ownerOf(3001);
          let wallet = undefined;
          if(owner == owner1.address) wallet = owner1;
          else if(owner == owner2.address) wallet = owner2;
          else if(owner == user1.address) wallet = user1;
          else if(owner == user2.address) wallet = user2;
          else if(owner == user3.address) wallet = user3;
          else throw new Error("hpt owner unknown")
          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("safeTransferFrom(address,address,uint256,bytes)", [owner, poisonERC721Receiver.address, 3001, "0x"])
          }
        }},
        "safeTransferFrom[4]": { name: "safeTransferFrom[4]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let poolID = await createGridOrderPoolFor(addr);
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("safeTransferFrom(address,address,uint256)", [addr, "0x000000000000000000000000000000000000dead", poolID])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "safeTransferFrom[5]": { name: "safeTransferFrom[5]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let poolID = await createGridOrderPoolFor(addr);
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("safeTransferFrom(address,address,uint256,bytes)", [addr, "0x000000000000000000000000000000000000dead", poolID, "0x"])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "safeTransferFrom[6]": { name: "safeTransferFrom[6]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let poolID = await createGridOrderPoolFor(addr);
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("safeTransferFrom(address,address,uint256)", [addr, erc721Receiver4.address, poolID])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "safeTransferFrom[7]": { name: "safeTransferFrom[7]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let poolID = await createGridOrderPoolFor(addr);
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("safeTransferFrom(address,address,uint256,bytes)", [addr, erc721Receiver4.address, poolID, "0x"])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "setApprovalForAll": { name: "setApprovalForAll", calldata: nucleus.interface.encodeFunctionData("setApprovalForAll", [user1.address, true]) },
        "setBaseURI": { name: "setBaseURI", constructTransaction: async () => {
          let owner = await nucleus.owner()
          let wallet = undefined
          if(owner == owner1.address) wallet = owner1;
          else if(owner == owner2.address) wallet = owner2;
          else throw new Error("contract owner unknown")
          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("setBaseURI", ["https://..."]),
          }
        }},
        "setContractURI": { name: "setContractURI", constructTransaction: async () => {
          let owner = await nucleus.owner()
          let wallet = undefined
          if(owner == owner1.address) wallet = owner1;
          else if(owner == owner2.address) wallet = owner2;
          else throw new Error("contract owner unknown")
          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("setContractURI", ["https://..."]),
          }
        }},
        "setFlashLoanFeesForTokens": { name: "setFlashLoanFeesForTokens", constructTransaction: async () => {
          let owner = await nucleus.owner()
          let wallet = undefined
          if(owner == owner1.address) wallet = owner1;
          else if(owner == owner2.address) wallet = owner2;
          else throw new Error("contract owner unknown")
          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("setFlashLoanFeesForTokens", [[]]),
          }
        }},
        "setSwapFeesForPairs": { name: "setSwapFeesForPairs", constructTransaction: async () => {
          let owner = await nucleus.owner()
          let wallet = undefined
          if(owner == owner1.address) wallet = owner1;
          else if(owner == owner2.address) wallet = owner2;
          else throw new Error("contract owner unknown")
          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("setSwapFeesForPairs", [[]]),
          }
        }},
        "setWrappedGasToken": { name: "setWrappedGasToken", calldata: nucleus.interface.encodeFunctionData("setWrappedGasToken", [wgas.address]) },
        "tokenTransfer[0]": { name: "tokenTransfer[0]", wallet: user1, calldata: nucleus.interface.encodeFunctionData("tokenTransfer", [{
          token: poisonToken1.address,
          src: user1ExternalLocation,
          dst: user1InternalLocation,
          amount: 1
        }]) },
        "tokenTransfer[1]": { name: "tokenTransfer[1]", wallet: user1, calldata: nucleus.interface.encodeFunctionData("tokenTransfer", [{
          token: poisonToken1.address,
          src: user1InternalLocation,
          dst: user1ExternalLocation,
          amount: 1
        }]) },
        "tokenTransfer[2]": { name: "tokenTransfer[2]", wallet: user3, calldata: nucleus.interface.encodeFunctionData("tokenTransfer", [{
          token: poisonToken1.address,
          src: user3InternalLocation,
          dst: user2InternalLocation,
          amount: 1
        }]) },
        "tokenTransfer[3]": { name: "tokenTransfer[3]", wallet: user1, constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          let data = nucleus.interface.encodeFunctionData("tokenTransfer", [{
            token: token1.address,
            src: HydrogenNucleusHelper.internalAddressToLocation(addr),
            dst: HydrogenNucleusHelper.internalAddressToLocation(addr),
            amount: 0,
          }])
          return {
            "wallet": wallet,
            to: nucleus.address,
            data,
          }
        }},
        "tokenTransfer[4]": { name: "tokenTransfer[4]", wallet: user1, calldata: nucleus.interface.encodeFunctionData("tokenTransfer", [{
          token: token1.address,
          src: user1ExternalLocation,
          dst: user1InternalLocation,
          amount: 1
        }]) },
        "tokenTransferIn[0]": { name: "tokenTransferIn[0]", wallet: user1, calldata: nucleus.interface.encodeFunctionData("tokenTransferIn", [{
          token: token1.address,
          amount: 1
        }]) },
        "tokenTransferIn[1]": { name: "tokenTransferIn[1]", wallet: user1, calldata: nucleus.interface.encodeFunctionData("tokenTransferIn", [{
          token: poisonToken1.address,
          amount: 1
        }]) },
        "tokenTransferOut[0]": { name: "tokenTransferOut[0]", wallet: user1, calldata: nucleus.interface.encodeFunctionData("tokenTransferOut", [{
          token: token1.address,
          amount: 1
        }]) },
        "tokenTransferOut[1]": { name: "tokenTransferOut[1]", wallet: user1, calldata: nucleus.interface.encodeFunctionData("tokenTransferOut", [{
          token: poisonToken1.address,
          amount: 1
        }]) },
        "transferFrom[0]": { name: "transferFrom[0]", constructTransaction: async () => {
          let owner = await nucleus.ownerOf(3001);
          let wallet = undefined;
          let newOwner = user1;
          if(owner == owner1.address) wallet = owner1;
          else if(owner == owner2.address) wallet = owner2;
          else if(owner == user1.address) { wallet = user1; newOwner = user2; }
          else if(owner == user2.address) wallet = user2;
          else if(owner == user3.address) wallet = user3;
          else throw new Error("hpt owner unknown")
          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("transferFrom", [owner, newOwner.address, 3001])
          }
        }},
        "transferFrom[1]": { name: "transferFrom[1]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let poolID = await createGridOrderPoolFor(addr);
          let wallet = undefined
          let newOwner = user2;
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) { wallet = user2; newOwner = user1; }
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("transferFrom", [addr, newOwner.address, poolID])
          }
        }},
        "transferOwnership": { name: "transferOwnership", constructTransaction: async () => {
          let owner = await nucleus.owner()
          let wallet = undefined
          let newOwner = undefined
          if(owner == owner1.address) {
            wallet = owner1;
            newOwner = owner2;
          }
          else if(owner == owner2.address) {
            wallet = owner2;
            newOwner = owner1;
          }
          else throw new Error("contract owner unknown")
          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("transferOwnership", [newOwner.address]),
          }
        }},
        "unwrapGasToken[0]": { name: "unwrapGasToken[0]", "wallet": user1, calldata: nucleus.interface.encodeFunctionData("unwrapGasToken", [1, user1InternalLocation, user1ExternalLocation]) },
        "unwrapGasToken[1]": { name: "unwrapGasToken[1]", "wallet": user1, calldata: nucleus.interface.encodeFunctionData("unwrapGasToken", [1, user1InternalLocation, HydrogenNucleusHelper.externalAddressToLocation(poisonGasTokenReceiver.address)]) },
        "unwrapGasToken[2]": { name: "unwrapGasToken[2]", constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("unwrapGasToken", [0, HydrogenNucleusHelper.internalAddressToLocation(addr), user1ExternalLocation])
          }
        }},
        "updateGridOrderPool[0]": { name: "updateGridOrderPool[0]", "wallet": user1, calldata: nucleus.interface.encodeFunctionData("updateGridOrderPool", [{
          poolID: 2002,
          tokenSources: [{
            token: token1.address,
            location: user1ExternalLocation,
            amount: 1
          }],
          tradeRequests: [{
            tokenA: token1.address,
            tokenB: token2.address,
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(2,3),
            locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
          }]
        }]) },
        "updateGridOrderPool[1]": { name: "updateGridOrderPool[1]", "wallet": user1, calldata: nucleus.interface.encodeFunctionData("updateGridOrderPool", [{
          poolID: 2002,
          tokenSources: [{
            token: poisonToken1.address,
            location: user1ExternalLocation,
            amount: 1
          }],
          tradeRequests: [{
            tokenA: token1.address,
            tokenB: token2.address,
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(2,3),
            locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
          }]
        }]) },
        "updateGridOrderPool[2]": { name: "updateGridOrderPool[2]", "wallet": user1, constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let poolID = await createGridOrderPoolFor(addr);
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("updateGridOrderPool", [{
              poolID: poolID,
              tokenSources: [],
              tradeRequests: []
            }])
          }
        }},
        "updateLimitOrderPool[0]": { name: "updateLimitOrderPool", "wallet": user1, calldata: nucleus.interface.encodeFunctionData("updateLimitOrderPool", [{
          poolID: 1001,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(2,3),
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        }]) },
        "updateLimitOrderPool[1]": { name: "updateLimitOrderPool", "wallet": user1, constructTransactionFor: async (addr: string|undefined) => {
          if(!addr) addr = user1.address;
          let poolID = await createLimitOrderPoolFor(addr);
          let wallet = undefined
          if(addr == owner1.address) wallet = owner1;
          else if(addr == owner2.address) wallet = owner2;
          else if(addr == user1.address) wallet = user1;
          else if(addr == user2.address) wallet = user2;
          else if(addr == user3.address) wallet = user3;
          else if(addr == poisonERC721Receiver.address) wallet = poisonERC721Receiver;
          else if(addr == poisonFlashSwapCallee.address) wallet = poisonFlashSwapCallee;

          return {
            "wallet": wallet,
            to: nucleus.address,
            data: nucleus.interface.encodeFunctionData("updateLimitOrderPool", [{
              poolID: poolID,
              exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(2,3),
              locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
            }])
          }
        }},
        "wrapGasToken": { name: "wrapGasToken", calldata: nucleus.interface.encodeFunctionData("wrapGasToken", [user1InternalLocation]) },
        "receive": { name: "receive", calldata: "0x" },
        //"": { name: "", calldata: nucleus.interface.encodeFunctionData("", []) },
      }
    });

    after("mint tokens and create pools", async function () {
      await token1.mint(user1.address, WeiPerEther.mul(10_000));
      await token2.mint(user1.address, WeiPerEther.mul(10_000));
      await token3.mint(user1.address, WeiPerEther.mul(10_000));
      await poisonToken1.mint(user1.address, WeiPerEther.mul(10_000));
      await poisonToken1.mint(user3.address, WeiPerEther.mul(10_000));
      await poisonTokenA.mint(user1.address, WeiPerEther.mul(10_000));
      await poisonTokenB.mint(user1.address, WeiPerEther.mul(10_000));
      await poisonTokenC.mint(user1.address, WeiPerEther.mul(10_000));
      await token1.connect(user1).approve(nucleus.address, MaxUint256);
      await token2.connect(user1).approve(nucleus.address, MaxUint256);
      await token3.connect(user1).approve(nucleus.address, MaxUint256);
      await poisonToken1.connect(user1).approve(nucleus.address, MaxUint256);
      await poisonToken1.connect(user3).approve(nucleus.address, MaxUint256);
      await poisonTokenA.connect(user1).approve(nucleus.address, MaxUint256);
      await poisonTokenB.connect(user1).approve(nucleus.address, MaxUint256);
      await poisonTokenC.connect(user1).approve(nucleus.address, MaxUint256);

      // initial balances
      await nucleus.connect(user1).wrapGasToken(user1InternalLocation, {value: WeiPerEther});
      await nucleus.connect(user1).tokenTransfer({
        token: poisonToken1.address,
        amount: WeiPerEther,
        src: user1ExternalLocation,
        dst: user1InternalLocation,
      });
      await nucleus.connect(user3).tokenTransfer({
        token: poisonToken1.address,
        amount: WeiPerEther,
        src: user3ExternalLocation,
        dst: user3InternalLocation,
      });
      await nucleus.connect(user1).tokenTransfer({
        token: poisonTokenA.address,
        amount: WeiPerEther,
        src: user1ExternalLocation,
        dst: user1InternalLocation,
      });
      await nucleus.connect(user1).tokenTransfer({
        token: poisonTokenB.address,
        amount: WeiPerEther,
        src: user1ExternalLocation,
        dst: user1InternalLocation,
      });
      await nucleus.connect(user1).tokenTransfer({
        token: poisonTokenC.address,
        amount: WeiPerEther,
        src: user1ExternalLocation,
        dst: user1InternalLocation,
      });

      // 1001
      await nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        locationA: user1ExternalLocation,
        locationB: user1ExternalLocation,
        amountA: WeiPerEther,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 2),
        hptReceiver: user1.address
      });

      // 2002
      await nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: token1.address,
          location: user1ExternalLocation,
          amount: WeiPerEther
        }],
        tradeRequests: [{
          tokenA: token1.address,
          tokenB: token2.address,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(100, 201)
        },{
          tokenA: token2.address,
          tokenB: token1.address,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(200, 101)
        }],
        hptReceiver: user1.address
      });

      // 3001
      await nucleus.connect(user1).createLimitOrderPool({
        tokenA: poisonToken1.address,
        tokenB: token1.address,
        locationA: user1ExternalLocation,
        locationB: user1ExternalLocation,
        amountA: WeiPerEther,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        hptReceiver: user1.address
      });

      // 4001
      await nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: poisonToken1.address,
        locationA: user1ExternalLocation,
        locationB: user1ExternalLocation,
        amountA: WeiPerEther,
        exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
        hptReceiver: user1.address
      });

      // 5002
      await nucleus.connect(user1).createGridOrderPool({
        tokenSources: [{
          token: poisonToken1.address,
          location: user1ExternalLocation,
          amount: WeiPerEther
        },{
          token: token1.address,
          location: user1ExternalLocation,
          amount: WeiPerEther
        }],
        tradeRequests: [{
          tokenA: poisonToken1.address,
          tokenB: token1.address,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
        },{
          tokenA: token1.address,
          tokenB: poisonToken1.address,
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1)
        }],
        hptReceiver: user1.address
      });

      await nucleus.connect(owner1).transferOwnership(owner2.address);
    });
  });

  async function makeCall(name:string, sender?:string|undefined) {
  //async function makeCall(func:any) {
    let func = functionsByName[name];
    if(!func) throw new Error('undefined')
    if(func.calldata) {
      let wallet = func.wallet || owner1;
      return {
        wallet: wallet,
        to: nucleus.address,
        data: func.calldata
      }
    }
    try {
      if(!sender) sender = user1.address;
      let { wallet, to, data } = await func.constructTransactionFor(sender)
      return { wallet, to, data }
    } catch(e) {}
    try {
      let { wallet, to, data } = await func.constructTransaction()
      return { wallet, to, data }
    } catch(e) {}
    throw new Error("failed to makeCall()")
  }

  describe("normal operation", function () {
    it("should start in enterable state", async function () {
      expect(await nucleus.reentrancyGuardState()).eq(1);
    });
    //for(const name of allNormalOperationFunctionKeys) {
    for(const func of functionsList.filter(func => !func.canOnlyBeCalledOnce)) {
      it(`should be able to call ${func.name}()`, async function () {
        let { wallet, to, data } = await makeCall(func.name)
        let call = wallet.sendTransaction({to, data});
        await expect(call).to.not.be.reverted;
        let tx = await call;
        expect(await nucleus.reentrancyGuardState()).eq(1); // return to enterable
        l1DataFeeAnalyzer.register(func.name, tx);
      })
    }
  });

  describe("reentrancy via erc20", function () {
    // for all functions that trigger reentrancy from erc20
    for(const triggerFunc of functionsList.filter(func => !!func.hasExternalCallToERC20 && !!func.externalCallToERC20CanBePoisoned)) {
      context(`triggered by ${triggerFunc.name}`, function () {
        // for all functions protected from entering with RG
        for(const reenterFunc of functionsList.filter(func => !!func.hasReentrancyGuard)) {
          it(`should not be able to reenter ${reenterFunc.name}() from ${triggerFunc.name}()`, async function () {
            let innerCall = await makeCall(reenterFunc.name)
            await poisonToken1.setHookCall(innerCall.to, innerCall.data);
            await poisonTokenA.setHookCall(innerCall.to, innerCall.data);
            await poisonTokenB.setHookCall(innerCall.to, innerCall.data);
            await poisonTokenC.setHookCall(innerCall.to, innerCall.data);
            let { wallet, to, data } = await makeCall(triggerFunc.name)
            await expect(wallet.sendTransaction({to, data})).to.be.reverted //WithCustomError(nucleus, "HydrogenReentrancyGuard"); // most, not all
            expect(await nucleus.reentrancyGuardState()).eq(1); // return to enterable
          })
        }
        // for all functions not protected from entering with RG
        for(const reenterFunc of functionsList.filter(func => !func.hasReentrancyGuard)) {
          it(`should be able to reenter ${reenterFunc.name}() from ${triggerFunc.name}()`, async function () {
            let innerCall = await makeCall(reenterFunc.name)
            await poisonToken1.setHookCall(innerCall.to, innerCall.data);
            await poisonTokenA.setHookCall(innerCall.to, innerCall.data);
            await poisonTokenB.setHookCall(innerCall.to, innerCall.data);
            await poisonTokenC.setHookCall(innerCall.to, innerCall.data);
            let { wallet, to, data } = await makeCall(triggerFunc.name)
            let call = wallet.sendTransaction({to, data});
            await expect(call).to.not.be.reverted;
            let tx = await call;
            expect(await nucleus.reentrancyGuardState()).eq(1); // return to enterable
            l1DataFeeAnalyzer.register(triggerFunc.name, tx);
          })
        }
      })
    }
    after("unpoison", async function () {
      await poisonToken1.setHookCall(AddressZero, "0x");
      await poisonTokenA.setHookCall(AddressZero, "0x");
      await poisonTokenB.setHookCall(AddressZero, "0x");
      await poisonTokenC.setHookCall(AddressZero, "0x");
    });
  });

  describe("reentrancy via gas token", function () {
    // for all functions that trigger reentrancy from transferring the gas token
    for(const triggerFunc of functionsList.filter(func => !!func.hasTransferGasTokenOut && !!func.externalCallToGasTokenCanBePoisoned)) {
      context(`triggered by ${triggerFunc.name}`, function () {
        // for all functions protected from entering with RG
        for(const reenterFunc of functionsList.filter(func => !!func.hasReentrancyGuard)) {
          it(`should not be able to reenter ${reenterFunc.name}() from ${triggerFunc.name}()`, async function () {
            let innerCall = await makeCall(reenterFunc.name)
            await poisonGasTokenReceiver.setHookCall(innerCall.to, innerCall.data);
            let { wallet, to, data } = await makeCall(triggerFunc.name)
            await expect(wallet.sendTransaction({to, data})).to.be.reverted //WithCustomError(nucleus, "HydrogenReentrancyGuard"); // most, not all
            expect(await nucleus.reentrancyGuardState()).eq(1); // return to enterable
          })
        }
        // for all functions not protected from entering with RG
        for(const reenterFunc of functionsList.filter(func => !func.hasReentrancyGuard)) {
          it(`should be able to reenter ${reenterFunc.name}() from ${triggerFunc.name}()`, async function () {
            let innerCall = await makeCall(reenterFunc.name)
            await poisonGasTokenReceiver.setHookCall(innerCall.to, innerCall.data);
            let { wallet, to, data } = await makeCall(triggerFunc.name)
            let call = wallet.sendTransaction({to, data});
            await expect(call).to.not.be.reverted;
            let tx = await call;
            expect(await nucleus.reentrancyGuardState()).eq(1); // return to enterable
            l1DataFeeAnalyzer.register(triggerFunc.name, tx);
          })
        }
      });
    }
    after("unpoison", async function () {
      await poisonGasTokenReceiver.setHookCall(AddressZero, "0x");
    });
  });

  describe("reentrancy via flash", function () {
    // flash loan, flash swap, and safeTransferFrom
    // may make an external call to another contract that is allowed to reenter by design

    // for all flash functions
    for(const triggerFunc of functionsList.filter(func => !!func.hasFlashCallOut && !!func.flashCallOutReenters)) {
      context(`triggered by ${triggerFunc.name}`, function () {
        // allowed to reenter into any function. access control still applies
        for(const reenterFunc of functionsList.filter(func => !!func.canBeFlashInnerCall)) {
          it(`should be able to reenter ${reenterFunc.name}() from ${triggerFunc.name}()`, async function () {
            // setup based on type
            if(triggerFunc.name.includes("safeTransferFrom")) {
              let flashCallRecipient = poisonERC721Receiver.address;
              let innerCall = await makeCall(reenterFunc.name, flashCallRecipient);
              await poisonERC721Receiver.setHookCall(innerCall.to, innerCall.data);
            }
            if(triggerFunc.name.includes("executeFlashSwap")) {
              let flashCallRecipient = poisonFlashSwapCallee.address;
              let innerCall = await makeCall(reenterFunc.name, flashCallRecipient);
              await poisonFlashSwapCallee.setHookCall(innerCall.to, innerCall.data);
            }
            if(triggerFunc.name.includes("flashLoan")) {
              let flashCallRecipient = poisonFlashLoanBorrower.address;
              let innerCall = await makeCall(reenterFunc.name, flashCallRecipient);
              await poisonFlashLoanBorrower.setHookCall(innerCall.to, innerCall.data);
            }
            // make outer call
            let { wallet, to, data } = await makeCall(triggerFunc.name)
            let call = wallet.sendTransaction({to, data});
            await expect(call).to.not.be.reverted;
            let tx = await call;
            expect(await nucleus.reentrancyGuardState()).eq(1); // return to enterable
            l1DataFeeAnalyzer.register(triggerFunc.name, tx);
          })
        }
      });
    }

    describe("L1 gas fees", function () {
      it("calculate", async function () {
        l1DataFeeAnalyzer.analyze()
      });
    });

  });

  async function createLimitOrderPoolFor(addr: string) {
    // create new limit order pool
    await nucleus.connect(user1).createLimitOrderPool({
      tokenA: token1.address,
      tokenB: token2.address,
      locationA: user1ExternalLocation,
      locationB: user1ExternalLocation,
      amountA: 1,
      exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
      hptReceiver: addr
    })
    let ts = (await nucleus.totalSupply()).toNumber();
    let poolID = ts * 1000 + 1;
    return poolID;
  }

  async function createGridOrderPoolFor(addr: string) {
    // create new grid order pool
    await nucleus.connect(user1).createGridOrderPool({
      tokenSources: [],
      tradeRequests: [],
      hptReceiver: addr
    })
    let ts = (await nucleus.totalSupply()).toNumber();
    let poolID = ts * 1000 + 2;
    return poolID;
  }

});
