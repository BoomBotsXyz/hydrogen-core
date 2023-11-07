/* global describe it before ethers */

import hre from "hardhat";
const { ethers } = hre;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;

import { HydrogenNucleus, MockERC20, MockERC20NoReturnsSuccess, MockERC20NoReturnsRevert, MockERC20NoReturnsRevertWithError, MockERC20SuccessFalse, MockFlashSwapCallee1, MockFlashSwapCallee2, MockFlashSwapCallee3, MockFlashSwapCallee4, MockFlashSwapCallee5, MockFlashSwapCallee6, MockFlashSwapCallee7, MockFlashSwapCallee8 } from "./../typechain-types";

import { expectDeployed } from "./../scripts/utilities/expectDeployed";
import { getNetworkSettings } from "../scripts/utils/getNetworkSettings";
import HydrogenNucleusHelper from "../scripts/utils/HydrogenNucleusHelper";
import HydrogenNucleusEventLogger from "../scripts/utils/HydrogenNucleusEventLogger";
import { setStorageAt, toBytes32 } from "../scripts/utilities/setStorage";
import { decimalsToAmount } from "../scripts/utils/price";
import { deployContract } from "../scripts/utils/deployContract";
import { leftPad } from "../scripts/utils/strings";

const { AddressZero, WeiPerEther, MaxUint256, Zero } = ethers.constants;
const { formatUnits } = ethers.utils;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const MAX_PPM = BN.from(1_000_000); // parts per million

