import hre from "hardhat";
const { ethers } = hre;
const { provider, deployContract } = ethers;
import { BigNumber as BN, BigNumberish } from "ethers";
const formatUnits = ethers.utils.formatUnits;

import { withBackoffRetries } from "./misc";

const { AddressZero, WeiPerEther, MaxUint256, Zero } = ethers.constants;
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"

// returns the balance of a holder for a list of tokens
// result is an array
// each element will be a decimal formatted string eg [ "1.2" ]
async function fetchBalances(tokenList: any, holder: any, blockTag: any) {
  function createBalancePromise(i: any) {
    return new Promise((resolve, reject) => {
      withBackoffRetries(() => ((tokenList[i].address == ETH_ADDRESS)
        ? provider.getBalance(holder, blockTag=blockTag)
        : tokenList[i].contract.balanceOf(holder, {blockTag:blockTag})
      )).then((bal:any) => { resolve(formatUnits(bal as BigNumberish, tokenList[i].decimals)) }).catch(() => { resolve("0.0") })
    })
  }
  var promises = []
  for(var i = 0; i < tokenList.length; ++i) {
    promises.push(createBalancePromise(i))
  }
  return Promise.all(promises)
}
exports.fetchBalances = fetchBalances

// fetch the total supply of a token
// if the token does not exist returns 0
async function fetchSupplyOrZero(token: any, blockTag: any) {
  return new Promise((resolve, reject) => {
    withBackoffRetries(() => token.totalSupply({blockTag:blockTag})).then(resolve).catch(()=>{resolve(Zero)})
  })
}
exports.fetchSupplyOrZero = fetchSupplyOrZero

// fetch the token balance of a holder
// if the token does not exist returns 0
async function fetchBalanceOrZero(token: any, holder: any, blockTag: any) {
  return new Promise((resolve, reject) => {
    withBackoffRetries(() => token.balanceOf(holder, {blockTag:blockTag})).then(resolve).catch(()=>{resolve(Zero)})
  })
}
exports.fetchBalanceOrZero = fetchBalanceOrZero

// fetch the reserves of a uniswap v2 pair (and forks)
// if the pool does not exist returns 0
export async function fetchReservesOrZero(pair: any, blockTag='latest') {
  return new Promise((resolve, reject) => {
    withBackoffRetries(() => pair.getReserves({blockTag:blockTag})).then(resolve).catch(()=>{resolve({_reserve0:Zero,_reserve1:Zero})})
  })
}
exports.fetchReservesOrZero = fetchReservesOrZero

// fetch the price of a token in a uniswap v2 pool
export async function fetchUniswapV2PriceOrZero(pair: any, oneZero: any, decimals0: any, decimals1: any, blockTag='latest') {
  return new Promise((resolve, reject) => {
    withBackoffRetries(() => pair.getReserves({blockTag:blockTag})).then((reserves: any) => {
      resolve(calculateUniswapV2PriceOrZero(reserves._reserve0, reserves._reserve1, oneZero, decimals0, decimals1))
    }).catch(()=>{resolve(0.0)})
  })
}
exports.fetchUniswapV2PriceOrZero = fetchUniswapV2PriceOrZero

// given uniswap v2 pool reserves, calculates the price of a token
export function calculateUniswapV2PriceOrZero(reserve0: any, reserve1: any, oneZero: any, decimals0: any, decimals1: any) {
  if(reserve0.eq(0) || reserve1.eq(0)) return 0.0
  else {
    var amt0 = parseFloat(formatUnits(reserve0, decimals0))
    var amt1 = parseFloat(formatUnits(reserve1, decimals1))
    // oneZero == true -> price of token 1 in terms of token 0
    var price = oneZero ? amt0/amt1 : amt1/amt0
    return price
  }
}
exports.calculateUniswapV2PriceOrZero = calculateUniswapV2PriceOrZero

const ONE_ETHER = BN.from("1000000000000000000")
const x192 = BN.from("0x01000000000000000000000000000000000000000000000000")

// fetch the price of a token in a uniswap v3 pool
async function fetchUniswapV3PriceOrZero(pool: any, oneZero: any, decimals0: any, decimals1: any, blockTag="latest") {
  return new Promise((resolve, reject) => {
    withBackoffRetries(() => pool.slot0({blockTag:blockTag})).then((slot0: any) => {
      var price = parseFloat(formatUnits(
        slot0.sqrtPriceX96.mul(slot0.sqrtPriceX96)
        .mul(ONE_ETHER)
        .mul(decimalsToAmount(decimals0))
        .div(decimalsToAmount(decimals1))
        .div(x192),
      18))
      // oneZero == true -> price of token 1 in terms of token 0
      if(price != 0.0 && !oneZero) price = 1/price
      resolve(price)
    }).catch(()=>{resolve(0.0)})
  })
}
exports.fetchUniswapV3PriceOrZero = fetchUniswapV3PriceOrZero

// given the decimals of a token, returns a bignumber of one token
export function decimalsToAmount(decimals: any) {
  decimals = BN.from(decimals).toNumber()
  var s = '1'
  for(var i = 0; i < decimals; ++i) s += '0'
  return BN.from(s)
}
exports.decimalsToAmount = decimalsToAmount
