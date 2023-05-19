// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { Errors } from "./../libraries/Errors.sol";


/**
 * @title Multicall
 * @author Hysland Finance
 * @notice Receives and executes a batch of function calls on this contract.
 *
 * A more efficient version of OpenZeppelin's multicall.
 */
abstract contract Multicall {

    /**
     * @notice Receives and executes a batch of function calls on this contract.
     * @param data The batch of function calls.
     * @return results The batch of results.
     */
    function multicall(bytes[] calldata data) external returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            results[i] = _selfDelegateCall(data[i]);
        }
        return results;
    }

    /**
     * @notice Executes a single function.
     * @param data The function to execute.
     * @return result The result of the function.
     */
    function _selfDelegateCall(bytes calldata data) private returns (bytes memory result) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = address(this).delegatecall(data);
        if (success) {
            return returndata;
        } else {
            _revert(returndata);
        }
    }

    /**
     * @notice Reverts the returndata.
     * @param returndata The data for the revert message.
     */
    function _revert(bytes memory returndata) private pure {
        // Look for revert reason and bubble it up if present
        if (returndata.length > 0) {
            // The easiest way to bubble the revert reason is using memory via assembly
            /// @solidity memory-safe-assembly
            // solhint-disable-next-line no-inline-assembly
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            revert Errors.HydrogenUnknownError();
        }
    }
}
