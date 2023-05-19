import { BigNumber as BN, BigNumberish, BytesLike } from "ethers";
import { ethers } from "hardhat";
import { HydrogenNucleus, MockERC20 } from "../../typechain-types";
import { toBytes32 } from "../utilities/setStorage";
import { decimalsToAmount } from "../utils/price";
import { rightPad } from "./strings";

const { getAddress } = ethers.utils;
const MaxUint128 = BN.from(2).pow(128).sub(1);

const ABI_ERC20_MIN = [{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}];

export default class HydrogenNucleusHelper {
  nucleus: HydrogenNucleus;
  chainID: number;
  eventCache: any;

  constructor(nucleus:HydrogenNucleus, chainID: number) {
    this.nucleus = nucleus;
    this.chainID = chainID;
    this.eventCache = {};
  }

  static externalAddressToLocation(address: string) {
    let addr = address.substring(2).toLowerCase();
    while(addr.length < 62) addr = `0${addr}`;
    addr = `0x01${addr}`;
    return addr;
  }

  static internalAddressToLocation(address: string) {
    let addr = address.substring(2).toLowerCase();
    while(addr.length < 62) addr = `0${addr}`;
    addr = `0x02${addr}`;
    return addr;
  }

  static poolIDtoLocation(poolID: BigNumberish) {
    let num = BN.from(poolID).toHexString();
    num = num.substring(2);
    while(num.length < 62) num = `0${num}`;
    num = `0x03${num}`;
    return num;
  }

  static locationToString(loc: string) {
    if(loc.length != 66) return `invalid location ${loc}`;
    if(loc.substring(0,4) === "0x01") {
      if(loc.substring(4, 26) != "0000000000000000000000") return `invalid location ${loc}`;
      let addr = getAddress(`0x${loc.substring(26,66)}`);
      return `${addr} external balance`;
    } else if(loc.substring(0,4) === "0x02") {
      if(loc.substring(4, 26) != "0000000000000000000000") return `invalid location ${loc}`;
      let addr = getAddress(`0x${loc.substring(26,66)}`);
      return `${addr} internal balance`;
    } else if(loc.substring(0,4) === "0x03") {
      let poolID = BN.from(`0x${loc.substring(4,66)}`);
      return `poolID ${poolID}`;
    } else return `invalid location ${loc}`;
  }

  static encodeExchangeRate(exchangeRateX1: BigNumberish, exchangeRateX2: BigNumberish) {
    let x1 = BN.from(exchangeRateX1);
    let x2 = BN.from(exchangeRateX2);
    if(x1.gt(MaxUint128) || x2.gt(MaxUint128)) throw(`HydrogenNucleusHelper: cannot encode exchange rate. Received ${x1.toString()}, ${x2.toString()}. Max ${MaxUint128.toString()}`);
    let exchangeRate = toBytes32(x1.shl(128).add(x2));
    return exchangeRate;
  }

  static exchangeRateIsNonzero(exchangeRate: BytesLike) {
    // decode exchange rate
    let er = BN.from(exchangeRate);
    let x1 = er.shr(128);
    let x2 = er.and(MaxUint128);
    if(x1.lte(0) || x2.lte(0)) return false;
    return true;
  }

  static decodeExchangeRate(exchangeRate: BytesLike) {
    // decode exchange rate
    let er = BN.from(exchangeRate);
    let x1 = er.shr(128);
    let x2 = er.and(MaxUint128);
    return [x1, x2];
  }

  static calculateAmountA(amountB: BigNumberish, exchangeRate: BytesLike) {
    // decode exchange rate
    let er = BN.from(exchangeRate);
    let x1 = er.shr(128);
    let x2 = er.and(MaxUint128);
    if(x1.lte(0) || x2.lte(0)) throw("HydrogenNucleusHelper: pool cannot exchange these tokens");
    // amountA = floor( (amountB * x1) / x2 )
    let amtB = BN.from(amountB);
    let amountA = amtB.mul(x1).div(x2);
    return amountA;
  }

  static calculateAmountB(amountA: BigNumberish, exchangeRate: BytesLike) {
    // decode exchange rate
    let er = BN.from(exchangeRate);
    let x1 = er.shr(128);
    let x2 = er.and(MaxUint128);
    if(x1.lte(0) || x2.lte(0)) throw("HydrogenNucleusHelper: pool cannot exchange these tokens");
    // amountB = ceil( (amountA * x2) / x1 )
    let amtA = BN.from(amountA);
    let numerator = amtA.mul(x2);
    let amountB = numerator.div(x1);
    if(numerator.mod(x1).gt(0)) amountB = amountB.add(1);
    return amountB;
  }

