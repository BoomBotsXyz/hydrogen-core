// SPDX-License-Identifier: none
pragma solidity 0.8.19;


/**
 * @title IHydrogenFlashSwapCallee
 * @author Hysland Finance
 * @notice
 */
interface IHydrogenFlashSwapCallee {

    struct FlashSwapCallbackParams {
        address initiator;  // the initiator of the swap
        address tokenA;     // the token this callback function has received
        address tokenB;     // the token this callback function needs to return
        uint256 amountA;    // the amount of tokenA this callback function has received
        uint256 amountB;    // the amount of tokenB that this callback function needs to return
        bytes32 locationA;  // the location tokenA was sent to
        bytes32 locationB;  // the location tokenB must be returned to
        bytes callbackData; // arbitrary data structure, intended to contain user-defined parameters
    }

    /**
     * @notice Receive a flash swap.
     * @param params Parameters.
     * @return magicValue The keccak256 hash of "HydrogenNucleus.onFlashSwap".
     */
    function hydrogenNucleusFlashSwapCallback(FlashSwapCallbackParams memory params) external returns (bytes32 magicValue);
}
