/* global describe it before ethers */

import hre from "hardhat";
const { ethers } = hre;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;

import { HydrogenNucleus, MockERC20, MockFlashSwapCallee1, MockFlashSwapCallee2, MockFlashSwapCallee3, MockFlashSwapCallee4, MockFlashSwapCallee5, MockFlashSwapCallee6, MockFlashSwapCallee7, MockFlashSwapCallee8, FlashSwapCallbackWithMulticall } from "./../typechain-types";

import { expectDeployed } from "./../scripts/utilities/expectDeployed";
import { getNetworkSettings } from "../scripts/utils/getNetworkSettings";
import HydrogenNucleusHelper from "../scripts/utils/HydrogenNucleusHelper";
import HydrogenNucleusEventLogger from "../scripts/utils/HydrogenNucleusEventLogger";
import { setStorageAt, toBytes32 } from "../scripts/utilities/setStorage";
import { decimalsToAmount } from "../scripts/utils/price";
import { deployContract } from "../scripts/utils/deployContract";
import L1DataFeeAnalyzer from "../scripts/utils/L1DataFeeAnalyzer";

const { AddressZero, WeiPerEther, MaxUint256, Zero } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const MAX_PPM = BN.from(1_000_000); // parts per million

const INVALID_LOCATION_0 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const INVALID_LOCATION_6 = "0x0600000000000000000000000000000000000000000000000000000000000000";
const INVALID_EXTERNAL_ADDRESS_LOCATION = "0x01ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const INVALID_INTERNAL_ADDRESS_LOCATION = "0x02ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const NULL_LOCATION = "0x0000000000000000000000000000000000000000000000000000000000000000";
const NULL_EXCHANGE_RATE = "0x0000000000000000000000000000000000000000000000000000000000000000";
const NULL_FEE = "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("HydrogenNucleus-flashSwaps", function () {
  let deployer: SignerWithAddress;
  let owner1: SignerWithAddress;
  let owner2: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let user4: SignerWithAddress;
  let user5: SignerWithAddress;

  let user1ExternalLocation: string;
  let user1InternalLocation: string;
  let user2ExternalLocation: string;
  let user2InternalLocation: string;
  let user3ExternalLocation: string;
  let user3InternalLocation: string;
  let callbackExternalLocation: string;
  let callbackInternalLocation: string;

  let nucleus: HydrogenNucleus;

  let swapCallee1: MockFlashSwapCallee1;
  let swapCallee2: MockFlashSwapCallee2;
  let swapCallee3: MockFlashSwapCallee3;
  let swapCallee4: MockFlashSwapCallee4;
  let swapCallee5: MockFlashSwapCallee5;
  let swapCallee6: MockFlashSwapCallee6;
  let swapCallee7: MockFlashSwapCallee7;
  let swapCallee8: MockFlashSwapCallee8;

  let swapCallback: FlashSwapCallbackWithMulticall;

  let token1: MockERC20;
  let token2: MockERC20;
  let token3: MockERC20;
  let tokens:any[] = [];

  let chainID: number;
  let networkSettings: any;
  let snapshot: BN;

  let l1DataFeeAnalyzer = new L1DataFeeAnalyzer();

  before(async function () {
    [deployer, owner1, owner2, user1, user2, user3, user4, user5] = await ethers.getSigners();
    chainID = (await provider.getNetwork()).chainId;
    networkSettings = getNetworkSettings(chainID);
    if(!networkSettings.isTestnet) throw new Error("Do not run tests on production networks");
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    while(tokens.length < 3) {
      let token = await deployContract(deployer, "MockERC20", [`Token${tokens.length+1}`, `TKN${tokens.length+1}`, 18]) as MockERC20;
      tokens.push(token);
    }
    [token1, token2, token3] = tokens;
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("should deploy successfully", async function () {
      nucleus = await deployContract(deployer, "HydrogenNucleus", [owner1.address]) as HydrogenNucleus;
    });
    it("should deploy callback contracts", async function () {
      /*
      swapCallee1 = await deployContract(deployer, "MockFlashSwapCallee1", [nucleus.address]) as MockFlashSwapCallee1;
      swapCallee2 = await deployContract(deployer, "MockFlashSwapCallee2", [nucleus.address]) as MockFlashSwapCallee2;
      swapCallee3 = await deployContract(deployer, "MockFlashSwapCallee3", [nucleus.address]) as MockFlashSwapCallee3;
      swapCallee4 = await deployContract(deployer, "MockFlashSwapCallee4", [nucleus.address]) as MockFlashSwapCallee4;
      swapCallee5 = await deployContract(deployer, "MockFlashSwapCallee5", [nucleus.address]) as MockFlashSwapCallee5;
      swapCallee6 = await deployContract(deployer, "MockFlashSwapCallee6", [nucleus.address]) as MockFlashSwapCallee6;
      swapCallee7 = await deployContract(deployer, "MockFlashSwapCallee7", [nucleus.address]) as MockFlashSwapCallee7;
      swapCallee8 = await deployContract(deployer, "MockFlashSwapCallee8", [nucleus.address]) as MockFlashSwapCallee8;
      */

      swapCallback = await deployContract(deployer, "FlashSwapCallbackWithMulticall", [nucleus.address]) as FlashSwapCallbackWithMulticall;
      user1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
      user1InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
      user2ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      user2InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      user3ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user3.address);
      user3InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user3.address);
      callbackExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(swapCallback.address);
      callbackInternalLocation = HydrogenNucleusHelper.internalAddressToLocation(swapCallback.address);

    });
  });

  describe("flash swap callbacks", function () {

    let amountA1001 = WeiPerEther.mul(10);
    let amountB1001 = WeiPerEther.mul(15);
    let exchangeRate1001 = HydrogenNucleusHelper.encodeExchangeRate(amountA1001, amountB1001);

    let amountA2001 = WeiPerEther.mul(17);
    let amountB2001 = WeiPerEther.mul(10);
    let exchangeRate2001 = HydrogenNucleusHelper.encodeExchangeRate(amountA2001, amountB2001);

    let expectedProfit1 = amountA2001.sub(amountB1001);

    it("should setup pools", async function () {
      expect(await nucleus.totalSupply()).eq(0);
      // poolID 1001. wants to buy token2 by selling token1
      await token1.connect(user1).mint(user1.address, WeiPerEther.mul(10000));
      await token1.connect(user1).approve(nucleus.address, MaxUint256);
      await nucleus.connect(user1).createLimitOrderPool({
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA1001,
        exchangeRate: exchangeRate1001,
        locationA: user1ExternalLocation,
        locationB: user1InternalLocation,
        hptReceiver: user1.address
      });
      // poolID 2001. wants to buy token1 by selling token2
      await token2.connect(user2).mint(user2.address, WeiPerEther.mul(10000));
      await token2.connect(user2).approve(nucleus.address, MaxUint256);
      await nucleus.connect(user2).createLimitOrderPool({
        tokenA: token2.address,
        tokenB: token1.address,
        amountA: amountA2001,
        exchangeRate: exchangeRate2001,
        locationA: user2ExternalLocation,
        locationB: user2InternalLocation,
        hptReceiver: user2.address
      });
    });
    it("can use callback to arbitrage between two pools", async function () {
      console.log("user1    :", user1.address)
      console.log("user2    :", user2.address)
      console.log("user3    :", user3.address)
      console.log("token1   :", token1.address)
      console.log("token2   :", token2.address)
      console.log("callback :", swapCallback.address)
      // 1. encode the token1 -> pool 2001 -> token2 market order
      const call12 = {
        target: nucleus.address,
        callData: nucleus.interface.encodeFunctionData('executeFlashSwap', [{
          poolID: 2001,
          tokenA: token2.address,
          tokenB: token1.address,
          amountA: amountA2001,
          amountB: amountB2001,
          locationA: user3InternalLocation,
          locationB: callbackInternalLocation,
          flashSwapCallee: AddressZero,
          callbackData: "0x",
        }])
      }
      const calls12 = [call12, ]
      const functionCall12 = swapCallback.interface.encodeFunctionData('aggregate', [calls12])
      const callbackData12 = `0x${functionCall12.substring(10)}`
      // 2. encode the tokenX -> pool0 -> tokenY market order
      let tx = await nucleus.connect(user3).executeFlashSwap({
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: amountA1001,
        amountB: amountB1001,
        locationA: callbackInternalLocation,
        locationB: user3InternalLocation,
        flashSwapCallee: swapCallback.address,
        callbackData: callbackData12,
      })
      //console.log("tx")
      //console.log(tx)
      //let receipt = await tx.wait()
      //console.log("receipt")
      //console.log(receipt)
      // checks
      expect(await nucleus.getTokenBalance(token2.address, user1InternalLocation)).eq(amountB1001);
      expect(await nucleus.getTokenBalance(token1.address, user2InternalLocation)).eq(amountB2001);
      expect(await nucleus.getTokenBalance(token2.address, user3InternalLocation)).eq(expectedProfit1);
      l1DataFeeAnalyzer.register("executeFlashSwap", tx);
      // 0.0597104640 no callback
      // 0.0644382720 yes callback. no data
      // 0.1524280320 yes callback. circular arbitrage
    });
  });

  describe("L1 gas fees", function () {
    it("calculate", async function () {
      l1DataFeeAnalyzer.analyze()
    });
  });
});
