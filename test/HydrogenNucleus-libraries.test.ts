/* global describe it before ethers */

import hre from "hardhat";
const { ethers } = hre;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;
import { splitSignature } from "ethers/lib/utils";

import { HydrogenNucleus, MockERC20, MockExchangeRateMath, MockLocations } from "./../typechain-types";

import { getNetworkSettings } from "../scripts/utils/getNetworkSettings";
import HydrogenNucleusHelper from "../scripts/utils/HydrogenNucleusHelper";
import { setStorageAt, toBytes32 } from "../scripts/utilities/setStorage";
import { deployContract } from "../scripts/utils/deployContract";

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const MAX_PPM = BN.from(1_000_000); // parts per million
const MaxUint128 = BN.from("0x00000000000000000000000000000000ffffffffffffffffffffffffffffffff");

const INVALID_LOCATION_0 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const INVALID_LOCATION_6 = "0x0600000000000000000000000000000000000000000000000000000000000000";
const INVALID_OTHER_LOCATION            = "0x00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const INVALID_EXTERNAL_ADDRESS_LOCATION = "0x01ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const INVALID_INTERNAL_ADDRESS_LOCATION = "0x02ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const INVALID_POOL_LOCATION             = "0x03ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const NULL_LOCATION = "0x0000000000000000000000000000000000000000000000000000000000000000";
const DUMMY_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" // user1

const LOCATION_TYPE_0 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const LOCATION_TYPE_1 = "0x0100000000000000000000000000000000000000000000000000000000000000";
const LOCATION_TYPE_2 = "0x0200000000000000000000000000000000000000000000000000000000000000";
const LOCATION_TYPE_3 = "0x0300000000000000000000000000000000000000000000000000000000000000";
const LOCATION_TYPE_4 = "0x0400000000000000000000000000000000000000000000000000000000000000";
const LOCATION_TYPE_5 = "0x0500000000000000000000000000000000000000000000000000000000000000";
const LOCATION_TYPE_6 = "0x0600000000000000000000000000000000000000000000000000000000000000";


