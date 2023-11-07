import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract, Wallet } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();

const accounts = JSON.parse(process.env.ACCOUNTS || "{}");
const trader1 = new ethers.Wallet(accounts.trader1.key, provider);

import { HydrogenNucleus, MockERC20 } from "./../../typechain-types";
import { expectDeployed, isDeployed } from "./../utilities/expectDeployed";
import { logContractAddress } from "./../utilities/logContractAddress";
import { getNetworkSettings } from "./../utils/getNetworkSettings";
import { deployContract, verifyContract } from "./../utils/deployContract";
import HydrogenNucleusHelper from "../utils/HydrogenNucleusHelper";
import { getTokensBySymbol } from "../utils/getTokens";
import { decimalsToAmount } from "../utils/price";

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const WeiPerWbtc = BN.from(100_000_000); // 8 decimals

let networkSettings: any;
let chainID: number;

let nucleus: HydrogenNucleus;
let NUCLEUS_ADDRESS = "0x49FD8f704a54FB6226e2F14B4761bf6Be84ADF15";

let tokenMetadatas = getTokensBySymbol(80001);

async function main() {
  console.log(`Using ${trader1.address} as trader1`);

  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(80001, "mumbai")) throw("Only run this on Polygon Mumbai or a local fork of Mumbai");

  await verifyDeployments()
  nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS, trader1) as HydrogenNucleus;

  await createGridOrder1();
  await createGridOrder1Compact();
  await createGridOrder2();
  await createGridOrder2Compact();
  await createGridOrder3();
  //await createGridOrder4();
  //await createGridOrder5();
  //await createGridOrder6();
}

async function verifyDeployments() {
  let nonDeploys:string[] = []
  if(!await isDeployed(NUCLEUS_ADDRESS)) nonDeploys.push("HydrogenNucleus")
  let symbols = Object.keys(tokenMetadatas);
  for(let i = 0; i < symbols.length; ++i) {
    if(!await isDeployed(tokenMetadatas[symbols[i]].address)) nonDeploys.push(symbols[i])
  }
  if(nonDeploys.length > 0) throw new Error(`${nonDeploys.join(", ")} not deployed`);
}

async function checkTokenBalancesAndAllowance(token:Contract, user:Wallet, amount:BN) {
  // check balance
  let balance = await token.balanceOf(user.address);
  if(balance.lt(amount)) {
    console.log("minting token");
    let tx = await token.connect(user).mint(user.address, amount, networkSettings.overrides);
    //let tx = await token.connect(user).mint(user.address, amount, {...networkSettings.overrides, nonce:7, maxFeePerGas:3000000001, maxPriorityFeePerGas:3000000000});
    console.log("tx:", tx);
    await tx.wait(networkSettings.confirmations);
    console.log("minted token");
  }
  // check allowance
  let allowance = await token.allowance(user.address, nucleus.address);
  if(allowance.lt(amount)) {
    console.log("approving token");
    let tx = await token.connect(user).approve(nucleus.address, MaxUint256, {...networkSettings.overrides, gasLimit: 80_000});
    console.log("tx:", tx);
    await tx.wait(networkSettings.confirmations);
    console.log("approved token");
  }
}

async function createGridOrder(params:any) {
  console.log("Creating grid order pool");
  let tx = await nucleus.connect(trader1).createGridOrderPool(params, networkSettings.overrides);
  await watchTxForCreatedPoolID(tx);
}

async function createGridOrderCompact(params:any) {
  console.log("Creating grid order pool");
  let tx = await nucleus.connect(trader1).createGridOrderPoolCompact(params, {...networkSettings.overrides, value: params.gasValue||0});
  await watchTxForCreatedPoolID(tx);
}

async function watchTxForCreatedPoolID(tx:any) {
  console.log("tx:", tx);
  let receipt = await tx.wait(networkSettings.confirmations);
  if(!receipt || !receipt.events || receipt.events.length == 0) {
    console.log(receipt)
    throw new Error("events not found");
  }
  let createEvent = (receipt.events as any).filter(event => event.event == 'PoolCreated')[0];
  let poolID = createEvent.args.poolID;
  console.log(`Created grid order pool ${poolID}`);
}

