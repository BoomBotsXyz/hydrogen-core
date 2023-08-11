// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";
import { IHydrogenFlashSwapCallee } from "./../../interfaces/IHydrogenFlashSwapCallee.sol";
import { Locations } from "./../../libraries/Locations.sol";
import { MockERC20 } from "./../tokens/MockERC20.sol";


/**
 * @title MockFlashSwapCallee7
 * @author Hysland Finance
 * @notice A mock callee. Used to test flash swaps.
 *
 * This callee improperly implements the callback function, causing the tx to revert.
 */
contract MockFlashSwapCallee7 {

    address payable public nucleus;

    constructor(address payable nuc) {
        nucleus = nuc;
    }

    function hydrogenNucleusFlashSwapCallback(IHydrogenFlashSwapCallee.FlashSwapCallbackParams memory) external {}
}
