// SPDX-License-Identifier: none
pragma solidity 0.8.19;


/**
 * @title MockFlashLoanBorrower1
 * @author Blue Matter Technologies Ltd.
 * @notice A mock borrower. Used to test flash loans.
 *
 * This borrower doesn't implement the interface and thus reverts.
 */
contract MockFlashLoanBorrower1 {

    address payable public nucleus;

    constructor(address payable nuc) {
        nucleus = nuc;
    }
}
