// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { Errors } from "./Errors.sol";


/**
 * @title Locations
 * @author Hysland Finance
 * @notice A library for handling a new primative used in Hydrogen called a "location".
 *
 * A location is a place where ERC20 tokens may be kept.
 *
 * The most common location type is external addresses such as wallets and smart contracts.
 *
 * The solidity primative that is most similar to a location is an address. Most dapps perform token accounting by address. For example, account 0xabcd... has a balance of 10 DAI and 9 WMATIC. They deposit these into a Uniswap V2 pool to receive 9.3 UNI-V2.
 *
 * Similar to Balancer V2, all Hydrogen Pools hold their tokens in a single contract called the `HydrogenNucleus`. The HydrogenNucleus stores each pool's "internal balance" and performs token accounting. This reduces the number of ERC20 transfers and with it the gas used. A multi-pool swap can be performed by modifying the internal balance of each pool, only requiring an ERC20 transfer before and after the swap. In contrast, Uniswap requires one ERC20 transfer for every hop.
 *
 * For additional gas savings, tokens may also be kept in account-based internal balances. These tokens are also stored in the HydrogenNucleus and may be used by the account that owns them. For example, a user may wish to swap USDC for DAI. They could use USDC from their internal balance, swap it for DAI in a pool, and send the DAI to their internal balance. This would require no ERC20 transfers at all. The call stack wouldn't even leave the HydrogenNucleus.
 *
 * All calls to the HydrogenNucleus require at least one location parameter. For example, when creating a new limit order, the nucleus needs to know where to pull the tokens from to fund the order and where to send the tokens when the order is filled.
 *
 * Locations are encoded as bytes32. The first byte holds the location type ID. The lower 31 bytes hold different information based on the location type.
 *
 * | Location type ID | Location type Name             | Lower 31 bytes  |
 * |------------------|--------------------------------|-----------------|
 * |                1 | External Address               | address account |
 * |                2 | Account Based Internal Balance | address account |
 * |                3 | Pool Based Internal Balance    | uint256 poolID  |
 *
 * In types 1 and 2, only the account has access to the tokens stored at that location. In type 3, only the pool owner can withdraw the tokens in the pool, but anyone can make trades in the pool based on the TradeRequests defined by the pool owner.
 */
library Locations {

    bytes32 internal constant MASK_LOCATION_TYPE             = 0xff00000000000000000000000000000000000000000000000000000000000000;
    bytes32 internal constant MASK_ADDRESS                   = 0x000000000000000000000000ffffffffffffffffffffffffffffffffffffffff;
    bytes32 internal constant MASK_POOL_ID                   = 0x00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    bytes32 internal constant LOCATION_TYPE_EXTERNAL_ADDRESS = 0x0100000000000000000000000000000000000000000000000000000000000000;
    bytes32 internal constant LOCATION_TYPE_INTERNAL_ADDRESS = 0x0200000000000000000000000000000000000000000000000000000000000000;
    bytes32 internal constant LOCATION_TYPE_POOL             = 0x0300000000000000000000000000000000000000000000000000000000000000;

    // used as a flag for identifying cases when the pool location should be used
    // useful when the poolID is not known before the transaction is sent, primarily pool creation
    bytes32 internal constant LOCATION_THIS_POOL             = 0x0000000000000000000000000000000000000000000000000000000000000001;

    function getLocationType(bytes32 loc) internal pure returns (bytes32 locationType) {
        return (loc & MASK_LOCATION_TYPE);
    }

    /**
     * @notice Validates a location. Reverts if invalid.
     * This simply checks that token transfers to and from the location will succeed.
     * It does not check for example if the poolID exists.
     * @param loc The location to validate.
     */
    function validateLocation(bytes32 loc) internal pure {
        // solhint-disable no-empty-blocks
        bytes32 locationType = getLocationType(loc);
        if(locationType == LOCATION_TYPE_EXTERNAL_ADDRESS) {
            address account = locationToAddress(loc);
            if(account == address(0)) revert Errors.HydrogenAddressZero();
        } else if(locationType == LOCATION_TYPE_INTERNAL_ADDRESS) {
            address account = locationToAddress(loc);
            if(account == address(0)) revert Errors.HydrogenAddressZero();
        } else if(locationType == LOCATION_TYPE_POOL) {
            // for the purpose of this test, all poolIDs are considered valid
        } else {
            revert Errors.HydrogenInvalidLocationType();
        }
        // solhint-enable no-empty-blocks
    }

    /**
     * @notice Decodes the lower bytes of a location as an address.
     * This assumes location type is an address.
     * @param loc The location to convert.
     * @return addr The location as an address.
     */
    function locationToAddress(bytes32 loc) internal pure returns (address addr) {
        bytes32 lower31 = loc & MASK_POOL_ID;
        if(lower31 > MASK_ADDRESS) revert Errors.HydrogenInvalidLocationToAddressCast();
        return address(uint160(uint256(lower31)));
    }

    /**
     * @notice Decodes the lower bytes of a location as a poolID.
     * This assumes location type is a pool.
     * @param loc The location to convert.
     * @return poolID The location as a poolID.
     */
    function locationToPoolID(bytes32 loc) internal pure returns (uint256 poolID) {
        return uint256(loc & MASK_POOL_ID);
    }

    /**
     * @notice Encodes an external address as a location.
     * @param addr The external address to convert.
     * @return loc The address as a location.
     */
    function externalAddressToLocation(address addr) internal pure returns (bytes32 loc) {
        return (LOCATION_TYPE_EXTERNAL_ADDRESS | (bytes32(bytes20(addr)) >> 96));
    }

    /**
     * @notice Encodes an internal address as a location.
     * @param addr The internal address to convert.
     * @return loc The address as a location.
     */
    function internalAddressToLocation(address addr) internal pure returns (bytes32 loc) {
        return (LOCATION_TYPE_INTERNAL_ADDRESS | (bytes32(bytes20(addr)) >> 96));
    }

    /**
     * @notice Encodes a poolID as a location.
     * @param poolID The poolID to convert.
     * @return loc The pool as a location.
     */
    function poolIDtoLocation(uint256 poolID) internal pure returns (bytes32 loc) {
        return (LOCATION_TYPE_POOL | bytes32(poolID));
    }
}
