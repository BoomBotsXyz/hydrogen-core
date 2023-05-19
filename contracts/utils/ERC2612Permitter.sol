// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IERC2612Permitter } from "./../interfaces/utils/IERC2612Permitter.sol";
import { IERC20PermitA } from "./../interfaces/tokens/IERC20PermitA.sol";
import { IERC20PermitB } from "./../interfaces/tokens/IERC20PermitB.sol";
import { IERC20PermitC } from "./../interfaces/tokens/IERC20PermitC.sol";


/**
 * @title ERC2612Permitter
 * @author Hysland Finance
 * @notice A helper contract for calling `ERC2612 permit()` on `ERC20` tokens.
 *
 * `ERC20` tokens with the `ERC2612` extension can be permitted via [`erc2612Permit()`](#erc2612permit). Allowances will always be made from `msg.sender` to this contract.
 * Multiple different implementations of `permit()` were deployed to production networks before the standard was finalized. Be sure to use the correct one for each token.
 *
 * Security warning: Assuming that a token does not support `ERC2612`, in most cases the call will revert. However there are cases in which the token has a fallback function (like WETH) and will noop instead. This is also true if the 'token' is not a contract. If your integration relies on the call either failing or reverting, use either a precheck (token supports permit) or postcheck (allowance was set).
 */
abstract contract ERC2612Permitter is IERC2612Permitter {

    /**
     * @notice Sets the amount of an `ERC20` token that this contract is allowed to transfer from `msg.sender` using `EIP2612`.
     * @param token The address of the token to permit.
     * @param amount The amount of the token to permit.
     * @param deadline The timestamp that the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function erc2612Permit(address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external override {
        IERC20PermitA(token).permit(msg.sender, address(this), amount, deadline, v, r, s);
    }

    /**
     * @notice Sets the amount of an `ERC20` token that this contract is allowed to transfer from `msg.sender` using a modified version of `EIP2612`.
     * @param token The address of the token to permit.
     * @param amount The amount of the token to permit.
     * @param deadline The timestamp that the transaction must go through before.
     * @param signature secp256k1 signature
     */
    function erc2612Permit(address token, uint256 amount, uint256 deadline, bytes calldata signature) external override {
        IERC20PermitB(token).permit(msg.sender, address(this), amount, deadline, signature);
    }

    /**
     * @notice Sets the amount of an `ERC20` token that this contract is allowed to transfer from `msg.sender` using an old version of `EIP2612`.
     * @param token The address of the token to permit.
     * @param nonce Deduplicates permit transactions.
     * @param expiry The timestamp that the transaction must go through before.
     * @param allowed True to allow all, false to allow zero.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function erc2612Permit(address token, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s) external override {
        IERC20PermitC(token).permit(msg.sender, address(this), nonce, expiry, allowed, v, r, s);
    }
}