async function createGridOrder1() {
  // wbtc-usdc
  let usdc = await ethers.getContractAt("MockERC20", tokenMetadatas["USDC"].address, trader1) as MockERC20;
  let wbtc = await ethers.getContractAt("MockERC20", tokenMetadatas["WBTC"].address, trader1) as MockERC20;
  let exchangeRateSellUsdcBuyWbtc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(25_000), WeiPerWbtc);
  let exchangeRateSellWbtcBuyUsdc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerWbtc, WeiPerUsdc.mul(26_000));
  let amountUsdcDeposit = WeiPerUsdc.mul(10_000);
  let amountWbtcDeposit = WeiPerWbtc;
  await checkTokenBalancesAndAllowance(usdc, trader1, amountUsdcDeposit);
  await checkTokenBalancesAndAllowance(wbtc, trader1, amountWbtcDeposit);
  // create pool
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  let params = {
    tokenSources: [{
      token: usdc.address,
      amount: amountUsdcDeposit,
      location: trader1ExternalLocation
    },{
      token: wbtc.address,
      amount: amountWbtcDeposit,
      location: trader1ExternalLocation
    }],
    tradeRequests: [{
      tokenA: usdc.address,
      tokenB: wbtc.address,
      exchangeRate: exchangeRateSellUsdcBuyWbtc,
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    },{
      tokenA: wbtc.address,
      tokenB: usdc.address,
      exchangeRate: exchangeRateSellWbtcBuyUsdc,
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    }],
    hptReceiver: trader1.address
  };
  await createGridOrder(params);
}

async function createGridOrder1Compact() {
  // wbtc-usdc
  let usdc = await ethers.getContractAt("MockERC20", tokenMetadatas["USDC"].address, trader1) as MockERC20;
  let wbtc = await ethers.getContractAt("MockERC20", tokenMetadatas["WBTC"].address, trader1) as MockERC20;
  let exchangeRateSellUsdcBuyWbtc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(25_000), WeiPerWbtc);
  let exchangeRateSellWbtcBuyUsdc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerWbtc, WeiPerUsdc.mul(26_000));
  let amountUsdcDeposit = WeiPerUsdc.mul(10_000);
  let amountWbtcDeposit = WeiPerWbtc;
  await checkTokenBalancesAndAllowance(usdc, trader1, amountUsdcDeposit);
  await checkTokenBalancesAndAllowance(wbtc, trader1, amountWbtcDeposit);
  // create pool
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  let params = {
    tokenSources: [{
      token: usdc.address,
      amount: amountUsdcDeposit,
    },{
      token: wbtc.address,
      amount: amountWbtcDeposit,
    }],
    exchangeRates: [
      exchangeRateSellUsdcBuyWbtc,
      exchangeRateSellWbtcBuyUsdc,
    ]
  };
  await createGridOrderCompact(params);
}

