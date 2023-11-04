// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";
import { IHydrogenFlashSwapCallee } from "./../../interfaces/IHydrogenFlashSwapCallee.sol";
import { Locations } from "./../../libraries/Locations.sol";
import { MockERC20 } from "./../tokens/MockERC20.sol";


/**
 * @title MockFlashSwapCallee10
 * @author Blue Matter Technologies Ltd.
 * @notice A mock callee. Used to test flash swaps.
 *
 * This callee makes a reentrant call to nucleus and returns.
 */
contract MockFlashSwapCallee10 is IHydrogenFlashSwapCallee {

    address payable public nucleus;

    address public hookCallee;
    bytes public hookCalldata;

    uint256 public stackDepth;

    // keccak256("HydrogenNucleus.onFlashSwap");
    bytes32 internal constant FLASH_SWAP_MAGIC_VALUE = 0xef2ee65b98afb6a6fa41b62a72b172b3afcdaf4f76c0775c113b8d60c55085ac;

    constructor(address payable nuc) {
        nucleus = nuc;
        stackDepth = 1;
    }

    function setHookCall(address callee, bytes calldata data) external {
        hookCallee = callee;
        hookCalldata = data;
    }

    function hydrogenNucleusFlashSwapCallback(FlashSwapCallbackParams memory /*params*/) external override returns (bytes32 magicValue) {
        if(stackDepth > 1) return FLASH_SWAP_MAGIC_VALUE; // used to stop infinite loop caused in one specific test
        //require(msg.sender == nucleus);
        //require(params.initiator is authorized);
        // make external call
        address callee = hookCallee;
        if(callee != address(0)) {
            stackDepth = 2;
            (bool success, ) = callee.call(hookCalldata);
            if(!success) revert();
            stackDepth = 1;
        }
        // return
        return FLASH_SWAP_MAGIC_VALUE;
    }
}
