// SPDX-License-Identifier: none
pragma solidity 0.8.19;



/**
 * @title MockFaultyGasTokenReceiver1
 * @author Hysland Finance
 * @notice A mock contract used to test other contracts.
 *
 * When this contract receives the gas token it reverts.
 */
contract MockFaultyGasTokenReceiver1 {

    receive () external payable {
        revert();
    }
}
