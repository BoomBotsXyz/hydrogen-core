// SPDX-License-Identifier: none
// code borrowed from https://etherscan.io/address/0x3B27F92C0e212C671EA351827EDF93DB27cc0c65#code
pragma solidity 0.8.19;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";


/**
 * @title IERC20PermitB
 * @author Blue Matter Technologies Ltd.
 * @notice An `ERC20` token that also has the `ERC2612` permit extension.
 *
 * Multiple different implementations of `permit()` were deployed to production networks before the standard was finalized. This is NOT the finalized version.
 */
interface IERC20PermitB is IERC20Metadata {

    /**
     * @notice Returns the current nonce for `owner`. This value must be
     * included whenever a signature is generated for `permit`.
     *
     * Every successful call to `permit` increases `owner`'s nonce by one. This
     * prevents a signature from being used multiple times.
     * @return nonce The current nonce for `owner`.
     */
    function nonces(address owner) external view returns (uint256);

    /**
     * @notice Returns the domain separator used in the encoding of the signature for `permit`, as defined by `EIP712`.
     * @return sep The domain separator.
     */
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32 sep);

    /**
     * @notice Sets the allowance of `spender` over `owner`'s tokens given `owner`'s signed approval.
     * @param owner The account that holds the tokens.
     * @param spender The account that spends the tokens.
     * @param value The amount of the token to permit.
     * @param deadline The timestamp that the transaction must go through before.
     * @param signature secp256k1 signature
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        bytes calldata signature
    ) external;
}