  static async logPools(nucleus:any) {
    let poolCount = (await nucleus.totalSupply()).toNumber();
    console.log(`There are ${poolCount} pools`);
    for(let i = 0; i < poolCount; ++i) {
      console.log(`\nindex            : ${i}`);
      let poolID = (await nucleus.tokenByIndex(i)).toNumber();
      let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
      console.log(`poolID           : ${poolID}`);
      let owner = await nucleus.ownerOf(poolID);
      console.log(`Owner            : ${owner}`);
      if(poolID % 1000 == 1) {
        console.log("Pool type        : LimitOrderPool");
        let pool = await nucleus.getLimitOrderPool(poolID);
        //console.log(pool);
        let tokenA = await ethers.getContractAt(ABI_ERC20_MIN, pool.tokenA) as MockERC20;
        let symA = await tokenA.symbol();
        let decA = await tokenA.decimals();
        let tokenB = await ethers.getContractAt(ABI_ERC20_MIN, pool.tokenB) as MockERC20;
        let symB = await tokenB.symbol();
        let decB = await tokenB.decimals();
        //let amountA = await nucleus.getTokenBalance(pool.tokenA, poolLocation);
        let amountA = pool.amountA;
        let amountAStr = ethers.utils.formatUnits(amountA, decA);
        if(HydrogenNucleusHelper.exchangeRateIsNonzero(pool.exchangeRate)) {
          let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, pool.exchangeRate);
          let amountBStr = ethers.utils.formatUnits(amountB, decB);
          //console.log(`TradeRequest     : ${amountAStr} ${symA} for ${amountBStr} ${symB}`);
          console.log(`Token A          : ${amountAStr} ${symA}`);
          console.log(`Token B          : ${amountBStr} ${symB}`);
          let [x1,x2] = HydrogenNucleusHelper.decodeExchangeRate(pool.exchangeRate);
          let amountAperB = x1.mul(decimalsToAmount(decB)).div(x2);
          let amountAperBstr = ethers.utils.formatUnits(amountAperB, decA);
          let amountBperA = x2.mul(decimalsToAmount(decA)).div(x1);
          let amountBperAstr = ethers.utils.formatUnits(amountBperA, decB);
          console.log(`Exchange Rate AB : ${amountAperBstr} ${symA}/${symB}`);
          console.log(`Exchange Rate BA : ${amountBperAstr} ${symB}/${symA}`);
        } else {
          //console.log(`TradeRequest     : ${amountAStr} ${symA} for ${symB} but trading is disabled`);
          console.log(`Token A          : ${amountAStr} ${symA}`);
          console.log(`Token B          : ${symB}`);
          console.log(`Status           : disabled`);
        }

      } else if(poolID % 1000 == 2) {
        console.log("Pool type        : GridOrderPool");
        //let tokenAddresses = await nucleus.getGridOrderTokens(poolID);
        //let tradeRequests = await nucleus.getGridOrderTradeRequests(poolID);
        let pool = await nucleus.getGridOrderPool(poolID);
        let tokenAddresses = pool.tokens;
        let tradeRequests = pool.tradeRequests;
        const MAX_TOKEN_CUTOFF = 3;
        let tokenMap:any = {};
        console.log(`Token count      : ${tokenAddresses.length}`);
        if(tokenAddresses.length <= MAX_TOKEN_CUTOFF) {
          for(let i = 0; i < tokenAddresses.length; ++i) {
            let tokenAddress = tokenAddresses[i];
            let token = await ethers.getContractAt(ABI_ERC20_MIN, tokenAddress) as MockERC20;
            let sym = await token.symbol();
            let dec = await token.decimals();
            let amount = await nucleus.getTokenBalance(tokenAddress, poolLocation);
            let amountStr = ethers.utils.formatUnits(amount, dec);
            console.log(`Token ${rightPad(i+1, 11)}: ${amountStr} ${sym}`);
            tokenMap[tokenAddress] = {
              symbol: sym,
              decimals: dec,
              balance: pool.balances[i]
            }
          }
        }
        console.log(`Trade requests   : ${tradeRequests.length}`);
        if(tokenAddresses.length <= MAX_TOKEN_CUTOFF) {
          for(let i = 0; i < tradeRequests.length; ++i) {
            console.log(`Trade request ${i+1}`);
            let tradeRequest = pool.tradeRequests[i];
            let symA = tokenMap[tradeRequest.tokenA].symbol;
            let decA = tokenMap[tradeRequest.tokenA].decimals;
            let symB = tokenMap[tradeRequest.tokenB].symbol;
            let decB = tokenMap[tradeRequest.tokenB].decimals;
            let exchangeRate = tradeRequest.exchangeRate;
            let amountA = tokenMap[tradeRequest.tokenA].balance;
            let amountAStr = ethers.utils.formatUnits(amountA, decA);
            if(HydrogenNucleusHelper.exchangeRateIsNonzero(exchangeRate)) {
              let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, exchangeRate);
              let amountBStr = ethers.utils.formatUnits(amountB, decB);
              console.log(`Token A          : ${amountAStr} ${symA}`);
              console.log(`Token B          : ${amountBStr} ${symB}`);
              let [x1,x2] = HydrogenNucleusHelper.decodeExchangeRate(exchangeRate);
              let amountAperB = x1.mul(decimalsToAmount(decB)).div(x2);
              let amountAperBstr = ethers.utils.formatUnits(amountAperB, decA);
              let amountBperA = x2.mul(decimalsToAmount(decA)).div(x1);
              let amountBperAstr = ethers.utils.formatUnits(amountBperA, decB);
              console.log(`Exchange Rate AB : ${amountAperBstr} ${symA}/${symB}`);
              console.log(`Exchange Rate BA : ${amountBperAstr} ${symB}/${symA}`);
            } else {
              //console.log(`TradeRequest     : ${amountAStr} ${symA} for ${symB} but trading is disabled`);
              console.log(`Token A          : ${amountAStr} ${symA}`);
              console.log(`Token B          : ${symB}`);
              console.log(`Status           : disabled`);
            }
          }
        }
      } else throw("unknown pool type")
    }
  }
}
