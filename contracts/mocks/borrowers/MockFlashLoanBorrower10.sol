// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";
import { IERC3156FlashBorrower } from "./../../interfaces/IERC3156FlashBorrower.sol";
import { MockERC20 } from "./../tokens/MockERC20.sol";


/**
 * @title MockFlashLoanBorrower10
 * @author Blue Matter Technologies Ltd.
 * @notice A mock borrower. Used to test flash loans.
 *
 * This borrower makes a reentrant call to nucleus and returns.
 */
contract MockFlashLoanBorrower10 is IERC3156FlashBorrower {

    address payable public nucleus;

    address public hookCallee;
    bytes public hookCalldata;

    uint256 public stackDepth;

    // keccak256("ERC3156FlashBorrower.onFlashLoan")
    bytes32 internal constant FLASH_LOAN_MAGIC_VALUE = 0x439148f0bbc682ca079e46d6e2c2f0c1e3b820f1a291b069d8882abf8cf18dd9;

    constructor(address payable nuc) {
        nucleus = nuc;
        stackDepth = 1;
    }

    function setHookCall(address callee, bytes calldata data) external {
        hookCallee = callee;
        hookCalldata = data;
    }

    function onFlashLoan(
        address /*initiator*/,
        address /*token*/,
        uint256 /*amount*/,
        uint256 /*fee*/,
        bytes calldata /*data*/
    ) external override returns (bytes32 magicValue) {
        if(stackDepth > 1) return FLASH_LOAN_MAGIC_VALUE; // used to stop infinite loop caused in one specific test
        //require(msg.sender == nucleus);
        //require(initiator is authorized);
        // make external call
        address callee = hookCallee;
        if(callee != address(0)) {
            stackDepth = 2;
            (bool success, ) = callee.call(hookCalldata);
            if(!success) revert();
            stackDepth = 1;
        }
        // return
        return FLASH_LOAN_MAGIC_VALUE;
    }
}
