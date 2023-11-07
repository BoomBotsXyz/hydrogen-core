// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IHydrogenNucleus } from "./../interfaces/IHydrogenNucleus.sol";
import { IHydrogenFlashSwapCallee } from "./../interfaces/IHydrogenFlashSwapCallee.sol";
import { Locations } from "./../libraries/Locations.sol";


/**
 * @title FlashSwapCallbackWithMulticall
 * @author Blue Matter Technologies Ltd.
 * @notice A flash swap callback. May be used in production but must be used with care.
 *
 * This callback can be used as part of an arbitrage strategy, using a flash swap from Hydrogen to trade in other markets and return the proceeds.
 *
 * If `callbackData` is given to `hydrogenNucleusFlashSwapCallback()`, interprets the call as `Multicall.aggregate()`.
 *
 * Security: This may be used as a stateless router. Any tokens left in this contract may be taken by anyone. Any token approvals made to this contract may be exploited and taken by anyone.
 */
contract FlashSwapCallbackWithMulticall is IHydrogenFlashSwapCallee {

    // thrown when called by not the nucleus
    error MsgSenderNotNucleus();
    // thrown when one of the calls within aggregate() fails
    error AggregateCallFailed();

    address public nucleus;

    // keccak256("HydrogenNucleus.onFlashSwap");
    bytes32 internal constant FLASH_SWAP_MAGIC_VALUE = 0xef2ee65b98afb6a6fa41b62a72b172b3afcdaf4f76c0775c113b8d60c55085ac;

    struct Call {
        address target;
        bytes callData;
    }

    constructor(address nuc) {
        nucleus = nuc;
    }

    function hydrogenNucleusFlashSwapCallback(FlashSwapCallbackParams memory params) external override returns (bytes32 magicValue) {
        if(msg.sender != nucleus) revert MsgSenderNotNucleus();
        // make external calls
        if(params.callbackData.length > 0) {
            Call[] memory calls = abi.decode(params.callbackData, (Call[]));
            aggregate(calls);
        }
        // return
        return FLASH_SWAP_MAGIC_VALUE;
    }

    function aggregate(Call[] memory calls) public returns (uint256 blockNumber, bytes[] memory returnData) {
        blockNumber = block.number;
        returnData = new bytes[](calls.length);
        for(uint256 i = 0; i < calls.length; i++) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, bytes memory ret) = calls[i].target.call(calls[i].callData);
            if(!success) revert AggregateCallFailed();
            returnData[i] = ret;
        }
    }

    // Helper functions
    function getEthBalance(address addr) public view returns (uint256 balance) {
        balance = addr.balance;
    }
    function getBlockHash(uint256 blockNumber) public view returns (bytes32 blockHash) {
        blockHash = blockhash(blockNumber);
    }
    function getLastBlockHash() public view returns (bytes32 blockHash) {
        blockHash = blockhash(block.number - 1);
    }
    function getCurrentBlockTimestamp() public view returns (uint256 timestamp) {
        timestamp = block.timestamp;
    }
}
