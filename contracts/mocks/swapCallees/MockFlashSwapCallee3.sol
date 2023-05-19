// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";
import { IHydrogenFlashSwapCallee } from "./../../interfaces/IHydrogenFlashSwapCallee.sol";

/**
 * @title MockFlashSwapCallee3
 * @author Hysland Finance
 * @notice A mock callee. Used to test flash swaps.
 *
 * This callee logs the callback and returns.
 */
contract MockFlashSwapCallee3 is IHydrogenFlashSwapCallee {

    event Callback();

    address public nucleus;

    // keccak256("HydrogenNucleus.onFlashSwap");
    bytes32 internal constant FLASH_SWAP_MAGIC_VALUE = 0xef2ee65b98afb6a6fa41b62a72b172b3afcdaf4f76c0775c113b8d60c55085ac;

    constructor(address nuc) {
        nucleus = nuc;
    }

    function hydrogenNucleusFlashSwapCallback(FlashSwapCallbackParams memory /*params*/) external override returns (bytes32 magicValue) {
        //require(msg.sender == nucleus);
        //require(params.initiator is authorized);
        emit Callback();
        return FLASH_SWAP_MAGIC_VALUE;
    }
}
