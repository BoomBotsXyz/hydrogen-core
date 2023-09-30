import hardhat from "hardhat";
const { ethers } = hardhat;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract, Wallet } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();

import { HydrogenNucleus, MockERC20 } from "./../../typechain-types";
import { expectDeployed, isDeployed } from "./../utilities/expectDeployed";
import { logContractAddress } from "./../utilities/logContractAddress";
import { getNetworkSettings } from "./../utils/getNetworkSettings";
import { deployContract, verifyContract } from "./../utils/deployContract";
import HydrogenNucleusHelper from "../utils/HydrogenNucleusHelper";

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals

let networkSettings: any;
let chainID: number;

let nucleus: HydrogenNucleus;
let NUCLEUS_ADDRESS = "0x1Caba1EaA6F14b94EF732624Db1702eA41b718ff";

async function main() {
  chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);
  function isChain(chainid: number, chainName: string) {
    return ((chainID === chainid) || ((chainID === 31337) && (process.env.FORK_NETWORK === chainName)));
  }
  if(!isChain(8453, "base")) throw("Only run this on Base Mainnet or a local fork of Base");

  nucleus = await ethers.getContractAt("HydrogenNucleus", NUCLEUS_ADDRESS) as HydrogenNucleus;

  await decodeAndQuote1001();
  await decodeAndQuote2002();
}

async function decodeAndQuote1001() {
  // decode

  const poolID = 1001
  // fetch pool info
  const poolInfo = await nucleus.getLimitOrderPool(poolID)
  /*
  console.log({poolID, poolInfo})
  {
    tokenA: "0x4200000000000000000000000000000000000006", // WETH
    tokenB: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", // USDbC
    amountA: "100000000000000000",
    exchangeRate: "0x0000000000000000016345785d8a00000000000000000000000000000bebc200",
    locationB: "0x010000000000000000000000298b37944f10ac4a3ecffcc55d34f90a27616078"
  }
  */
  // A market taker can buy up to 1 WETH from this pool by selling USDbC.
  // early exit if trade request is disabled
  if(!HydrogenNucleusHelper.exchangeRateIsNonzero(poolInfo.exchangeRate)) return
  // decode exchange rate
  const [x1, x2] = HydrogenNucleusHelper.decodeExchangeRate(poolInfo.exchangeRate)
  const { amountAperB, amountBperA } = HydrogenNucleusHelper.calculateRelativeAmounts(x1, 18, x2, 6)
  //console.log(amountBperA) // 2000000000
  // This pool will trade at 2000 USDbC/WETH
  // fetch swap fee
  const { feePPM } = await nucleus.getSwapFeeForPair(poolInfo.tokenA, poolInfo.tokenB)
  //console.log(feePPM) // 2000
  // The swap fee in this direction is 2000 PPM or 0.2%.
  // After the swap fee the market taker will trade at 2000 / (1-0.002) = 2004.008016 USDbC/WETH

  // quote

  // The market taker wants to buy the full 1 WETH
  var amountAMT = WeiPerEther
  var { amountBMT } = HydrogenNucleusHelper.calculateMarketOrderExactAMT(amountAMT, poolInfo.exchangeRate, feePPM)
  //console.log(amountAMT) // 1000000000000000000
  //console.log(amountBMT) // 2004008016
  // The market taker must sell 2004.008016 USDbC to buy 1 WETH.

  // The market taker wants to buy as much WETH as possible for 500 USDbC
  var amountBMT = WeiPerUsdc.mul(500)
  var { amountAMT } = HydrogenNucleusHelper.calculateMarketOrderExactBMT(amountBMT, poolInfo.exchangeRate, feePPM)
  //console.log(amountAMT) // 249500000000000000
  //console.log(amountBMT) // 500000000
  // The market taker can buy 0.2495 WETH by selling 500 USDbC.

  // swap

  // The market maker can use poolID, tokenA, tokenB, amountAMT, and amountBMT in a call to executeMarketOrder
}

async function decodeAndQuote2002() {
  // decode

  const poolID = 2002
  // fetch pool info
  const poolInfo = await nucleus.getGridOrderPool(poolID)
  /*
  console.log(poolInfo)
  {
    tokens: [
      "0x4200000000000000000000000000000000000006", // WETH
      "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA"  // USDbC
    ],
    balances: [
      "103465277777777778",
      "0"
    ],
    tradeRequests: [
      {
        tokenA: "0x4200000000000000000000000000000000000006",
        tokenB: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
        exchangeRate: "0x00000000000000000de0b6b3a76400000000000000000000000000006b49d200",
        locationB: "0x03000000000000000000000000000000000000000000000000000000000007d2"
      },
      {
        tokenA: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
        tokenB: "0x4200000000000000000000000000000000000006",
        exchangeRate: "0x0000000000000000000000005f5e100000000000000000000de0b6b3a7640000",
        locationB: "0x03000000000000000000000000000000000000000000000000000000000007d2"
      }
    ]
  ]

  */
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
