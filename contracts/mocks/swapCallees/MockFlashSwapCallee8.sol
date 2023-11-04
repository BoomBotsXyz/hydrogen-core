// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";
import { IHydrogenFlashSwapCallee } from "./../../interfaces/IHydrogenFlashSwapCallee.sol";
import { Locations } from "./../../libraries/Locations.sol";
import { MockERC20 } from "./../tokens/MockERC20.sol";


/**
 * @title MockFlashSwapCallee8
 * @author Blue Matter Technologies Ltd.
 * @notice A mock callee. Used to test flash swaps.
 *
 * This callee improperly implements the callback function, causing the tx to revert.
 */
contract MockFlashSwapCallee8 is IHydrogenFlashSwapCallee {

    address payable public nucleus;

    constructor(address payable nuc) {
        nucleus = nuc;
    }
    function hydrogenNucleusFlashSwapCallback(FlashSwapCallbackParams memory) external override returns (bytes32 magicValue) {
        //require(msg.sender == nucleus);
        //require(params.initiator is authorized);
        nucleus = nucleus; // not necessary. only used to get rid of compiler warnings
        return keccak256("wrong value");
    }
}
