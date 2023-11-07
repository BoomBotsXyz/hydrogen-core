// SPDX-License-Identifier: none
pragma solidity 0.8.19;


/**
 * @title Pools
 * @author Blue Matter Technologies Ltd.
 * @notice
 */
library Pools {

    uint256 internal constant POOL_ID_DECIMAL_OFFSET = 1_000;
    uint256 internal constant LIMIT_ORDER_POOL_TYPE  =     1;
    uint256 internal constant GRID_ORDER_POOL_TYPE   =     2;

    function getPoolType(uint256 poolID) internal pure returns (uint256 poolType) {
        return (poolID % POOL_ID_DECIMAL_OFFSET);
    }

    /**
     * @notice Determines if the pool is a LimitOrderPool.
     * This assumes that the pool exists.
     * @param poolID The ID of the pool to identify.
     * @return status True if the pool is a LimitOrderPool, false otherwise.
     */
    function isLimitOrderPool(uint256 poolID) internal pure returns (bool status) {
        return ( (poolID % POOL_ID_DECIMAL_OFFSET) == LIMIT_ORDER_POOL_TYPE);
    }

    /**
     * @notice Determines if the pool is a GridOrderPool.
     * This assumes that the pool exists.
     * @param poolID The ID of the pool to identify.
     * @return status True if the pool is a GridOrderPool, false otherwise.
     */
    function isGridOrderPool(uint256 poolID) internal pure returns (bool status) {
        return ( (poolID % POOL_ID_DECIMAL_OFFSET) == GRID_ORDER_POOL_TYPE);
    }
}
