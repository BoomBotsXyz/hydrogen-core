// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";
import { IERC721Receiver } from "./../../interfaces/IERC721Receiver.sol";


/**
 * @title MockERC721Receiver2
 * @author Blue Matter Technologies Ltd.
 * @notice A mock erc721 receiver. Used to test `safeTransferFrom()``.
 *
 * This callee explictly reverts callbacks.
 */
contract MockERC721Receiver2 is IERC721Receiver {

    address payable public nucleus;

    constructor(address payable nuc) {
        nucleus = nuc;
    }

    /**
     * @notice Whenever an ERC721 is transferred to this contract via safeTransferFrom by `operator` from `from`, this function is called.
     * It must return its Solidity selector to confirm the token transfer.
     * If any other value is returned or the interface is not implemented by the recipient, the transfer will be reverted.
     * The selector can be obtained in Solidity with `bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"))`.
     * @return magicValue The function selector.
     */
    function onERC721Received(
        address /*operator*/,
        address /*from*/,
        uint256 /*tokenId*/,
        bytes calldata /*data*/
    ) external override returns (bytes4 magicValue) {
        //require(msg.sender == nucleus);
        nucleus = nucleus; // not necessary. only used to get rid of compiler warnings
        magicValue = bytes4(0);
        revert("MockERC721Receiver2: force revert");
    }
}
