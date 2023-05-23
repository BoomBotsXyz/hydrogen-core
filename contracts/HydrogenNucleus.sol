// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ExchangeRateMath } from "./libraries/ExchangeRateMath.sol";
import { Locations } from "./libraries/Locations.sol";
import { Pools } from "./libraries/Pools.sol";
import { Errors } from "./libraries/Errors.sol";
import { IHydrogenNucleus } from "./interfaces/IHydrogenNucleus.sol";
import { IHydrogenFlashSwapCallee } from "./interfaces/IHydrogenFlashSwapCallee.sol";
import { IERC3156FlashBorrower } from "./interfaces/IERC3156FlashBorrower.sol";
import { ERC2612Permitter } from "./utils/ERC2612Permitter.sol";
import { Multicall } from "./utils/Multicall.sol";


/**
 * @title HydrogenNucleus
 * @author Hysland Finance
 * @notice The entry point for all interactions with Hydrogen.
 */
contract HydrogenNucleus is IHydrogenNucleus, ERC721Enumerable, Multicall, Ownable2Step, ERC2612Permitter {

    /***************************************
    STATE VARIABLES
    ***************************************/

    // token internal balances

    // token => account => balance
    mapping(address => mapping(address => uint256)) internal _tokenInternalBalanceOfAccount;
    // token => poolID => balance
    mapping(address => mapping(uint256 => uint256)) internal _tokenInternalBalanceOfPool;

    // pool data

    // poolID => limit order data
    mapping(uint256 => LimitOrderPoolData) internal _limitOrderPoolData;
    // poolID => grid order data
    mapping(uint256 => GridOrderPoolData) internal _gridOrderPoolData;
    uint256 internal constant MAX_TOKENS_PER_GRID_ORDER = 20;

    // fee data

    uint256 internal constant MAX_PPM = 1_000_000;
    // tokenA => tokenB => swap fee in parts per million
    mapping(address => mapping(address => uint256)) internal _swapFeeForPair;
    // tokenA => tokenB => fee receiver location
    mapping(address => mapping(address => bytes32)) internal _swapFeeReceiverForPair;
    // token => flash loan fee in parts per million
    mapping(address => uint256) internal _flashLoanFeeForToken;
    // token => fee receiver location
    mapping(address => bytes32) internal _flashLoanFeeReceiverForToken;

    // callback magic values

    // keccak256("HydrogenNucleus.onFlashSwap");
    bytes32 internal constant FLASH_SWAP_MAGIC_VALUE = 0xef2ee65b98afb6a6fa41b62a72b172b3afcdaf4f76c0775c113b8d60c55085ac;
    // keccak256("ERC3156FlashBorrower.onFlashLoan")
    bytes32 internal constant FLASH_LOAN_MAGIC_VALUE = 0x439148f0bbc682ca079e46d6e2c2f0c1e3b820f1a291b069d8882abf8cf18dd9;

    // uri data

    string internal _tokenURIbase;
    string internal _contractURI;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the HydrogenNucleus contract.
     * @param owner The initial owner of the contract.
     */
    constructor(address owner) ERC721("Hydrogen Pool Token", "HPT") {
        _transferOwnership(owner);
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
    ) external view override returns (uint256 balance) {
        if(token == address(this)) revert Errors.HydrogenSelfReferrence();
        bytes32 locationType = Locations.getLocationType(location);
        if(locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(location);
            return IERC20(token).balanceOf(account);
        } else if(locationType == Locations.LOCATION_TYPE_INTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(location);
            return _tokenInternalBalanceOfAccount[token][account];
        } else if(locationType == Locations.LOCATION_TYPE_POOL) {
            uint256 poolID = Locations.locationToPoolID(location);
            return _tokenInternalBalanceOfPool[token][poolID];
        } else {
            revert Errors.HydrogenInvalidLocationType();
        }
    }

    /**
     * @notice Transfers a token from `src` to `dst`.
     * @param params token, amount, src, and dst.
     */
    function tokenTransfer(
        TokenTransferParams calldata params
    ) external override {
        if(params.token == address(this)) revert Errors.HydrogenSelfReferrence();
        Locations.validateLocation(params.src);
        Locations.validateLocation(params.dst);
        _validateLocationTransferFromAuthorization(params.src);
        _performTokenTransfer(params.token, params.amount, params.src, params.dst);
    }

    /***************************************
    POOL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Returns true if the pool exists.
     * @param poolID The ID of the pool to query.
     * @return status True if the pool exists, false otherwise.
     */
    function exists(uint256 poolID) external view override returns (bool status) {
        return _exists(poolID);
    }

    /**
     * @notice Returns the type of a pool.
     * You can also check the last three digits of the poolID.
     * @param poolID The ID of the pool to query.
     * @return poolType The type of the pool.
     */
    function getPoolType(uint256 poolID) external view override returns (uint256 poolType) {
        if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
        return (poolID % Pools.POOL_ID_DECIMAL_OFFSET);
    }

    /**
     * @notice Returns the exchange rate and output location of a trade request.
     * If the pool does not support the trade, returns a null trade request.
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
    ) external view override returns (
        uint256 amountA,
        bytes32 exchangeRate,
        bytes32 locationB
    ) {
        if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
        uint256 poolType = Pools.getPoolType(poolID);
        amountA = _tokenInternalBalanceOfPool[tokenA][poolID];
        if(poolType == Pools.LIMIT_ORDER_POOL_TYPE) {
            LimitOrderPoolData storage poolData = _limitOrderPoolData[poolID];
            if( (poolData.tokenA == tokenA) && (poolData.tokenB == tokenB) ) {
                return (amountA, poolData.exchangeRate, poolData.locationB);
            } else {
                return (amountA, bytes32(0), bytes32(0));
            }
        } else if(poolType == Pools.GRID_ORDER_POOL_TYPE) {
            GridOrderPoolData storage poolData = _gridOrderPoolData[poolID];
            exchangeRate = poolData.tokenPairToExchangeRate[tokenA][tokenB];
            return(amountA, exchangeRate, poolData.tokenPairToLocation[tokenA][tokenB]);
        } else {
            revert Errors.HydrogenUnknownPoolType(); // dev: branch should never hit
        }
    }

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
    ) external view override returns (
        address tokenA,
        address tokenB,
        uint256 amountA,
        bytes32 exchangeRate,
        bytes32 locationB
    ) {
        if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
        if(!Pools.isLimitOrderPool(poolID)) revert Errors.HydrogenNotALimitOrderPool();
        LimitOrderPoolData memory poolData = _limitOrderPoolData[poolID];
        return (
            poolData.tokenA,
            poolData.tokenB,
            _tokenInternalBalanceOfPool[poolData.tokenA][poolID],
            poolData.exchangeRate,
            poolData.locationB
        );
    }

    /**
     * @notice Creates a new LimitOrderPool.
     * @param params tokenA, tokenB, amountA, exchangeRate, locationA, locationB, hptReceiver.
     * @return poolID The ID of the newly created pool.
     */
    function createLimitOrderPool(
        CreateLimitOrderParams calldata params
    ) external override returns (
        uint256 poolID
    ) {
        // verify params
        Locations.validateLocation(params.locationA);
        _validateLocationTransferFromAuthorization(params.locationA);
        if(params.tokenA == params.tokenB) revert Errors.HydrogenSameToken();
        if((params.tokenA == address(this)) || params.tokenB == address(this)) revert Errors.HydrogenSelfReferrence();
        // calculate poolID
        uint256 poolIndex = totalSupply() + 1;
        poolID = (poolIndex * Pools.POOL_ID_DECIMAL_OFFSET) + Pools.LIMIT_ORDER_POOL_TYPE;
        if(poolID > uint256(Locations.MASK_POOL_ID)) revert Errors.HydrogenMaxPoolCount();
        // mint pool token
        emit PoolCreated(poolID);
        _mint(params.hptReceiver, poolID);
        // store pool data
        bytes32 poolLocation = Locations.poolIDtoLocation(poolID);
        bytes32 locationB = params.locationB;
        if(locationB == Locations.LOCATION_THIS_POOL) {
            locationB = poolLocation;
        } else {
            Locations.validateLocation(locationB);
        }
        _limitOrderPoolData[poolID] = LimitOrderPoolData({
            tokenA: params.tokenA,
            tokenB: params.tokenB,
            exchangeRate: params.exchangeRate,
            locationB: locationB
        });
        // transfer tokens into pool
        _performTokenTransfer(params.tokenA, params.amountA, params.locationA, poolLocation);
        // events
        emit TradeRequestUpdated(poolID, params.tokenA, params.tokenB, params.exchangeRate, locationB);
    }

    /**
     * @notice Updates a LimitOrderPool.
     * @param params poolID, exchangeRate, locationB
     */
    function updateLimitOrderPool(
        UpdateLimitOrderParams calldata params
    ) external override {
        uint256 poolID = params.poolID;
        // checks
        if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
        if(ownerOf(poolID) != msg.sender) revert Errors.HydrogenUpdatePoolNotOwnedByMsgSender();
        if(!Pools.isLimitOrderPool(poolID)) revert Errors.HydrogenNotALimitOrderPool();
        bytes32 locationB = params.locationB;
        if(locationB == Locations.LOCATION_THIS_POOL) {
            locationB = Locations.poolIDtoLocation(poolID);
        } else {
            Locations.validateLocation(locationB);
        }
        // store data
        LimitOrderPoolData storage poolData = _limitOrderPoolData[poolID];
        poolData.exchangeRate = params.exchangeRate;
        poolData.locationB = locationB;
        emit TradeRequestUpdated(poolID, poolData.tokenA, poolData.tokenB, params.exchangeRate, locationB);
    }

    /***************************************
    GRID ORDER FUNCTIONS
    ***************************************/

    /**
     * @notice Returns information about a grid order pool.
     * @param poolID The ID of the pool to query.
     * @return tokens The list of tokens in the pool.
     * @return balances The balance of each token in the pool.
     * @return tradeRequests A list of trades that may be made in the pool.
     */
    function getGridOrderPool(
        uint256 poolID
    ) external view override returns (
        address[] memory tokens,
        uint256[] memory balances,
        TradeRequest[] memory tradeRequests
    ) {
        if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
        if(!Pools.isGridOrderPool(poolID)) revert Errors.HydrogenNotAGridOrderPool();
        GridOrderPoolData storage poolData = _gridOrderPoolData[poolID];
        uint256 tokensLength = poolData.numTokensInPool;
        uint256 requestsLength = (tokensLength <= 1) ? 0 : (tokensLength*(tokensLength-1));
        tokens = new address[](tokensLength);
        balances = new uint256[](tokensLength);
        tradeRequests = new TradeRequest[](requestsLength);
        uint256 k = 0;
        for(uint256 i = 0; i < tokensLength; i++) {
            address tokenA = poolData.tokenIndexToAddress[i+1];
            tokens[i] = tokenA;
            balances[i] = _tokenInternalBalanceOfPool[tokenA][poolID];
            for(uint256 j = 0; j < tokensLength; j++) {
                if(i == j) continue;
                address tokenB = poolData.tokenIndexToAddress[j+1];
                tradeRequests[k] = TradeRequest({
                    tokenA: tokenA,
                    tokenB: tokenB,
                    exchangeRate: poolData.tokenPairToExchangeRate[tokenA][tokenB],
                    locationB: poolData.tokenPairToLocation[tokenA][tokenB]
                });
                k++;
            }
        }
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
    ) {
        // calculate poolID
        uint256 poolIndex = totalSupply() + 1;
        poolID = (poolIndex * Pools.POOL_ID_DECIMAL_OFFSET) + Pools.GRID_ORDER_POOL_TYPE;
        if(poolID > uint256(Locations.MASK_POOL_ID)) revert Errors.HydrogenMaxPoolCount();
        // mint pool token
        emit PoolCreated(poolID);
        _mint(params.hptReceiver, poolID);
        // store pool data
        _updateGridOrderPool(poolID, params.tokenSources, params.tradeRequests);
    }

    /**
     * @notice Updates a GridOrderPool.
     * @param params poolID, tokenSources, tradeRequests.
     */
    function updateGridOrderPool(
        UpdateGridOrderPoolParams calldata params
    ) external {
        // checks
        if(!_exists(params.poolID)) revert Errors.HydrogenPoolDoesNotExist();
        if(ownerOf(params.poolID) != msg.sender) revert Errors.HydrogenUpdatePoolNotOwnedByMsgSender();
        if(!Pools.isGridOrderPool(params.poolID)) revert Errors.HydrogenNotAGridOrderPool();
        // store pool data
        _updateGridOrderPool(params.poolID, params.tokenSources, params.tradeRequests);
    }

    /***************************************
    MARKET ORDER FUNCTIONS
    ***************************************/

    /**
     * @notice Executes a market order.
     * @param params poolID, tokenA, tokenB, amountA, amountB, locationA, locationB, flashSwapCallee, callbackData.
     */
    function executeMarketOrder(ExecuteMarketOrderParams calldata params) external override {
        // checks
        Locations.validateLocation(params.locationA);
        Locations.validateLocation(params.locationB);
        _validateLocationNotThis(params.locationA);
        _validateLocationTransferFromAuthorization(params.locationB);
        bytes32 poolLocation = Locations.poolIDtoLocation(params.poolID);
        if((params.locationA == poolLocation) || (params.locationB == poolLocation)) revert Errors.HydrogenPoolCannotTradeAgainstItself();

        // math
        (bytes32 exchangeRate, bytes32 poolLocationB) = _getTradeRequest(params.poolID, params.tokenA, params.tokenB);
        (uint256 feePPM, bytes32 feeReceiver) = getSwapFeeForPair(params.tokenA, params.tokenB);
        uint256 amountBToFeeReceiver = (params.amountB * feePPM) / MAX_PPM;
        uint256 amountBToPool = params.amountB - amountBToFeeReceiver;
        if(!ExchangeRateMath.isMarketOrderAcceptable(params.amountA, amountBToPool, exchangeRate)) revert Errors.HydrogenExchangeRateDisagreement();
        uint256 capacity = _tokenInternalBalanceOfPool[params.tokenA][params.poolID];
        if(capacity < params.amountA) revert Errors.HydrogenInsufficientCapacity();

        // effects
        // transfer tokenA from pool to market taker
        _performTokenTransfer(params.tokenA, params.amountA, poolLocation, params.locationA);
        // optional callback
        if(params.flashSwapCallee != address(0)) {
            if(IHydrogenFlashSwapCallee(params.flashSwapCallee).hydrogenNucleusFlashSwapCallback(
                IHydrogenFlashSwapCallee.FlashSwapCallbackParams({
                    initiator: msg.sender,
                    tokenA: params.tokenA,
                    tokenB: params.tokenB,
                    amountA: params.amountA,
                    amountB: params.amountB,
                    locationA: params.locationA,
                    locationB: params.locationB,
                    callbackData: params.callbackData
                })
            ) != FLASH_SWAP_MAGIC_VALUE) revert Errors.HydrogenFlashSwapCallbackFailed();
        }
        // double check authorization
        _validateLocationTransferFromAuthorization(params.locationB);
        // transfer tokenB from market taker
        _performTokenTransferFrom(params.tokenB, params.amountB, params.locationB);
        // transfer tokenB to pool
        _performTokenTransferTo(params.tokenB, amountBToPool, poolLocation);
        emit TokensTransferred(params.tokenB, params.locationB, poolLocation, amountBToPool);
        // transfer tokenB from pool to market maker
        if(poolLocation != poolLocationB) {
            _performTokenTransfer(params.tokenB, amountBToPool, poolLocation, poolLocationB);
        }
        // transfer tokenB to fee receiver
        if(amountBToFeeReceiver > 0) {
            _performTokenTransferTo(params.tokenB, amountBToFeeReceiver, feeReceiver);
            emit TokensTransferred(params.tokenB, params.locationB, feeReceiver, amountBToFeeReceiver);
        }

        // emit event
        emit MarketOrderExecuted(params.poolID, params.tokenA, params.tokenB, params.amountA, params.amountB, amountBToPool);
    }

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
    ) public view override returns (
        uint256 feePPM,
        bytes32 receiverLocation
    ) {
        // if pair returns zero, that's an implicit 'has never been set' and should return the default fee
        // the default fee is stored at map[0][0]
        // if the pair returns an 'invalid amount too high', that's an explicit zero fee
        feePPM = _swapFeeForPair[tokenA][tokenB];
        if(feePPM == 0) {
            feePPM = _swapFeeForPair[address(0)][address(0)];
            receiverLocation = _swapFeeReceiverForPair[address(0)][address(0)];
        } else {
            receiverLocation = _swapFeeReceiverForPair[tokenA][tokenB];
        }
        if(feePPM >= MAX_PPM) feePPM = 0;
        return (feePPM, receiverLocation);
    }

    /**
     * @notice Gets the stored swap fee for a pair.
     * The default fee is stored at [address zero, address zero].
     * @param tokenA The token that market takers buy.
     * @param tokenB The token that market takers sell.
     * @return feePPM The fee measured in parts per million.
     * @return receiverLocation The receiver of fees.
     */
    function getStoredSwapFeeForPair(
        address tokenA,
        address tokenB
    ) external view override returns (
        uint256 feePPM,
        bytes32 receiverLocation
    ) {
        return (_swapFeeForPair[tokenA][tokenB], _swapFeeReceiverForPair[tokenA][tokenB]);
    }

    /**
     * @notice Sets the swap fee for multiple pairs.
     * @param params tokenA, tokenB, feePPM, receiverLocation.
     */
    function setSwapFeesForPairs(SetSwapFeeForPairParam[] calldata params) external override onlyOwner {
        uint256 len = params.length;
        for(uint256 i = 0; i < len; i++) {
            address tokenA = params[i].tokenA;
            address tokenB = params[i].tokenB;
            uint256 feePPM = params[i].feePPM;
            bytes32 receiverLocation = params[i].receiverLocation;
            Locations.validateLocation(receiverLocation);
            _swapFeeForPair[tokenA][tokenB] = feePPM;
            _swapFeeReceiverForPair[tokenA][tokenB] = receiverLocation;
            emit SwapFeeSetForPair(tokenA, tokenB, feePPM, receiverLocation);
        }
    }

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
    ) external view override returns (uint256 amount) {
        if(token == address(this)) return 0;
        else return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice The fee to be charged for a given loan.
     * @param token The loan currency.
     * @param amount The amount of tokens lent.
     * @return fee The amount of `token` to be charged for the loan, on top of the returned principal.
     */
    function flashFee(
        address token,
        uint256 amount
    ) external view override returns (uint256 fee) {
        (uint256 feePPM, ) = getFlashLoanFeeForToken(token);
        fee = amount * feePPM / MAX_PPM;
    }

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
    ) external override returns (bool status) {
        // math
        (uint256 feePPM, bytes32 feeReceiver) = getFlashLoanFeeForToken(token);
        uint256 fee = amount * feePPM / MAX_PPM;
        // token transfer to
        SafeERC20.safeTransfer(IERC20(token), receiver, amount);
        // callback
        if(IERC3156FlashBorrower(receiver).onFlashLoan(msg.sender, token, amount, fee, data) != FLASH_LOAN_MAGIC_VALUE) revert Errors.HydrogenFlashLoanCallbackFailed();
        // token transfer from
        SafeERC20.safeTransferFrom(IERC20(token), receiver, address(this), amount+fee);
        // process fees
        if(fee > 0) {
            _performTokenTransferTo(token, fee, feeReceiver);
            emit TokensTransferred(token, Locations.externalAddressToLocation(receiver), feeReceiver, fee);
        }
        return true;
    }

    /**
     * @notice Gets the flash loan fee for a token.
     * The default fee is stored at address zero.
     * @param token The loan currency.
     * @return feePPM The fee measured in parts per million.
     * @return receiverLocation The receiver of fees.
     */
    function getFlashLoanFeeForToken(
        address token
    ) public view override returns (
        uint256 feePPM,
        bytes32 receiverLocation
    ) {
        if(token == address(this)) revert Errors.HydrogenSelfReferrence();
        // if token returns zero, that's an implicit 'has never been set' and should return the default fee
        // the default fee is stored at map[0]
        // if the token returns an 'invalid amount too high', that's an explicit zero fee
        feePPM = _flashLoanFeeForToken[token];
        if(feePPM == 0) {
            feePPM = _flashLoanFeeForToken[address(0)];
            receiverLocation = _flashLoanFeeReceiverForToken[address(0)];
        } else {
            receiverLocation = _flashLoanFeeReceiverForToken[token];
        }
        if(feePPM >= MAX_PPM) feePPM = 0;
        return (feePPM, receiverLocation);
    }

    /**
     * @notice Gets the stored flash loan fee for a token.
     * The default fee is stored at address zero.
     * @param token The loan currency.
     * @return feePPM The fee measured in parts per million.
     * @return receiverLocation The receiver of fees.
     */
    function getStoredFlashLoanFeeForToken(
        address token
    ) external view override returns (
        uint256 feePPM,
        bytes32 receiverLocation
    ) {
        if(token == address(this)) revert Errors.HydrogenSelfReferrence();
        return (_flashLoanFeeForToken[token], _flashLoanFeeReceiverForToken[token]);
    }

    /**
     * @notice Sets the flash loan fee for multiple tokens.
     * @param params token, feePPM, receiverLocation.
     */
    function setFlashLoanFeesForTokens(SetFlashLoanFeeForTokenParam[] calldata params) external override onlyOwner {
        uint256 len = params.length;
        for(uint256 i = 0; i < len; i++) {
            address token = params[i].token;
            uint256 feePPM = params[i].feePPM;
            bytes32 receiverLocation = params[i].receiverLocation;
            Locations.validateLocation(receiverLocation);
            _flashLoanFeeForToken[token] = feePPM;
            _flashLoanFeeReceiverForToken[token] = receiverLocation;
            emit FlashLoanFeeSetForToken(token, feePPM, receiverLocation);
        }
    }

    /***************************************
    TOKEN TRANSFER HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Transfers tokens from `src` to `dst`.
     * @param token The address of the token to transfer.
     * @param amount The amount of the token to transfer.
     * @param src The location to transfer tokens from.
     * @param dst The location to transfer tokens to.
     */
    function _performTokenTransfer(
        address token,
        uint256 amount,
        bytes32 src,
        bytes32 dst
    ) internal {
        if(src == dst) {
            _performTokenTransferSameLocation(token, amount, src);
        } else {
            _performTokenTransferFrom(token, amount, src);
            _performTokenTransferTo(token, amount, dst);
        }
        emit TokensTransferred(token, src, dst, amount);
    }

    /**
     * @notice Verifies if a transfer from a location to the same location could happen.
     * Namely, is it a valid location and does it have enough tokens.
     * Useful as a more gas efficient alternative to transfers.
     * This assumes that `msg.sender` has already been authorized to transfer from `loc`.
     * @param token The token to query.
     * @param amount The minimum balance.
     * @param location The location to check.
     */
    function _performTokenTransferSameLocation(address token, uint256 amount, bytes32 location) internal view {
        bytes32 locationType = Locations.getLocationType(location);
        if(locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(location);
            uint256 balance = IERC20(token).balanceOf(account);
            if(balance < amount) revert Errors.HydrogenInsufficientBalance();
        } else if(locationType == Locations.LOCATION_TYPE_INTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(location);
            uint256 balance = _tokenInternalBalanceOfAccount[token][account];
            if(balance < amount) revert Errors.HydrogenInsufficientBalance();
        } else if(locationType == Locations.LOCATION_TYPE_POOL) {
            uint256 poolID = Locations.locationToPoolID(location);
            uint256 balance = _tokenInternalBalanceOfPool[token][poolID];
            if(balance < amount) revert Errors.HydrogenInsufficientBalance();
        } else {
            revert Errors.HydrogenInvalidLocationType(); // dev: branch should never hit when following _validateLocation
        }
    }

    /**
     * @notice Transfers tokens from `src`.
     * This assumes that `msg.sender` has already been authorized to transfer from `src`.
     * @param token The address of the token to transfer.
     * @param amount The amount of the token to transfer.
     * @param src The location to transfer tokens from.
     */
    function _performTokenTransferFrom(
        address token,
        uint256 amount,
        bytes32 src
    ) internal {
        bytes32 locationType = Locations.getLocationType(src);
        if(locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(src);
            SafeERC20.safeTransferFrom(IERC20(token), account, address(this), amount);
        } else if(locationType == Locations.LOCATION_TYPE_INTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(src);
            uint256 balance = _tokenInternalBalanceOfAccount[token][account];
            if(balance < amount) revert Errors.HydrogenInsufficientBalance();
            unchecked {
                _tokenInternalBalanceOfAccount[token][account] = balance - amount;
            }
        } else if(locationType == Locations.LOCATION_TYPE_POOL) {
            uint256 poolID = Locations.locationToPoolID(src);
            uint256 balance = _tokenInternalBalanceOfPool[token][poolID];
            if(balance < amount) revert Errors.HydrogenInsufficientBalance();
            unchecked {
                _tokenInternalBalanceOfPool[token][poolID] = balance - amount;
            }
        } else {
            revert Errors.HydrogenInvalidLocationType(); // dev: branch should never hit when following _validateLocation
        }
    }

    /**
     * @notice Transfers tokens to `dst`.
     * @param token The address of the token to transfer.
     * @param amount The amount of the token to transfer.
     * @param dst The location to transfer tokens to.
     */
    function _performTokenTransferTo(
        address token,
        uint256 amount,
        bytes32 dst
    ) internal {
        bytes32 locationType = Locations.getLocationType(dst);
        if(locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(dst);
            SafeERC20.safeTransfer(IERC20(token), account, amount);
        } else if(locationType == Locations.LOCATION_TYPE_INTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(dst);
            _tokenInternalBalanceOfAccount[token][account] += amount;
        } else if(locationType == Locations.LOCATION_TYPE_POOL) {
            uint256 poolID = Locations.locationToPoolID(dst);
            _tokenInternalBalanceOfPool[token][poolID] += amount;
        } else {
            revert Errors.HydrogenInvalidLocationType();
        }
    }

    /***************************************
    POOL VIEW HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the exchange rate and output location of a trade request.
     * @param poolID The ID of the pool to query.
     * @param tokenA The tokenA of the trade request.
     * @param tokenB The tokenB of the trade request.
     * @return exchangeRate The exchangeRate of the trade request.
     * @return locationB The locationB of the trade request.
     */
    function _getTradeRequest(
        uint256 poolID,
        address tokenA,
        address tokenB
    ) internal view returns (bytes32 exchangeRate, bytes32 locationB) {
        if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
        uint256 poolType = Pools.getPoolType(poolID);
        if(poolType == Pools.LIMIT_ORDER_POOL_TYPE) {
            LimitOrderPoolData storage poolData = _limitOrderPoolData[poolID];
            if((poolData.tokenA != tokenA) || (poolData.tokenB != tokenB)) revert Errors.HydrogenPoolCannotTradeTheseTokens();
            return (poolData.exchangeRate, poolData.locationB);
        } else if(poolType == Pools.GRID_ORDER_POOL_TYPE) {
            GridOrderPoolData storage poolData = _gridOrderPoolData[poolID];
            exchangeRate = poolData.tokenPairToExchangeRate[tokenA][tokenB];
            return(exchangeRate, poolData.tokenPairToLocation[tokenA][tokenB]);
        } else {
            revert Errors.HydrogenUnknownPoolType(); // dev: branch should never hit
        }
    }

    /***************************************
    LOCATION VALIDATION HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Reverts if the location referrences the nucleus itself.
     * @param src The location to query.
     */
    function _validateLocationNotThis(bytes32 src) internal view {
        bytes32 locationType = Locations.getLocationType(src);
        if(locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(src);
            if(account == address(this)) revert Errors.HydrogenSelfReferrence();
        } else if(locationType == Locations.LOCATION_TYPE_INTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(src);
            if(account == address(this)) revert Errors.HydrogenSelfReferrence();
        } else if(locationType == Locations.LOCATION_TYPE_POOL) {
            // ok
        } else {
            revert Errors.HydrogenInvalidLocationType();
        }
    }

    /**
     * @notice Reverts if `msg.sender` is not authorized to access the location.
     * @param src The location to query.
     */
    function _validateLocationTransferFromAuthorization(bytes32 src) internal view {
        bytes32 locationType = Locations.getLocationType(src);
        if(locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(src);
            if(account == address(this)) revert Errors.HydrogenSelfReferrence();
            if(account != msg.sender) revert Errors.HydrogenTransferFromAccountNotMsgSender();
        } else if(locationType == Locations.LOCATION_TYPE_INTERNAL_ADDRESS) {
            address account = Locations.locationToAddress(src);
            if(account == address(this)) revert Errors.HydrogenSelfReferrence();
            if(account != msg.sender) revert Errors.HydrogenTransferFromAccountNotMsgSender();
        } else if(locationType == Locations.LOCATION_TYPE_POOL) {
            uint256 poolID = Locations.locationToPoolID(src);
            if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
            if(ownerOf(poolID) != msg.sender) revert Errors.HydrogenTransferFromPoolNotOwnedByMsgSender();
        } else {
            revert Errors.HydrogenInvalidLocationType();
        }
    }

    /***************************************
    GRID ORDER HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Helper function for createGridOrderPool and updateGridOrderPool.
     * @param poolID The ID of the pool to update.
     * @param tokenSources The list of tokens to transfer into the pool.
     * @param tradeRequests The list of tradeRequests to update.
     */
    function _updateGridOrderPool(
        uint256 poolID,
        TokenSource[] calldata tokenSources,
        TradeRequest[] calldata tradeRequests
    ) internal {
        // store pool data
        GridOrderPoolData storage poolData = _gridOrderPoolData[poolID];
        bytes32 poolLocation = Locations.poolIDtoLocation(poolID);
        // handle tokens
        uint256 tokenSourcesLength = tokenSources.length;
        for(uint256 i = 0; i < tokenSourcesLength; i++) {
            address token = tokenSources[i].token;
            if(token == address(this)) revert Errors.HydrogenSelfReferrence();
            _addTokenToGridOrderPool(poolData, token);
            // transfer tokens from source to pool
            Locations.validateLocation(tokenSources[i].location);
            _validateLocationTransferFromAuthorization(tokenSources[i].location);
            _performTokenTransfer(token, tokenSources[i].amount, tokenSources[i].location, poolLocation);
        }
        // handle trade requests
        uint256 tradeRequestsLength = tradeRequests.length;
        for(uint256 i = 0; i < tradeRequestsLength; i++) {
            // verify trade request
            address tokenA = tradeRequests[i].tokenA;
            address tokenB = tradeRequests[i].tokenB;
            if(tokenA == tokenB) revert Errors.HydrogenSameToken();
            if((tokenA == address(this)) || tokenB == address(this)) revert Errors.HydrogenSelfReferrence();
            bytes32 locationB = tradeRequests[i].locationB;
            if(locationB == Locations.LOCATION_THIS_POOL) {
                locationB = poolLocation;
            } else {
                Locations.validateLocation(locationB);
            }
            bytes32 exchangeRate = tradeRequests[i].exchangeRate;
            _addTokenToGridOrderPool(poolData, tokenA);
            _addTokenToGridOrderPool(poolData, tokenB);
            // add trade request to pool
            poolData.tokenPairToExchangeRate[tokenA][tokenB] = exchangeRate;
            poolData.tokenPairToLocation[tokenA][tokenB] = locationB;
            emit TradeRequestUpdated(poolID, tokenA, tokenB, exchangeRate, locationB);
        }
    }

    /**
     * @notice Helper function for _updateGridOrderPool.
     * @param poolData The storage for pool data.
     * @param token The token to add to the pool.
     */
    function _addTokenToGridOrderPool(
        GridOrderPoolData storage poolData,
        address token
    ) internal {
        // add token to pool
        if(poolData.tokenAddressToIndex[token] == 0) {
            uint256 tokenIndex = ++poolData.numTokensInPool;
            if(tokenIndex > MAX_TOKENS_PER_GRID_ORDER) revert Errors.HydrogenMaxTokensPerGridOrder();
            poolData.tokenAddressToIndex[token] = tokenIndex;
            poolData.tokenIndexToAddress[tokenIndex] = token;
        }
    }

    /***************************************
    URI FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the base URI for computing tokenURI.
     * @return uri The base URI.
     */
    function baseURI() external view override returns (string memory uri) {
        return _tokenURIbase;
    }

    /**
     * @notice Returns the base URI for computing tokenURI.
     * @return uri The base URI.
     */
    function _baseURI() internal view override returns (string memory uri) {
        return _tokenURIbase;
    }

    /**
     * @notice Sets the base URI for computing tokenURI.
     * @param uri The new base URI.
     */
    function setBaseURI(string calldata uri) external override onlyOwner {
        _tokenURIbase = uri;
        emit BaseURISet(uri);
    }

    /**
     * @notice Returns the contract URI.
     * @return uri The contract URI.
     */
    function contractURI() external view override returns (string memory uri) {
        return _contractURI;
    }

    /**
     * @notice Sets the contract URI.
     * @param uri The new contract URI.
     */
    function setContractURI(string calldata uri) external override onlyOwner {
        _contractURI = uri;
        emit ContractURISet(uri);
    }
}
