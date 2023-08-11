// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { Locations } from "./../../libraries/Locations.sol";


/**
 * @title MockLocations
 * @author Hysland Finance
 * @notice A mock contract used to test Locations.
 */
contract MockLocations {

    /**
     * @notice Returns the type of the location. This does not verify if the type is valid.
     * @param loc The location to query.
     * @return locationType The type of the location.
     */
    function getLocationType(bytes32 loc) external pure returns (bytes32 locationType) {
        return Locations.getLocationType(loc);
    }

    /**
     * @notice Decodes the lower bytes of a location as an address.
     * This assumes location type is an address.
     * @param loc The location to convert.
     * @return addr The location as an address.
     */
    function locationToAddress(bytes32 loc) external pure returns (address addr) {
        return Locations.locationToAddress(loc);
    }

    /**
     * @notice Decodes the lower bytes of a location as a poolID.
     * This assumes location type is a pool.
     * @param loc The location to convert.
     * @return poolID The location as a poolID.
     */
    function locationToPoolID(bytes32 loc) external pure returns (uint256 poolID) {
        return Locations.locationToPoolID(loc);
    }

    /**
     * @notice Encodes an external address as a location.
     * @param addr The external address to convert.
     * @return loc The address as a location.
     */
    function externalAddressToLocation(address addr) external pure returns (bytes32 loc) {
        return Locations.externalAddressToLocation(addr);
    }

    /**
     * @notice Encodes an internal address as a location.
     * @param addr The internal address to convert.
     * @return loc The address as a location.
     */
    function internalAddressToLocation(address addr) external pure returns (bytes32 loc) {
        return Locations.internalAddressToLocation(addr);
    }

    /**
     * @notice Encodes a poolID as a location.
     * @param poolID The poolID to convert.
     * @return loc The pool as a location.
     */
    function poolIDtoLocation(uint256 poolID) external pure returns (bytes32 loc) {
        return Locations.poolIDtoLocation(poolID);
    }
}
