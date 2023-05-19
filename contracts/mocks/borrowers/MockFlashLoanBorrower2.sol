// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IERC3156FlashBorrower } from "./../../interfaces/IERC3156FlashBorrower.sol";


/**
 * @title MockFlashLoanBorrower2
 * @author Hysland Finance
 * @notice A mock borrower. Used to test flash loans.
 *
 * This callee explicitly reverts callbacks.
 */
contract MockFlashLoanBorrower2 is IERC3156FlashBorrower {

    address public nucleus;

    constructor(address nuc) {
        nucleus = nuc;
    }

    function onFlashLoan(
        address /*initiator*/,
        address /*token*/,
        uint256 /*amount*/,
        uint256 /*fee*/,
        bytes calldata /*data*/
    ) external override returns (bytes32 magicValue) {
        //require(msg.sender == nucleus);
        //require(initiator is authorized);
        nucleus = nucleus; // not necessary. only used to get rid of compiler warnings
        magicValue = bytes32(0);
        revert("MockFlashLoanBorrower2: force revert");
    }
}