describe("HydrogenNucleus-erc721", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let user4: SignerWithAddress;

  let user1ExternalLocation: string;
  let user1InternalLocation: string;
  let user2ExternalLocation: string;
  let user2InternalLocation: string;
  let user3ExternalLocation: string;
  let user3InternalLocation: string;

  let nucleus: HydrogenNucleus;

  let exchangeRateMath: MockExchangeRateMath;
  let locations: MockLocations;

  let token1: MockERC20;
  let token2: MockERC20;
  let token3: MockERC20;
  let tokens:any[] = [];

  let chainID: number;
  let networkSettings: any;
  let snapshot: BN;

  before(async function () {
    [deployer, owner, user1, user2, user3, user4] = await ethers.getSigners();
    chainID = (await provider.getNetwork()).chainId;
    networkSettings = getNetworkSettings(chainID);
    if(!networkSettings.isTestnet) throw new Error("Do not run tests on production networks");
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    nucleus = await deployContract(deployer, "HydrogenNucleus", [owner.address]) as HydrogenNucleus;

    exchangeRateMath = await deployContract(deployer, "MockExchangeRateMath") as MockExchangeRateMath;
    locations = await deployContract(deployer, "MockLocations") as MockLocations;

    while(tokens.length < 3) {
      let token = await deployContract(deployer, "MockERC20", [`Token${tokens.length+1}`, `TKN${tokens.length+1}`, 18]) as MockERC20;
      tokens.push(token);
    }
    [token1, token2, token3] = tokens;

    await token1.mint(user1.address, WeiPerEther.mul(10_000));
    await token1.mint(user2.address, WeiPerEther.mul(10_000));
    await token2.mint(user1.address, WeiPerEther.mul(10_000));
    await token2.mint(user2.address, WeiPerEther.mul(10_000));
    await token3.mint(user1.address, WeiPerEther.mul(10_000));
    await token3.mint(user2.address, WeiPerEther.mul(10_000));
    await token1.connect(user1).approve(nucleus.address, MaxUint256);
    await token1.connect(user2).approve(nucleus.address, MaxUint256);
    await token2.connect(user1).approve(nucleus.address, MaxUint256);
    await token2.connect(user2).approve(nucleus.address, MaxUint256);
    await token3.connect(user1).approve(nucleus.address, MaxUint256);
    await token3.connect(user2).approve(nucleus.address, MaxUint256);

    user1ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
    user1InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
    user2ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
    user2InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
    user3ExternalLocation = HydrogenNucleusHelper.externalAddressToLocation(user3.address);
    user3InternalLocation = HydrogenNucleusHelper.internalAddressToLocation(user3.address);

    console.log("user1")
    console.log(user1.address)
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("exchangeRate", function () {

    // isMarketOrderAcceptable() tested in other files

    describe("decodeExchangeRate()", function () {
      let cases = [
        [0,0],
        [0,1],
        [5,0],
        [2,3],
        [WeiPerUsdc,WeiPerEther],
        [WeiPerEther.mul(1000),MaxUint128],
      ]
      for(let i = 0; i < cases.length; i++) {
        it(`can decode exchange rate case[${i}]`, async function () {
          let [z1, z2] = cases[i];
          let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(z1, z2);
          let { x1, x2 } = await exchangeRateMath.decodeExchangeRate(exchangeRate);
          expect(x1).eq(z1);
          expect(x2).eq(z2);
          let [y1, y2] = HydrogenNucleusHelper.decodeExchangeRate(exchangeRate);
          expect(y1).eq(z1);
          expect(y2).eq(z2);
        });
      }
    });

    describe("exchangeRateIsNonZero()", function () {
      let cases = [
        [0,0, false],
        [0,1, false],
        [1,0, false],
        [2,3, true],
        [WeiPerUsdc,WeiPerEther, true],
        [WeiPerEther.mul(1000),MaxUint128, true],
      ] as any[]
      for(let i = 0; i < cases.length; i++) {
        it(`can decode exchange rate case[${i}]`, async function () {
          let [z1, z2, isNonZero] = cases[i];
          let exchangeRate = HydrogenNucleusHelper.encodeExchangeRate(z1, z2);
          expect(await exchangeRateMath.exchangeRateIsNonZero(exchangeRate)).eq(isNonZero);
          expect(HydrogenNucleusHelper.exchangeRateIsNonzero(exchangeRate)).eq(isNonZero);
        });
      }
    });

  });

  describe("locations", function () {

    describe("getLocationType()", function () {
      let cases = [
        [INVALID_LOCATION_0,LOCATION_TYPE_0],
        [INVALID_LOCATION_6,LOCATION_TYPE_6],
        [INVALID_OTHER_LOCATION,LOCATION_TYPE_0],
        [INVALID_EXTERNAL_ADDRESS_LOCATION,LOCATION_TYPE_1],
        [INVALID_INTERNAL_ADDRESS_LOCATION,LOCATION_TYPE_2],
        [INVALID_POOL_LOCATION,LOCATION_TYPE_3],
        [HydrogenNucleusHelper.externalAddressToLocation(AddressZero),LOCATION_TYPE_1],
        [HydrogenNucleusHelper.internalAddressToLocation(AddressZero),LOCATION_TYPE_2],
        [HydrogenNucleusHelper.externalAddressToLocation(DUMMY_ADDRESS),LOCATION_TYPE_1],
        [HydrogenNucleusHelper.internalAddressToLocation(DUMMY_ADDRESS),LOCATION_TYPE_2],
        [HydrogenNucleusHelper.poolIDtoLocation(0),LOCATION_TYPE_3],
        [HydrogenNucleusHelper.poolIDtoLocation(999),LOCATION_TYPE_3],
        [HydrogenNucleusHelper.poolIDtoLocation(1001),LOCATION_TYPE_3],
        [HydrogenNucleusHelper.poolIDtoLocation(2002),LOCATION_TYPE_3],
      ] as any[]
      for(let i = 0; i < cases.length; i++) {
        it(`can get location type case[${i}]`, async function () {
          let [loc, loctype] = cases[i]
          expect(await locations.getLocationType(loc)).eq(loctype);
        });
      }
    });
    
    describe("locationToAddress()", function () {
      let cases = [
        [INVALID_LOCATION_0,true,AddressZero],
        [INVALID_LOCATION_6,true,AddressZero],
        [INVALID_OTHER_LOCATION,false,undefined],
        [INVALID_EXTERNAL_ADDRESS_LOCATION,false,undefined],
        [INVALID_INTERNAL_ADDRESS_LOCATION,false,undefined],
        [INVALID_POOL_LOCATION,false,undefined],
        [HydrogenNucleusHelper.externalAddressToLocation(AddressZero),true,AddressZero],
        [HydrogenNucleusHelper.internalAddressToLocation(AddressZero),true,AddressZero],
        [HydrogenNucleusHelper.externalAddressToLocation(DUMMY_ADDRESS),true,DUMMY_ADDRESS],
        [HydrogenNucleusHelper.internalAddressToLocation(DUMMY_ADDRESS),true,DUMMY_ADDRESS],
        [HydrogenNucleusHelper.poolIDtoLocation(0),true,undefined],
        [HydrogenNucleusHelper.poolIDtoLocation(999),true,undefined],
        [HydrogenNucleusHelper.poolIDtoLocation(1001),true,undefined],
        [HydrogenNucleusHelper.poolIDtoLocation(2002),true,undefined],
      ] as any[]
      for(let i = 0; i < cases.length; i++) {
        it(`can cast location to address case[${i}]`, async function () {
          let [loc, succ, addr] = cases[i]
          if(succ) {
            let res = await locations.locationToAddress(loc);
            if(!!addr) expect(res).eq(addr);
          } else {
            await expect(locations.locationToAddress(loc)).to.be.reverted;
          }
        });
      }
    });

    describe("locationToPoolID()", function () {
      let cases = [
        [INVALID_LOCATION_0,0],
        [INVALID_LOCATION_6,0],
        [INVALID_OTHER_LOCATION,INVALID_OTHER_LOCATION],
        [INVALID_EXTERNAL_ADDRESS_LOCATION,INVALID_OTHER_LOCATION],
        [INVALID_INTERNAL_ADDRESS_LOCATION,INVALID_OTHER_LOCATION],
        [INVALID_POOL_LOCATION,INVALID_OTHER_LOCATION],
        [HydrogenNucleusHelper.externalAddressToLocation(AddressZero),0],
        [HydrogenNucleusHelper.internalAddressToLocation(AddressZero),0],
        [HydrogenNucleusHelper.externalAddressToLocation(DUMMY_ADDRESS),DUMMY_ADDRESS],
        [HydrogenNucleusHelper.internalAddressToLocation(DUMMY_ADDRESS),DUMMY_ADDRESS],
        [HydrogenNucleusHelper.poolIDtoLocation(0),0],
        [HydrogenNucleusHelper.poolIDtoLocation(999),999],
        [HydrogenNucleusHelper.poolIDtoLocation(1001),1001],
        [HydrogenNucleusHelper.poolIDtoLocation(2002),2002],
      ] as any[]
      for(let i = 0; i < cases.length; i++) {
        it(`can cast location to address case[${i}]`, async function () {
          let [loc, poolID] = cases[i]
          expect(await locations.locationToPoolID(loc)).eq(poolID);
        });
      }
    });

    describe("externalAddressToLocation()", function () {
      let cases = [
        [AddressZero],
        [DUMMY_ADDRESS],
      ] as any[]
      for(let i = 0; i < cases.length; i++) {
        it(`can cast external address to location case[${i}]`, async function () {
          let [addr] = cases[i]
          expect(await locations.externalAddressToLocation(addr)).eq(HydrogenNucleusHelper.externalAddressToLocation(addr));
        });
      }
    });

    describe("internalAddressToLocation()", function () {
      let cases = [
        [AddressZero],
        [DUMMY_ADDRESS],
      ] as any[]
      for(let i = 0; i < cases.length; i++) {
        it(`can cast internal address to location case[${i}]`, async function () {
          let [addr] = cases[i]
          expect(await locations.internalAddressToLocation(addr)).eq(HydrogenNucleusHelper.internalAddressToLocation(addr));
        });
      }
    });

    describe("poolIDtoLocation()", function () {
      let cases = [
        [0],
        [1],
        [999],
        [1001],
        [2002],
      ] as any[]
      for(let i = 0; i < cases.length; i++) {
        it(`can cast internal address to location case[${i}]`, async function () {
          let [poolID] = cases[i]
          expect(await locations.poolIDtoLocation(poolID)).eq(HydrogenNucleusHelper.poolIDtoLocation(poolID));
        });
      }
    });

  });
  //describe("", function () {});
});
