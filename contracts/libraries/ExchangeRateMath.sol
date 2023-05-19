// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { Errors } from "./Errors.sol";


/**
 * @title ExchangeRateMath
 * @author Hysland Finance
 * @notice A math library used for calculating the amount of tokens exchanged in trades.
 *
 * Trades involve two tokens, `tokenA` and `tokenB`. The following statements regarding the direction of token flows are true:
 * - market maker wants to sell tokenA for tokenB
 * - market maker wants to buy tokenB for tokenA
 * - market taker wants to sell tokenB for tokenA
 * - market taker wants to buy tokenA for tokenB
 * - market maker -> tokenA -> market taker
 * - market maker <- tokenB <- market taker
 *
 * As a market maker, trade math involves three primary variables: the `amountA` of `tokenA`, the `amountB` of `tokenB`, and the `exchangeRate` between the two. `exchangeRate` is set by the market maker. `amountA` and `amountB` are set by the market taker. The market order must only be accepted if the rate between `amountA` and `amountB` is equal to or better than `exchangeRate`.
 * - `amountA / amountB <= exchangeRate`
 *
 * An `exchangeRate` may be thought of as the `amountA` of `tokenA` that must be exchanged for an `amountB` of `tokenB`.
 *
 * An `exchangeRate` stores two uint128s packed as a bytes32. `x1` is stored in the first 128 bits and `x2` is stored in the second 128 bits.
 * - `exchangeRate = (x1 << 128) | x2`
 * - `x1 = exchangeRate >> 128`
 * - `x2 = exchangeRate & MAX_UINT_128`
 *
 * These `x1` and `x2` are the numerator and denominator of a fraction. We can convert between `amountA` and `amountB` by multiplying by this fraction.
 * - `amountA / amountB <= x1 / x2`
 * - `amountA = amountB * x1 / x2`
 * - `amountB = amountA * x2 / x1`
 *
 * The formulas above utilise division of integers with finite precision, which may introduce rounding error of an amount less than one wei. If this happens, the one wei is given to the market maker.
 * - `amountA = floor( (amountB * x1) / x2 )`
 * - `amountB = ceil( (amountA * x2) / x1 )`
 *
 * Two easy methods for encoding `exchangeRate` as a market maker:
 * By relative price:
 * 1 - Pick one token to use as the base. If that's the token you're selling, set `x1` to one unit of this token respecting decimals. If that's the token you're buying, set `x2` to that same value.
 * 2 - Set the other `x` value to an amount of the other token with equal price.
 * 3 - `exchangeRate = (x1 << 128) | x2`
 * By total amount:
 * 1 - Deterine the `amountA` that you want to sell and the `amountB` that you want to buy respecting decimals.
 * 2 - Use `amountA` as `x1` and `amountB` as `x2`.
 * 3 - `exchangeRate = (x1 << 128) | x2`
 */
library ExchangeRateMath {

    // 2 ** 128 - 1
    bytes32 internal constant MAX_UINT_128 = 0x00000000000000000000000000000000ffffffffffffffffffffffffffffffff;

    /**
     * @notice Determines if a pool with a given `exchangeRate` should accept the market order with amounts `amountA` and `amountB`.
     */
    function isMarketOrderAcceptable(
        uint256 amountA,
        uint256 amountB,
        bytes32 exchangeRate
    ) internal pure returns (bool isAcceptable) {
        // decode exchange rate
        uint256 x1 = uint256(exchangeRate >> 128);
        uint256 x2 = uint256(exchangeRate & MAX_UINT_128);
        if((x1 == 0) || (x2 == 0)) revert Errors.HydrogenPoolCannotTradeTheseTokens();
        // compare exchange rates by cross multiplication
        // (amountA / amountB) <= (x1 / x2)
        return ( (amountA * x2) <= (amountB * x1) );
    }
}
