// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";


/**
 * @title MockERC721Receiver7
 * @author Hysland Finance
 * @notice A mock erc721 receiver. Used to test `safeTransferFrom()``.
 *
 * This callee implement the receiver interface incorrectly and thus reverts.
 */
contract MockERC721Receiver7 {

    address payable public nucleus;

    constructor(address payable nuc) {
        nucleus = nuc;
    }

    /**
     * @notice Whenever an ERC721 is transferred to this contract via safeTransferFrom by `operator` from `from`, this function is called.
     * It must return its Solidity selector to confirm the token transfer.
     * If any other value is returned or the interface is not implemented by the recipient, the transfer will be reverted.
     * The selector can be obtained in Solidity with `IERC721Receiver.onERC721Received.selector`.
     * @param operator The operator account that initiated the transfer.
     * @param from The account to transfer the token from.
     * @param tokenId The ID of the token being transferred.
     * @param data Arbitrary data to pass with the call.
     */
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external {
        // pass
    }
}
