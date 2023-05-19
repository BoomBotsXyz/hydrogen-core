// SPDX-License-Identifier: none
pragma solidity 0.8.19;


/**
 * @title MockFlashLoanBorrower1
 * @author Hysland Finance
 * @notice A mock borrower. Used to test flash loans.
 *
 * This borrower doesn't implement the interface and thus reverts.
 */
contract MockFlashLoanBorrower1 {

    address public nucleus;

    constructor(address nuc) {
        nucleus = nuc;
    }
}
