// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";
import { IHydrogenFlashSwapCallee } from "./../../interfaces/IHydrogenFlashSwapCallee.sol";
import { Locations } from "./../../libraries/Locations.sol";
import { MockERC20 } from "./../tokens/MockERC20.sol";


/**
 * @title MockFlashSwapCallee5
 * @author Hysland Finance
 * @notice A mock callee. Used to test flash swaps.
 *
 * This callee simulates a user trying to use a flash swap to buy an HPT.
 */
contract MockFlashSwapCallee5 is IHydrogenFlashSwapCallee {

    event Callback();

    address public nucleus;

    // keccak256("HydrogenNucleus.onFlashSwap");
    bytes32 internal constant FLASH_SWAP_MAGIC_VALUE = 0xef2ee65b98afb6a6fa41b62a72b172b3afcdaf4f76c0775c113b8d60c55085ac;

    constructor(address nuc) {
        nucleus = nuc;
    }

    function hydrogenNucleusFlashSwapCallback(FlashSwapCallbackParams memory params) external override returns (bytes32 magicValue) {
        //require(msg.sender == nucleus);
        //require(params.initiator is authorized);
        // decode data as poolID
        uint256 poolID = abi.decode(params.callbackData, (uint256));
        // simulate buying hpt by transferring from tx.origin
        IHydrogenNucleus(nucleus).transferFrom(tx.origin, address(this), poolID);
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
        // return
        emit Callback();
        return FLASH_SWAP_MAGIC_VALUE;
    }
}
