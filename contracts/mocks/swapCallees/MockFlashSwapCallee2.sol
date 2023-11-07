// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";
import { IHydrogenFlashSwapCallee } from "./../../interfaces/IHydrogenFlashSwapCallee.sol";


/**
 * @title MockFlashSwapCallee2
 * @author Blue Matter Technologies Ltd.
 * @notice A mock callee. Used to test flash swaps.
 *
 * This callee explicitly reverts callbacks.
 */
contract MockFlashSwapCallee2 is IHydrogenFlashSwapCallee {

    address payable public nucleus;

    constructor(address payable nuc) {
        nucleus = nuc;
    }

    function hydrogenNucleusFlashSwapCallback(FlashSwapCallbackParams memory /*params*/) external override returns (bytes32 magicValue) {
        //require(msg.sender == nucleus);
        //require(params.initiator is authorized);
        nucleus = nucleus; // not necessary. only used to get rid of compiler warnings
        magicValue = bytes32(0);
        revert("MockFlashSwapCallee2: force revert");
    }
}
