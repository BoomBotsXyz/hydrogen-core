// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";


/**
 * @title MockFlashSwapCallee1
 * @author Hysland Finance
 * @notice A mock callee. Used to test flash swaps.
 *
 * This callee doesn't implement the interface and thus reverts.
 */
contract MockFlashSwapCallee1 {

    address payable public nucleus;

    constructor(address payable nuc) {
        nucleus = nuc;
    }
}
