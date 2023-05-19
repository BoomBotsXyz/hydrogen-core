import { BigNumber as BN, BigNumberish, BytesLike } from "ethers";
import { ethers } from "hardhat";
import { HydrogenNucleus, MockERC20 } from "../../typechain-types";
import { toBytes32 } from "../utilities/setStorage";
import { decimalsToAmount } from "../utils/price";
import { formatTimestamp, rightPad } from "./strings";

import "./HydrogenNucleusHelper";
import { fetchEvents, findDeployBlock } from "./network";
import { deduplicateArray } from "./misc";
import HydrogenNucleusHelper from "./HydrogenNucleusHelper";

const { AddressZero } = ethers.constants;
const { formatUnits } = ethers.utils;

const MaxUint128 = BN.from(2).pow(128).sub(1);

const ABI_ERC20_MIN = [{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}];

export default class HydrogenNucleusEventLogger {
  nucleus: HydrogenNucleus;
  provider: any;
  chainID: number;
  eventCache: any;
  eventFilter: any;
  blockTimestamps: any;

  constructor(nucleus:HydrogenNucleus, provider: any, chainID: number) {
    this.nucleus = nucleus;
    this.provider = provider;
    this.chainID = chainID;
    this.eventCache = {
      deployBlock: -1,
      lastScannedBlock: -1,
      events: []
    };
    this.eventFilter = {
      address: nucleus.address,
      topics: []
    }
    this.blockTimestamps = {} as any;
  }

  async logEvents() {
    // if initial state was not already fetched
    if(this.eventCache.deployBlock == -1) {
      return "need to fetchEvents()";
    }
    let tokenMap = {} as any
    async function _getToken(address:string) {
      if(tokenMap.hasOwnProperty(address)) return tokenMap[address];
      let token = await ethers.getContractAt(ABI_ERC20_MIN, address) as MockErc20;
      try {
        let symbol = await token.symbol();
        let decimals = await token.decimals();
        let res = {symbol, decimals};
        tokenMap[address] = res;
        return res;
      } catch(e) {
        let symbol = `token(${address})`;
        let decimals = 0;
        let res = {symbol, decimals};
        tokenMap[address] = res;
        return res;
      }
    }

    let transactionCount = 0;
    let latestBlockNumber = 0;
    let latestTxHash = "";
    let s = "";
    for(let i = 0; i < this.eventCache.events.length; i++) {
      // meta
      let event = this.eventCache.events[i];
      if(event.blockNumber > latestBlockNumber) {
        latestBlockNumber = event.blockNumber;
        s = `${s}\n\n${formatTimestamp(this.blockTimestamps[event.blockNumber])} UTC\nBlock ${event.blockNumber}`;
      }
      if(event.transactionHash != latestTxHash) {
        latestTxHash = event.transactionHash;
        s = `${s}\n\nTransaction ${event.transactionHash}`;
        if(transactionCount === 0) {
          s = `${s}\n  HydrogenNucleus deployed at ${this.nucleus.address}`;
        }
        transactionCount++;
      }
      // parse event
      if(event.event === "OwnershipTransferred") {
        s = `${s}\n  Contract ownership transferred to ${event.args.newOwner}`;
      } else if(event.event === "TokensTransferred") {
        s = `${s}\n  Transferred ${await _stringifyTokenAndAmount(event.args.token, event.args.amount)} from ${HydrogenNucleusHelper.locationToString(event.args.from)} to ${HydrogenNucleusHelper.locationToString(event.args.to)}`;
      } else if(event.event === "PoolCreated") {
        s = `${s}\n  Pool ${event.args.poolID} created`;
      } else if(event.event === "Transfer") {
        if(event.args.from === AddressZero) {
          s = `${s}\n  HPT ${event.args.tokenId} created and minted to ${event.args.to}`;
        } else {
          s = `${s}\n  HPT ${event.args.tokenId} transferred from ${event.args.from} to ${event.args.to}`;
        }
      } else if(event.event === "TradeRequestUpdated") {
        let tokenA = await _getToken(event.args.tokenA);
        let tokenB = await _getToken(event.args.tokenB);
        //let amountA = await this.nucleus.getTokenBalance(event.args.tokenA, HydrogenNucleusHelper.poolIDtoLocation(event.args.poolID));
        //let amountAStr = formatUnits(amountA, tokenA.decimals);
        if(HydrogenNucleusHelper.exchangeRateIsNonzero(event.args.exchangeRate)) {
          //let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, event.args.exchangeRate);
          //let amountBStr = formatUnits(amountB, tokenB.decimals);
          let [x1,x2] = HydrogenNucleusHelper.decodeExchangeRate(event.args.exchangeRate);
          let amountAperB = x1.mul(decimalsToAmount(tokenB.decimals)).div(x2);
          let amountAperBstr = formatUnits(amountAperB, tokenA.decimals);
          let amountBperA = x2.mul(decimalsToAmount(tokenA.decimals)).div(x1);
          let amountBperAstr = formatUnits(amountBperA, tokenB.decimals);
          //s = `${s}\n  Trade request updated. PoolID = ${event.args.poolID}, tokenA = ${amountAStr} ${tokenA.symbol}, tokenB = ${amountBStr} ${tokenB.symbol}, exchangeRate = ${amountAperBstr} ${tokenA.symbol}/${tokenB.symbol} = ${amountBperAstr} ${tokenB.symbol}/${tokenA.symbol}`
          s = `${s}\n  Trade request updated. PoolID = ${event.args.poolID}, tokenA = ${tokenA.symbol}, tokenB = ${tokenB.symbol}, exchangeRate = ${amountAperBstr} ${tokenA.symbol}/${tokenB.symbol} = ${amountBperAstr} ${tokenB.symbol}/${tokenA.symbol}`
        } else {
          s = `${s}\n  Trade request updated. PoolID = ${event.args.poolID}, tokenA = ${tokenA.symbol}, tokenB = ${tokenB.symbol}, swaps disabled`;
        }
      } else if(event.event === "Approval") {
        s = `${s}\n  HPT ${event.args.tokenId} approved for use by ${event.args.approved}`;
      } else if(event.event === "ApprovalForAll") {
        if(event.args.approved) {
          s = `${s}\n  User ${event.args.owner} approved all HPTs to ${event.args.operator}`;
        } else {
          s = `${s}\n  User ${event.args.owner} revoked allowance of HPTs to ${event.args.operator}`;
        }
      } else if(event.event === "MarketOrderExecuted") {
        let tokenA = await _getToken(event.args.tokenA);
        let tokenB = await _getToken(event.args.tokenB);
        let amountAMMStr = formatUnits(event.args.amountAFromPool, tokenA.decimals);
        let amountAMTStr = formatUnits(event.args.amountAToMarketTaker, tokenA.decimals);
        let amountAFr = event.args.amountAFromPool.sub(event.args.amountAToMarketTaker);
        let amountAFRStr = formatUnits(amountAFr, tokenA.decimals);
        let amountBStr = formatUnits(event.args.amountBToPool, tokenB.decimals);
        s = `${s}\n  Market order executed. Market maker swapped ${amountAMMStr} ${tokenA.symbol} for ${amountBStr} ${tokenB.symbol}. Market taker swapped ${amountBStr} ${tokenB.symbol} for ${amountAMTStr} ${tokenA.symbol}.${amountAFr.eq(0) ? "" : ` Fees generated: ${amountAFRStr} ${tokenA.symbol}`}`;
      } else if(event.event === "SwapFeeSetForPair") {
        let tokenA = await _getToken(event.args.tokenA);
        let tokenB = await _getToken(event.args.tokenB);
        s = `${s}\n  SwapFeeSetForPair ${tokenA.symbol}->${tokenB.symbol} ${event.args.feePPM} PPM`;
      } else {
        s = `${s}\n  Unknown event ${event.event}`;
      }
    }

    async function _stringifyTokenAndAmount(tokenAddress:string, amount:BigNumberish) {
      let token = await ethers.getContractAt(ABI_ERC20_MIN, tokenAddress) as MockERC20;
      let sym = await token.symbol();
      let dec = await token.decimals();
      let amountStr = formatUnits(amount, dec);
      return `${amountStr} ${sym}`;
    }

    return s;
  }

