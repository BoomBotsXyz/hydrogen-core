// SPDX-License-Identifier: none
pragma solidity 0.8.19;


/**
 * @title MockGasTokenReceiverWithReceiveHook
 * @author Blue Matter Technologies Ltd.
 * @notice A mock contract used to test other contracts.
 *
 * When this contract receives the gas token, it optionally calls out to another contract.
 *
 * This implementation should NOT be used in production (unguarded receive hook).
 */
contract MockGasTokenReceiverWithReceiveHook {

    address public hookCallee;
    bytes public hookCalldata;


    function setHookCall(address callee, bytes calldata data) external {
        hookCallee = callee;
        hookCalldata = data;
    }

    receive () external payable {
        address callee = hookCallee;
        if(callee != address(0)) {
            (bool success, ) = callee.call(hookCalldata);
            if(!success) revert();
        }
    }
}
