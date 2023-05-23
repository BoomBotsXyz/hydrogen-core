// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";


/**
 * @title IHydrogenNucleus
 * @author Hysland Finance
 * @notice The entry point for all interactions with Hydrogen.
 */
interface IHydrogenNucleus is IERC721Enumerable {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when tokens are transferred between locations.
    event TokensTransferred(address indexed token, bytes32 indexed from, bytes32 indexed to, uint256 amount);
    /// @notice Emitted when a pool is created.
    event PoolCreated(uint256 indexed poolID);
    /// @notice Emitted when a trade request is updated by the pool owner.
    event TradeRequestUpdated(uint256 indexed poolID, address indexed tokenA, address indexed tokenB, bytes32 exchangeRate, bytes32 locationB);
    /// @notice Emitted when a market order is executed.
    event MarketOrderExecuted(uint256 indexed poolID, address indexed tokenA, address indexed tokenB, uint256 amountAToMarketTaker, uint256 amountBFromMarketTaker, uint256 amountBToPool);
    /// @notice Emitted when the swap fee for a pair is set.
    event SwapFeeSetForPair(address indexed tokenA, address indexed tokenB, uint256 feePPM, bytes32 receiverLocation);
    /// @notice Emitted when the flash loan fee for a token is set.
    event FlashLoanFeeSetForToken(address indexed token, uint256 feePPM, bytes32 receiverLocation);
    /// @notice Emitted when the base URI is set.
    event BaseURISet(string baseURI);
    /// @notice Emitted when the contract URI is set.
    event ContractURISet(string contractURI);

    /***************************************
    STATE VARIABLES
    ***************************************/

    // limit order data
    // a limit order pool has exactly one input and one output token
    // the tokens are set on pool creation. the other parameters can be modified
    struct LimitOrderPoolData {
        address tokenA;        // the token the market maker wants to sell
        address tokenB;        // the token the market maker wants to buy
        bytes32 exchangeRate;  // the rate that the market maker is willing to accept
        bytes32 locationB;     // the location to send tokenB
    }

    // grid order data
    // a grid order pool has an arbitrary number of tokens with potentially one order between every pair
    struct GridOrderPoolData {
        // keep track of the tokens in this pool
        uint256 numTokensInPool;
        mapping(uint256 => address) tokenIndexToAddress; // tokens are indexed from 1
        mapping(address => uint256) tokenAddressToIndex; // 0 == not in pool
        // tokenA => tokenB => exchangeRate
        mapping(address => mapping(address => bytes32)) tokenPairToExchangeRate;
        // tokenA => tokenB => location
        mapping(address => mapping(address => bytes32)) tokenPairToLocation;
    }

    /***************************************
    POOL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Returns true if the pool exists.
     * @param poolID The ID of the pool to query.
     * @return status True if the pool exists, false otherwise.
     */
    function exists(uint256 poolID) external view returns (bool status);

    /**
     * @notice Returns the type of a pool.
     * You can also check the last three digits of the poolID.
     * @param poolID The ID of the pool to query.
     * @return poolType The type of the pool.
     */
    function getPoolType(uint256 poolID) external view returns (uint256 poolType);

    /**
     * @notice Returns the exchange rate and output location of a trade request.
     * @param poolID The ID of the pool to query.
     * @param tokenA The tokenA of the trade request.
     * @param tokenB The tokenB of the trade request.
     * @return amountA The amount of tokenA that the pool can trade.
     * @return exchangeRate The exchangeRate of the trade request.
     * @return locationB The locationB of the trade request.
     */
    function getTradeRequest(
        uint256 poolID,
        address tokenA,
        address tokenB
    ) external view returns (
        uint256 amountA,
        bytes32 exchangeRate,
        bytes32 locationB
    );

    /***************************************
    TOKEN FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the token balance of `location`.
     * @param token The address of the token to query.
     * @param location The location to query balance of.
     * @return balance The balance of the token at the location.
     */
    function getTokenBalance(
        address token,
        bytes32 location
    ) external view returns (uint256 balance);

    struct TokenTransferParams {
        address token;  // the address of the token to transfer
        uint256 amount; // the amount of the token to transfer
        bytes32 src;    // the location to transfer tokens from
        bytes32 dst;    // the location to transfer tokens to
    }

    /**
     * @notice Transfers a token from `src` to `dst`.
     * @param params token, amount, src, and dst.
     */
    function tokenTransfer(
        TokenTransferParams calldata params
    ) external;

