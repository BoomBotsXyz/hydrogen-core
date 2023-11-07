// SPDX-License-Identifier: none
pragma solidity 0.8.19;


/**
 * @title IHydrogenNucleus
 * @author Blue Matter Technologies Ltd.
 * @notice The main Hydrogen contract.
 */
interface IHydrogenNucleus {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when `tokenId` token is transferred from `from` to `to`.
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    /// @notice Emitted when `owner` enables `approved` to manage the `tokenId` token.
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    /// @notice Emitted when `owner` enables or disables (`approved`) `operator` to manage all of its assets.
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
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
    /// @notice Emitted when the ownership transfer process is started.
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    /// @notice Emitted when the ownership transfer process is completed.
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    /// @notice Emitted when the base URI is set.
    event BaseURISet(string baseURI);
    /// @notice Emitted when the contract URI is set.
    event ContractURISet(string contractURI);
    /// @notice Emitted when the wrapped gas token is set.
    event WrappedGasTokenSet(address indexed wgas);


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
    ) external payable;

    struct TokenTransferInParams {
        address token;  // the address of the token to transfer
        uint256 amount; // the amount of the token to transfer
    }

    /**
     * @notice Transfers a token from `msg.sender`'s external address to their internal address.
     * @param params token, amount.
     */
    function tokenTransferIn(
        TokenTransferInParams calldata params
    ) external payable;

    struct TokenTransferOutParams {
        address token;  // the address of the token to transfer
        uint256 amount; // the amount of the token to transfer
    }

    /**
     * @notice Transfers a token from `msg.sender`'s internal address to their external address.
     * @param params token, amount.
     */
    function tokenTransferOut(
        TokenTransferOutParams calldata params
    ) external payable;

    /***************************************
    GAS TOKEN FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the address of the wrapped gas token.
     * @return _wgas The address of the wrapped gas token.
     */
    function wrappedGasToken() external view returns (address _wgas);

    /**
     * @notice Wraps the gas token into wrapped gas token.
     * Wraps this contracts entire gas token balance.
     * @param receiverLocation The location to receive the wrapped gas token.
     */
    function wrapGasToken(bytes32 receiverLocation) external payable;

    /**
     * @notice Unwraps some wrapped gas token into gas token.
     * If `dst` is an external location type, transfers gas token.
     * If `dst` is an internal location type, transfers wrapped gas token.
     * @param amount The amount of gas token to unwrap.
     * @param src The location to transfer the wrapped gas token from.
     * @param dst The location to transfer the unwrapped gas token to.
     */
    function unwrapGasToken(uint256 amount, bytes32 src, bytes32 dst) external payable;

    /**
     * @notice Sets the address of the wrapped gas token.
     * Can only be called by the contract owner.
     * Can only be set once.
     * @param wgas The address of the wrapped gas token.
     */
    function setWrappedGasToken(address wgas) external payable;

    /**
     * @notice Allows this contract to receive the gas token.
     */
    receive() external payable;

    /***************************************
    POOL VIEW FUNCTIONS
    ***************************************/

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
    ) external payable returns (
        uint256 poolID
    );

    struct CreateLimitOrderCompactParams {
        address tokenA;       // the token the market maker wants to sell
        address tokenB;       // the token the market maker wants to buy
        uint256 amountA;      // the amount of tokenA that the market maker wants to sell
        bytes32 exchangeRate; // the amount of tokenB the market maker will receive for each unit of tokenA sold
    }

    /**
     * @notice Creates a new LimitOrderPool.
     * @param params tokenA, tokenB, amountA, exchangeRate.
     * @return poolID The ID of the newly created pool.
     */
    function createLimitOrderPoolCompact(
        CreateLimitOrderCompactParams calldata params
    ) external payable returns (
        uint256 poolID
    );

    struct UpdateLimitOrderParams {
        uint256 poolID;       // the ID of the pool to update
        bytes32 exchangeRate; // the new exchange rate of the limit order
        bytes32 locationB;    // the new location to send tokenB
    }

    /**
     * @notice Updates a LimitOrderPool.
     * @param params poolID, exchangeRate, locationB.
     */
    function updateLimitOrderPool(
        UpdateLimitOrderParams calldata params
    ) external payable;

    struct UpdateLimitOrderCompactParams {
        uint256 poolID;       // the ID of the pool to update
        bytes32 exchangeRate; // the new exchange rate of the limit order
    }

    /**
     * @notice Updates a LimitOrderPool.
     * @param params poolID, exchangeRate.
     */
    function updateLimitOrderPoolCompact(
        UpdateLimitOrderCompactParams calldata params
    ) external payable;

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
    ) external payable returns (
        uint256 poolID
    );

    struct TokenSourceCompact {
        address token;
        uint256 amount;
    }

    struct CreateGridOrderCompactParams {
        TokenSourceCompact[] tokenSources;
        bytes32[] exchangeRates;
    }

    /**
     * @notice Creates a new GridOrderPool.
     * @param params tokenSources, exchange rates.
     * @return poolID The ID of the newly created pool.
     */
    function createGridOrderPoolCompact(
        CreateGridOrderCompactParams calldata params
    ) external payable returns (
        uint256 poolID
    );

    struct UpdateGridOrderPoolParams {
        uint256 poolID;
        TokenSource[] tokenSources;
        TradeRequest[] tradeRequests;
    }

    /**
     * @notice Updates a GridOrderPool.
     * @param params poolID, exchange rates.
     */
    function updateGridOrderPool(
        UpdateGridOrderPoolParams calldata params
    ) external payable;

    struct UpdateGridOrderPoolCompactParams {
        uint256 poolID;
        bytes32[] exchangeRates;
    }

    /**
     * @notice Updates a GridOrderPool.
     * @param params poolID, tokenSources, tradeRequests.
     */
    function updateGridOrderPoolCompact(
        UpdateGridOrderPoolCompactParams calldata params
    ) external payable;

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
    }

    /**
     * @notice Executes a market order.
     * @param params poolID, tokenA, tokenB, amountA, amountB, locationA, locationB.
     */
    function executeMarketOrder(ExecuteMarketOrderParams calldata params) external payable;

    struct ExecuteMarketOrderDstExtParams {
        uint256 poolID;          // the ID of the pool to trade in
        address tokenA;          // the token the market taker wants to buy
        address tokenB;          // the token the market taker wants to sell
        uint256 amountA;         // the amount of tokenA the market taker will receive
        uint256 amountB;         // the amount of tokenB that the market taker will sell
    }

    /**
     * @notice Executes a market order.
     * @param params poolID, tokenA, tokenB, amountA, amountB.
     */
    function executeMarketOrderDstExt(ExecuteMarketOrderDstExtParams calldata params) external payable;

    struct ExecuteMarketOrderDstIntParams {
        uint256 poolID;          // the ID of the pool to trade in
        address tokenA;          // the token the market taker wants to buy
        address tokenB;          // the token the market taker wants to sell
        uint256 amountA;         // the amount of tokenA the market taker will receive
        uint256 amountB;         // the amount of tokenB that the market taker will sell
    }

    /**
     * @notice Executes a market order.
     * @param params poolID, tokenA, tokenB, amountA, amountB.
     */
    function executeMarketOrderDstInt(ExecuteMarketOrderDstIntParams calldata params) external payable;

    struct ExecuteFlashSwapParams {
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
     * @notice Executes a flash swap.
     * @param params poolID, tokenA, tokenB, amountA, amountB, locationA, locationB, flashSwapCallee, callbackData.
     */
    function executeFlashSwap(ExecuteFlashSwapParams calldata params) external payable;

    /***************************************
    ERC721 FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the total number of tokens stored by the contract.
     * @return supply The total number of tokens that have been minted.
     */
    function totalSupply() external view returns (uint256 supply);

    /**
     * @notice Returns the number of tokens in `holder`'s account.
     * @param holder The account to query.
     * @return balance The account's balance.
     */
    function balanceOf(address holder) external view returns (uint256 balance);

    /**
     * @notice Returns the owner of the `poolID` token.
     * Reverts if the token does not exist.
     * @param poolID The ID of the pool to query.
     * @return holder The owner of the token.
     */
    function ownerOf(uint256 poolID) external view returns (address holder);

    /**
     * @notice Returns true if the pool exists.
     * @param poolID The ID of the pool to query.
     * @return status True if the pool exists, false otherwise.
     */
    function exists(uint256 poolID) external view returns (bool status);

    /**
     * @notice Returns the account approved for `poolID` token.
     * Reverts if the token does not exist.
     * @param poolID The ID of the pool to query.
     * @return operator The account approved for the specific token.
     */
    function getApproved(uint256 poolID) external view returns (address operator);

    /**
     * @notice Returns if the `operator` is allowed to manage all of the assets of `owner`.
     * @param holder The holder account to query.
     * @param operator The operator account to query.
     * @return isApproved True if operator is approved, false otherwise.
     */
    function isApprovedForAll(address holder, address operator) external view returns (bool isApproved);

    /**
     * @notice Gives permission to `to` to transfer `poolID` pool to another account.
     * @param to The account to give approval to.
     * @param poolID The pool to approve.
     */
    function approve(address to, uint256 poolID) external payable;

    /**
     * @notice Approve or remove `operator` as an operator for the caller.
     * @param operator The account to manage approval for.
     * @param approved True to grant approval, false to revoke.
     */
    function setApprovalForAll(address operator, bool approved) external payable;

    /**
     * @notice Transfers `poolID` token from `from` to `to`.
     * @param from The account to transfer the token from.
     * @param to The account to transfer the pool to.
     * @param poolID The ID of the pool to transfer.
     */
    function transferFrom(address from, address to, uint256 poolID) external payable;

    /**
     * @notice Transfers `poolID` token from `from` to `to`.
     * @param from The account to transfer the token from.
     * @param to The account to transfer the pool to.
     * @param poolID The ID of the pool to transfer.
     */
    function safeTransferFrom(address from, address to, uint256 poolID) external payable;

    /**
     * @notice Transfers `poolID` token from `from` to `to`.
     * @param from The account to transfer the token from.
     * @param to The account to transfer the pool to.
     * @param poolID The ID of the pool to transfer.
     * @param data Arbitrary data to be passed to `to`.
     */
    function safeTransferFrom(address from, address to, uint256 poolID, bytes memory data) external payable;

    /***************************************
    MULTICALL FUNCTIONS
    ***************************************/

    /**
     * @notice Receives and executes a batch of function calls on this contract.
     * @param data The batch of function calls.
     * @return results The batch of results.
     */
    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results);

    /***************************************
    ERC2612 FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the amount of an `ERC20` token that this contract is allowed to transfer from `holder` using `EIP2612`.
     * @param holder The account to approve tokens.
     * @param token The address of the token to permit.
     * @param amount The amount of the token to permit.
     * @param deadline The timestamp that the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function erc2612Permit(address holder, address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external payable;

    /**
     * @notice Sets the amount of an `ERC20` token that this contract is allowed to transfer from `holder` using a modified version of `EIP2612`.
     * @param holder The account to approve tokens.
     * @param token The address of the token to permit.
     * @param amount The amount of the token to permit.
     * @param deadline The timestamp that the transaction must go through before.
     * @param signature secp256k1 signature
     */
    function erc2612Permit(address holder, address token, uint256 amount, uint256 deadline, bytes calldata signature) external payable;

    /**
     * @notice Sets the amount of an `ERC20` token that this contract is allowed to transfer from `holder` using an old version of `EIP2612`.
     * @param holder The account to approve tokens.
     * @param token The address of the token to permit.
     * @param nonce Deduplicates permit transactions.
     * @param expiry The timestamp that the transaction must go through before.
     * @param allowed True to allow all, false to allow zero.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function erc2612Permit(address holder, address token, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s) external payable;

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
    function setSwapFeesForPairs(SetSwapFeeForPairParam[] calldata params) external payable;

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
    ) external payable returns (bool status);

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
     * Can only be called by the contract owner.
     */
    function setFlashLoanFeesForTokens(SetFlashLoanFeeForTokenParam[] calldata params) external payable;

    /***************************************
    REENTRANCY GUARD FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the stored state of reentrancy guard.
     * @return rgState The current state.
     */
    function reentrancyGuardState() external view returns (uint256 rgState);

    /***************************************
    METADATA FUNCTIONS
    ***************************************/

    /**
     * @notice A descriptive name for a collection of NFTs in this contract.
     * @return name_ The NFT name.
     */
    function name() external view returns (string memory name_);

    /**
     * @notice An abbreviated name for NFTs in this contract.
     * @return symbol_ The NFT symbol.
     */
    function symbol() external view returns (string memory symbol_);

    /**
     * @notice Returns the Uniform Resource Identifier (URI) for `poolID` token.
     * Reverts if the token does not exist.
     * @param poolID The ID of the pool to query.
     * @return uri The token uri.
     */
    function tokenURI(uint256 poolID) external view returns (string memory uri);

    /**
     * @notice Returns the base URI for computing tokenURI.
     * @return uri The base URI.
     */
    function baseURI() external view returns (string memory uri);

    /**
     * @notice Sets the base URI for computing tokenURI.
     * Can only be called by the contract owner.
     * @param uri The new base URI.
     */
    function setBaseURI(string calldata uri) external payable;

    /**
     * @notice Returns the contract URI.
     * @return uri The contract URI.
     */
    function contractURI() external view returns (string memory uri);

    /**
     * @notice Sets the contract URI.
     * Can only be called by the contract owner.
     * @param uri The new contract URI.
     */
    function setContractURI(string calldata uri) external payable;

    /**
     * @notice Returns true if this contract implements the interface defined by `interfaceId`.
     * @param interfaceId The id of the interface to query.
     * @return status True if supported, false otherwise.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool status);

    /***************************************
    OWNER FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the address of the current owner.
     * @return contractOwner The address of the contract owner.
     */
    function owner() external view returns (address contractOwner);

    /**
     * @notice Returns the address of the pending owner.
     * @return pendingContractOwner The address of the pending contract owner.
     */
    function pendingOwner() external view returns (address pendingContractOwner);

    /**
     * @notice Starts the ownership transfer of the contract to a new account. Replaces the pending transfer if there is one. The transfer will not be finalized until the new owner calls `acceptOwnership()`.
     * Can only be called by the current contract owner.
     * @param newOwner The new owner of the contract.
     */
    function transferOwnership(address newOwner) external payable;

    /**
     * @notice The new owner accepts the ownership transfer.
     * Can only be called by the new owner.
     */
    function acceptOwnership() external payable;

    /**
     * @notice Leaves the contract without owner. It will not be possible to call `onlyOwner` functions anymore.
     * Can only be called by the current contract owner.
     */
    function renounceOwnership() external payable;
}
