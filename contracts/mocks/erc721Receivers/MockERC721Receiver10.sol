// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";
import { IERC721Receiver } from "./../../interfaces/IERC721Receiver.sol";


/**
 * @title MockERC721Receiver10
 * @author Blue Matter Technologies Ltd.
 * @notice A mock erc721 receiver. Used to test `safeTransferFrom()``.
 *
 * This callee accepts the transfer, makes a reentrant call to nucleus, and returns.
 */
contract MockERC721Receiver10 is IERC721Receiver {

    address payable public nucleus;

    address public hookCallee;
    bytes public hookCalldata;

    // bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"))
    bytes4 internal constant ON_ERC721_RECEIVED_MAGIC_VALUE = 0x150b7a02;

    constructor(address payable nuc) {
        nucleus = nuc;
    }

    function setHookCall(address callee, bytes calldata data) external {
        hookCallee = callee;
        hookCalldata = data;
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
        address from,
        uint256 tokenId,
        bytes calldata /*data*/
    ) external override returns (bytes4 magicValue) {
        //require(msg.sender == nucleus);
        // make external call
        address callee = hookCallee;
        if(callee != address(0)) {
            (bool success, ) = callee.call(hookCalldata);
            if(!success) revert();
        }
        // transfer erc721 back to from (makes testing easier)
        IHydrogenNucleus(payable(msg.sender)).transferFrom(address(this), from, tokenId);
        // return magic value
        return ON_ERC721_RECEIVED_MAGIC_VALUE;
    }
}
