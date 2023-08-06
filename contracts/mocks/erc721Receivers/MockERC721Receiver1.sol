// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";


/**
 * @title MockERC721Receiver1
 * @author Hysland Finance
 * @notice A mock erc721 receiver. Used to test `safeTransferFrom()``.
 *
 * This callee doesn't implement the receiver interface and thus reverts.
 */
contract MockERC721Receiver1 {

    address payable public nucleus;

    constructor(address payable nuc) {
        nucleus = nuc;
    }
}
