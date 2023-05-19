// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IERC3156FlashBorrower } from "./../../interfaces/IERC3156FlashBorrower.sol";


/**
 * @title MockFlashLoanBorrower8
 * @author Hysland Finance
 * @notice A mock borrower. Used to test flash loans.
 *
 * This callee improperly implements the callback function, causing the tx to revert.
 */
contract MockFlashLoanBorrower8 is IERC3156FlashBorrower {

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
        return keccak256("wrong value");
    }
}