    /***************************************
    LIMIT ORDER FUNCTIONS
    ***************************************/

    /**
     * @notice Returns information about a limit order pool.
     * @param poolID The ID of the pool to query.
     * @return tokenA The token the market maker wants to sell.
     * @return tokenB The token the market maker wants to buy.
     * @return amountA The amount of tokenA the market maker wants to sell.
     * @return exchangeRate The rate that the market maker is willing to accept.
     * @return locationB The location to send tokenB.
     */
    function getLimitOrderPool(
        uint256 poolID
    ) external view returns (
        address tokenA,
        address tokenB,
        uint256 amountA,
        bytes32 exchangeRate,
        bytes32 locationB
    );

    struct CreateLimitOrderParams {
        address tokenA;       // the token the market maker wants to sell
        address tokenB;       // the token the market maker wants to buy
        uint256 amountA;      // the amount of tokenA that the market maker wants to sell
        bytes32 exchangeRate; // the amount of tokenB the market maker will receive for each unit of tokenA sold
        bytes32 locationA;    // the location to pull tokenA from
        bytes32 locationB;    // the location to send tokenB to
        address hptReceiver;  // the address to mint the pool token to
    }

    /**
     * @notice Creates a new LimitOrderPool.
     * @param params tokenA, tokenB, amountA, exchangeRate, locationA, locationB, hptReceiver.
     * @return poolID The ID of the newly created pool.
     */
    function createLimitOrderPool(
        CreateLimitOrderParams calldata params
    ) external returns (
        uint256 poolID
    );

    struct UpdateLimitOrderParams {
        uint256 poolID;       // the ID of the pool to update
        bytes32 exchangeRate; // the new exchange rate of the limit order
        bytes32 locationB;    // the new location to send tokenB
    }

    /**
     * @notice Updates a LimitOrderPool.
     * @param params poolID, exchangeRate, locationB
     */
    function updateLimitOrderPool(
        UpdateLimitOrderParams calldata params
    ) external;

    /***************************************
    GRID ORDER FUNCTIONS
    ***************************************/

    struct TradeRequest {
        address tokenA;        // the token the market maker wants to sell
        address tokenB;        // the token the market maker wants to buy
        bytes32 exchangeRate;  // the rate that the market maker is willing to accept
        bytes32 locationB;     // the location to send tokenB
    }

    /**
     * @notice Returns information about a grid order pool.
     * @param poolID The ID of the pool to query.
     * @return tokens The list of tokens in the pool.
     * @return balances The balance of each token in the pool.
     * @return tradeRequests A list of trades that may be made in the pool.
     */
    function getGridOrderPool(
        uint256 poolID
    ) external view returns (
        address[] memory tokens,
        uint256[] memory balances,
        TradeRequest[] memory tradeRequests
    );

    struct TokenSource {
        address token;
        uint256 amount;
        bytes32 location;
    }

    struct CreateGridOrderParams {
        TokenSource[] tokenSources;
        TradeRequest[] tradeRequests;
        address hptReceiver;  // the address to mint the pool token to
    }

    /**
     * @notice Creates a new GridOrderPool.
     * @param params tokenSources, tradeRequests, hptReceiver.
     * @return poolID The ID of the newly created pool.
     */
    function createGridOrderPool(
        CreateGridOrderParams calldata params
    ) external returns (
        uint256 poolID
    );

    struct UpdateGridOrderPoolParams {
        uint256 poolID;
        TokenSource[] tokenSources;
        TradeRequest[] tradeRequests;
    }

    /**
     * @notice Updates a GridOrderPool.
     * @param params poolID, tokenSources, tradeRequests.
     */
    function updateGridOrderPool(
        UpdateGridOrderPoolParams calldata params
    ) external;

    /***************************************
    MARKET ORDER FUNCTIONS
    ***************************************/

    struct ExecuteMarketOrderParams {
        uint256 poolID;          // the ID of the pool to trade in
        address tokenA;          // the token the market taker wants to buy
        address tokenB;          // the token the market taker wants to sell
        uint256 amountA;         // the amount of tokenA the market taker will receive
        uint256 amountB;         // the amount of tokenB that the market taker will sell
        bytes32 locationA;       // the location to send tokenA to
        bytes32 locationB;       // the location to pull tokenB from
        address flashSwapCallee; // the receiver of the callback or address zero to not callback
        bytes callbackData;      // the data to send to the callback
    }

