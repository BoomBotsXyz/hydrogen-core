// SPDX-License-Identifier: none
pragma solidity 0.8.19;


/**
 * @title Errors
 * @author Hysland Finance
 * @notice A library of custom error types used in Hydrogen.
 */
library Errors {

    // token accounting errors

    // thrown when transferring tokens from a location with insufficient balance
    error HydrogenInsufficientBalance();

    // pool errors

    // thrown when accessing a non existant pool
    error HydrogenPoolDoesNotExist();
    // thrown when too many pools have been created
    error HydrogenMaxPoolCount();
    // thrown when accessing a pool with an unknown type
    error HydrogenUnknownPoolType();
    // thrown when a limit order pool operation is called on a pool that isnt a limit order
    error HydrogenNotALimitOrderPool();
    // thrown when a grid order pool operation is called on a pool that isnt a grid order
    error HydrogenNotAGridOrderPool();
    // thrown when creating a trade request to buy and sell the same token
    error HydrogenSameToken();
    // thrown when creating a grid order with an excessive number of tokens
    error HydrogenMaxTokensPerGridOrder();

    // location errors

    // thrown when a user passes in address(this) in cases when it should not be allowed, typically tokens and locations
    error HydrogenSelfReferrence();
    // thrown when a location type is not recognized
    error HydrogenInvalidLocationType();
    // thrown when an external or internal address location stores an invalid address
    error HydrogenInvalidLocationToAddressCast();
    // thrown when address zero is passed when it should not be allowed. some tokens disallow transfers to address zero
    error HydrogenAddressZero();

    // authentication errors

    // thrown when one account tries to transfer tokens from another account
    error HydrogenTransferFromAccountNotMsgSender();
    // thrown when an account tries to transfer tokens from a pool it doesnt own
    error HydrogenTransferFromPoolNotOwnedByMsgSender();
    // thrown when an account tries to update a pool it doesnt own
    error HydrogenUpdatePoolNotOwnedByMsgSender();

    // callback errors

    // thrown when a flash swap callback fails
    error HydrogenFlashSwapCallbackFailed();
    // thrown when a flash loan callback fails
    error HydrogenFlashLoanCallbackFailed();

    // market order errors

    // thrown when a pool trades against itself
    error HydrogenPoolCannotTradeAgainstItself();
    // thrown when a market order is placed at an exchange rate worse than the exchange rate set in the trade request
    error HydrogenExchangeRateDisagreement();
    // thrown when a market order takes more of tokenA than is currently in the pool
    error HydrogenInsufficientCapacity();
    // thrown when
    error HydrogenPoolCannotTradeTheseTokens();

    // unknown error
    error HydrogenUnknownError();
}
