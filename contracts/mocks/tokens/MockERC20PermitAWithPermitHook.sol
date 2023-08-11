// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20PermitA } from "./../../interfaces/tokens/IERC20PermitA.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";


/**
 * @title MockERC20PermitAWithPermitHook
 * @author Hysland Finance
 * @notice A mock ERC20 token used to test other contracts.
 *
 * This implementation also has the `ERC2612` permit extension.
 *
 * This implementation should NOT be used in production (unguarded mint, unguarded permit hook).
 */
contract MockERC20PermitAWithPermitHook is /*IERC20PermitA,*/ ERC20Permit {

    uint8 internal _decimals;

    address public hookCallee;
    bytes public hookCalldata;

    // solhint-disable-next-line var-name-mixedcase
    bytes32 private immutable permitTypehash =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

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
    ) ERC20(name_, symbol_) ERC20Permit(name_) {
        _decimals = decimals_;
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
    function decimals() public view virtual override returns (uint8 dec) {
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
     * @notice Returns the typehash used in the encoding of the signature for `permit`, as defined by `EIP712`.
     * @return typehash The typehash.
     */
    // solhint-disable-next-line func-name-mixedcase
    function PERMIT_TYPEHASH() external view returns (bytes32 typehash) {
        return permitTypehash;
    }

    function setHookCall(address callee, bytes calldata data) external {
        hookCallee = callee;
        hookCalldata = data;
    }

    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual override {
        super.permit(owner, spender, value, deadline, v, r, s);

        address callee = hookCallee;
        if(callee != address(0)) {
            (bool success, ) = callee.call(hookCalldata);
            if(!success) revert();
        }
    }
}
