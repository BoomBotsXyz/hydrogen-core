/* global describe it before ethers */

import hre from "hardhat";
const { ethers } = hre;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;

import { HydrogenNucleus, MockERC20, MockFlashLoanBorrower1, MockFlashLoanBorrower2, MockFlashLoanBorrower3, MockFlashLoanBorrower4, MockFlashLoanBorrower5, MockFlashLoanBorrower7, MockFlashLoanBorrower8 } from "./../typechain-types";

import { expectDeployed } from "./../scripts/utilities/expectDeployed";
import { getNetworkSettings } from "../scripts/utils/getNetworkSettings";
import HydrogenNucleusHelper from "../scripts/utils/HydrogenNucleusHelper";
import HydrogenNucleusEventLogger from "../scripts/utils/HydrogenNucleusEventLogger";
import { setStorageAt, toBytes32 } from "../scripts/utilities/setStorage";
import { decimalsToAmount } from "../scripts/utils/price";
import { deployContract } from "../scripts/utils/deployContract";

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const MAX_PPM = BN.from(1_000_000); // parts per million

const INVALID_LOCATION_6 = "0x0600000000000000000000000000000000000000000000000000000000000000";
const NULL_LOCATION = "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("HydrogenNucleus-flashloans", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let nucleus: HydrogenNucleus;

  let borrower1: MockFlashLoanBorrower1;
  let borrower2: MockFlashLoanBorrower2;
  let borrower3: MockFlashLoanBorrower3;
  let borrower4: MockFlashLoanBorrower4;
  let borrower5: MockFlashLoanBorrower5;
  //let borrower6: MockFlashLoanBorrower6;
  let borrower7: MockFlashLoanBorrower7;
  let borrower8: MockFlashLoanBorrower8;

  let token1: MockERC20;
  let token2: MockERC20;
  let token3: MockERC20;

  let chainID: number;
  let networkSettings: any;
  let snapshot: BN;

  before(async function () {
    [deployer, owner, user1, user2] = await ethers.getSigners();
    chainID = (await provider.getNetwork()).chainId;
    networkSettings = getNetworkSettings(chainID);
    if(!networkSettings.isTestnet) throw new Error("Do not run tests on production networks");
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    token1 = await deployContract(deployer, "MockERC20", ["Token1", "TKN1", 18]) as MockERC20;
    token2 = await deployContract(deployer, "MockERC20", ["Token2", "TKN2", 18]) as MockERC20;
    token3 = await deployContract(deployer, "MockERC20", ["Token3", "TKN3", 6]) as MockERC20;
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("should deploy successfully", async function () {
      nucleus = await deployContract(deployer, "HydrogenNucleus", [owner.address]) as HydrogenNucleus;
    });
    it("should deploy callback contracts", async function () {
      borrower1 = await deployContract(deployer, "MockFlashLoanBorrower1", [nucleus.address]) as MockFlashLoanBorrower1;
      borrower2 = await deployContract(deployer, "MockFlashLoanBorrower2", [nucleus.address]) as MockFlashLoanBorrower2;
      borrower3 = await deployContract(deployer, "MockFlashLoanBorrower3", [nucleus.address]) as MockFlashLoanBorrower3;
      borrower4 = await deployContract(deployer, "MockFlashLoanBorrower4", [nucleus.address]) as MockFlashLoanBorrower4;
      borrower5 = await deployContract(deployer, "MockFlashLoanBorrower5", [nucleus.address]) as MockFlashLoanBorrower5;
      //borrower6 = await deployContract(deployer, "MockFlashLoanBorrower6", [nucleus.address]) as MockFlashLoanBorrower6;
      borrower7 = await deployContract(deployer, "MockFlashLoanBorrower7", [nucleus.address]) as MockFlashLoanBorrower7;
      borrower8 = await deployContract(deployer, "MockFlashLoanBorrower8", [nucleus.address]) as MockFlashLoanBorrower8;
    });
  });

  describe("flash loans", function () {
    before("deposit tokens", async function () {
      let locationInt = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
      let locationExt = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
      await token1.connect(user2).mint(user2.address, WeiPerEther.mul(100));
      await token2.connect(user2).mint(user2.address, WeiPerEther.mul(100));
      await token3.connect(user2).mint(user2.address, WeiPerUsdc.mul(100));
      await token1.connect(user2).approve(nucleus.address, MaxUint256);
      await token2.connect(user2).approve(nucleus.address, MaxUint256);
      await token3.connect(user2).approve(nucleus.address, MaxUint256);
      await nucleus.connect(user2).tokenTransfer({
        token: token1.address,
        src: locationExt,
        amount: WeiPerEther.mul(100),
        dst: locationInt
      });
      await nucleus.connect(user2).tokenTransfer({
        token: token2.address,
        amount: WeiPerEther.mul(100),
        src: locationExt,
        dst: locationInt
      });
      await nucleus.connect(user2).tokenTransfer({
        token: token3.address,
        amount: WeiPerUsdc.mul(100),
        src: locationExt,
        dst: locationInt
      });
    });
    it("initial fees are zero", async function () {
      let fees0 = await nucleus.getFlashLoanFeeForToken(token1.address);
      expect(fees0.feePPM).eq(0);
      expect(fees0.receiverLocation).eq(NULL_LOCATION);
      let fees1 = await nucleus.getStoredFlashLoanFeeForToken(token1.address);
      expect(fees1.feePPM).eq(0);
      expect(fees1.receiverLocation).eq(NULL_LOCATION);
      expect(await nucleus.flashFee(token1.address, WeiPerEther)).eq(0);
    });
    it("cannot callback to EOA", async function () {
      await expect(nucleus.connect(user1).flashLoan(user1.address, token1.address, 0, "0x")).to.be.reverted;
    });
    it("cannot callback to non callee implementer", async function () {
      await expect(nucleus.connect(user1).flashLoan(borrower1.address, token1.address, 0, "0x")).to.be.reverted;
    });
    it("reverts if callee reverts", async function () {
      await expect(nucleus.connect(user1).flashLoan(borrower2.address, token1.address, 0, "0x")).to.be.revertedWith("MockFlashLoanBorrower2: force revert");
    });
    it("reverts if the callee does not return any value", async function () {
      await expect(nucleus.connect(user1).flashLoan(borrower7.address, token1.address, 0, "0x")).to.be.reverted;
    });
    it("reverts if the callee returns the wrong value", async function () {
      await expect(nucleus.connect(user1).flashLoan(borrower8.address, token1.address, 0, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenFlashLoanCallbackFailed");
    });
    it("cannot borrow hpt", async function () {
      expect(await nucleus.maxFlashLoan(nucleus.address)).eq(0);
      await expect(nucleus.flashFee(nucleus.address, 0)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.getFlashLoanFeeForToken(nucleus.address)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.getStoredFlashLoanFeeForToken(nucleus.address)).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
      await expect(nucleus.connect(user1).flashLoan(borrower4.address, nucleus.address, 0, "0x")).to.be.revertedWithCustomError(nucleus, "HydrogenSelfReferrence");
    });
    it("max flash loan is erc20 balance", async function () {
      let bal1 = await token1.balanceOf(nucleus.address);
      expect(bal1).gt(0);
      expect(await nucleus.maxFlashLoan(token1.address)).eq(bal1);
    });
    it("cannot borrow more than max", async function () {
      let bal1 = await token1.balanceOf(nucleus.address);
      await expect(nucleus.connect(user1).flashLoan(borrower4.address, token1.address, bal1.add(1), "0x")).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("reverts if borrower needs to produce funds but cant part 1", async function () {
      await expect(nucleus.connect(user1).flashLoan(borrower3.address, token1.address, 1, "0x")).to.be.revertedWith("ERC20: insufficient allowance");
    });
    it("can flash loan 1", async function () {
      // no fees
      let bal1 = await token1.balanceOf(nucleus.address);
      let fee = await nucleus.flashFee(token1.address, bal1);
      let amountPlusFee = bal1.add(fee);
      let tx = await nucleus.connect(user1).flashLoan(borrower4.address, token1.address, bal1, "0x");
      let bal2 = await token1.balanceOf(nucleus.address);
      expect(bal2.sub(bal1)).eq(fee);
      await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, borrower4.address, bal1);
      await expect(tx).to.emit(token1, "Approval").withArgs(borrower4.address, nucleus.address, amountPlusFee);
      await expect(tx).to.emit(token1, "Transfer").withArgs(borrower4.address, nucleus.address, amountPlusFee);
      await expect(tx).to.emit(borrower4, "Callback");
      await expect(tx).to.not.emit(nucleus, "Transfer");
      await expect(tx).to.not.emit(nucleus, "TokensTransferred");
    });
    it("non owner cannot set fees", async function () {
      await expect(nucleus.connect(user1).setFlashLoanFeesForTokens([])).to.be.revertedWithCustomError(nucleus, "HydrogenNotContractOwner");
    });
    it("cannot set fee receiver to invalid location", async function () {
      await expect(nucleus.connect(owner).setFlashLoanFeesForTokens([
        {
          token: token1.address,
          feePPM: 0,
          receiverLocation: INVALID_LOCATION_6
        }
      ])).to.be.revertedWithCustomError(nucleus, "HydrogenInvalidLocationType");
    });
    it("owner can set fees", async function () {
      let fee0 = MAX_PPM.mul(9).div(10_000)
      let fee1 = MAX_PPM.mul(1).div(10_000)
      let fee3 = MAX_PPM
      let treasuryLocation = HydrogenNucleusHelper.internalAddressToLocation(owner.address);
      let deployerLocation = HydrogenNucleusHelper.internalAddressToLocation(deployer.address);
      let tx = await nucleus.connect(owner).setFlashLoanFeesForTokens([
        {
          // default fee: 0.09%
          token: AddressZero,
          feePPM: fee0,
          receiverLocation: treasuryLocation
        },{
          // loaning token1 costs 0.01%
          token: token1.address,
          feePPM: fee1,
          receiverLocation: deployerLocation
        },{
          // loaning token3 costs 0.0%
          token: token3.address,
          feePPM: fee3,
          receiverLocation: treasuryLocation
        }
      ]);
      // address zero
      let fees0 = await nucleus.getFlashLoanFeeForToken(AddressZero);
      expect(fees0.feePPM).eq(fee0);
      expect(fees0.receiverLocation).eq(treasuryLocation);
      let fees1 = await nucleus.getStoredFlashLoanFeeForToken(AddressZero);
      expect(fees1.feePPM).eq(fee0);
      expect(fees1.receiverLocation).eq(treasuryLocation);
      expect(await nucleus.flashFee(AddressZero, WeiPerEther)).eq(WeiPerEther.mul(9).div(10000));
      // token1
      let fees2 = await nucleus.getFlashLoanFeeForToken(token1.address);
      expect(fees2.feePPM).eq(fee1);
      expect(fees2.receiverLocation).eq(deployerLocation);
      let fees3 = await nucleus.getStoredFlashLoanFeeForToken(token1.address);
      expect(fees3.feePPM).eq(fee1);
      expect(fees3.receiverLocation).eq(deployerLocation);
      expect(await nucleus.flashFee(token1.address, WeiPerEther)).eq(WeiPerEther.mul(1).div(10000));
      // token3
      let fees4 = await nucleus.getFlashLoanFeeForToken(token3.address);
      expect(fees4.feePPM).eq(0);
      expect(fees4.receiverLocation).eq(treasuryLocation);
      let fees5 = await nucleus.getStoredFlashLoanFeeForToken(token3.address);
      expect(fees5.feePPM).eq(fee3);
      expect(fees5.receiverLocation).eq(treasuryLocation);
      expect(await nucleus.flashFee(token3.address, WeiPerEther)).eq(0);
      // token2
      let fees6 = await nucleus.getFlashLoanFeeForToken(token2.address);
      expect(fees6.feePPM).eq(fee0);
      expect(fees6.receiverLocation).eq(treasuryLocation);
      let fees7 = await nucleus.getStoredFlashLoanFeeForToken(token2.address);
      expect(fees7.feePPM).eq(0);
      expect(fees7.receiverLocation).eq(NULL_LOCATION);
      expect(await nucleus.flashFee(token2.address, WeiPerEther)).eq(WeiPerEther.mul(9).div(10000));
      // events
      await expect(tx).to.emit(nucleus, "FlashLoanFeeSetForToken").withArgs(AddressZero, fee0, treasuryLocation);
      await expect(tx).to.emit(nucleus, "FlashLoanFeeSetForToken").withArgs(token1.address, fee1, deployerLocation);
      await expect(tx).to.emit(nucleus, "FlashLoanFeeSetForToken").withArgs(token3.address, fee3, treasuryLocation);
    });
    it("can flash loan 2", async function () {
      // explicit zero fee
      let bal1 = await token3.balanceOf(nucleus.address);
      let amount = WeiPerUsdc.mul(10);
      expect(bal1).gte(amount);
      let fee = await nucleus.flashFee(token3.address, amount);
      expect(fee).eq(0);
      let amountPlusFee = amount.add(fee);
      let tx = await nucleus.connect(user1).flashLoan(borrower4.address, token3.address, amount, "0x");
      let bal2 = await token3.balanceOf(nucleus.address);
      expect(bal2.sub(bal1)).eq(fee);
      await expect(tx).to.emit(token3, "Transfer").withArgs(nucleus.address, borrower4.address, amount);
      await expect(tx).to.emit(token3, "Approval").withArgs(borrower4.address, nucleus.address, amountPlusFee);
      await expect(tx).to.emit(token3, "Transfer").withArgs(borrower4.address, nucleus.address, amountPlusFee);
      await expect(tx).to.emit(borrower4, "Callback");
      await expect(tx).to.not.emit(nucleus, "Transfer");
      await expect(tx).to.not.emit(nucleus, "TokensTransferred");
    });
    it("can flash loan 3", async function () {
      // fee set for token
      let bal11 = await token1.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(10);
      expect(bal11).gte(amount);
      let fee = await nucleus.flashFee(token1.address, amount);
      expect(fee).eq(amount.mul(1).div(10000));
      let amountPlusFee = amount.add(fee);
      let fees = await nucleus.getFlashLoanFeeForToken(token1.address);
      let bal21 = await nucleus.getTokenBalance(token1.address, fees.receiverLocation);
      let tx = await nucleus.connect(user1).flashLoan(borrower4.address, token1.address, amount, "0x");
      let bal12 = await token1.balanceOf(nucleus.address);
      expect(bal12.sub(bal11)).eq(fee);
      let bal22 = await nucleus.getTokenBalance(token1.address, fees.receiverLocation);
      expect(bal22.sub(bal21)).eq(fee);
      await expect(tx).to.emit(token1, "Transfer").withArgs(nucleus.address, borrower4.address, amount);
      await expect(tx).to.emit(token1, "Approval").withArgs(borrower4.address, nucleus.address, amountPlusFee);
      await expect(tx).to.emit(token1, "Transfer").withArgs(borrower4.address, nucleus.address, amountPlusFee);
      await expect(tx).to.emit(borrower4, "Callback");
      await expect(tx).to.not.emit(nucleus, "Transfer");
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token1.address, HydrogenNucleusHelper.externalAddressToLocation(borrower4.address), fees.receiverLocation, fee);
    });
    it("can flash loan 4", async function () {
      // default fee
      let bal11 = await token2.balanceOf(nucleus.address);
      let amount = WeiPerEther.mul(10);
      expect(bal11).gte(amount);
      let fee = await nucleus.flashFee(token2.address, amount);
      expect(fee).eq(amount.mul(9).div(10000));
      let amountPlusFee = amount.add(fee);
      let fees = await nucleus.getFlashLoanFeeForToken(token2.address);
      let bal21 = await nucleus.getTokenBalance(token2.address, fees.receiverLocation);
      let tx = await nucleus.connect(user1).flashLoan(borrower4.address, token2.address, amount, "0x");
      let bal12 = await token2.balanceOf(nucleus.address);
      expect(bal12.sub(bal11)).eq(fee);
      let bal22 = await nucleus.getTokenBalance(token2.address, fees.receiverLocation);
      expect(bal22.sub(bal21)).eq(fee);
      await expect(tx).to.emit(token2, "Transfer").withArgs(nucleus.address, borrower4.address, amount);
      await expect(tx).to.emit(token2, "Approval").withArgs(borrower4.address, nucleus.address, amountPlusFee);
      await expect(tx).to.emit(token2, "Transfer").withArgs(borrower4.address, nucleus.address, amountPlusFee);
      await expect(tx).to.emit(borrower4, "Callback");
      await expect(tx).to.not.emit(nucleus, "Transfer");
      await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token2.address, HydrogenNucleusHelper.externalAddressToLocation(borrower4.address), fees.receiverLocation, fee);
    });
    it("reverts if borrower needs to produce funds but cant part 2", async function () {
      await expect(nucleus.connect(user1).flashLoan(borrower5.address, token1.address, WeiPerEther, "0x")).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
  });
});
