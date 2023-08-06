// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";


/**
 * @title MockERC20WithTransferHook
 * @author Hysland Finance
 * @notice A mock ERC20 token used to test other contracts.
 *
 * This implementation should NOT be used in production (unguarded mint, unguarded transfer hook).
 */
contract MockERC20WithTransferHook is ERC20 {

    uint8 internal _decimals;

    address public hookCallee;
    bytes public hookCalldata;


    /**
     * @notice Constructs the MockERC20WithTransferHook contract.
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
     */
    function decimals() public view virtual override returns (uint8) {
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

    function setHookCall(address callee, bytes calldata data) external {
        hookCallee = callee;
        hookCalldata = data;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);
        address callee = hookCallee;
        if(callee != address(0)) {
            (bool success, ) = callee.call(hookCalldata);
            if(!success) revert();
        }
    }
}
