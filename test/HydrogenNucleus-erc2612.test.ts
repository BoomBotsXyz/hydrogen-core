/* global describe it before ethers */

import hre from "hardhat";
const { ethers } = hre;
const { provider } = ethers;
import { BigNumber as BN, BigNumberish, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;
import { splitSignature } from "ethers/lib/utils";

import { HydrogenNucleus, WrappedGasToken, MockERC20, MockERC20PermitA, MockERC20PermitB, MockERC20PermitC } from "./../typechain-types";

import { expectDeployed } from "./../scripts/utilities/expectDeployed";
import { getNetworkSettings } from "../scripts/utils/getNetworkSettings";
import HydrogenNucleusHelper from "../scripts/utils/HydrogenNucleusHelper";
import HydrogenNucleusEventLogger from "../scripts/utils/HydrogenNucleusEventLogger";
import { setStorageAt, toBytes32 } from "../scripts/utilities/setStorage";
import { decimalsToAmount } from "../scripts/utils/price";
import { deployContract } from "../scripts/utils/deployContract";
import { getERC2612PermitASignature, getERC2612PermitBSignature, getERC2612PermitCSignature, getNonce } from "../scripts/utilities/getERC2612PermitSignature";

const { AddressZero, WeiPerEther, MaxUint256 } = ethers.constants;
const WeiPerUsdc = BN.from(1_000_000); // 6 decimals
const MAX_PPM = BN.from(1_000_000); // parts per million

describe("HydrogenNucleus-erc2612", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let nucleus: HydrogenNucleus;

  // fetch tokens
  let tokens: any[] = [
    { name: "MockERC20", symbol: "MockERC20", permit: false },
    { name: "MockERC20PermitA", symbol: "MockERC20PermitA", permit: { permitType: "A", version: "1", chainID: 31337} },
    { name: "MockERC20PermitB", symbol: "MockERC20PermitB", permit: { permitType: "B", version: "1", chainID: 31337} },
    { name: "MockERC20PermitC", symbol: "MockERC20PermitC", permit: { permitType: "C", version: "1", chainID: 31337} },
    { name: "MockERC20NoReturnsSuccess", symbol: "MockERC20NoReturnsSuccess", permit: false, special: ["noreturns"] },
    { name: "WrappedGasToken", symbol: "WGAS", permit: false, special: ["wgas","fallback"] },
  ];
  for(let i = 0; i < tokens.length; ++i) {
    if(!tokens[i].special) tokens[i].special = [];
  }

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
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("should deploy successfully", async function () {
      nucleus = await deployContract(deployer, "HydrogenNucleus", [owner.address]) as HydrogenNucleus;
    });
  });

  for(let tokenIndex = 0; tokenIndex < tokens.length; ++tokenIndex) {
    testToken(tokens[tokenIndex]);
  }

  function testToken(token: any) {
    let tokenContract: Contract;

    describe(token.symbol, function () {
      before(async function () {
        // fetch contract
        let args = [token.name, token.symbol, 18];
        if(token.special.includes("wgas")) tokenContract = await deployContract(deployer, "WrappedGasToken", []) as WrappedGasToken;
        else if(token.special.includes("noreturns")) tokenContract = await deployContract(deployer, "MockERC20NoReturnsSuccess", args) as MockERC20;
        else if(!token.permit) tokenContract = await deployContract(deployer, "MockERC20", args) as MockERC20;
        else if(token.permit.permitType === "A") tokenContract = await deployContract(deployer, "MockERC20PermitA", args) as MockERC20PermitA;
        else if(token.permit.permitType === "B") tokenContract = await deployContract(deployer, "MockERC20PermitB", args) as MockERC20PermitB;
        else if(token.permit.permitType === "C") tokenContract = await deployContract(deployer, "MockERC20PermitC", args) as MockERC20PermitC;
        else tokenContract = await deployContract(deployer, "MockERC20", args) as MockERC20;
        token.address = tokenContract.address;
        token.contract = tokenContract;
        await expectDeployed(token.address);
        await tokenContract.name();
        await tokenContract.symbol();
        await tokenContract.decimals();
        await tokenContract.totalSupply();
        await tokenContract.balanceOf(user1.address);
        if(!!token.permit) {
          let ds = await tokenContract.DOMAIN_SEPARATOR();
          expect(ds.length).eq(66); // bytes32
          let pt = await tokenContract.PERMIT_TYPEHASH();
          expect(pt.length).eq(66); // bytes32
          if(token.permit.permitType === "A") expect(pt).eq("0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9");
          else if(token.permit.permitType === "B") expect(pt).eq("0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9");
          else if(token.permit.permitType === "C") expect(pt).eq("0xea2aa0a1be11a07ed86d755c93467f4f82362b452371d1ba94d1715123511acb");
        }
      });

      describe("erc2612Permit A", function () {
        if(!token.permit || token.permit.permitType !== "A") {
          if(token.special.includes("fallback")) {
            it("will fail silently", async function () {
              let tx = await nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"](user1.address, token.address, 1, MaxUint256, 27, MaxUint256.toHexString(), MaxUint256.toHexString());
              await expect(tx).to.not.emit(tokenContract, "Approval");
              expect(await tokenContract.allowance(user1.address, nucleus.address)).eq(0);
            });
          } else {
            it("will revert", async function () {
              await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"](user1.address, token.address, 1, MaxUint256, 27, MaxUint256.toHexString(), MaxUint256.toHexString())).to.be.reverted;
            });
          }
        } else {
          let permitAmount = BN.from(10);
          it("cannot permit after deadline", async function () {
            let deadline = (await provider.getBlock("latest")).timestamp - 1;
            let { v, r, s } = await getERC2612PermitASignature(user1, nucleus.address, tokenContract, permitAmount, { ...token.permit, deadline });
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"](user1.address, token.address, permitAmount, deadline, v, r, s)).to.be.reverted;
          });
          it("cannot permit with invalid signature", async function () {
            let { v, r, s } = await getERC2612PermitASignature(user1, nucleus.address, tokenContract, permitAmount, token.permit);
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"](user1.address, token.address, permitAmount.add(1), MaxUint256, v, r, s)).to.be.reverted;
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"](user1.address, token.address, permitAmount, MaxUint256.sub(1), v, r, s)).to.be.reverted;
            let v2 = ( (v%2==0) ? v-1 : v+1 ); // increments if odd, decrements if even
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"](user1.address, token.address, permitAmount, MaxUint256, v2, r, s)).to.be.reverted;
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"](user1.address, token.address, permitAmount, MaxUint256, v, s, r)).to.be.reverted;
          });
          it("can permit", async function () {
            let { v, r, s } = await getERC2612PermitASignature(user1, nucleus.address, tokenContract, permitAmount, token.permit);
            let tx = await nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"](user1.address, token.address, permitAmount, MaxUint256, v, r, s);
            await expect(tx).to.emit(tokenContract, "Approval").withArgs(user1.address, nucleus.address, permitAmount);
            expect(await tokenContract.allowance(user1.address, nucleus.address)).eq(permitAmount);
          });
          it("can use allowance", async function () {
            await mintTokens(token, user1.address, 20);
            let locationExt = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
            let locationInt = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
            let balExt1 = await nucleus.getTokenBalance(token.address, locationExt);
            let balInt1 = await nucleus.getTokenBalance(token.address, locationInt);
            let tx = await nucleus.connect(user1).tokenTransfer({
              token: token.address,
              amount: 3,
              src: locationExt,
              dst: locationInt
            });
            let balExt2 = await nucleus.getTokenBalance(token.address, locationExt);
            let balInt2 = await nucleus.getTokenBalance(token.address, locationInt);
            expect(balExt1.sub(balExt2)).eq(3);
            expect(balInt2.sub(balInt1)).eq(3);
            await expect(tx).to.emit(tokenContract, "Transfer").withArgs(user1.address, nucleus.address, 3);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token.address, locationExt, locationInt, 3);
          });
          it("can use multicall with permit", async function () {
            await mintTokens(token, user2.address, 20);
            let locationExt = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
            let locationInt = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
            let balExt1 = await nucleus.getTokenBalance(token.address, locationExt);
            let balInt1 = await nucleus.getTokenBalance(token.address, locationInt);
            let { v, r, s } = await getERC2612PermitASignature(user2, nucleus.address, tokenContract, permitAmount, token.permit);
            let txdata0 = nucleus.interface.encodeFunctionData("erc2612Permit(address,address,uint256,uint256,uint8,bytes32,bytes32)", [user2.address, token.address, permitAmount, MaxUint256, v, r, s]);
            let txdata1 = nucleus.interface.encodeFunctionData("tokenTransfer", [{
              token: token.address,
              amount: 3,
              src: locationExt,
              dst: locationInt
            }]);
            let tx = await nucleus.connect(user2).multicall([txdata0, txdata1]);
            let balExt2 = await nucleus.getTokenBalance(token.address, locationExt);
            let balInt2 = await nucleus.getTokenBalance(token.address, locationInt);
            expect(balExt1.sub(balExt2)).eq(3);
            expect(balInt2.sub(balInt1)).eq(3);
            await expect(tx).to.emit(tokenContract, "Approval").withArgs(user2.address, nucleus.address, permitAmount);
            await expect(tx).to.emit(tokenContract, "Transfer").withArgs(user2.address, nucleus.address, 3);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token.address, locationExt, locationInt, 3);
          });
        }
      });

      describe("erc2612Permit B", function () {
        if(!token.permit || token.permit.permitType !== "B") {
          if(token.special.includes("fallback")) {
            it("will fail silently", async function () {
              let tx = await nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bytes)"](user1.address, token.address, 1, MaxUint256, "0x1234");
              await expect(tx).to.not.emit(tokenContract, "Approval");
              expect(await tokenContract.allowance(user1.address, nucleus.address)).eq(0);
            });
          } else {
            it("will revert", async function () {
              await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bytes)"](user1.address, token.address, 1, MaxUint256, "0x1234")).to.be.reverted;
            });
          }
        } else {
          let permitAmount = BN.from(10);
          it("cannot permit after deadline", async function () {
            let deadline = (await provider.getBlock("latest")).timestamp - 1;
            let sig = await getERC2612PermitBSignature(user1, nucleus.address, tokenContract, permitAmount, { ...token.permit, deadline });
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bytes)"](user1.address, token.address, permitAmount, deadline, sig)).to.be.reverted;
          });
          it("cannot permit with invalid signature", async function () {
            let sig = await getERC2612PermitBSignature(user1, nucleus.address, tokenContract, permitAmount, token.permit);
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bytes)"](user1.address, token.address, permitAmount.add(1), MaxUint256, sig)).to.be.reverted;
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bytes)"](user1.address, token.address, permitAmount, MaxUint256.sub(1), sig)).to.be.reverted;
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bytes)"](user1.address, token.address, permitAmount, MaxUint256, "0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890")).to.be.reverted;
          });
          it("can permit", async function () {
            let sig = await getERC2612PermitBSignature(user1, nucleus.address, tokenContract, permitAmount, token.permit);
            let tx = await nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bytes)"](user1.address, token.address, permitAmount, MaxUint256, sig);
            await expect(tx).to.emit(tokenContract, "Approval").withArgs(user1.address, nucleus.address, permitAmount);
            expect(await tokenContract.allowance(user1.address, nucleus.address)).eq(permitAmount);
          });
          it("can use allowance", async function () {
            await mintTokens(token, user1.address, 20);
            let locationExt = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
            let locationInt = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
            let balExt1 = await nucleus.getTokenBalance(token.address, locationExt);
            let balInt1 = await nucleus.getTokenBalance(token.address, locationInt);
            let tx = await nucleus.connect(user1).tokenTransfer({
              token: token.address,
              amount: 3,
              src: locationExt,
              dst: locationInt
            });
            let balExt2 = await nucleus.getTokenBalance(token.address, locationExt);
            let balInt2 = await nucleus.getTokenBalance(token.address, locationInt);
            expect(balExt1.sub(balExt2)).eq(3);
            expect(balInt2.sub(balInt1)).eq(3);
            await expect(tx).to.emit(tokenContract, "Transfer").withArgs(user1.address, nucleus.address, 3);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token.address, locationExt, locationInt, 3);
          });
          it("can use multicall with permit", async function () {
            await mintTokens(token, user2.address, 20);
            let locationExt = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
            let locationInt = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
            let balExt1 = await nucleus.getTokenBalance(token.address, locationExt);
            let balInt1 = await nucleus.getTokenBalance(token.address, locationInt);
            let sig = await getERC2612PermitBSignature(user2, nucleus.address, tokenContract, permitAmount, token.permit);
            let txdata0 = nucleus.interface.encodeFunctionData("erc2612Permit(address,address,uint256,uint256,bytes)", [user2.address, token.address, permitAmount, MaxUint256, sig]);
            let txdata1 = nucleus.interface.encodeFunctionData("tokenTransfer", [{
              token: token.address,
              amount: 3,
              src: locationExt,
              dst: locationInt
            }]);
            let tx = await nucleus.connect(user2).multicall([txdata0, txdata1]);
            let balExt2 = await nucleus.getTokenBalance(token.address, locationExt);
            let balInt2 = await nucleus.getTokenBalance(token.address, locationInt);
            expect(balExt1.sub(balExt2)).eq(3);
            expect(balInt2.sub(balInt1)).eq(3);
            await expect(tx).to.emit(tokenContract, "Approval").withArgs(user2.address, nucleus.address, permitAmount);
            await expect(tx).to.emit(tokenContract, "Transfer").withArgs(user2.address, nucleus.address, 3);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token.address, locationExt, locationInt, 3);
          });
        }
      });

      describe("erc2612Permit C", function () {
        if(!token.permit || token.permit.permitType !== "C") {
          if(token.special.includes("fallback")) {
            it("will fail silently", async function () {
              let tx = await nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)"](user1.address, token.address, 0, 0, true, 27, MaxUint256.toHexString(), MaxUint256.toHexString());
              await expect(tx).to.not.emit(tokenContract, "Approval");
              expect(await tokenContract.allowance(user1.address, nucleus.address)).eq(0);
            });
          } else {
            it("will revert", async function () {
              await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)"](user1.address, token.address, 0, 0, true, 27, MaxUint256.toHexString(), MaxUint256.toHexString())).to.be.reverted;
            })
          }
        } else {
          it("cannot permit from address zero", async function () {
            // impossible to pass from erc20rf to dai, must call dai directly
            let nonce = await getNonce(token.address, user1.address);
            let { v, r, s } = await getERC2612PermitCSignature(user1, nucleus.address, tokenContract, true, { ...token.permit, nonce });
            await expect(tokenContract.permit(AddressZero, nucleus.address, nonce, MaxUint256, true, v, r, s)).to.be.revertedWith("Dai/invalid-address-0");
          });
          it("cannot permit after expiry", async function () {
            let expiry = (await provider.getBlock("latest")).timestamp - 1;
            let nonce = await getNonce(token.address, user1.address);
            let { v, r, s } = await getERC2612PermitCSignature(user1, nucleus.address, tokenContract, true, { ...token.permit, nonce, expiry });
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)"](user1.address, token.address, nonce, expiry, true, v, r, s)).to.be.revertedWith("Dai/permit-expired");
          });
          it("cannot permit with invalid nonce", async function () {
            let nonce = (await getNonce(token.address, user1.address)).add(1);
            let { v, r, s } = await getERC2612PermitCSignature(user1, nucleus.address, tokenContract, true, { ...token.permit, nonce });
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)"](user1.address, token.address, nonce, MaxUint256, true, v, r, s)).to.be.revertedWith("Dai/invalid-nonce");
          });
          it("cannot permit with invalid signature", async function () {
            let nonce = await getNonce(token.address, user1.address);
            let { v, r, s } = await getERC2612PermitCSignature(user1, nucleus.address, tokenContract, true, { ...token.permit, nonce });
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)"](user1.address, token.address, nonce, MaxUint256, false, v, r, s)).to.be.revertedWith("Dai/invalid-permit");
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)"](user1.address, token.address, nonce, MaxUint256.sub(1), true, v, r, s)).to.be.revertedWith("Dai/invalid-permit");
            let v2 = ( (v%2==0) ? v-1 : v+1 ); // increments if odd, decrements if even
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)"](user1.address, token.address, nonce, MaxUint256, true, v2, r, s)).to.be.revertedWith("Dai/invalid-permit");
            await expect(nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)"](user1.address, token.address, nonce, MaxUint256, true, v, s, r)).to.be.revertedWith("Dai/invalid-permit");
          });
          it("can permit all", async function () {
            let nonce = await getNonce(token.address, user1.address);
            let { v, r, s } = await getERC2612PermitCSignature(user1, nucleus.address, tokenContract, true, { ...token.permit, nonce });
            let tx = await nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)"](user1.address, token.address, nonce, MaxUint256, true, v, r, s);
            await expect(tx).to.emit(tokenContract, "Approval").withArgs(user1.address, nucleus.address, MaxUint256);
            expect(await tokenContract.allowance(user1.address, nucleus.address)).eq(MaxUint256);
          });
          it("can use allowance", async function () {
            await mintTokens(token, user1.address, 20);
            let locationExt = HydrogenNucleusHelper.externalAddressToLocation(user1.address);
            let locationInt = HydrogenNucleusHelper.internalAddressToLocation(user1.address);
            let balExt1 = await nucleus.getTokenBalance(token.address, locationExt);
            let balInt1 = await nucleus.getTokenBalance(token.address, locationInt);
            let tx = await nucleus.connect(user1).tokenTransfer({
              token: token.address,
              amount: 3,
              src: locationExt,
              dst: locationInt
            });
            let balExt2 = await nucleus.getTokenBalance(token.address, locationExt);
            let balInt2 = await nucleus.getTokenBalance(token.address, locationInt);
            expect(balExt1.sub(balExt2)).eq(3);
            expect(balInt2.sub(balInt1)).eq(3);
            await expect(tx).to.emit(tokenContract, "Transfer").withArgs(user1.address, nucleus.address, 3);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token.address, locationExt, locationInt, 3);
            let allowance = await tokenContract.allowance(user1.address, nucleus.address);
            expect(allowance.eq(MaxUint256) || allowance.eq(MaxUint256.sub(3))); // may not decrease if MaxUint256
          });
          it("can use multicall with permit", async function () {
            await mintTokens(token, user2.address, 20);
            let locationExt = HydrogenNucleusHelper.externalAddressToLocation(user2.address);
            let locationInt = HydrogenNucleusHelper.internalAddressToLocation(user2.address);
            let balExt1 = await nucleus.getTokenBalance(token.address, locationExt);
            let balInt1 = await nucleus.getTokenBalance(token.address, locationInt);
            let nonce = await getNonce(token.address, user2.address);
            let { v, r, s } = await getERC2612PermitCSignature(user2 as any, nucleus.address, tokenContract, true, { ...token.permit, nonce });
            let txdata0 = nucleus.interface.encodeFunctionData("erc2612Permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)", [user2.address, token.address, nonce, MaxUint256, true, v, r, s]);
            let txdata1 = nucleus.interface.encodeFunctionData("tokenTransfer", [{
              token: token.address,
              amount: 3,
              src: locationExt,
              dst: locationInt
            }]);
            let tx = await nucleus.connect(user2).multicall([txdata0, txdata1]);
            let balExt2 = await nucleus.getTokenBalance(token.address, locationExt);
            let balInt2 = await nucleus.getTokenBalance(token.address, locationInt);
            expect(balExt1.sub(balExt2)).eq(3);
            expect(balInt2.sub(balInt1)).eq(3);
            await expect(tx).to.emit(tokenContract, "Approval").withArgs(user2.address, nucleus.address, MaxUint256);
            await expect(tx).to.emit(tokenContract, "Transfer").withArgs(user2.address, nucleus.address, 3);
            await expect(tx).to.emit(nucleus, "TokensTransferred").withArgs(token.address, locationExt, locationInt, 3);
          });
          it("can permit zero", async function () {
            let nonce = await getNonce(token.address, user1.address);
            let { v, r, s } = await getERC2612PermitCSignature(user1, nucleus.address, tokenContract, false, { ...token.permit, nonce });
            let tx = await nucleus.connect(user1)["erc2612Permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)"](user1.address, token.address, nonce, MaxUint256, false, v, r, s);
            await expect(tx).to.emit(tokenContract, "Approval").withArgs(user1.address, nucleus.address, 0);
            expect(await tokenContract.allowance(user1.address, nucleus.address)).eq(0);
          });
        }
      });
    });

    async function mintTokens(token:any, receiver:string, amount: BigNumberish) {
      if(!!token.special && token.special.includes("wgas")) {
        await token.contract.deposit({value: amount});
        await token.contract.transfer(receiver, amount);
      } else {
        await token.contract.mint(receiver, amount);
      }
    }
  }
});
