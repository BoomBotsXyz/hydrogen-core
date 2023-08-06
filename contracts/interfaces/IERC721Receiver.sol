// SPDX-License-Identifier: none
pragma solidity 0.8.19;

/**
 * @title ERC721 token receiver interface
 * @dev Interface for any contract that wants to support safeTransfers
 * from ERC721 asset contracts.
 */
/**
 * @title IERC721Receiver
 * @author Hysland Finance
 * @notice Interface for any contract that wants to support safeTransfers from ERC721 asset contracts.
 */
interface IERC721Receiver {
    /**
     * @notice Whenever an ERC721 is transferred to this contract via safeTransferFrom by `operator` from `from`, this function is called.
     * It must return its Solidity selector to confirm the token transfer.
     * If any other value is returned or the interface is not implemented by the recipient, the transfer will be reverted.
     * The selector can be obtained in Solidity with `bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"))`.
     * @param operator The operator account that initiated the transfer.
     * @param from The account to transfer the token from.
     * @param tokenId The ID of the token being transferred.
     * @param data Arbitrary data to pass with the call.
     * @return magicValue The function selector.
     */
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4 magicValue);
}
