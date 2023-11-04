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
import L1DataFeeAnalyzer from "../scripts/utils/L1DataFeeAnalyzer";

const { AddressZero, WeiPerEther, MaxUint256, Zero } = ethers.constants;
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

describe("HydrogenNucleus-executeMarketOrder", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let user4: SignerWithAddress;
  let user5: SignerWithAddress;
  let user6: SignerWithAddress;
  let user1ExternalLocation: string;
  let user1InternalLocation: string;
  let user2ExternalLocation: string;
  let user2InternalLocation: string;
  let user3ExternalLocation: string;
  let user3InternalLocation: string;
  let user4ExternalLocation: string;
  let user4InternalLocation: string;
  let user5ExternalLocation: string;
  let user5InternalLocation: string;
  let user6ExternalLocation: string;
  let user6InternalLocation: string;
  let nucleusExternalLocation: string;
  let nucleusInternalLocation: string;
  let addressZeroExternalLocation: string;
  let addressZeroInternalLocation: string;

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
  let token4: MockERC20;
  let token5: MockERC20;
  let token6: MockERC20;
  let tokens:any[] = [];
  let nonstandardToken1: MockERC20NoReturnsSuccess;
  let nonstandardToken2: MockERC20NoReturnsRevert;
  let nonstandardToken3: MockERC20NoReturnsRevertWithError;
  let nonstandardToken4: MockERC20SuccessFalse;

  let chainID: number;
  let networkSettings: any;
  let snapshot: BN;

  let l1DataFeeAnalyzer = new L1DataFeeAnalyzer();

  before(async function () {
    [deployer, owner, user1, user2, user3, user4, user5, user6] = await ethers.getSigners();
    chainID = (await provider.getNetwork()).chainId;
    networkSettings = getNetworkSettings(chainID);
    if(!networkSettings.isTestnet) throw new Error("Do not run tests on production networks");
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    while(tokens.length < 6) {
      let token = await deployContract(deployer, "MockERC20", [`Token${tokens.length+1}`, `TKN${tokens.length+1}`, 18]) as MockERC20;
      tokens.push(token);
    }
    [token1, token2, token3, token4, token5, token6] = tokens;

    nonstandardToken1 = await deployContract(deployer, "MockERC20NoReturnsSuccess", [`NonstandardToken1`, `NSTKN1`, 18]) as MockERC20NoReturnsSuccess;
    nonstandardToken2 = await deployContract(deployer, "MockERC20NoReturnsRevert", [`NonstandardToken2`, `NSTKN2`, 18]) as MockERC20NoReturnsRevert;
    nonstandardToken3 = await deployContract(deployer, "MockERC20NoReturnsRevertWithError", [`NonstandardToken3`, `NSTKN3`, 18]) as MockERC20NoReturnsRevertWithError;
    nonstandardToken4 = await deployContract(deployer, "MockERC20SuccessFalse", [`NonstandardToken4`, `NSTKN4`, 18]) as MockERC20SuccessFalse;

    nucleus = await deployContract(deployer, "HydrogenNucleus", [owner.address]) as HydrogenNucleus;

    swapCallee1 = await deployContract(deployer, "MockFlashSwapCallee1", [nucleus.address]) as MockFlashSwapCallee1;
    swapCallee2 = await deployContract(deployer, "MockFlashSwapCallee2", [nucleus.address]) as MockFlashSwapCallee2;
    swapCallee3 = await deployContract(deployer, "MockFlashSwapCallee3", [nucleus.address]) as MockFlashSwapCallee3;
    swapCallee4 = await deployContract(deployer, "MockFlashSwapCallee4", [nucleus.address]) as MockFlashSwapCallee4;
    swapCallee5 = await deployContract(deployer, "MockFlashSwapCallee5", [nucleus.address]) as MockFlashSwapCallee5;
    swapCallee6 = await deployContract(deployer, "MockFlashSwapCallee6", [nucleus.address]) as MockFlashSwapCallee6;
    swapCallee7 = await deployContract(deployer, "MockFlashSwapCallee7", [nucleus.address]) as MockFlashSwapCallee7;
    swapCallee8 = await deployContract(deployer, "MockFlashSwapCallee8", [nucleus.address]) as MockFlashSwapCallee8;

    user1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
    user1InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
    user2ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
    user2InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
    user3ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user3.address);
    user3InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user3.address);
    user4ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user4.address);
    user4InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user4.address);
    user5ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user5.address);
    user5InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user5.address);
    user6ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user6.address);
    user6InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user6.address);
    nucleusExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(nucleus.address);
    nucleusInternalLocation = HydrogenNucleusHelper.internalAddressToLocation(nucleus.address);
    addressZeroExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(AddressZero);
    addressZeroInternalLocation = HydrogenNucleusHelper.internalAddressToLocation(AddressZero);
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  const funcs = [{
    name: "executeMarketOrderDstExt",
    hasLocationParams: false,
    dst: "ext",
    src: "any",
    hasFlashSwap: false,
  },{
    name: "executeMarketOrderDstInt",
    hasLocationParams: false,
    dst: "int",
    src: "any",
    hasFlashSwap: false,
  },{
    name: "executeMarketOrder",
    hasLocationParams: true,
    dst: "any",
    src: "loc",
    hasFlashSwap: false,
  },{
    name: "executeFlashSwap",
    hasLocationParams: true,
    dst: "any",
    src: "loc",
    hasFlashSwap: true,
  }];

  function assembleCall(params:any) {
    //console.log(`assembling call for ${params.functionName}`, params)
    if(params.functionName == "executeMarketOrder") {
      const swapParams = {
        poolID: params.poolID,
        tokenA: params.tokenA,
        tokenB: params.tokenB,
        amountA: params.amountA,
        amountB: params.amountB,
        locationA: params.locationA||HydrogenNucleusHelper.externalAddressToLocation(params.wallet.address),
        locationB: params.locationB||HydrogenNucleusHelper.externalAddressToLocation(params.wallet.address),
      }
      //console.log(`assembling call for ${params.functionName}`, swapParams)
      return nucleus.connect(params.wallet).executeMarketOrder(swapParams)
    } else if(params.functionName == "executeMarketOrderDstExt") {
      const swapParams = {
        poolID: params.poolID,
        tokenA: params.tokenA,
        tokenB: params.tokenB,
        amountA: params.amountA,
        amountB: params.amountB,
      }
      //console.log(`assembling call for ${params.functionName}`, swapParams)
      return nucleus.connect(params.wallet).executeMarketOrderDstExt(swapParams)
    } else if(params.functionName == "executeMarketOrderDstInt") {
      const swapParams = {
        poolID: params.poolID,
        tokenA: params.tokenA,
        tokenB: params.tokenB,
        amountA: params.amountA,
        amountB: params.amountB,
      }
      //console.log(`assembling call for ${params.functionName}`, swapParams)
      return nucleus.connect(params.wallet).executeMarketOrderDstInt(swapParams)
    } else if(params.functionName == "executeFlashSwap") {
      const swapParams = {
        poolID: params.poolID,
        tokenA: params.tokenA,
        tokenB: params.tokenB,
        amountA: params.amountA,
        amountB: params.amountB,
        locationA: params.locationA||HydrogenNucleusHelper.externalAddressToLocation(params.wallet.address),
        locationB: params.locationB||HydrogenNucleusHelper.externalAddressToLocation(params.wallet.address),
        flashSwapCallee: params.flashSwapCallee||AddressZero,
        callbackData: params.callbackData||"0x"
      }
      //console.log(`assembling call for ${params.functionName}`, swapParams)
      return nucleus.connect(params.wallet).executeFlashSwap(swapParams)
    } else {
      throw new Error(`unknown functionName ${params.functionName}`)
    }
  }

  describe("executeMarketOrder part 1", function () {
    let poolID0: number;
    let poolID1: number;
    let poolID2: number;
    let poolID3: number;
    let poolID4: number;
    let poolID5: number;
    let poolID6: number;
    let poolID7: number;
    let poolID8: number;
    let poolID9: number;

    for(const func of funcs) {
      describe(`using ${func.name}()`, function () {

        before("redeploy tokens, create more pools", async function () {
          // tokens
          while(tokens.length < 3) {
            let token = await deployContract(deployer, "MockERC20", [`Token${tokens.length+1}`, `TKN${tokens.length+1}`, 18]) as MockERC20;
            tokens.push(token);
          }
          [token1, token2, token3] = tokens;
          await token1.mint(user1.address, WeiPerEther.mul(10_000));
          await token1.mint(user2.address, WeiPerEther.mul(10_000));
          await token1.mint(user3.address, WeiPerEther.mul(10_000));
          await token2.mint(user1.address, WeiPerEther.mul(10_000));
          await token2.mint(user2.address, WeiPerEther.mul(10_000));
          await token3.mint(user1.address, WeiPerUsdc.mul(1_000_000));
          await token5.mint(user5.address, WeiPerEther.mul(10_000));
          await token6.mint(user6.address, WeiPerUsdc.mul(1_000_000));
          await token1.connect(user1).approve(nucleus.address, MaxUint256);
          await token1.connect(user2).approve(nucleus.address, MaxUint256);
          await token1.connect(user3).approve(nucleus.address, MaxUint256);
          await token2.connect(user1).approve(nucleus.address, MaxUint256);
          await token2.connect(user2).approve(nucleus.address, MaxUint256);
          await token3.connect(user1).approve(nucleus.address, MaxUint256);
          await token5.connect(user5).approve(nucleus.address, MaxUint256);
          await token6.connect(user6).approve(nucleus.address, MaxUint256);
          // poolID0
          await nucleus.connect(user1).createLimitOrderPool({
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: WeiPerEther.mul(200),
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(16, 100),
            locationA: user1ExternalLocation,
            locationB: user1InternalLocation,
            hptReceiver: user1.address
          });
          poolID0 = (await nucleus.totalSupply()).toNumber() * 1000 + 1;
          // poolID1
          await nucleus.connect(user2).createLimitOrderPool({
            tokenA: token2.address,
            tokenB: token1.address,
            amountA: WeiPerEther.mul(500),
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(10, 18),
            locationA: user2ExternalLocation,
            locationB: user2ExternalLocation,
            hptReceiver: user2.address
          });
          poolID1 = poolID0 + 1000;
          // poolID2
          await nucleus.connect(user1).createLimitOrderPool({
            tokenA: token2.address,
            tokenB: token3.address,
            amountA: WeiPerEther.mul(1_000),
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, 7_500_000),
            locationA: user1ExternalLocation,
            locationB: user1ExternalLocation,
            hptReceiver: user1.address
          });
          poolID2 = poolID1 + 1000;
          // poolID3
          await nucleus.connect(user1).createLimitOrderPool({
            tokenA: token3.address,
            tokenB: token1.address,
            amountA: WeiPerUsdc.mul(1_000_000),
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(8_000_000, WeiPerEther),
            locationA: user1ExternalLocation,
            locationB: user1ExternalLocation,
            hptReceiver: swapCallee4.address
          });
          poolID3 = poolID2 + 1000;
          // poolID4
          await nucleus.connect(user2).createLimitOrderPool({
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: WeiPerEther.mul(400),
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(0, 0),
            locationA: user2ExternalLocation,
            locationB: user2ExternalLocation,
            hptReceiver: user2.address
          });
          poolID4 = poolID3 + 1000;
          // poolID5
          await nucleus.connect(user1).createLimitOrderPool({
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: WeiPerEther.mul(100),
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 1),
            locationA: user1ExternalLocation,
            locationB: user1ExternalLocation,
            hptReceiver: user1.address
          });
          poolID5 = poolID4 + 1000;
          // poolID6
          await nucleus.connect(user3).createLimitOrderPool({
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: WeiPerEther.mul(50),
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(102, 100),
            locationA: user3ExternalLocation,
            locationB: user3ExternalLocation,
            hptReceiver: user3.address
          });
          poolID6 = poolID5 + 1000;
          // poolID7
          await nucleus.connect(user1).createLimitOrderPoolCompact({
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: WeiPerEther.mul(100),
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(2, 3),
          });
          poolID7 = poolID6 + 1000;
          // poolID8
          await nucleus.connect(user1).createGridOrderPool({
            tokenSources: [{
              token: token1.address,
              amount: WeiPerEther.mul(100),
              location: user1ExternalLocation
            },{
              token: token2.address,
              amount: WeiPerEther.mul(200),
              location: user1ExternalLocation
            }],
            tradeRequests: [{
              tokenA: token1.address,
              tokenB: token2.address,
              exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(3, 4),
              locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
            },{
              tokenA: token2.address,
              tokenB: token1.address,
              exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(4, 5),
              locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL
            }],
            hptReceiver: user1.address
          });
          poolID8 = poolID7 + 1000 + 1;
          // poolID9
          await nucleus.connect(user1).createGridOrderPoolCompact({
            tokenSources: [{
              token: token1.address,
              amount: WeiPerEther.mul(300),
            },{
              token: token2.address,
              amount: WeiPerEther.mul(400),
            }],
            exchangeRates: [
              HydrogenNucleusHelper.encodeExchangeRate(11, 12),
              HydrogenNucleusHelper.encodeExchangeRate(13, 14),
            ]
          });
          poolID9 = poolID8 + 1000;
        });
        it("cannot swap in non existant pool", async function () {
          let swapParams0 = {
            poolID: 0,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: 1,
            amountB: 1,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams0
          })
          await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
          let swapParams1 = {
            poolID: 999,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: 1,
            amountB: 1,
          }
          let call1 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams1
          })
          await expect(call1).to.be.revertedWithCustomError(nucleus, "HydrogenPoolDoesNotExist");
        });
        it("cannot swap tokens not supported by pool", async function () {
          let swapParams = {
            poolID: poolID5,
            tokenA: token1.address,
            tokenB: token3.address,
            amountA: 1,
            amountB: 1,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams
          })
          await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeTheseTokens");
        });
        it("cannot swap tokens in reverse direction", async function () {
          let swapParams = {
            poolID: poolID5,
            tokenA: token2.address,
            tokenB: token1.address,
            amountA: 1,
            amountB: 1,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams
          })
          await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeTheseTokens");
        });
        it("cannot swap if pool has invalid exchange rate", async function () {
          let swapParams = {
            poolID: poolID4,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: 1,
            amountB: 1,
          };
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams
          })
          await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeTheseTokens");
          let updateParams = {
            poolID: poolID4,
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(1, 0),
            locationB: user2ExternalLocation
          }
          await nucleus.connect(user2).updateLimitOrderPool(updateParams);
          let call1 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams
          })
          await expect(call1).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeTheseTokens");
          updateParams.exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(0, 1);
          await nucleus.connect(user2).updateLimitOrderPool(updateParams);
          let call2 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams
          })
          await expect(call2).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeTheseTokens");
          expect(await nucleus.reentrancyGuardState()).eq(1);
        });

        if(func.hasLocationParams) {
          it("cannot swap using funds from external address that isn't msg.sender", async function () {
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 1,
              locationA: user1ExternalLocation,
              locationB: user2ExternalLocation,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user1,
              ...swapParams
            })
            await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
          });
          it("cannot swap using funds from internal address that isn't msg.sender", async function () {
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 1,
              locationA: user1ExternalLocation,
              locationB: user2InternalLocation,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user1,
              ...swapParams
            })
            await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenTransferFromAccountNotMsgSender");
          });
          it("cannot swap using funds from nucleus external address as src", async function () {
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 1,
              locationA: user1ExternalLocation,
              locationB: nucleusExternalLocation,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user1,
              ...swapParams
            })
            await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
          });
          it("cannot swap sending funds to nucleus external address as dst", async function () {
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 1,
              locationA: nucleusExternalLocation,
              locationB: user1ExternalLocation,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user1,
              ...swapParams
            })
            await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
          });
          it("cannot swap using funds from nucleus internal address as src", async function () {
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 1,
              locationA: user1ExternalLocation,
              locationB: nucleusInternalLocation,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user1,
              ...swapParams
            })
            await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
          });
          it("cannot swap sending funds to nucleus internal address as dst", async function () {
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 1,
              locationA: nucleusInternalLocation,
              locationB: user1ExternalLocation,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user1,
              ...swapParams
            })
            await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
          });
          it("cannot swap sending funds to external address zero", async function () {
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 1,
              locationA: addressZeroExternalLocation,
              locationB: user1ExternalLocation,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user1,
              ...swapParams
            })
            await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
          });
          it("cannot swap sending funds to internal address zero", async function () {
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 1,
              locationA: addressZeroInternalLocation,
              locationB: user1ExternalLocation,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user1,
              ...swapParams
            })
            await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenAddressZero");
          });
          it("cannot swap using funds from external address with insufficient balance", async function () {
            let balance = await token2.balanceOf(user3.address);
            await token2.connect(user3).approve(nucleus.address, MaxUint256);
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: balance.add(1),
              locationA: user3ExternalLocation,
              locationB: user3ExternalLocation,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user3,
              ...swapParams
            })
            await expect(call0).to.be.revertedWith("ERC20: transfer amount exceeds balance");
          });
          it("cannot swap using funds from external address with insufficient allowance", async function () {
            await token2.connect(user3).approve(nucleus.address, 5);
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 6,
              locationA: user3ExternalLocation,
              locationB: user3ExternalLocation,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user3,
              ...swapParams
            })
            await expect(call0).to.be.revertedWith("ERC20: insufficient allowance");
          });
          it("cannot swap using funds from internal address with insufficient balance", async function () {
            let balance = await nucleus.getTokenBalance(token2.address, user2InternalLocation)
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: balance.add(1),
              locationA: user2ExternalLocation,
              locationB: user2InternalLocation,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user2,
              ...swapParams
            })
            await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientBalance");
          });
          it("cannot swap using funds from invalid location type", async function () {
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 1,
              locationA: user2ExternalLocation,
              locationB: INVALID_LOCATION_6,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user2,
              ...swapParams
            })
            await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
          });
          it("cannot swap and send funds to invalid location type", async function () {
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 1,
              locationA: INVALID_LOCATION_6,
              locationB: user2ExternalLocation,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user2,
              ...swapParams
            })
            await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
          });
          it("pool cannot trade against itself", async function () {
            let poolID = poolID5;
            let swapParams0 = {
              poolID: poolID,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 1,
              locationA: HydrogenNucleusHelper.poolIDtoLocation(poolID),
              locationB: user1ExternalLocation,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user1,
              ...swapParams0
            })
            await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeAgainstItself");
            let swapParams1 = {
              poolID: poolID,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 1,
              locationA: user1ExternalLocation,
              locationB: HydrogenNucleusHelper.poolIDtoLocation(poolID),
              flashSwapCallee: AddressZero,
              callbackData: "0x"
            }
            let call1 = assembleCall({
              functionName: func.name,
              wallet: user1,
              ...swapParams1
            })
            await expect(call1).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeAgainstItself");
            let swapParams2 = {
              poolID: poolID,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: 1,
              locationA: HydrogenNucleusHelper.poolIDtoLocation(poolID),
              locationB: HydrogenNucleusHelper.poolIDtoLocation(poolID),
              flashSwapCallee: AddressZero,
              callbackData: "0x"
            }
            let call2 = assembleCall({
              functionName: func.name,
              wallet: user1,
              ...swapParams2
            })
            await expect(call2).to.be.revertedWithCustomError(nucleus, "HydrogenPoolCannotTradeAgainstItself");
          });
        } else {
          it("cannot swap with insufficient balance", async function () {
            await token2.mint(user3.address, WeiPerEther.mul(100));
            await token2.connect(user3).approve(nucleus.address, MaxUint256);
            await nucleus.connect(user3).tokenTransferIn({token: token2.address, amount: WeiPerEther.mul(20)})
            let balanceExt = await token2.balanceOf(user3.address);
            let balanceInt = await nucleus.getTokenBalance(token2.address, user3InternalLocation);
            let balance = balanceExt.add(balanceInt);
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: balance.add(1),
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user3,
              ...swapParams
            })
            await expect(call0).to.be.revertedWith("ERC20: transfer amount exceeds balance");
          });
          it("cannot swap with insufficient allowance", async function () {
            let balanceExt = await token2.balanceOf(user3.address);
            let balanceInt = await nucleus.getTokenBalance(token2.address, user3InternalLocation);
            let balance = balanceExt.add(balanceInt);
            await token2.connect(user3).approve(nucleus.address, balanceExt.sub(1));
            let swapParams = {
              poolID: poolID5,
              tokenA: token1.address,
              tokenB: token2.address,
              amountA: 1,
              amountB: balance,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user3,
              ...swapParams
            })
            await expect(call0).to.be.revertedWith("ERC20: insufficient allowance");
          });
        }

        it("cannot swap more than pool capacity", async function () {
          let poolID = poolID5;
          let pool = await nucleus.getLimitOrderPool(poolID);
          let amountA = pool.amountA.add(1);
          let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, pool.exchangeRate);
          let swapParams = {
            poolID: poolID,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: amountA,
            amountB: amountB,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams
          })
          await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenInsufficientCapacity");
        });
        it("reverts insufficient amountA 1", async function () {
          let poolID = poolID5;
          let pool = await nucleus.getLimitOrderPool(poolID);
          let amountB = WeiPerEther.mul(10);
          let amountA = HydrogenNucleusHelper.calculateAmountA(amountB, pool.exchangeRate);
          expect(amountA).gt(0);
          amountA = amountA.add(1);
          let swapParams = {
            poolID: poolID,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: amountA,
            amountB: amountB,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams
          })
          await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
        });
        it("reverts excessive amountB 1", async function () {
          let poolID = poolID5;
          let amountA = WeiPerEther.mul(10);
          let pool = await nucleus.getLimitOrderPool(poolID);
          let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, pool.exchangeRate);
          amountB = amountB.sub(1);
          expect(amountB).gt(0);
          let swapParams = {
            poolID: poolID,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: amountA,
            amountB: amountB,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams
          })
          await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
        });
        it("reverts insufficient amountA 2", async function () {
          let poolID = poolID3;
          let pool = await nucleus.getLimitOrderPool(poolID);
          let amountB = WeiPerEther.mul(10);
          let amountA = HydrogenNucleusHelper.calculateAmountA(amountB, pool.exchangeRate);
          expect(amountA).gt(0);
          amountA = amountA.add(1);
          let swapParams = {
            poolID: poolID,
            tokenA: token3.address,
            tokenB: token1.address,
            amountA: amountA,
            amountB: amountB,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams
          })
          await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
        });
        it("reverts excessive amountB 2", async function () {
          let poolID = poolID3;
          let amountA = WeiPerUsdc.mul(10);
          let pool = await nucleus.getLimitOrderPool(poolID);
          let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, pool.exchangeRate);
          amountB = amountB.sub(1);
          expect(amountB).gt(0);
          let swapParams = {
            poolID: poolID,
            tokenA: token3.address,
            tokenB: token1.address,
            amountA: amountA,
            amountB: amountB,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams
          })
          await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
        });
        it("can swap 1", async function () {
          await token2.connect(user2).approve(nucleus.address, MaxUint256);
          let poolID = poolID5;
          let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
          let pool = await nucleus.getLimitOrderPool(poolID);
          let mtLocationAExt = user2ExternalLocation;
          let mtLocationAInt = user2InternalLocation;
          let mtLocationBExt = user2ExternalLocation;
          let mtLocationBInt = user2InternalLocation;
          let balNuA1 = await token1.balanceOf(nucleus.address);
          let balNuB1 = await token2.balanceOf(nucleus.address);
          let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
          let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
          let balMtAExt1 = await nucleus.getTokenBalance(token1.address, mtLocationAExt);
          let balMtAInt1 = await nucleus.getTokenBalance(token1.address, mtLocationAInt);
          let balMtBExt1 = await nucleus.getTokenBalance(token2.address, mtLocationBExt);
          let balMtBInt1 = await nucleus.getTokenBalance(token2.address, mtLocationBInt);
          let balMmB1 = await nucleus.getTokenBalance(token2.address, pool.locationB);
          let amountB = WeiPerEther.mul(10);
          let amountA = HydrogenNucleusHelper.calculateAmountA(amountB, pool.exchangeRate);
          expect(amountA).eq(amountB); // since pool is 1:1
          expect(amountA).gt(0);
          expect(amountB).gt(0);
          expect(amountA).lte(balPlA1);
          let swapParams = {
            poolID: poolID,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: amountA,
            amountB: amountB,
            locationA: mtLocationAExt,
            locationB: mtLocationBExt,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user2,
            ...swapParams
          })
          let tx = await call0;
          let balNuA2 = await token1.balanceOf(nucleus.address);
          let balNuB2 = await token2.balanceOf(nucleus.address);
          let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
          let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
          let balMtAExt2 = await nucleus.getTokenBalance(token1.address, mtLocationAExt);
          let balMtAInt2 = await nucleus.getTokenBalance(token1.address, mtLocationAInt);
          let balMtBExt2 = await nucleus.getTokenBalance(token2.address, mtLocationBExt);
          let balMtBInt2 = await nucleus.getTokenBalance(token2.address, mtLocationBInt);
          let balMmB2 = await nucleus.getTokenBalance(token2.address, pool.locationB);
          expect(balPlA1.sub(balPlA2)).eq(amountA);
          expect(balPlB2.sub(balPlB1)).eq(0);
          expect(balMmB2.sub(balMmB1)).eq(amountB);
          if(func.dst == "ext" || func.dst == "any") {
            expect(balNuA1.sub(balNuA2)).eq(amountA);
            expect(balMtAExt2.sub(balMtAExt1)).eq(amountA);
            expect(balMtAInt2.sub(balMtAInt1)).eq(0);
            await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amountA);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationAExt, amountA);
          } else {
            expect(balNuA1.sub(balNuA2)).eq(0);
            expect(balMtAExt2.sub(balMtAExt1)).eq(0);
            expect(balMtAInt2.sub(balMtAInt1)).eq(amountA);
            await expect(tx).to.not.emit(token1, "Transfer");
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationAInt, amountA);
          }
          if(func.src == "any") {
            if(balMtBInt1.gte(amountB)) {
              expect(balNuB1.sub(balNuB2)).eq(amountB);
              expect(balMtBExt1.sub(balMtBExt2)).eq(0);
              expect(balMtBInt1.sub(balMtBInt2)).eq(amountB);
              //await expect(tx).to.not.emit(token2, "Transfer");
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountB);
            } else if(balMtBInt1.eq(0)) {
              expect(balNuB2.sub(balNuB1)).eq(0);
              expect(balMtBExt1.sub(balMtBExt2)).eq(amountB);
              expect(balMtBInt1.sub(balMtBInt2)).eq(0);
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, poolLocation, amountB);
            } else {
              expect(balNuB1.sub(balNuB2)).eq(amountB.sub(balMtBInt1));
              expect(balMtBExt1.sub(balMtBExt2)).eq(amountB.sub(balMtBInt1));
              expect(balMtBInt2).eq(0);
              await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountB.sub(balMtBInt1));
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, mtLocationBInt, amountB.sub(balMtBInt1));
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountB);
            }
          } else {
            expect(balNuB2.sub(balNuB1)).eq(0);
            expect(balMtBExt1.sub(balMtBExt2)).eq(amountB);
            expect(balMtBInt1.sub(balMtBInt2)).eq(0);
            await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountB);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, poolLocation, amountB);
          }
          let pool2 = await nucleus.getLimitOrderPool(poolID);
          expect(pool2.tokenA).eq(pool.tokenA);
          expect(pool2.tokenB).eq(pool.tokenB);
          expect(pool2.amountA).eq(pool.amountA.sub(amountA));
          expect(pool2.exchangeRate).eq(pool.exchangeRate);
          expect(pool2.locationB).eq(pool.locationB);
          let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
          expect(tradeRequest2.amountA).eq(pool.amountA.sub(amountA));
          expect(tradeRequest2.exchangeRate).eq(pool.exchangeRate);
          expect(tradeRequest2.locationB).eq(pool.locationB);
          await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, poolLocation, pool.locationB, amountB);
          await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountA, amountB, amountB);
          l1DataFeeAnalyzer.register(func.name, tx);
        });
        it("can swap 2", async function () {
          // same pool. trade to capacity
          // from internal address to other internal address
          // setup user2 internal balance
          let depositAmount = WeiPerEther.mul(10_000);
          await token2.mint(user2.address, depositAmount);
          await token2.connect(user2).approve(nucleus.address, MaxUint256);
          await nucleus.connect(user2).tokenTransferIn({
            token: token2.address,
            amount: depositAmount
          });
          // test
          let poolID = poolID5;
          let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
          let pool = await nucleus.getLimitOrderPool(poolID);
          let mtLocationAExt = user2ExternalLocation;
          let mtLocationAInt = user2InternalLocation;
          let mtLocationBExt = user2ExternalLocation;
          let mtLocationBInt = user2InternalLocation;
          //let mtLocationB = ((func.dst == "int" || func.dst == "any") ? user2InternalLocation : user2ExternalLocation);
          let balNuA1 = await token1.balanceOf(nucleus.address);
          let balNuB1 = await token2.balanceOf(nucleus.address);
          let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
          let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
          let balMtAExt1 = await nucleus.getTokenBalance(token1.address, mtLocationAExt);
          let balMtAInt1 = await nucleus.getTokenBalance(token1.address, mtLocationAInt);
          let balMtBExt1 = await nucleus.getTokenBalance(token2.address, mtLocationBExt);
          let balMtBInt1 = await nucleus.getTokenBalance(token2.address, mtLocationBInt);
          let balMmB1 = await nucleus.getTokenBalance(token2.address, pool.locationB);
          let amountA = balPlA1;
          let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, pool.exchangeRate);
          expect(amountA).eq(amountB); // since pool is 1:1
          expect(amountA).gt(0);
          expect(amountB).gt(0);
          expect(amountB).lte(balMtBInt1);
          let swapParams = {
            poolID: poolID,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: amountA,
            amountB: amountB,
            locationA: mtLocationAInt,
            locationB: mtLocationBInt,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user2,
            ...swapParams
          })
          let tx = await call0;
          let balNuA2 = await token1.balanceOf(nucleus.address);
          let balNuB2 = await token2.balanceOf(nucleus.address);
          let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
          let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
          let balMtAExt2 = await nucleus.getTokenBalance(token1.address, mtLocationAExt);
          let balMtAInt2 = await nucleus.getTokenBalance(token1.address, mtLocationAInt);
          let balMtBExt2 = await nucleus.getTokenBalance(token2.address, mtLocationBExt);
          let balMtBInt2 = await nucleus.getTokenBalance(token2.address, mtLocationBInt);
          let balMmB2 = await nucleus.getTokenBalance(token2.address, pool.locationB);
          expect(balPlA1.sub(balPlA2)).eq(amountA);
          expect(balPlB2.sub(balPlB1)).eq(0);
          expect(balMmB2.sub(balMmB1)).eq(amountB);
          if(func.dst == "int" || func.dst == "any") {
            expect(balNuA1.sub(balNuA2)).eq(0);
            expect(balMtAExt2.sub(balMtAExt1)).eq(0);
            expect(balMtAInt2.sub(balMtAInt1)).eq(amountA);
            await expect(tx).to.not.emit(token1, "Transfer");
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationAInt, amountA);
          } else {
            expect(balNuA1.sub(balNuA2)).eq(amountA);
            expect(balMtAExt2.sub(balMtAExt1)).eq(amountA);
            expect(balMtAInt2.sub(balMtAInt1)).eq(0);
            await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amountA);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationAExt, amountA);
          }
          if(func.src == "any") {
            if(balMtBInt1.gte(amountB)) {
              expect(balNuB1.sub(balNuB2)).eq(amountB);
              expect(balMtBExt1.sub(balMtBExt2)).eq(0);
              expect(balMtBInt1.sub(balMtBInt2)).eq(amountB);
              //await expect(tx).to.not.emit(token2, "Transfer");
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountB);
            } else if(balMtBInt1.eq(0)) {
              expect(balNuB2.sub(balNuB1)).eq(0);
              expect(balMtBExt1.sub(balMtBExt2)).eq(amountB);
              expect(balMtBInt1.sub(balMtBInt2)).eq(0);
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, poolLocation, amountB);
            } else {
              expect(balNuB1.sub(balNuB2)).eq(amountB.sub(balMtBInt1));
              expect(balMtBExt1.sub(balMtBExt2)).eq(amountB.sub(balMtBInt1));
              expect(balMtBInt2).eq(0);
              await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountB.sub(balMtBInt1));
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, mtLocationBInt, amountB.sub(balMtBInt1));
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountB);
            }
          } else {
            expect(balNuB1.sub(balNuB2)).eq(amountB);
            expect(balMtBExt1.sub(balMtBExt2)).eq(0);
            expect(balMtBInt1.sub(balMtBInt2)).eq(amountB);
            //await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountB);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountB);
          }
          let pool2 = await nucleus.getLimitOrderPool(poolID);
          expect(pool2.tokenA).eq(pool.tokenA);
          expect(pool2.tokenB).eq(pool.tokenB);
          expect(pool2.amountA).eq(pool.amountA.sub(amountA));
          expect(pool2.exchangeRate).eq(pool.exchangeRate);
          expect(pool2.locationB).eq(pool.locationB);
          let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
          expect(tradeRequest2.amountA).eq(pool.amountA.sub(amountA));
          expect(tradeRequest2.exchangeRate).eq(pool.exchangeRate);
          expect(tradeRequest2.locationB).eq(pool.locationB);
          await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, poolLocation, pool.locationB, amountB);
          await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountA, amountB, amountB);
          l1DataFeeAnalyzer.register(func.name, tx);
        });
        it("can swap 3", async function () {
          // different pool. exchange rate not 1:1
          // to the market makers internal address
          // test
          let poolID = poolID0;
          let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
          let pool = await nucleus.getLimitOrderPool(poolID);
          let mtLocationAExt = user2ExternalLocation;
          let mtLocationAInt = user2InternalLocation;
          let mtLocationBExt = user2ExternalLocation;
          let mtLocationBInt = user2InternalLocation;
          //let mtLocationB = ((func.dst == "int" || func.dst == "any") ? user2InternalLocation : user2ExternalLocation);
          let balNuA1 = await token1.balanceOf(nucleus.address);
          let balNuB1 = await token2.balanceOf(nucleus.address);
          let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
          let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
          let balMtAExt1 = await nucleus.getTokenBalance(token1.address, mtLocationAExt);
          let balMtAInt1 = await nucleus.getTokenBalance(token1.address, mtLocationAInt);
          let balMtBExt1 = await nucleus.getTokenBalance(token2.address, mtLocationBExt);
          let balMtBInt1 = await nucleus.getTokenBalance(token2.address, mtLocationBInt);
          let balMmB1 = await nucleus.getTokenBalance(token2.address, pool.locationB);
          let amountA = WeiPerEther;
          let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, pool.exchangeRate);
          expect(amountA).lt(amountB);
          expect(amountA).eq(amountB.mul(16).div(100));
          expect(amountA).gt(0);
          expect(amountB).gt(0);
          expect(amountB).lte(balMtBInt1);
          let swapParams = {
            poolID: poolID,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: amountA,
            amountB: amountB,
            locationA: mtLocationAInt,
            locationB: mtLocationBInt,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user2,
            ...swapParams
          })
          let tx = await call0;
          let balNuA2 = await token1.balanceOf(nucleus.address);
          let balNuB2 = await token2.balanceOf(nucleus.address);
          let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
          let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
          let balMtAExt2 = await nucleus.getTokenBalance(token1.address, mtLocationAExt);
          let balMtAInt2 = await nucleus.getTokenBalance(token1.address, mtLocationAInt);
          let balMtBExt2 = await nucleus.getTokenBalance(token2.address, mtLocationBExt);
          let balMtBInt2 = await nucleus.getTokenBalance(token2.address, mtLocationBInt);
          let balMmB2 = await nucleus.getTokenBalance(token2.address, pool.locationB);
          expect(balPlA1.sub(balPlA2)).eq(amountA);
          expect(balPlB2.sub(balPlB1)).eq(0);
          expect(balMmB2.sub(balMmB1)).eq(amountB);
          if(func.dst == "int" || func.dst == "any") {
            expect(balNuA1.sub(balNuA2)).eq(0);
            expect(balMtAExt2.sub(balMtAExt1)).eq(0);
            expect(balMtAInt2.sub(balMtAInt1)).eq(amountA);
            await expect(tx).to.not.emit(token1, "Transfer");
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationAInt, amountA);
          } else {
            expect(balNuA1.sub(balNuA2)).eq(amountA);
            expect(balMtAExt2.sub(balMtAExt1)).eq(amountA);
            expect(balMtAInt2.sub(balMtAInt1)).eq(0);
            await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amountA);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationAExt, amountA);
          }
          if(func.src == "any") {
            if(balMtBInt1.gte(amountB)) {
              expect(balNuB1.sub(balNuB2)).eq(0);
              expect(balMtBExt1.sub(balMtBExt2)).eq(0);
              expect(balMtBInt1.sub(balMtBInt2)).eq(amountB);
              //await expect(tx).to.not.emit(token2, "Transfer");
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountB);
            } else if(balMtBInt1.eq(0)) {
              expect(balNuB2.sub(balNuB1)).eq(0);
              expect(balMtBExt1.sub(balMtBExt2)).eq(amountB);
              expect(balMtBInt1.sub(balMtBInt2)).eq(0);
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, poolLocation, amountB);
            } else {
              expect(balNuB1.sub(balNuB2)).eq(amountB.sub(balMtBInt1));
              expect(balMtBExt1.sub(balMtBExt2)).eq(amountB.sub(balMtBInt1));
              expect(balMtBInt2).eq(0);
              await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountB.sub(balMtBInt1));
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, mtLocationBInt, amountB.sub(balMtBInt1));
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountB);
            }
          } else {
            expect(balNuB1.sub(balNuB2)).eq(0);
            expect(balMtBExt1.sub(balMtBExt2)).eq(0);
            expect(balMtBInt1.sub(balMtBInt2)).eq(amountB);
            //await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountB);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountB);
          }
          let pool2 = await nucleus.getLimitOrderPool(poolID);
          expect(pool2.tokenA).eq(pool.tokenA);
          expect(pool2.tokenB).eq(pool.tokenB);
          expect(pool2.amountA).eq(pool.amountA.sub(amountA));
          expect(pool2.exchangeRate).eq(pool.exchangeRate);
          expect(pool2.locationB).eq(pool.locationB);
          let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
          expect(tradeRequest2.amountA).eq(pool.amountA.sub(amountA));
          expect(tradeRequest2.exchangeRate).eq(pool.exchangeRate);
          expect(tradeRequest2.locationB).eq(pool.locationB);
          await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, poolLocation, pool.locationB, amountB);
          await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountA, amountB, amountB);
          l1DataFeeAnalyzer.register(func.name, tx);
        });
        it("can swap 4", async function () {
          // same pool. exchange rate not 1:1
          // tokenB kept in the pool
          let poolID = poolID0;
          await nucleus.connect(user1).updateLimitOrderPool({
            poolID: poolID,
            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(16, 100),
            locationB: HydrogenNucleusHelper.poolIDtoLocation(poolID),
          });
          // test
          let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
          let pool = await nucleus.getLimitOrderPool(poolID);
          let mtLocationAExt = user2ExternalLocation;
          let mtLocationAInt = user2InternalLocation;
          let mtLocationBExt = user2ExternalLocation;
          let mtLocationBInt = user2InternalLocation;
          //let mtLocationB = ((func.dst == "int" || func.dst == "any") ? user2InternalLocation : user2ExternalLocation);
          let balNuA1 = await token1.balanceOf(nucleus.address);
          let balNuB1 = await token2.balanceOf(nucleus.address);
          let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
          let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
          let balMtAExt1 = await nucleus.getTokenBalance(token1.address, mtLocationAExt);
          let balMtAInt1 = await nucleus.getTokenBalance(token1.address, mtLocationAInt);
          let balMtBExt1 = await nucleus.getTokenBalance(token2.address, mtLocationBExt);
          let balMtBInt1 = await nucleus.getTokenBalance(token2.address, mtLocationBInt);
          let amountA = WeiPerEther.mul(2);
          let amountB = HydrogenNucleusHelper.calculateAmountB(amountA, pool.exchangeRate);
          expect(amountA).lt(amountB);
          expect(amountA).eq(amountB.mul(16).div(100));
          expect(amountA).gt(0);
          expect(amountB).gt(0);
          expect(amountB).lte(balMtBInt1);
          let swapParams = {
            poolID: poolID,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: amountA,
            amountB: amountB,
            locationA: mtLocationAInt,
            locationB: mtLocationBInt,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user2,
            ...swapParams
          })
          let tx = await call0;
          let balNuA2 = await token1.balanceOf(nucleus.address);
          let balNuB2 = await token2.balanceOf(nucleus.address);
          let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
          let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
          let balMtAExt2 = await nucleus.getTokenBalance(token1.address, mtLocationAExt);
          let balMtAInt2 = await nucleus.getTokenBalance(token1.address, mtLocationAInt);
          let balMtBExt2 = await nucleus.getTokenBalance(token2.address, mtLocationBExt);
          let balMtBInt2 = await nucleus.getTokenBalance(token2.address, mtLocationBInt);
          expect(balPlA1.sub(balPlA2)).eq(amountA);
          expect(balPlB2.sub(balPlB1)).eq(amountB);
          if(func.dst == "int" || func.dst == "any") {
            expect(balNuA1.sub(balNuA2)).eq(0);
            expect(balMtAExt2.sub(balMtAExt1)).eq(0);
            expect(balMtAInt2.sub(balMtAInt1)).eq(amountA);
            await expect(tx).to.not.emit(token1, "Transfer");
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationAInt, amountA);
          } else {
            expect(balNuA1.sub(balNuA2)).eq(amountA);
            expect(balMtAExt2.sub(balMtAExt1)).eq(amountA);
            expect(balMtAInt2.sub(balMtAInt1)).eq(0);
            await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amountA);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationAExt, amountA);
          }
          if(func.src == "any") {
            if(balMtBInt1.gte(amountB)) {
              expect(balNuB1.sub(balNuB2)).eq(0);
              expect(balMtBExt1.sub(balMtBExt2)).eq(0);
              expect(balMtBInt1.sub(balMtBInt2)).eq(amountB);
              //await expect(tx).to.not.emit(token2, "Transfer");
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountB);
            } else if(balMtBInt1.eq(0)) {
              expect(balNuB2.sub(balNuB1)).eq(0);
              expect(balMtBExt1.sub(balMtBExt2)).eq(amountB);
              expect(balMtBInt1.sub(balMtBInt2)).eq(0);
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, poolLocation, amountB);
            } else {
              expect(balNuB1.sub(balNuB2)).eq(amountB.sub(balMtBInt1));
              expect(balMtBExt1.sub(balMtBExt2)).eq(amountB.sub(balMtBInt1));
              expect(balMtBInt2).eq(0);
              await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountB.sub(balMtBInt1));
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, mtLocationBInt, amountB.sub(balMtBInt1));
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountB);
            }
          } else {
            expect(balNuB1.sub(balNuB2)).eq(0);
            expect(balMtBExt1.sub(balMtBExt2)).eq(0);
            expect(balMtBInt1.sub(balMtBInt2)).eq(amountB);
            //await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountB);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountB);
          }
          let pool2 = await nucleus.getLimitOrderPool(poolID);
          expect(pool2.tokenA).eq(pool.tokenA);
          expect(pool2.tokenB).eq(pool.tokenB);
          expect(pool2.amountA).eq(pool.amountA.sub(amountA));
          expect(pool2.exchangeRate).eq(pool.exchangeRate);
          expect(pool2.locationB).eq(pool.locationB);
          let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
          expect(tradeRequest2.amountA).eq(pool.amountA.sub(amountA));
          expect(tradeRequest2.exchangeRate).eq(pool.exchangeRate);
          expect(tradeRequest2.locationB).eq(pool.locationB);
          await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountA, amountB, amountB);
          l1DataFeeAnalyzer.register(func.name, tx);
        });
        if(func.hasLocationParams) {
          it("can swap 5", async function () {
            // user1 has an open limit order to sell token1 for token2 at 1.6 token1/token2
            // user2 has an open limit order to buy token1 for token2 at 1.8 token1/token2
            // user1 pulls token1 from his pool, market buys in user2's pool, and sends the funds to his other pool
            // careful each pool's tokenA and tokenB are different
            let srcPoolID = poolID0;
            let srcPoolLocation = HydrogenNucleusHelper.poolIDtoLocation(srcPoolID);
            let swapPoolID = poolID1;
            let swapPoolLocation = HydrogenNucleusHelper.poolIDtoLocation(swapPoolID);
            let dstPoolID = poolID2;
            let dstPoolLocation = HydrogenNucleusHelper.poolIDtoLocation(dstPoolID);
            let swapPool = await nucleus.getLimitOrderPool(swapPoolID);
            let mtLocationA = dstPoolLocation;
            let mtLocationB = srcPoolLocation;
            let balNuA1 = await token2.balanceOf(nucleus.address);
            let balNuB1 = await token1.balanceOf(nucleus.address);
            let balPlA1 = await nucleus.getTokenBalance(token2.address, swapPoolLocation);
            let balPlB1 = await nucleus.getTokenBalance(token1.address, swapPoolLocation);
            let balMtA1 = await nucleus.getTokenBalance(token2.address, mtLocationA);
            let balMtB1 = await nucleus.getTokenBalance(token1.address, mtLocationB);
            let balMmB1 = await nucleus.getTokenBalance(token1.address, swapPool.locationB);
            let amountB = balMtB1;
            let amountA = HydrogenNucleusHelper.calculateAmountA(amountB, swapPool.exchangeRate);
            expect(amountA).eq(amountB.mul(10).div(18));
            expect(amountA).gt(0);
            expect(amountB).gt(0);
            expect(amountA).lte(balPlA1);
            expect(amountB).lte(balMtB1);
            let swapParams = {
              poolID: swapPoolID,
              tokenA: token2.address,
              tokenB: token1.address,
              amountA: amountA,
              amountB: amountB,
              locationA: mtLocationA,
              locationB: mtLocationB,
            }
            let call0 = assembleCall({
              functionName: func.name,
              wallet: user1,
              ...swapParams
            })
            let tx = await call0;
            let balNuA2 = await token2.balanceOf(nucleus.address);
            let balNuB2 = await token1.balanceOf(nucleus.address);
            let balPlA2 = await nucleus.getTokenBalance(token2.address, swapPoolLocation);
            let balPlB2 = await nucleus.getTokenBalance(token1.address, swapPoolLocation);
            let balMtA2 = await nucleus.getTokenBalance(token2.address, mtLocationA);
            let balMtB2 = await nucleus.getTokenBalance(token1.address, mtLocationB);
            let balMmB2 = await nucleus.getTokenBalance(token1.address, swapPool.locationB);
            expect(balNuA1.sub(balNuA2)).eq(0);
            expect(balPlA1.sub(balPlA2)).eq(amountA);
            expect(balMtA2.sub(balMtA1)).eq(amountA);
            expect(balNuB1.sub(balNuB2)).eq(amountB);
            expect(balPlB2.sub(balPlB1)).eq(0);
            expect(balMtB1.sub(balMtB2)).eq(amountB);
            expect(balMmB2.sub(balMmB1)).eq(amountB);
            let pool2 = await nucleus.getLimitOrderPool(swapPoolID);
            expect(pool2.tokenA).eq(swapPool.tokenA);
            expect(pool2.tokenB).eq(swapPool.tokenB);
            expect(pool2.amountA).eq(swapPool.amountA.sub(amountA));
            expect(pool2.exchangeRate).eq(swapPool.exchangeRate);
            expect(pool2.locationB).eq(swapPool.locationB);
            let tradeRequest2 = await nucleus.getTradeRequest(swapPoolID, token2.address, token1.address);
            expect(tradeRequest2.amountA).eq(swapPool.amountA.sub(amountA));
            expect(tradeRequest2.exchangeRate).eq(swapPool.exchangeRate);
            expect(tradeRequest2.locationB).eq(swapPool.locationB);
            await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amountB);
            await expect(tx).to.not.emit(token2, "Transfer");
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, swapPoolLocation, mtLocationA, amountA);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, mtLocationB, swapPoolLocation, amountB);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, swapPoolLocation, swapPool.locationB, amountB);
            await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(swapPoolID, token2.address, token1.address, amountA, amountB, amountB);
          });
        }
        it("can swap 6", async function () {
          // with fees
          let feePPM = MAX_PPM.mul(1).div(1000);
          let feeReceiverLocation = HydrogenNucleusHelper.internalAddressToLocation(user3.address);
          await nucleus.connect(owner).setSwapFeesForPairs([{
            tokenA: token1.address,
            tokenB: token2.address,
            feePPM: feePPM,
            receiverLocation: feeReceiverLocation
          }]);
          let poolID = poolID7;
          let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
          let pool = await nucleus.getLimitOrderPool(poolID);
          let mtLocationAExt = user2ExternalLocation;
          let mtLocationAInt = user2InternalLocation;
          let mtLocationBExt = user2ExternalLocation;
          let mtLocationBInt = user2InternalLocation;
          let balNuA1 = await token1.balanceOf(nucleus.address);
          let balNuB1 = await token2.balanceOf(nucleus.address);
          let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
          let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
          let balMtAExt1 = await nucleus.getTokenBalance(token1.address, mtLocationAExt);
          let balMtAInt1 = await nucleus.getTokenBalance(token1.address, mtLocationAInt);
          let balMtBExt1 = await nucleus.getTokenBalance(token2.address, mtLocationBExt);
          let balMtBInt1 = await nucleus.getTokenBalance(token2.address, mtLocationBInt);
          let balMmB1 = await nucleus.getTokenBalance(token2.address, pool.locationB);
          let balFrB1 = await nucleus.getTokenBalance(token2.address, feeReceiverLocation);
          let amountBMT = WeiPerEther.mul(10);
          let { amountAMT, amountAMM, amountBMM, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactBMT(amountBMT, pool.exchangeRate, feePPM);
          expect(amountAMT).lt(amountBMT);
          expect(amountAMT).gt(0);
          expect(amountAMM).gt(0);
          expect(amountBMT).gt(0);
          expect(amountBFR).gt(0);
          expect(amountAMM).lte(balPlA1);
          let swapParams = {
            poolID: poolID,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: amountAMT,
            amountB: amountBMT,
            locationA: mtLocationAExt,
            locationB: mtLocationBExt,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user2,
            ...swapParams
          })
          let tx = await call0;
          let balNuA2 = await token1.balanceOf(nucleus.address);
          let balNuB2 = await token2.balanceOf(nucleus.address);
          let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
          let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
          let balMtAExt2 = await nucleus.getTokenBalance(token1.address, mtLocationAExt);
          let balMtAInt2 = await nucleus.getTokenBalance(token1.address, mtLocationAInt);
          let balMtBExt2 = await nucleus.getTokenBalance(token2.address, mtLocationBExt);
          let balMtBInt2 = await nucleus.getTokenBalance(token2.address, mtLocationBInt);
          let balMmB2 = await nucleus.getTokenBalance(token2.address, pool.locationB);
          let balFrB2 = await nucleus.getTokenBalance(token2.address, feeReceiverLocation);
          expect(balPlA1.sub(balPlA2)).eq(amountAMM);
          expect(balPlB2.sub(balPlB1)).eq(0);
          expect(balMmB2.sub(balMmB1)).eq(amountBMM);
          expect(balFrB2.sub(balFrB1)).eq(amountBFR);
          if(func.dst == "ext" || func.dst == "any") {
            expect(balNuA1.sub(balNuA2)).eq(amountAMT);
            expect(balMtAExt2.sub(balMtAExt1)).eq(amountAMT);
            expect(balMtAInt2.sub(balMtAInt1)).eq(0);
            await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amountAMT);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationAExt, amountAMT);
          } else {
            expect(balNuA1.sub(balNuA2)).eq(0);
            expect(balMtAExt2.sub(balMtAExt1)).eq(0);
            expect(balMtAInt2.sub(balMtAInt1)).eq(amountAMT);
            await expect(tx).to.not.emit(token1, "Transfer");
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationAInt, amountAMT);
          }
          if(func.src == "any") {
            if(balMtBInt1.gte(amountBMT)) {
              expect(balNuB1.sub(balNuB2)).eq(amountBMM);
              expect(balMtBExt1.sub(balMtBExt2)).eq(0);
              expect(balMtBInt1.sub(balMtBInt2)).eq(amountBMT);
              //await expect(tx).to.not.emit(token2, "Transfer");
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountBMM);
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, feeReceiverLocation, amountBFR);
            } else if(balMtBInt1.eq(0)) {
              expect(balNuB2.sub(balNuB1)).eq(0);
              expect(balMtBExt1.sub(balMtBExt2)).eq(amountBMT);
              expect(balMtBInt1.sub(balMtBInt2)).eq(0);
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, poolLocation, amountBMM);
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, feeReceiverLocation, amountBFR);
            } else {
              expect(balNuB1.sub(balNuB2)).eq(amountBMT.sub(balMtBInt1));
              expect(balMtBExt1.sub(balMtBExt2)).eq(amountBMT.sub(balMtBInt1));
              expect(balMtBInt2).eq(0);
              await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountBMT.sub(balMtBInt1));
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, mtLocationBInt, amountBMT.sub(balMtBInt1));
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountBMM);
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, feeReceiverLocation, amountBFR);
            }
          } else {
            expect(balNuB2.sub(balNuB1)).eq(amountBFR);
            expect(balMtBExt1.sub(balMtBExt2)).eq(amountBMT);
            expect(balMtBInt1.sub(balMtBInt2)).eq(0);
            await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountBMT);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, poolLocation, amountBMM);
          }
          let pool2 = await nucleus.getLimitOrderPool(poolID);
          expect(pool2.tokenA).eq(pool.tokenA);
          expect(pool2.tokenB).eq(pool.tokenB);
          expect(pool2.amountA).eq(pool.amountA.sub(amountAMT));
          expect(pool2.exchangeRate).eq(pool.exchangeRate);
          expect(pool2.locationB).eq(pool.locationB);
          let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
          expect(tradeRequest2.amountA).eq(pool.amountA.sub(amountAMT));
          expect(tradeRequest2.exchangeRate).eq(pool.exchangeRate);
          expect(tradeRequest2.locationB).eq(pool.locationB);
          await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, poolLocation, pool.locationB, amountBMM);
          await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountAMT, amountBMT, amountBMM);
          l1DataFeeAnalyzer.register(func.name, tx);
        });
        it("reverts insufficient amountA 3", async function () {
          let poolID = poolID7;
          let pool = await nucleus.getLimitOrderPool(poolID);
          let feePPM = MAX_PPM.mul(1).div(1000);
          let amountBMT = WeiPerEther.mul(10);
          let { amountAMT, amountBMM, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactBMT(amountBMT, pool.exchangeRate, feePPM);
          expect(amountAMT).gt(0);
          amountAMT = amountAMT.add(1);
          expect(amountBMM).gt(0);
          expect(amountBFR).gt(0);
          expect(amountBMT).not.eq(amountBMM);
          expect(amountBMT).not.eq(amountBFR);
          expect(amountBMM).not.eq(amountBFR);
          let swapParams = {
            poolID: poolID,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: amountAMT,
            amountB: amountBMT,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams
          })
          await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
        });
        it("reverts excessive amountB 3", async function () {
          let poolID = poolID7;
          let pool = await nucleus.getLimitOrderPool(poolID);
          let feePPM = MAX_PPM.mul(1).div(1000);
          let amountAMT = WeiPerUsdc.mul(10);
          let { amountBMT, amountBMM, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactAMT(amountAMT, pool.exchangeRate, feePPM);
          amountBMT = amountBMT.sub(1);
          expect(amountBMT).gt(0);
          let swapParams = {
            poolID: poolID,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: amountAMT,
            amountB: amountBMT,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user1,
            ...swapParams
          })
          await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
        });
        it("can swap 7", async function () {
          // trade against a grid order
          let feePPM = MAX_PPM.mul(1).div(1000);
          let feeReceiverLocation = HydrogenNucleusHelper.internalAddressToLocation(user3.address);
          let poolID = poolID8;
          let poolLocation = HydrogenNucleusHelper.poolIDtoLocation(poolID);
          let tradeRequest = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
          let mtLocationAExt = user2ExternalLocation;
          let mtLocationAInt = user2InternalLocation;
          let mtLocationBExt = user2ExternalLocation;
          let mtLocationBInt = user2InternalLocation;
          let balNuA1 = await token1.balanceOf(nucleus.address);
          let balNuB1 = await token2.balanceOf(nucleus.address);
          let balPlA1 = await nucleus.getTokenBalance(token1.address, poolLocation);
          let balPlB1 = await nucleus.getTokenBalance(token2.address, poolLocation);
          let balMtAExt1 = await nucleus.getTokenBalance(token1.address, mtLocationAExt);
          let balMtAInt1 = await nucleus.getTokenBalance(token1.address, mtLocationAInt);
          let balMtBExt1 = await nucleus.getTokenBalance(token2.address, mtLocationBExt);
          let balMtBInt1 = await nucleus.getTokenBalance(token2.address, mtLocationBInt);
          let balMmB1 = await nucleus.getTokenBalance(token2.address, tradeRequest.locationB);
          let balFrB1 = await nucleus.getTokenBalance(token2.address, feeReceiverLocation);
          let amountBMT = WeiPerEther.mul(10);
          let { amountAMT, amountAMM, amountBMM, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactBMT(amountBMT, tradeRequest.exchangeRate, feePPM);
          expect(amountAMT).lt(amountBMT);
          expect(amountAMT).gt(0);
          expect(amountAMM).gt(0);
          expect(amountBMT).gt(0);
          expect(amountBFR).gt(0);
          expect(amountAMM).lte(balPlA1);
          let swapParams = {
            poolID: poolID,
            tokenA: token1.address,
            tokenB: token2.address,
            amountA: amountAMT,
            amountB: amountBMT,
            locationA: mtLocationAExt,
            locationB: mtLocationBExt,
          }
          let call0 = assembleCall({
            functionName: func.name,
            wallet: user2,
            ...swapParams
          })
          let tx = await call0;
          let balNuA2 = await token1.balanceOf(nucleus.address);
          let balNuB2 = await token2.balanceOf(nucleus.address);
          let balPlA2 = await nucleus.getTokenBalance(token1.address, poolLocation);
          let balPlB2 = await nucleus.getTokenBalance(token2.address, poolLocation);
          let balMtAExt2 = await nucleus.getTokenBalance(token1.address, mtLocationAExt);
          let balMtAInt2 = await nucleus.getTokenBalance(token1.address, mtLocationAInt);
          let balMtBExt2 = await nucleus.getTokenBalance(token2.address, mtLocationBExt);
          let balMtBInt2 = await nucleus.getTokenBalance(token2.address, mtLocationBInt);
          let balMmB2 = await nucleus.getTokenBalance(token2.address, tradeRequest.locationB);
          let balFrB2 = await nucleus.getTokenBalance(token2.address, feeReceiverLocation);
          expect(balPlA1.sub(balPlA2)).eq(amountAMM);
          expect(balPlB2.sub(balPlB1)).eq(amountBMM);
          expect(balMmB2.sub(balMmB1)).eq(amountBMM);
          expect(balFrB2.sub(balFrB1)).eq(amountBFR);
          if(func.dst == "ext" || func.dst == "any") {
            expect(balNuA1.sub(balNuA2)).eq(amountAMT);
            expect(balMtAExt2.sub(balMtAExt1)).eq(amountAMT);
            expect(balMtAInt2.sub(balMtAInt1)).eq(0);
            await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, user2.address, amountAMT);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationAExt, amountAMT);
          } else {
            expect(balNuA1.sub(balNuA2)).eq(0);
            expect(balMtAExt2.sub(balMtAExt1)).eq(0);
            expect(balMtAInt2.sub(balMtAInt1)).eq(amountAMT);
            await expect(tx).to.not.emit(token1, "Transfer");
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, poolLocation, mtLocationAInt, amountAMT);
          }
          if(func.src == "any") {
            if(balMtBInt1.gte(amountBMT)) {
              expect(balNuB1.sub(balNuB2)).eq(0);
              expect(balMtBExt1.sub(balMtBExt2)).eq(0);
              expect(balMtBInt1.sub(balMtBInt2)).eq(amountBMT);
              //await expect(tx).to.not.emit(token2, "Transfer");
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountBMM);
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, feeReceiverLocation, amountBFR);
            } else if(balMtBInt1.eq(0)) {
              expect(balNuB2.sub(balNuB1)).eq(0);
              expect(balMtBExt1.sub(balMtBExt2)).eq(amountBMT);
              expect(balMtBInt1.sub(balMtBInt2)).eq(0);
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, poolLocation, amountBMM);
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, feeReceiverLocation, amountBFR);
            } else {
              expect(balNuB1.sub(balNuB2)).eq(amountBMT.sub(balMtBInt1));
              expect(balMtBExt1.sub(balMtBExt2)).eq(amountBMT.sub(balMtBInt1));
              expect(balMtBInt2).eq(0);
              await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountBMT.sub(balMtBInt1));
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, mtLocationBInt, amountBMT.sub(balMtBInt1));
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, poolLocation, amountBMM);
              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBInt, feeReceiverLocation, amountBFR);
            }
          } else {
            expect(balNuB2.sub(balNuB1)).eq(amountBMT);
            expect(balMtBExt1.sub(balMtBExt2)).eq(amountBMT);
            expect(balMtBInt1.sub(balMtBInt2)).eq(0);
            await expect(tx).to.emit(token2, "Transfer").withArgs(user2.address, nucleus.address, amountBMT);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, mtLocationBExt, poolLocation, amountBMM);
          }
          let tradeRequest2 = await nucleus.getTradeRequest(poolID, token1.address, token2.address);
          expect(tradeRequest2.amountA).eq(tradeRequest.amountA.sub(amountAMT));
          expect(tradeRequest2.exchangeRate).eq(tradeRequest.exchangeRate);
          expect(tradeRequest2.locationB).eq(tradeRequest.locationB);
          await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token1.address, token2.address, amountAMT, amountBMT, amountBMM);
          l1DataFeeAnalyzer.register(func.name, tx);
        });
        it("rezero fees", async function () {
          let feePPM = 0;
          let feeReceiverLocation = HydrogenNucleusHelper.internalAddressToLocation(user3.address);
          await nucleus.connect(owner).setSwapFeesForPairs([{
            tokenA: token1.address,
            tokenB: token2.address,
            feePPM: feePPM,
            receiverLocation: feeReceiverLocation
          }]);
        });

        // already looping over swap function. should also loop over other settings
        // swap fee settings
        //
        for(const defaultFee of [0, 2000]) {
          context(`with a defaultFee of ${defaultFee}`, function () {
            before(async function () {
              await nucleus.connect(owner).setSwapFeesForPairs([{
                tokenA: AddressZero,
                tokenB: AddressZero,
                feePPM: defaultFee,
                receiverLocation: user3InternalLocation
              }])
            })
            after(async function () {
              await nucleus.connect(owner).setSwapFeesForPairs([{
                tokenA: AddressZero,
                tokenB: AddressZero,
                feePPM: 0,
                receiverLocation: user3InternalLocation
              }])
            })
            for(const pairFee of [0, 100]) {
              context(`with a pairFee of ${pairFee}`, function () {
                const [swapFeePPM, swapFeeReceiver] = ((!!pairFee)
                  ? [pairFee,user4InternalLocation]
                  : [defaultFee,user3InternalLocation])
                before(async function () {
                  await nucleus.connect(owner).setSwapFeesForPairs([{
                    tokenA: token5.address,
                    tokenB: token6.address,
                    feePPM: pairFee,
                    receiverLocation: user4InternalLocation
                  }])
                })
                for(const createFunc of ["createLimitOrderPool", "createLimitOrderPoolCompact", "createGridOrderPool", "createGridOrderPoolCompact"]) {
                  context(`with a createFunc of ${createFunc}`, function () {
                    let poolID: number
                    let poolLocation: string
                    let updateFuncs: []
                    if(createFunc.includes("createLimitOrderPool")) updateFuncs = ["updateLimitOrderPool", "updateLimitOrderPoolCompact"]
                    else updateFuncs = ["updateGridOrder", "updateGridOrderCompact"]
                    before(async function () {
                      if(createFunc == "createLimitOrderPool") {
                        await nucleus.connect(user5).createLimitOrderPool({
                          tokenA: token5.address,
                          tokenB: token6.address,
                          amountA: WeiPerEther.mul(100),
                          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerUsdc.mul(1800)),
                          locationA: user5ExternalLocation,
                          locationB: user5ExternalLocation,
                          hptReceiver: user5.address,
                        });
                        poolID = (await nucleus.totalSupply()).toNumber() * 1000 + 1
                      } else if(createFunc == "createLimitOrderPoolCompact") {
                        await nucleus.connect(user5).createLimitOrderPoolCompact({
                          tokenA: token5.address,
                          tokenB: token6.address,
                          amountA: WeiPerEther.mul(100),
                          exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerUsdc.mul(1800)),
                        });
                        poolID = (await nucleus.totalSupply()).toNumber() * 1000 + 1
                      } else if(createFunc == "createGridOrderPool") {
                        await nucleus.connect(user5).createGridOrderPool({
                          tokenSources: [{
                            token: token5.address,
                            amount: WeiPerEther.mul(100),
                            location: user5ExternalLocation,
                          }],
                          tradeRequests: [{
                            tokenA: token5.address,
                            tokenB: token6.address,
                            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerUsdc.mul(1800)),
                            locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
                          },{
                            tokenA: token6.address,
                            tokenB: token5.address,
                            exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(1700), WeiPerEther),
                            locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
                          }],
                          hptReceiver: user5.address,
                        });
                        poolID = (await nucleus.totalSupply()).toNumber() * 1000 + 2
                      } else if(createFunc == "createGridOrderPoolCompact") {
                        await nucleus.connect(user5).createGridOrderPoolCompact({
                          tokenSources: [{
                            token: token5.address,
                            amount: WeiPerEther.mul(100),
                          },{
                            token: token6.address,
                            amount: 0,
                          }],
                          exchangeRates: [
                            HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerUsdc.mul(1800)),
                            HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(1700), WeiPerEther),
                          ]
                        });
                        poolID = (await nucleus.totalSupply()).toNumber() * 1000 + 2
                      } else throw "bruh1"
                      poolLocation = await HydrogenNucleusHelper.poolIDtoLocation(poolID)
                    })
                    it("reverts insufficient amountA 4", async function () {
                      let tradeRequest = await nucleus.getTradeRequest(poolID, token5.address, token6.address);
                      let amountBMT = WeiPerUsdc.mul(10);
                      let { amountAMT, amountBMM, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactBMT(amountBMT, tradeRequest.exchangeRate, swapFeePPM);
                      expect(amountAMT).gt(0);
                      amountAMT = amountAMT.add(1);
                      expect(amountBMT).gt(0);
                      expect(amountBMM).gt(0);
                      if(swapFeePPM > 0) {
                        expect(amountBFR).gt(0);
                        expect(amountBMT).not.eq(amountBMM);
                        expect(amountBMT).not.eq(amountBFR);
                        expect(amountBMM).not.eq(amountBFR);
                      }
                      let swapParams = {
                        poolID: poolID,
                        tokenA: token5.address,
                        tokenB: token6.address,
                        amountA: amountAMT,
                        amountB: amountBMT,
                      }
                      let call0 = assembleCall({
                        functionName: func.name,
                        wallet: user6,
                        ...swapParams
                      })
                      await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
                    });
                    it("reverts excessive amountB 4", async function () {
                      let tradeRequest = await nucleus.getTradeRequest(poolID, token5.address, token6.address);
                      let amountAMT = WeiPerEther.div(100);
                      let { amountBMT, amountBMM, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactAMT(amountAMT, tradeRequest.exchangeRate, swapFeePPM);
                      amountBMT = amountBMT.sub(1);
                      expect(amountBMT).gt(0);
                      let swapParams = {
                        poolID: poolID,
                        tokenA: token5.address,
                        tokenB: token6.address,
                        amountA: amountAMT,
                        amountB: amountBMT,
                      }
                      let call0 = assembleCall({
                        functionName: func.name,
                        wallet: user6,
                        ...swapParams
                      })
                      await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
                    });
                    it("can swap 11", async function () {
                      let mtLocationAExt = user6ExternalLocation;
                      let mtLocationAInt = user6InternalLocation;
                      let mtLocationBExt = user6ExternalLocation;
                      let mtLocationBInt = user6InternalLocation;
                      let balNuA1 = await token5.balanceOf(nucleus.address);
                      let balNuB1 = await token6.balanceOf(nucleus.address);
                      let balPlA1 = await nucleus.getTokenBalance(token5.address, poolLocation);
                      let balPlB1 = await nucleus.getTokenBalance(token6.address, poolLocation);
                      let balMtAExt1 = await nucleus.getTokenBalance(token5.address, mtLocationAExt);
                      let balMtAInt1 = await nucleus.getTokenBalance(token5.address, mtLocationAInt);
                      let balMtBExt1 = await nucleus.getTokenBalance(token6.address, mtLocationBExt);
                      let balMtBInt1 = await nucleus.getTokenBalance(token6.address, mtLocationBInt);
                      let tradeRequest = await nucleus.getTradeRequest(poolID, token5.address, token6.address);
                      let balMmB1 = await nucleus.getTokenBalance(token6.address, tradeRequest.locationB);
                      const swapFeeReceiver2 = (!!pairFee) ? user4InternalLocation : user3InternalLocation;
                      let balFrB1 = await nucleus.getTokenBalance(token6.address, swapFeeReceiver2);
                      let amountBMT = WeiPerUsdc.mul(10);
                      let { amountAMT, amountBMM, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactBMT(amountBMT, tradeRequest.exchangeRate, swapFeePPM);
                      expect(amountAMT).gt(0);
                      expect(amountBMT).gt(0);
                      expect(amountBMM).gt(0);
                      if(swapFeePPM > 0) {
                        expect(amountBFR).gt(0);
                        expect(amountBMT).not.eq(amountBMM);
                        expect(amountBMT).not.eq(amountBFR);
                        expect(amountBMM).not.eq(amountBFR);
                      }
                      let swapParams = {
                        poolID: poolID,
                        tokenA: token5.address,
                        tokenB: token6.address,
                        amountA: amountAMT,
                        amountB: amountBMT,
                      }
                      let call0 = assembleCall({
                        functionName: func.name,
                        wallet: user6,
                        ...swapParams
                      })
                      let tx = await call0;
                      let balNuA2expected = balNuA1;
                      let balNuB2expected = balNuB1;
                      let balPlA2expected = balPlA1.sub(amountAMT);
                      let balPlB2expected = balPlB1.add(amountBMM);
                      let balMtAExt2expected = balMtAExt1;
                      let balMtAInt2expected = balMtAInt1;
                      let balMtBExt2expected = balMtBExt1;
                      let balMtBInt2expected = balMtBInt1;
                      let balMmB2expected = balMmB1.add(amountBMM);
                      let balFrB2expected = balFrB1.add(amountBFR);
                      let balNuA2 = await token5.balanceOf(nucleus.address);
                      let balNuB2 = await token6.balanceOf(nucleus.address);
                      let balPlA2 = await nucleus.getTokenBalance(token5.address, poolLocation);
                      let balPlB2 = await nucleus.getTokenBalance(token6.address, poolLocation);
                      let balMtAExt2 = await nucleus.getTokenBalance(token5.address, mtLocationAExt);
                      let balMtAInt2 = await nucleus.getTokenBalance(token5.address, mtLocationAInt);
                      let balMtBExt2 = await nucleus.getTokenBalance(token6.address, mtLocationBExt);
                      let balMtBInt2 = await nucleus.getTokenBalance(token6.address, mtLocationBInt);
                      let balMmB2 = await nucleus.getTokenBalance(token6.address, tradeRequest.locationB);
                      let balFrB2 = await nucleus.getTokenBalance(token6.address, swapFeeReceiver2);
                      if(func.dst == "ext" || func.dst == "any") {
                        balNuA2expected = balNuA2expected.sub(amountAMT);
                        balMtAExt2expected = balMtAExt2expected.add(amountAMT);
                        await expect(tx).to.emit(token5, "Transfer").withArgs(nucleus.address, user6.address, amountAMT);
                        await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token5.address, poolLocation, mtLocationAExt, amountAMT);
                      } else {
                        balMtAInt2expected = balMtAInt2expected.add(amountAMT);
                        await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token5.address, poolLocation, mtLocationAInt, amountAMT);
                      }
                      if(func.src == "any") {
                        if(balMtBInt1.gte(amountBMT)) {
                          balMtBInt2expected = balMtBInt2expected.sub(amountBMT)
                          await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBInt, poolLocation, amountBMT);
                          if(swapFeePPM > 0) await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBInt, swapFeeReceiver2, amountBFR);
                        } else if(balMtBInt1.eq(0)) {
                          balMtBExt2expected = balMtBExt2expected.sub(amountBMT)
                          balNuB2expected = balNuB2expected.add(amountBMT)
                          await expect(tx).to.emit(token6, "Transfer").withArgs(user6.address, nucleus.address, amountBMT);
                          await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBExt, poolLocation, amountBMM);
                          if(swapFeePPM > 0) await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBExt, swapFeeReceiver2, amountBFR);
                        } else {
                          let diff = amountBMT.sub(balMtBInt1)
                          balMtBExt2expected = balMtBExt2expected.sub(diff)
                          balMtBInt2expected = 0
                          balNuB2expected = balNuB2expected.add(diff)
                          await expect(tx).to.emit(token6, "Transfer").withArgs(user6.address, nucleus.address, diff);
                          await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBExt, mtLocationBInt, diff);
                          await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBInt, poolLocation, amountBMT);
                          if(swapFeePPM > 0) await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBInt, swapFeeReceiver2, amountBFR);
                        }
                      } else {
                        balMtBExt2expected = balMtBExt2expected.sub(amountBMT)
                        balNuB2expected = balNuB2expected.add(amountBMT)
                        await expect(tx).to.emit(token6, "Transfer").withArgs(user6.address, nucleus.address, amountBMT);
                        await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBExt, poolLocation, amountBMM);
                        if(swapFeePPM > 0) await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBExt, swapFeeReceiver2, amountBFR);
                      }
                      if(tradeRequest.locationB != poolLocation) {
                        balNuB2expected = balNuB2expected.sub(amountBMM)
                        balPlB2expected = balPlB2expected.sub(amountBMM)
                        await expect(tx).to.emit(token6, "Transfer").withArgs(nucleus.address, user5.address, amountBMM);
                        await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, poolLocation, tradeRequest.locationB, amountBMM);
                      }
                      expect(balNuA2).eq(balNuA2expected)
                      expect(balNuB2).eq(balNuB2expected)
                      expect(balPlA2).eq(balPlA2expected)
                      expect(balPlB2).eq(balPlB2expected)
                      expect(balMtAExt2).eq(balMtAExt2expected)
                      expect(balMtAInt2).eq(balMtAInt2expected)
                      expect(balMtBExt2).eq(balMtBExt2expected)
                      expect(balMtBInt2).eq(balMtBInt2expected)
                      expect(balMmB2).eq(balMmB2expected)
                      expect(balFrB2).eq(balFrB2expected)
                      let tradeRequest2 = await nucleus.getTradeRequest(poolID, token5.address, token6.address);
                      expect(tradeRequest2.amountA).eq(tradeRequest.amountA.sub(amountAMT));
                      expect(tradeRequest2.exchangeRate).eq(tradeRequest.exchangeRate);
                      expect(tradeRequest2.locationB).eq(tradeRequest.locationB);
                      await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token5.address, token6.address, amountAMT, amountBMT, amountBMM);
                      l1DataFeeAnalyzer.register(func.name, tx);
                    });
                    for(const updateFunc of updateFuncs) {
                      context(`with a updateFunc of ${updateFunc}`, function () {
                        before(async function () {
                          if(updateFunc == "updateLimitOrderPool") {
                            await nucleus.connect(user5).updateLimitOrderPool({
                              poolID: poolID,
                              exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerUsdc.mul(1900)),
                              locationB: user5ExternalLocation,
                            })
                          } else if(updateFunc == "updateLimitOrderPoolCompact") {
                            await nucleus.connect(user5).updateLimitOrderPoolCompact({
                              poolID: poolID,
                              exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerUsdc.mul(1900)),
                            })
                          } else if(updateFunc == "updateGridOrder") {
                            await nucleus.connect(user5).updateGridOrderPool({
                              poolID: poolID,
                              tokenSources: [],
                              tradeRequests: [{
                                tokenA: token5.address,
                                tokenB: token6.address,
                                exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerUsdc.mul(1900)),
                                locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
                              },{
                                tokenA: token6.address,
                                tokenB: token5.address,
                                exchangeRate: HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(1600), WeiPerEther),
                                locationB: HydrogenNucleusHelper.LOCATION_FLAG_POOL,
                              }]
                            })
                          } else if(updateFunc == "updateGridOrderCompact") {
                            await nucleus.connect(user5).updateGridOrderPoolCompact({
                              poolID: poolID,
                              exchangeRates: [
                                HydrogenNucleusHelper.encodeExchangeRate(WeiPerEther, WeiPerUsdc.mul(1900)),
                                HydrogenNucleusHelper.encodeExchangeRate(WeiPerUsdc.mul(1600), WeiPerEther),
                              ],
                            })
                          } else throw "bruh2"
                        })
                        it("reverts insufficient amountA 5", async function () {
                          let tradeRequest = await nucleus.getTradeRequest(poolID, token5.address, token6.address);
                          let amountBMT = WeiPerUsdc.mul(10);
                          let { amountAMT, amountBMM, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactBMT(amountBMT, tradeRequest.exchangeRate, swapFeePPM);
                          expect(amountAMT).gt(0);
                          amountAMT = amountAMT.add(1);
                          expect(amountBMT).gt(0);
                          expect(amountBMM).gt(0);
                          if(swapFeePPM > 0) {
                            expect(amountBFR).gt(0);
                            expect(amountBMT).not.eq(amountBMM);
                            expect(amountBMT).not.eq(amountBFR);
                            expect(amountBMM).not.eq(amountBFR);
                          }
                          let swapParams = {
                            poolID: poolID,
                            tokenA: token5.address,
                            tokenB: token6.address,
                            amountA: amountAMT,
                            amountB: amountBMT,
                          }
                          let call0 = assembleCall({
                            functionName: func.name,
                            wallet: user6,
                            ...swapParams
                          })
                          await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
                        });
                        it("reverts excessive amountB 5", async function () {
                          let tradeRequest = await nucleus.getTradeRequest(poolID, token5.address, token6.address);
                          let amountAMT = WeiPerEther.div(100);
                          let { amountBMT, amountBMM, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactAMT(amountAMT, tradeRequest.exchangeRate, swapFeePPM);
                          amountBMT = amountBMT.sub(1);
                          expect(amountBMT).gt(0);
                          let swapParams = {
                            poolID: poolID,
                            tokenA: token5.address,
                            tokenB: token6.address,
                            amountA: amountAMT,
                            amountB: amountBMT,
                          }
                          let call0 = assembleCall({
                            functionName: func.name,
                            wallet: user6,
                            ...swapParams
                          })
                          await expect(call0).to.be.revertedWithCustomError(nucleus, "HydrogenExchangeRateDisagreement");
                        });
                        it("can swap 12", async function () {
                          let mtLocationAExt = user6ExternalLocation;
                          let mtLocationAInt = user6InternalLocation;
                          let mtLocationBExt = user6ExternalLocation;
                          let mtLocationBInt = user6InternalLocation;
                          let balNuA1 = await token5.balanceOf(nucleus.address);
                          let balNuB1 = await token6.balanceOf(nucleus.address);
                          let balPlA1 = await nucleus.getTokenBalance(token5.address, poolLocation);
                          let balPlB1 = await nucleus.getTokenBalance(token6.address, poolLocation);
                          let balMtAExt1 = await nucleus.getTokenBalance(token5.address, mtLocationAExt);
                          let balMtAInt1 = await nucleus.getTokenBalance(token5.address, mtLocationAInt);
                          let balMtBExt1 = await nucleus.getTokenBalance(token6.address, mtLocationBExt);
                          let balMtBInt1 = await nucleus.getTokenBalance(token6.address, mtLocationBInt);
                          let tradeRequest = await nucleus.getTradeRequest(poolID, token5.address, token6.address);
                          let balMmB1 = await nucleus.getTokenBalance(token6.address, tradeRequest.locationB);
                          const swapFeeReceiver2 = (!!pairFee) ? user4InternalLocation : user3InternalLocation;
                          let balFrB1 = await nucleus.getTokenBalance(token6.address, swapFeeReceiver2);
                          let amountAMT = WeiPerEther.div(10);
                          let { amountBMT, amountBMM, amountBFR } = HydrogenNucleusHelper.calculateMarketOrderExactAMT(amountAMT, tradeRequest.exchangeRate, swapFeePPM);
                          expect(amountAMT).gt(0);
                          expect(amountBMT).gt(0);
                          expect(amountBMM).gt(0);
                          if(swapFeePPM > 0) {
                            expect(amountBFR).gt(0);
                            expect(amountBMT).not.eq(amountBMM);
                            expect(amountBMT).not.eq(amountBFR);
                            expect(amountBMM).not.eq(amountBFR);
                          }
                          let swapParams = {
                            poolID: poolID,
                            tokenA: token5.address,
                            tokenB: token6.address,
                            amountA: amountAMT,
                            amountB: amountBMT,
                          }
                          let call0 = assembleCall({
                            functionName: func.name,
                            wallet: user6,
                            ...swapParams
                          })
                          let tx = await call0;
                          let balNuA2expected = balNuA1;
                          let balNuB2expected = balNuB1;
                          let balPlA2expected = balPlA1.sub(amountAMT);
                          let balPlB2expected = balPlB1.add(amountBMM);
                          let balMtAExt2expected = balMtAExt1;
                          let balMtAInt2expected = balMtAInt1;
                          let balMtBExt2expected = balMtBExt1;
                          let balMtBInt2expected = balMtBInt1;
                          let balMmB2expected = balMmB1.add(amountBMM);
                          let balFrB2expected = balFrB1.add(amountBFR);
                          let balNuA2 = await token5.balanceOf(nucleus.address);
                          let balNuB2 = await token6.balanceOf(nucleus.address);
                          let balPlA2 = await nucleus.getTokenBalance(token5.address, poolLocation);
                          let balPlB2 = await nucleus.getTokenBalance(token6.address, poolLocation);
                          let balMtAExt2 = await nucleus.getTokenBalance(token5.address, mtLocationAExt);
                          let balMtAInt2 = await nucleus.getTokenBalance(token5.address, mtLocationAInt);
                          let balMtBExt2 = await nucleus.getTokenBalance(token6.address, mtLocationBExt);
                          let balMtBInt2 = await nucleus.getTokenBalance(token6.address, mtLocationBInt);
                          let balMmB2 = await nucleus.getTokenBalance(token6.address, tradeRequest.locationB);
                          let balFrB2 = await nucleus.getTokenBalance(token6.address, swapFeeReceiver2);
                          if(func.dst == "ext" || func.dst == "any") {
                            balNuA2expected = balNuA2expected.sub(amountAMT);
                            balMtAExt2expected = balMtAExt2expected.add(amountAMT);
                            await expect(tx).to.emit(token5, "Transfer").withArgs(nucleus.address, user6.address, amountAMT);
                            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token5.address, poolLocation, mtLocationAExt, amountAMT);
                          } else {
                            balMtAInt2expected = balMtAInt2expected.add(amountAMT);
                            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token5.address, poolLocation, mtLocationAInt, amountAMT);
                          }
                          if(func.src == "any") {
                            if(balMtBInt1.gte(amountBMT)) {
                              balMtBInt2expected = balMtBInt2expected.sub(amountBMT)
                              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBInt, poolLocation, amountBMT);
                              if(swapFeePPM > 0) await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBInt, swapFeeReceiver2, amountBFR);
                            } else if(balMtBInt1.eq(0)) {
                              balMtBExt2expected = balMtBExt2expected.sub(amountBMT)
                              balNuB2expected = balNuB2expected.add(amountBMT)
                              await expect(tx).to.emit(token6, "Transfer").withArgs(user6.address, nucleus.address, amountBMT);
                              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBExt, poolLocation, amountBMM);
                              if(swapFeePPM > 0) await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBExt, swapFeeReceiver2, amountBFR);
                            } else {
                              let diff = amountBMT.sub(balMtBInt1)
                              balMtBExt2expected = balMtBExt2expected.sub(diff)
                              balMtBInt2expected = 0
                              balNuB2expected = balNuB2expected.add(diff)
                              await expect(tx).to.emit(token6, "Transfer").withArgs(user6.address, nucleus.address, diff);
                              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBExt, mtLocationBInt, diff);
                              await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBInt, poolLocation, amountBMT);
                              if(swapFeePPM > 0) await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBInt, swapFeeReceiver2, amountBFR);
                            }
                          } else {
                            balMtBExt2expected = balMtBExt2expected.sub(amountBMT)
                            balNuB2expected = balNuB2expected.add(amountBMT)
                            await expect(tx).to.emit(token6, "Transfer").withArgs(user6.address, nucleus.address, amountBMT);
                            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBExt, poolLocation, amountBMM);
                            if(swapFeePPM > 0) await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, mtLocationBExt, swapFeeReceiver2, amountBFR);
                          }
                          if(tradeRequest.locationB != poolLocation) {
                            balNuB2expected = balNuB2expected.sub(amountBMM)
                            balPlB2expected = balPlB2expected.sub(amountBMM)
                            await expect(tx).to.emit(token6, "Transfer").withArgs(nucleus.address, user5.address, amountBMM);
                            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token6.address, poolLocation, tradeRequest.locationB, amountBMM);
                          }
                          expect(balNuA2).eq(balNuA2expected)
                          expect(balNuB2).eq(balNuB2expected)
                          expect(balPlA2).eq(balPlA2expected)
                          expect(balPlB2).eq(balPlB2expected)
                          expect(balMtAExt2).eq(balMtAExt2expected)
                          expect(balMtAInt2).eq(balMtAInt2expected)
                          expect(balMtBExt2).eq(balMtBExt2expected)
                          expect(balMtBInt2).eq(balMtBInt2expected)
                          expect(balMmB2).eq(balMmB2expected)
                          expect(balFrB2).eq(balFrB2expected)
                          let tradeRequest2 = await nucleus.getTradeRequest(poolID, token5.address, token6.address);
                          expect(tradeRequest2.amountA).eq(tradeRequest.amountA.sub(amountAMT));
                          expect(tradeRequest2.exchangeRate).eq(tradeRequest.exchangeRate);
                          expect(tradeRequest2.locationB).eq(tradeRequest.locationB);
                          await expect(tx).to.emit(nucleus, "MarketOrderExecuted").withArgs(poolID, token5.address, token6.address, amountAMT, amountBMT, amountBMM);
                          l1DataFeeAnalyzer.register(func.name, tx);
                        });
                      })
                    }
                  });
                }
              })
            }
          })
        }
      });
    }
  });

  describe("L1 gas fees", function () {
    it("calculate", async function () {
      l1DataFeeAnalyzer.analyze()
    });
  });
});
