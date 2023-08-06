// SPDX-License-Identifier: none
pragma solidity 0.8.19;


/**
 * @title MockFaultyGasTokenReceiver3
 * @author Hysland Finance
 * @notice A mock contract used to test other contracts.
 *
 * When this contract receives the gas token it uses all the gas given and more, forcing a revert.
 */
contract MockFaultyGasTokenReceiver3 {

    receive () external payable {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(not(0), 1)
        }
    }
}
