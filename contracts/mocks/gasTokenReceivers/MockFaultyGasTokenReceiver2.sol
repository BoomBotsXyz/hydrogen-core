// SPDX-License-Identifier: none
pragma solidity 0.8.19;



/**
 * @title MockFaultyGasTokenReceiver2
 * @author Blue Matter Technologies Ltd.
 * @notice A mock contract used to test other contracts.
 *
 * When this contract receives the gas token it reverts.
 */
contract MockFaultyGasTokenReceiver2 {

    receive () external payable {
        revert("MockFaultyGasTokenReceiver2: force revert");
    }
}
