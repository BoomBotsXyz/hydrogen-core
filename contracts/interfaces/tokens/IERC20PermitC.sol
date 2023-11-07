// SPDX-License-Identifier: none
// code borrowed from https://etherscan.io/address/0x6b175474e89094c44da98b954eedeac495271d0f#code
pragma solidity 0.8.19;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";


/**
 * @title IERC20PermitC
 * @author Blue Matter Technologies Ltd.
 * @notice An `ERC20` token that also has the `ERC2612` permit extension.
 *
 * Multiple different implementations of `permit()` were deployed to production networks before the standard was finalized. This is NOT the finalized version.
 */
interface IERC20PermitC is IERC20Metadata {

    /**
     * @notice Returns the current nonce for `owner`. This value must be
     * included whenever a signature is generated for `permit`.
     *
     * Every successful call to `permit` increases `owner`'s nonce by one. This
     * prevents a signature from being used multiple times.
     * @return nonce The current nonce for `owner`.
     */
    function nonces(address owner) external view returns (uint256 nonce);

    /**
     * @notice Returns the domain separator used in the encoding of the signature for `permit`, as defined by `EIP712`.
     * @return sep The domain separator.
     */
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32 sep);

    /**
     * @notice Sets the allowance of `spender` over `holder`'s tokens given `holder`'s signed approval.
     * @param holder The account that holds the tokens.
     * @param spender The account that spends the tokens.
     * @param nonce Deduplicates permit transactions.
     * @param expiry The timestamp that the transaction must go through before or zero for never expires.
     * @param allowed True to allow all, false to allow zero.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function permit(
        address holder,
        address spender,
        uint256 nonce,
        uint256 expiry,
        bool allowed,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
