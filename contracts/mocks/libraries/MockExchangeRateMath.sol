// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { ExchangeRateMath } from "./../../libraries/ExchangeRateMath.sol";

/**
 * @title MockExchangeRateMath
 * @author Blue Matter Technologies Ltd.
 * @notice A mock contract used to test ExchangeRateMath.
 */
contract MockExchangeRateMath {

    /**
     * @notice Decodes an exchange rate into its numerator and denominator components.
     * Note that while x1 and x2 are uint128s, they are returned as uint256s for gas efficiency.
     * @param exchangeRate The exchange rate to decode.
     * @return x1 The numerator of the exchange rate.
     * @return x2 The denominator of the exchange rate.
     */
    function decodeExchangeRate(
        bytes32 exchangeRate
    ) external pure returns (
        uint256 x1,
        uint256 x2
    ) {
        (x1, x2) = ExchangeRateMath.decodeExchangeRate(exchangeRate);
    }

    /**
     * @notice Determines if a pool with a given `exchangeRate` should accept the market order with amounts `amountA` and `amountB`.
     * @param amountA The amount of tokenA to transfer out of the pool.
     * @param amountB The amount of tokenB to transfer into the pool.
     * @param exchangeRate The pools stated exchange rate.
     * @return isAcceptable True if the pool should accept the market order, false otherwise.
     */
    function isMarketOrderAcceptable(
        uint256 amountA,
        uint256 amountB,
        bytes32 exchangeRate
    ) external pure returns (
        bool isAcceptable
    ) {
        return ExchangeRateMath.isMarketOrderAcceptable(amountA, amountB, exchangeRate);
    }

    /**
     * @notice Returns true if an exchange rate is nonzero.
     * An exchange rate is considered zero if either of its components is zero.
     * A trade request is only enabled if its exchange rate is nonzero.
     * @param exchangeRate The exchange rate to decode.
     * @return isNonZero True if the exchange rate is nonzero, false otherwise.
     */
    function exchangeRateIsNonZero(
        bytes32 exchangeRate
    ) external pure returns (
        bool isNonZero
    ) {
        return ExchangeRateMath.exchangeRateIsNonZero(exchangeRate);
    }
}
