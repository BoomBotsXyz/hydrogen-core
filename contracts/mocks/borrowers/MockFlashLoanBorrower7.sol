// SPDX-License-Identifier: none
pragma solidity 0.8.19;


/**
 * @title MockFlashLoanBorrower7
 * @author Hysland Finance
 * @notice A mock borrower. Used to test flash loans.
 *
 * This callee improperly implements the callback function, causing the tx to revert.
 */
contract MockFlashLoanBorrower7 {

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
    ) external {}
}
