// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IERC3156FlashBorrower } from "./../../interfaces/IERC3156FlashBorrower.sol";
import { MockERC20 } from "./../tokens/MockERC20.sol";


/**
 * @title MockFlashLoanBorrower5
 * @author Hysland Finance
 * @notice A mock borrower. Used to test flash loans.
 *
 * This borrower logs the callback, sets allowance, and returns.
 */
contract MockFlashLoanBorrower5 is IERC3156FlashBorrower {

    event Callback();

    address public nucleus;

    // keccak256("ERC3156FlashBorrower.onFlashLoan")
    bytes32 internal constant FLASH_LOAN_MAGIC_VALUE = 0x439148f0bbc682ca079e46d6e2c2f0c1e3b820f1a291b069d8882abf8cf18dd9;

    constructor(address nuc) {
        nucleus = nuc;
    }

    function onFlashLoan(
        address /*initiator*/,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata /*data*/
    ) external override returns (bytes32 magicValue) {
        //require(msg.sender == nucleus);
        //require(initiator is authorized);
        MockERC20(token).approve(nucleus, amount+fee);
        emit Callback();
        return FLASH_LOAN_MAGIC_VALUE;
    }
}