    /**
     * @notice Executes a market order.
     * @param params poolID, tokenA, tokenB, amountA, amountB, locationA, locationB, flashSwapCallee, callbackData.
     */
    function executeMarketOrder(ExecuteMarketOrderParams calldata params) external;

    /***************************************
    SWAP FEE FUNCTIONS
    ***************************************/

    /**
     * @notice Gets the swap fee for a pair.
     * The default fee is stored at [address zero, address zero].
     * @param tokenA The token that market takers buy.
     * @param tokenB The token that market takers sell.
     * @return feePPM The fee measured in parts per million.
     * @return receiverLocation The receiver of fees.
     */
    function getSwapFeeForPair(
        address tokenA,
        address tokenB
    ) external view returns (
        uint256 feePPM,
        bytes32 receiverLocation
    );

    /**
     * @notice Gets the stored swap fee for a pair.
     * @param tokenA The token that market takers buy.
     * @param tokenB The token that market takers sell.
     * @return feePPM The fee measured in parts per million.
     * @return receiverLocation The receiver of fees.
     */
    function getStoredSwapFeeForPair(
        address tokenA,
        address tokenB
    ) external view returns (
        uint256 feePPM,
        bytes32 receiverLocation
    );

    struct SetSwapFeeForPairParam {
        address tokenA;
        address tokenB;
        uint256 feePPM;
        bytes32 receiverLocation;
    }

    /**
     * @notice Sets the swap fee for multiple pairs.
     * @param params tokenA, tokenB, feePPM, receiverLocation.
     */
    function setSwapFeesForPairs(SetSwapFeeForPairParam[] calldata params) external;

    /***************************************
    FLASH LOAN FUNCTIONS
    ***************************************/

    /**
     * @notice The amount of currency available to be lent.
     * @param token The loan currency.
     * @return amount The amount of `token` that can be borrowed.
     */
    function maxFlashLoan(
        address token
    ) external view returns (uint256 amount);

    /**
     * @notice The fee to be charged for a given loan.
     * @param token The loan currency.
     * @param amount The amount of tokens lent.
     * @return fee The amount of `token` to be charged for the loan, on top of the returned principal.
     */
    function flashFee(
        address token,
        uint256 amount
    ) external view returns (uint256 fee);

    /**
     * @notice Initiate a flash loan.
     * @param receiver The receiver of the tokens in the loan, and the receiver of the callback.
     * @param token The loan currency.
     * @param amount The amount of tokens lent.
     * @param data Arbitrary data structure, intended to contain user-defined parameters.
     * @return status True if successful, false otherwise.
     */
    function flashLoan(
        address receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool status);

    /**
     * @notice Gets the flash loan fee for a token.
     * The default fee is stored at address zero.
     * @param token The loan currency.
     * @return feePPM The fee measured in parts per million.
     * @return receiverLocation The receiver of fees.
     */
    function getFlashLoanFeeForToken(
        address token
    ) external view returns (
        uint256 feePPM,
        bytes32 receiverLocation
    );

    /**
     * @notice Gets the stored flash loan fee for a token.
     * The default fee is stored at address zero.
     * @param token The loan currency.
     * @return feePPM The fee measured in parts per million.
     * @return receiverLocation The receiver of fees.
     */
    function getStoredFlashLoanFeeForToken(
        address token
    ) external view returns (
        uint256 feePPM,
        bytes32 receiverLocation
    );

    struct SetFlashLoanFeeForTokenParam {
        address token;
        uint256 feePPM;
        bytes32 receiverLocation;
    }

    /**
     * @notice Sets the flash loan fee for multiple tokens.
     * @param params token, feePPM, receiverLocation.
     */
    function setFlashLoanFeesForTokens(SetFlashLoanFeeForTokenParam[] calldata params) external;

    /***************************************
    URI FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the base URI for computing tokenURI.
     * @return uri The base URI.
     */
    function baseURI() external view returns (string memory uri);

    /**
     * @notice Sets the base URI for computing tokenURI.
     * @param uri The new base URI.
     */
    function setBaseURI(string calldata uri) external;

    /**
     * @notice Returns the contract URI.
     * @return uri The contract URI.
     */
    function contractURI() external view returns (string memory uri);

    /**
     * @notice Sets the contract URI.
     * @param uri The new contract URI.
     */
    function setContractURI(string calldata uri) external;
}
