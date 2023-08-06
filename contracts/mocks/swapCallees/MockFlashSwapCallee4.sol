// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IHydrogenNucleus } from "./../../interfaces/IHydrogenNucleus.sol";
import { IHydrogenFlashSwapCallee } from "./../../interfaces/IHydrogenFlashSwapCallee.sol";
import { Locations } from "./../../libraries/Locations.sol";
import { MockERC20 } from "./../tokens/MockERC20.sol";


/**
 * @title MockFlashSwapCallee4
 * @author Hysland Finance
 * @notice A mock callee. Used to test flash swaps.
 *
 * This callee simulates an arbitrage strategy, using a flash swap from Hydrogen to trade in other markets and return the proceeds.
 */
contract MockFlashSwapCallee4 is IHydrogenFlashSwapCallee {

    event Callback();

    address payable public nucleus;

    // keccak256("HydrogenNucleus.onFlashSwap");
    bytes32 internal constant FLASH_SWAP_MAGIC_VALUE = 0xef2ee65b98afb6a6fa41b62a72b172b3afcdaf4f76c0775c113b8d60c55085ac;

    constructor(address payable nuc) {
        nucleus = nuc;
    }

    function hydrogenNucleusFlashSwapCallback(FlashSwapCallbackParams memory params) external override returns (bytes32 magicValue) {
        //require(msg.sender == nucleus);
        //require(params.initiator is authorized);
        // perform trade using tokenA received in flash swap
        MockERC20 token = MockERC20(params.tokenB);
        token.mint(address(this), params.amountB);
        // transfer tokenB to locationB
        bytes32 locationType = Locations.getLocationType(params.locationB);
        if(locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(params.locationB);
            if(account == address(this)) token.approve(nucleus, params.amountB);
            else token.transfer(account, params.amountB);
        } else if((locationType == Locations.LOCATION_TYPE_INTERNAL_ADDRESS) || (locationType == Locations.LOCATION_TYPE_POOL)) {
            token.approve(nucleus, params.amountB);
            IHydrogenNucleus(nucleus).tokenTransfer(IHydrogenNucleus.TokenTransferParams({
                token: params.tokenB,
                amount: params.amountB,
                src: Locations.externalAddressToLocation(address(this)),
                dst: params.locationB
            }));
        } else {
            revert("MockFlashSwapCallee4: invalid location type");
        }
        // return
        emit Callback();
        return FLASH_SWAP_MAGIC_VALUE;
    }
}
