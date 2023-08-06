// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";
import { IERC3156FlashBorrower } from "./../../interfaces/IERC3156FlashBorrower.sol";
import { MockERC20 } from "./../tokens/MockERC20.sol";


/**
 * @title MockFlashLoanBorrower9
 * @author Hysland Finance
 * @notice A mock borrower. Used to test flash loans.
 *
 * This borrower simulates an arbitrage strategy, using a flash loan from Hydrogen to trade in other markets and return the proceeds. It also deposits and wraps the gas token to a location specified in `data`.
 */
contract MockFlashLoanBorrower9 is IERC3156FlashBorrower {

    address payable public nucleus;

    // keccak256("ERC3156FlashBorrower.onFlashLoan")
    bytes32 internal constant FLASH_LOAN_MAGIC_VALUE = 0x439148f0bbc682ca079e46d6e2c2f0c1e3b820f1a291b069d8882abf8cf18dd9;

    constructor(address payable nuc) {
        nucleus = nuc;
    }

    function onFlashLoan(
        address /*initiator*/,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32 magicValue) {
        //require(msg.sender == nucleus);
        //require(initiator is authorized);
        // perform trade using token received in flash loan
        MockERC20(token).mint(address(this), fee);
        // approve amount+fee back to nucleus
        MockERC20(token).approve(msg.sender, amount+fee);
        // decode data
        (uint256 gasAmount, bytes32 location) = abi.decode(data, (uint256, bytes32));
        // deposit gas token
        IHydrogenNucleus(nucleus).wrapGasToken{value: gasAmount}(location);
        // return
        return FLASH_LOAN_MAGIC_VALUE;
    }

    receive () external payable {}
}
