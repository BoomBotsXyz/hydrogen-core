// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";
import { IHydrogenFlashSwapCallee } from "./../../interfaces/IHydrogenFlashSwapCallee.sol";
import { Locations } from "./../../libraries/Locations.sol";
import { MockERC20 } from "./../tokens/MockERC20.sol";


/**
 * @title MockFlashSwapCallee6
 * @author Hysland Finance
 * @notice A mock callee. Used to test flash swaps.
 *
 * This callee simulates a malicious user trying to use a flash swap to sell an HPT.
 */
contract MockFlashSwapCallee6 is IHydrogenFlashSwapCallee {

    event Callback();

    address public nucleus;

    // keccak256("HydrogenNucleus.onFlashSwap");
    bytes32 internal constant FLASH_SWAP_MAGIC_VALUE = 0xef2ee65b98afb6a6fa41b62a72b172b3afcdaf4f76c0775c113b8d60c55085ac;

    constructor(address nuc) {
        nucleus = nuc;
    }

    function executeMarketOrderWithCallback(IHydrogenNucleus.ExecuteMarketOrderParams calldata params) external {
        // decode data as poolID
        uint256 poolID = abi.decode(params.callbackData, (uint256));
        // pull pool from msg.sender
        IHydrogenNucleus(nucleus).transferFrom(msg.sender, address(this), poolID);
        // swap
        IHydrogenNucleus(nucleus).executeMarketOrder(params);
    }

    function hydrogenNucleusFlashSwapCallback(FlashSwapCallbackParams memory params) external override returns (bytes32 magicValue) {
        //require(msg.sender == nucleus);
        //require(params.initiator is authorized);
        // decode data as poolID
        uint256 poolID = abi.decode(params.callbackData, (uint256));
        // transfer tokenB from pool to return location
        IHydrogenNucleus(nucleus).tokenTransfer(IHydrogenNucleus.TokenTransferParams({
            token: params.tokenB,
            amount: params.amountB,
            src: Locations.poolIDtoLocation(poolID),
            dst: params.locationB
        }));
        // may need approval
        bytes32 locationType = Locations.getLocationType(params.locationB);
        if(locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(params.locationB);
            if(account == address(this)) MockERC20(params.tokenB).approve(nucleus, params.amountB);
        }
        // simulate selling hpt by transferring to dead address
        IHydrogenNucleus(nucleus).transferFrom(address(this), address(0x000000000000000000000000000000000000dEaD), poolID);
        // return
        emit Callback();
        return FLASH_SWAP_MAGIC_VALUE;
    }
}
