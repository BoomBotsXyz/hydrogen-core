// SPDX-License-Identifier: none
pragma solidity 0.8.19;



/**
 * @title MockGasTokenReceiver
 * @author Blue Matter Technologies Ltd.
 * @notice A mock contract used to test other contracts.
 *
 * When this contract receives the gas token, it accepts it and returns.
 */
contract MockGasTokenReceiver {

    receive () external payable {}
}