const INVALID_LOCATION_0 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const INVALID_LOCATION_6 = "0x0600000000000000000000000000000000000000000000000000000000000000";
const INVALID_LOCATION_FLAG = "0x0400000000000000000000000000000000000000000000000000000000000000";
const INVALID_EXTERNAL_ADDRESS_LOCATION = "0x01ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const INVALID_INTERNAL_ADDRESS_LOCATION = "0x02ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const NULL_LOCATION = "0x0000000000000000000000000000000000000000000000000000000000000000";
const NULL_EXCHANGE_RATE = "0x0000000000000000000000000000000000000000000000000000000000000000";
const NULL_FEE = "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("HydrogenNucleus-gasCost", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let user4: SignerWithAddress;
  let user5: SignerWithAddress;

  let nucleus: HydrogenNucleus;

  let swapCallee1: MockFlashSwapCallee1;
  let swapCallee2: MockFlashSwapCallee2;
  let swapCallee3: MockFlashSwapCallee3;
  let swapCallee4: MockFlashSwapCallee4;
  let swapCallee5: MockFlashSwapCallee5;
  let swapCallee6: MockFlashSwapCallee6;
  let swapCallee7: MockFlashSwapCallee7;
  let swapCallee8: MockFlashSwapCallee8;

  let token1: MockERC20;
  let token2: MockERC20;
  let token3: MockERC20;
  let tokens:any[] = [];
  let nonstandardToken1: MockERC20NoReturnsSuccess;
  let nonstandardToken2: MockERC20NoReturnsRevert;
  let nonstandardToken3: MockERC20NoReturnsRevertWithError;
  let nonstandardToken4: MockERC20SuccessFalse;

  let chainID: number;
  let networkSettings: any;
  let snapshot: BN;

  before(async function () {
    [deployer, owner, user1, user2, user3, user4, user5] = await ethers.getSigners();
    chainID = (await provider.getNetwork()).chainId;
    networkSettings = getNetworkSettings(chainID);
    if(!networkSettings.isTestnet) throw new Error("Do not run tests on production networks");
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    while(tokens.length < 21) {
      let token = await deployContract(deployer, "MockERC20", [`Token${tokens.length+1}`, `TKN${tokens.length+1}`, 18]) as MockERC20;
      tokens.push(token);
    }
    [token1, token2, token3] = tokens;

    //nonstandardToken1 = await deployContract(deployer, "MockERC20NoReturnsSuccess", [`NonstandardToken1`, `NSTKN1`, 18]) as MockERC20NoReturnsSuccess;
    //nonstandardToken2 = await deployContract(deployer, "MockERC20NoReturnsRevert", [`NonstandardToken2`, `NSTKN2`, 18]) as MockERC20NoReturnsRevert;
    //nonstandardToken3 = await deployContract(deployer, "MockERC20NoReturnsRevertWithError", [`NonstandardToken3`, `NSTKN3`, 18]) as MockERC20NoReturnsRevertWithError;
    //nonstandardToken4 = await deployContract(deployer, "MockERC20SuccessFalse", [`NonstandardToken4`, `NSTKN4`, 18]) as MockERC20SuccessFalse;
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("should deploy successfully", async function () {
      nucleus = await deployContract(deployer, "HydrogenNucleus", [owner.address]) as HydrogenNucleus;
    });
    /*
    it("should deploy callback contracts", async function () {
      swapCallee1 = await deployContract(deployer, "MockFlashSwapCallee1", [nucleus.address]) as MockFlashSwapCallee1;
      swapCallee2 = await deployContract(deployer, "MockFlashSwapCallee2", [nucleus.address]) as MockFlashSwapCallee2;
      swapCallee3 = await deployContract(deployer, "MockFlashSwapCallee3", [nucleus.address]) as MockFlashSwapCallee3;
      swapCallee4 = await deployContract(deployer, "MockFlashSwapCallee4", [nucleus.address]) as MockFlashSwapCallee4;
      swapCallee5 = await deployContract(deployer, "MockFlashSwapCallee5", [nucleus.address]) as MockFlashSwapCallee5;
      swapCallee6 = await deployContract(deployer, "MockFlashSwapCallee6", [nucleus.address]) as MockFlashSwapCallee6;
      swapCallee7 = await deployContract(deployer, "MockFlashSwapCallee7", [nucleus.address]) as MockFlashSwapCallee7;
      swapCallee8 = await deployContract(deployer, "MockFlashSwapCallee8", [nucleus.address]) as MockFlashSwapCallee8;
    });
    */
  });

  describe("market order and flash swap", function () {
    //let tokenA = "0x"
    it("executeMarketOrder()", async function () {
      let txdata = nucleus.interface.encodeFunctionData("executeMarketOrder", [{
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: WeiPerEther,
        amountB: WeiPerEther.mul(2),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(user2.address),
      }])
      console.log("analyzing executeMarketOrder() txdata")
      analyzeTxData(txdata)
    });
    it("executeFlashSwap()", async function () {
      let txdata = nucleus.interface.encodeFunctionData("executeFlashSwap", [{
        poolID: 1001,
        tokenA: token1.address,
        tokenB: token2.address,
        amountA: WeiPerEther,
        amountB: WeiPerEther.mul(2),
        locationA: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        locationB: HydrogenNucleusHelper.internalAddressToLocation(user2.address),
        flashSwapCallee: AddressZero,
        callbackData: "0x"
      }])
      console.log("analyzing executeFlashSwap() txdata")
      analyzeTxData(txdata)
    });
    it("theoretical best market order 1", async function () {
      let txdata = '0x899ff23000000000000000000000000000000000000003e98a791620dd6260079bf849dc5567adc3f2fdc318610178da211fef7d417bc0e6fed39f05609ad7880000000000000000000000000de0b6b3a76400000000000000000000000000001bc16d674ec80000013c44cdddb6a900fa2b585dd299e03d12fa4293bc0290f79bf6eb2c4f870365e785982e1f101e93b906'
      console.log("analyzing theoretical best market order 1 txdata")
      analyzeTxData(txdata)
    });
    it("theoretical best market order 2", async function () {
      let txdata = '0x2200000000000000000000000000000000000003e98a791620dd6260079bf849dc5567adc3f2fdc318610178da211fef7d417bc0e6fed39f05609ad7880000000000000000000000000de0b6b3a76400000000000000000000000000001bc16d674ec80000'
      console.log("analyzing theoretical best market order 2 txdata")
      analyzeTxData(txdata)
    });
    it("executeMarketOrderSrcExt()", async function () {
      let txdata = '0x899ff23000000000000000000000000000000000000000000000000000000000000003e90000000000000000000000008a791620dd6260079bf849dc5567adc3f2fdc318000000000000000000000000610178da211fef7d417bc0e6fed39f05609ad7880000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000001bc16d674ec80000'
      console.log("analyzing executeMarketOrderSrcExt() txdata")
      analyzeTxData(txdata)
    });
  });

  describe("token transfer", function () {
    it("tokenTransfer()", async function () {
      let txdata = nucleus.interface.encodeFunctionData("tokenTransfer", [{
        token: token1.address,
        amount: WeiPerEther,
        src: HydrogenNucleusHelper.externalAddressToLocation(user1.address),
        dst: HydrogenNucleusHelper.internalAddressToLocation(user2.address),
      }]);
      console.log("analyzing tokenTransfer() txdata")
      analyzeTxData(txdata)
    });
    it("tokenTransferIn()", async function () {
      let txdata = nucleus.interface.encodeFunctionData("tokenTransferIn", [{
        token: token1.address,
        amount: WeiPerEther,
      }]);
      console.log("analyzing tokenTransferIn() txdata")
      analyzeTxData(txdata)
    });
    it("tokenTransferOut()", async function () {
      let txdata = nucleus.interface.encodeFunctionData("tokenTransferOut", [{
        token: token1.address,
        amount: WeiPerEther,
      }]);
      console.log("analyzing tokenTransferOut() txdata")
      analyzeTxData(txdata)
    });
  });

  describe("createGridOrderPool", function () {
    it("create pool 3002", async function () {
      let txdata = '0x3a4f31590000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000298b37944f10ac4a3ecffcc55d34f90a27616078000000000000000000000000000000000000000000000000000000000000000300000000000000000000000050c5725949a6f0c72e6c4a641f24049a917db0cb0000000000000000000000000000000000000000000000000000000000000000010000000000000000000000298b37944f10ac4a3ecffcc55d34f90a27616078000000000000000000000000d9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca0000000000000000000000000000000000000000000000000000000000000000010000000000000000000000298b37944f10ac4a3ecffcc55d34f90a27616078000000000000000000000000eb466342c4d449bc9f53a865d5cb90586f4052150000000000000000000000000000000000000000000000000000000000000000010000000000000000000000298b37944f10ac4a3ecffcc55d34f90a27616078000000000000000000000000000000000000000000000000000000000000000600000000000000000000000050c5725949a6f0c72e6c4a641f24049a917db0cb000000000000000000000000d9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca00000000000000000de0b6b3a7640000000000000000000000000000000f4498040000000000000000000000000000000000000000000000000000000000000300000000000000000000000050c5725949a6f0c72e6c4a641f24049a917db0cb000000000000000000000000eb466342c4d449bc9f53a865d5cb90586f40521500000000000000000de0b6b3a7640000000000000000000000000000000f44980400000000000000000000000000000000000000000000000000000000000003000000000000000000000000d9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca00000000000000000000000050c5725949a6f0c72e6c4a641f24049a917db0cb000000000000000000000000000f424000000000000000000de2d8660a4180000400000000000000000000000000000000000000000000000000000000000003000000000000000000000000d9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca000000000000000000000000eb466342c4d449bc9f53a865d5cb90586f405215000000000000000000000000000f4240000000000000000000000000000f44980400000000000000000000000000000000000000000000000000000000000003000000000000000000000000eb466342c4d449bc9f53a865d5cb90586f40521500000000000000000000000050c5725949a6f0c72e6c4a641f24049a917db0cb000000000000000000000000000f424000000000000000000de2d8660a4180000400000000000000000000000000000000000000000000000000000000000003000000000000000000000000eb466342c4d449bc9f53a865d5cb90586f405215000000000000000000000000d9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca000000000000000000000000000f4240000000000000000000000000000f44980400000000000000000000000000000000000000000000000000000000000003'
      console.log("analyzing pool 3002 creation txdata")
      analyzeTxData(txdata)
    });
  });

  function analyzeTxData(txdata: string) {
    let fixed_overhead = 188 // set by chain governance
    let dynamic_overhead = 0.684 // set by chain governance
    let l1_gas_price = 27062202174 // 27 gwei // changes per block with eip1559
    let eth_price = 1600

    //console.log(txdata)
    let numBytes = txdata.length/2-1
    let zeros = numZeroBytes(txdata)
    let nonzeros = numNonZeroBytes(txdata)
    console.log(`total num bytes    : ${leftPad(numBytes, 5)}`)
    console.log(`num zero bytes     : ${leftPad(zeros, 5)}`)
    console.log(`num nonzero bytes  : ${leftPad(nonzeros, 5)}`)
    let tx_data_gas = zeros * 4 + nonzeros * 16
    let l1_data_fee = l1_gas_price * (tx_data_gas + fixed_overhead) * dynamic_overhead
    console.log(`tx_data_gas        : ${leftPad(tx_data_gas, 5)}`)
    console.log(`l1_data_fee        : ${l1_data_fee}`)
    let data_fee_eth = BN.from(Math.floor(l1_data_fee))
    console.log(`data_fee_eth       : ${formatUnits(data_fee_eth)}`)
    let data_fee_usd = data_fee_eth.mul(eth_price)
    console.log(`data_fee_usd       : ${formatUnits(data_fee_usd)}`)
    // 52495909269977.38
    // 0.000052495909269977.38
  }

  function numZeroBytes(txdata: string) {
    let count = 0
    for(let i = 2; i < txdata.length; i+=2) {
      let s = txdata.substring(i, i+2)
      if(s == '00') count++
    }
    return count
  }

  function numNonZeroBytes(txdata: string) {
    let count = 0
    for(let i = 2; i < txdata.length; i+=2) {
      let s = txdata.substring(i, i+2)
      if(s != '00') count++
    }
    return count
  }

});
