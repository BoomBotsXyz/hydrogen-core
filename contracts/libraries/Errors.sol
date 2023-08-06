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
    // thrown when attempting to use the gas token but the wrapped gas token is not yet set
    error HydrogenWrappedGasTokenNotSet();
    // thrown when attempting to overwrite the address of the wrapped gas token
    error HydrogenWrappedGasTokenAlreadySet();

    // pool errors

    // thrown when accessing a non existant pool
    error HydrogenPoolDoesNotExist();
    // thrown when minting a pool with a duplicate poolID
    error HydrogenPoolAlreadyExists();
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
    // thrown when safe transferring a token to a contract that is not an erc721 receiver
    error HydrogenNotERC721Receiver();
    // thrown when approving
    error HydrogenApprovePoolToOwner();
    // throws when using location flag pool where the poolID is unknown
    error HydrogenMissingPoolContext();

    // location errors

    // thrown when a user passes in address(this) in cases when it should not be allowed, typically tokens and locations
    error HydrogenSelfReferrence();
    // thrown when a location type is not recognized
    error HydrogenInvalidLocationType();
    // thrown when an external or internal address location stores an invalid address
    error HydrogenInvalidLocationToAddressCast();
    // thrown when address zero is passed when it should not be allowed
    error HydrogenAddressZero();
    // thrown when a flag location is passed in but is invalid
    error HydrogenInvalidLocationFlag();

    // authentication errors

    // thrown when one account tries to transfer tokens from another account
    error HydrogenTransferFromAccountNotMsgSender();
    // thrown when an account tries to operate on a pool it doesn't own
    error HydrogenNotPoolOwner();
    // thrown when an account tries to transfer a pool it doesnt own or have approval for
    error HydrogenNotPoolOwnerOrOperator();

    // callback errors

    // thrown when a flash swap callback fails
    error HydrogenFlashSwapCallbackFailed();
    // thrown when a flash loan callback fails
    error HydrogenFlashLoanCallbackFailed();
    // thrown when a pool safe transfer fails
    error HydrogenSafeTransferCallbackFailed();
    // thrown when sending an erc20 token fails
    error HydrogenERC20TransferFailed();
    // thrown when sending the gas token fails
    error HydrogenGasTokenTransferFailed();
    // thrown when unwrapping the gas token back to the wrapped gas token contract
    error HydrogenInvalidTransferToWgas();

    // market order errors

    // thrown when a pool trades against itself
    error HydrogenPoolCannotTradeAgainstItself();
    // thrown when a market order is placed at an exchange rate worse than the exchange rate set in the trade request
    error HydrogenExchangeRateDisagreement();
    // thrown when a market order takes more of tokenA than is currently in the pool
    error HydrogenInsufficientCapacity();
    // thrown when a market taker tries to trade tokens in a direction that is not enabled in the pool
    error HydrogenPoolCannotTradeTheseTokens();

    // contract ownership errors

    // thrown when an only owner function is called by non owner
    error HydrogenNotContractOwner();
    // thrown when an only pending owner function is called by non pending owner
    error HydrogenNotPendingContractOwner();

    // reentrancy guard errors

    // thrown when a call reenters illegally
    error HydrogenReentrancyGuard();

    // unknown error
    error HydrogenUnknownError();
}