  async fetchEvents() {
    await this.getInitialState();
    await this.scanForEvents();
  }

  async fetchAndLogEvents() {
    await this.fetchEvents();
    console.log(await this.logEvents());
  }

  async getInitialState() {
    // if initial state was not already fetched
    if(this.eventCache.deployBlock == -1) {
      // if not on local testnet, try reading from file
      if(this.chainID != 31337) {

      }
      // if wasn't on file, search on chain
      if(this.eventCache.lastScannedBlock == -1) {
        this.eventCache.deployBlock = await findDeployBlock(this.provider, this.nucleus.address);
        this.eventCache.lastScannedBlock = this.eventCache.deployBlock - 1;
      }
    }
  }

  async scanForEvents() {
    await this.getInitialState();
    let latestBlockNumber = await this.provider.getBlockNumber();
    if(latestBlockNumber <= this.eventCache.lastScannedBlock) return;
    let newEvents = await fetchEvents(this.nucleus, this.eventFilter, this.eventCache.lastScannedBlock+1, latestBlockNumber) as any[];
    let newBlockNumbers = deduplicateArray(newEvents.map(event => event.blockNumber));
    let timestamps = await Promise.all(newBlockNumbers.map(num => this.provider.getBlock(num).then((block:any) => block.timestamp)))
    newBlockNumbers.forEach((blockNum:any, i:number) => this.blockTimestamps[blockNum] = timestamps[i]);
    this.eventCache.events.push(...newEvents);
    this.eventCache.lastScannedBlock = latestBlockNumber;
  }

  saveEvents() {
    // if not on local testnet
    if(this.chainID != 31337) {

    }
  }
}
