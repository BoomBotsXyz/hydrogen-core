// SPDX-License-Identifier: none
// code borrowed from https://etherscan.io/address/0x6b175474e89094c44da98b954eedeac495271d0f#code
pragma solidity 0.8.19;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IERC20PermitB } from "./../../interfaces/tokens/IERC20PermitB.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";


/**
 * @title MockERC20PermitB
 * @author Blue Matter Technologies Ltd.
 * @notice A mock ERC20 token used to test other contracts.
 *
 * This implementation also has an old version of the `ERC2612` permit extension.
 *
 * This implementation should NOT be used in production (unguarded mint).
 */
contract MockERC20PermitB is IERC20PermitB, ERC20 {

    uint8 internal _decimals;

    // --- EIP712 niceties ---
    bytes32 internal _domainSeparator;
    bytes32 internal _permitTypehash = keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    mapping (address => uint) internal _nonces;

    /**
     * @notice Constructs the MockERC20 contract.
     * @param name_ The name of the token.
     * @param symbol_ The symbol of the token.
     * @param decimals_ The amount of decimals in the token.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
        uint256 chainID;
        assembly {
            chainID := chainid()
        }
        _domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(name_)),
            keccak256(bytes("1")),
            chainID,
            address(this)
        ));
    }

    /**
     * @notice Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5,05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the value `ERC20` uses, unless this function is
     * overridden.
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * `balanceOf()` and `transfer`.
     * @return dec The number of decimals.
     */
    function decimals() public view virtual override(ERC20, IERC20Metadata) returns (uint8 dec) {
        return _decimals;
    }

    /**
     * @notice Mints tokens.
     * @param receiver The address to receive new tokens.
     * @param amount The amount of tokens to mint.
     */
    function mint(address receiver, uint256 amount) external {
        _mint(receiver, amount);
    }

    /**
     * @notice Returns the current nonce for `owner`. This value must be
     * included whenever a signature is generated for `permit`.
     *
     * Every successful call to `permit` increases `owner`'s nonce by one. This
     * prevents a signature from being used multiple times.
     * @return nonce The current nonce for `owner`.
     */
    function nonces(address owner) external view override returns (uint256 nonce) {
        return _nonces[owner];
    }

    /**
     * @notice Returns the domain separator used in the encoding of the signature for `permit`, as defined by `EIP712`.
     * @return sep The domain separator.
     */
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view override returns (bytes32 sep) {
        return _domainSeparator;
    }

    /**
     * @notice Returns the typehash used in the encoding of the signature for `permit`, as defined by `EIP712`.
     * @return typehash The typehash.
     */
    // solhint-disable-next-line func-name-mixedcase
    function PERMIT_TYPEHASH() external view returns (bytes32 typehash) {
        return _permitTypehash;
    }

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
    ) external override {
        require(block.timestamp <= deadline, "ERC20PermitB: expired deadline");

        bytes32 structHash = keccak256(abi.encode(_permitTypehash, owner, spender, value, _nonces[owner], deadline));

        bytes32 hash = ECDSA.toTypedDataHash(_domainSeparator, structHash);

        address signer = ECDSA.recover(hash, signature);
        require(signer == owner, "ERC20PermitB: invalid signature");

        _approve(owner, spender, value);
    }
}