async function createGridOrder2() {
  // dai-usdc-usdt
  let dai = await ethers.getContractAt("MockERC20", tokenMetadatas["DAI"].address, trader1) as MockERC20;
  let usdc = await ethers.getContractAt("MockERC20", tokenMetadatas["USDC"].address, trader1) as MockERC20;
  let usdt = await ethers.getContractAt("MockERC20", tokenMetadatas["USDT"].address, trader1) as MockERC20;
  let exchangeRateSellDaiBuyUsdc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(99), WeiPerUsdc.mul(100));
  let exchangeRateSellUsdcBuyDai = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerEther.mul(100));
  let exchangeRateSellDaiBuyUsdt = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(99), WeiPerUsdc.mul(100));
  let exchangeRateSellUsdtBuyDai = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerEther.mul(100));
  let exchangeRateSellUsdcBuyUsdt = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerUsdc.mul(100));
  let exchangeRateSellUsdtBuyUsdc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerUsdc.mul(100));
  let amountDaiDeposit = WeiPerEther.mul(10_000);
  let amountUsdcDeposit = WeiPerUsdc.mul(10_000);
  let amountUsdtDeposit = WeiPerUsdc.mul(10_000);
  await checkTokenBalancesAndAllowance(dai, trader1, amountDaiDeposit);
  await checkTokenBalancesAndAllowance(usdc, trader1, amountUsdcDeposit);
  await checkTokenBalancesAndAllowance(usdt, trader1, amountUsdtDeposit);
  // create pool
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  let params = {
    tokenSources: [{
      token: dai.address,
      amount: amountDaiDeposit,
      location: trader1ExternalLocation
    },{
      token: usdc.address,
      amount: amountUsdcDeposit,
      location: trader1ExternalLocation
    },{
      token: usdt.address,
      amount: amountUsdtDeposit,
      location: trader1ExternalLocation
    }],
    tradeRequests: [{
      tokenA: dai.address,
      tokenB: usdc.address,
      exchangeRate: exchangeRateSellDaiBuyUsdc,
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    },{
      tokenA: usdc.address,
      tokenB: dai.address,
      exchangeRate: exchangeRateSellUsdcBuyDai,
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    },{
      tokenA: dai.address,
      tokenB: usdt.address,
      exchangeRate: exchangeRateSellDaiBuyUsdt,
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    },{
      tokenA: usdt.address,
      tokenB: dai.address,
      exchangeRate: exchangeRateSellUsdtBuyDai,
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    },{
      tokenA: usdc.address,
      tokenB: usdt.address,
      exchangeRate: exchangeRateSellUsdcBuyUsdt,
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    },{
      tokenA: usdt.address,
      tokenB: usdc.address,
      exchangeRate: exchangeRateSellUsdtBuyUsdc,
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    }],
    hptReceiver: trader1.address
  };
  await createGridOrder(params);
}

async function createGridOrder2Compact() {
  // dai-usdc-usdt
  let dai = await ethers.getContractAt("MockERC20", tokenMetadatas["DAI"].address, trader1) as MockERC20;
  let usdc = await ethers.getContractAt("MockERC20", tokenMetadatas["USDC"].address, trader1) as MockERC20;
  let usdt = await ethers.getContractAt("MockERC20", tokenMetadatas["USDT"].address, trader1) as MockERC20;
  let exchangeRateSellDaiBuyUsdc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(99), WeiPerUsdc.mul(100));
  let exchangeRateSellUsdcBuyDai = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerEther.mul(100));
  let exchangeRateSellDaiBuyUsdt = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(99), WeiPerUsdc.mul(100));
  let exchangeRateSellUsdtBuyDai = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerEther.mul(100));
  let exchangeRateSellUsdcBuyUsdt = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerUsdc.mul(100));
  let exchangeRateSellUsdtBuyUsdc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(99), WeiPerUsdc.mul(100));
  let amountDaiDeposit = WeiPerEther.mul(10_000);
  let amountUsdcDeposit = WeiPerUsdc.mul(10_000);
  let amountUsdtDeposit = WeiPerUsdc.mul(10_000);
  await checkTokenBalancesAndAllowance(dai, trader1, amountDaiDeposit);
  await checkTokenBalancesAndAllowance(usdc, trader1, amountUsdcDeposit);
  await checkTokenBalancesAndAllowance(usdt, trader1, amountUsdtDeposit);
  // create pool
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  let params = {
    tokenSources: [{
      token: dai.address,
      amount: amountDaiDeposit,
    },{
      token: usdc.address,
      amount: amountUsdcDeposit,
    },{
      token: usdt.address,
      amount: amountUsdtDeposit,
    }],
    exchangeRates: [
      exchangeRateSellDaiBuyUsdc,
      exchangeRateSellDaiBuyUsdt,
      exchangeRateSellUsdcBuyDai,
      exchangeRateSellUsdcBuyUsdt,
      exchangeRateSellUsdtBuyDai,
      exchangeRateSellUsdtBuyUsdc,
    ]
  };
  await createGridOrderCompact(params);
}

async function createGridOrder3() {
  // frax-usdc
  let frax = await ethers.getContractAt("MockERC20", tokenMetadatas["FRAX"].address, trader1) as MockERC20;
  let usdc = await ethers.getContractAt("MockERC20", tokenMetadatas["USDC"].address, trader1) as MockERC20;
  let exchangeRateSellFraxBuyUsdc = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(999), WeiPerUsdc.mul(1000));
  let exchangeRateSellUsdcBuyFrax = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(999), WeiPerEther.mul(1000));
  let amountFraxDeposit = WeiPerEther.mul(10_000);
  let amountUsdcDeposit = WeiPerUsdc.mul(10_000);
  await checkTokenBalancesAndAllowance(frax, trader1, amountFraxDeposit);
  await checkTokenBalancesAndAllowance(usdc, trader1, amountUsdcDeposit);
  // create pool
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  let params = {
    tokenSources: [{
      token: frax.address,
      amount: amountFraxDeposit,
      location: trader1ExternalLocation
    },{
      token: usdc.address,
      amount: amountUsdcDeposit,
      location: trader1ExternalLocation
    }],
    tradeRequests: [{
      tokenA: frax.address,
      tokenB: usdc.address,
      exchangeRate: exchangeRateSellFraxBuyUsdc,
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    },{
      tokenA: usdc.address,
      tokenB: frax.address,
      exchangeRate: exchangeRateSellUsdcBuyFrax,
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    }],
    hptReceiver: trader1.address
  };
  await createGridOrder(params);
}

async function createGridOrder4() {
  // all stable groups
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  let symbols = ["DAI", "USDC", "USDT", "FRAX"]
  for(const symbol of symbols) {
    tokenMetadatas[symbol].contract = await ethers.getContractAt("MockERC20", tokenMetadatas[symbol].address, trader1) as MockERC20;
  }
  //let tokens = await Promise.all(symbols.map(async sym => await ethers.getContractAt("MockERC20", tokenMetadatas[sym].address, trader1) as MockERC20));
  //let decimals = symbols.map(sym => tokenMetadatas[sym].decimals)
  /*
  let dai = await ethers.getContractAt("MockERC20", tokenMetadatas["DAI"].address, trader1) as MockERC20;
  let usdc = await ethers.getContractAt("MockERC20", tokenMetadatas["USDC"].address, trader1) as MockERC20;
  let usdt = await ethers.getContractAt("MockERC20", tokenMetadatas["USDT"].address, trader1) as MockERC20;
  let frax = await ethers.getContractAt("MockERC20", tokenMetadatas["FRAX"].address, trader1) as MockERC20;
  let amountDaiDeposit = WeiPerEther.mul(1_000);
  let amountUsdcDeposit = WeiPerUsdc.mul(1_000);
  let amountUsdtDeposit = WeiPerUsdc.mul(1_000);
  let amountFraxDeposit = WeiPerEther.mul(1_000);
  let exchangeRate_6_6 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc, WeiPerUsdc.mul(10005).div(10000));
  let exchangeRate_6_18 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc, WeiPerEther.mul(10005).div(10000));
  let exchangeRate_18_6 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerUsdc.mul(10005).div(10000));
  let exchangeRate_18_18 = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerEther.mul(10005).div(10000));
  */
  // loop over all combinations
  for(let i = 0; i < 16; i++) {
    let b0 = !!(i & 1) ? 1 : 0
    let b1 = !!(i & 2) ? 1 : 0
    let b2 = !!(i & 4) ? 1 : 0
    let b3 = !!(i & 8) ? 1 : 0
    let accept = (b0 + b1 + b2 + b3) >= 2
    console.log(i, b0, b1, b2, b3, accept)
    if(!accept) continue
    let b = [b0, b1, b2, b3]
    let theseSymbols = []
    for(let j = 0; j < 4; j++) {
      if(b[j]) theseSymbols.push(symbols[j])
    }
    console.log(`Creating grid order pool with ${theseSymbols.join(", ")}`)
    //let tokens = await Promise.all(theseSymbols.map(async sym => await ethers.getContractAt("MockERC20", tokenMetadatas[sym].address, trader1) as MockERC20))
    let decimals = theseSymbols.map(sym => tokenMetadatas[sym].decimals)
    let depositAmounts = decimals.map(dec => decimalsToAmount(dec).mul(1_000))
    let tokenSources = theseSymbols.map((symbol,tokenIndex) => {
      return {
        token: tokenMetadatas[symbol].address,
        amount: depositAmounts[tokenIndex],
        location: trader1ExternalLocation
      }
    })
    let tradeRequests = []
    for(const symbolA of theseSymbols) {
      for(const symbolB of theseSymbols) {
        if(symbolA == symbolB) continue;
        tradeRequests.push({
          tokenA: tokenMetadatas[symbolA].address,
          tokenB: tokenMetadatas[symbolB].address,
          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(decimalsToAmount(tokenMetadatas[symbolA].decimals), decimalsToAmount(tokenMetadatas[symbolB].decimals).mul(10005).div(10000)),
          locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
        })
      }
    }
    let params = {
      tokenSources,
      tradeRequests,
      hptReceiver: trader1.address
    };
    await createGridOrder(params);
  }
}

async function createGridOrder5() {
  // mweth-dai
  let dai = await ethers.getContractAt("MockERC20", tokenMetadatas["DAI"].address, trader1) as MockERC20;
  let mweth = await ethers.getContractAt("MockERC20", tokenMetadatas["mWETH"].address, trader1) as MockERC20;
  let exchangeRateSellDaiBuyMWeth = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther.mul(1700), WeiPerEther);
  let exchangeRateSellMWethBuyDai = HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerEther.mul(1900));
  let amountDaiDeposit = WeiPerEther.mul(10_000);
  let amountMWethDeposit = WeiPerEther.mul(5);
  await checkTokenBalancesAndAllowance(dai, trader1, amountDaiDeposit);
  await checkTokenBalancesAndAllowance(mweth, trader1, amountMWethDeposit);
  // create pool
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  let params = {
    tokenSources: [{
      token: dai.address,
      amount: amountDaiDeposit,
      location: trader1ExternalLocation
    },{
      token: mweth.address,
      amount: amountMWethDeposit,
      location: trader1ExternalLocation
    }],
    tradeRequests: [{
      tokenA: dai.address,
      tokenB: mweth.address,
      exchangeRate: exchangeRateSellDaiBuyMWeth,
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    },{
      tokenA: mweth.address,
      tokenB: dai.address,
      exchangeRate: exchangeRateSellMWethBuyDai,
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    }],
    hptReceiver: trader1.address
  };
  await createGridOrder(params);
}

async function createGridOrder6() {
  // all pairs of WETH and an ETH based interest bearing vault
  let trader1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(trader1.address);
  //let weth = await ethers.getContractAt("MockERC20", tokenMetadatas["WETH"].address, trader1) as MockERC20;
  let ethVaults = [ // prices measured in ETH. buy and sell measured in BPS of ETH
    { symbol: "wstETH",  price: 1.1355, buy: 11353, sell: 11357 },
    { symbol: "rETH",    price: 1.0870, buy: 10868, sell: 10872 },
    { symbol: "sfrxETH", price: 1.0530, buy: 10528, sell: 10532 },
    { symbol: "cbETH",   price: 1.0470, buy: 10468, sell: 10472 },
    { symbol: "icETH",   price: 1.0688, buy: 10686, sell: 10690 },
  ]
  let tokenSources = [{
    token: tokenMetadatas["mWETH"].address,
    amount: WeiPerEther,
    location: trader1ExternalLocation
  }]
  //await checkTokenBalancesAndAllowance(dai, trader1, amountDaiDeposit);
  for(const vault of ethVaults) {
    console.log(`Creating grid order with mWETH and ${vault.symbol}`)
    let tradeRequests = [{
      tokenA: tokenMetadatas["mWETH"].address,
      tokenB: tokenMetadatas[vault.symbol].address,
      exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(vault.buy,10000),
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    },{
      tokenA: tokenMetadatas[vault.symbol].address,
      tokenB: tokenMetadatas["mWETH"].address,
      exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(10000,vault.sell),
      locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
    }]
    let params = {
      tokenSources,
      tradeRequests,
      hptReceiver: trader1.address
    }
    await createGridOrder(params);
  }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
