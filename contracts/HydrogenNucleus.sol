// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { ExchangeRateMath } from "./libraries/ExchangeRateMath.sol";
import { Locations } from "./libraries/Locations.sol";
import { Pools } from "./libraries/Pools.sol";
import { Errors } from "./libraries/Errors.sol";
import { IHydrogenNucleus } from "./interfaces/IHydrogenNucleus.sol";
import { IHydrogenFlashSwapCallee } from "./interfaces/IHydrogenFlashSwapCallee.sol";
import { IERC3156FlashBorrower } from "./interfaces/IERC3156FlashBorrower.sol";
import { IERC721Receiver } from "./interfaces/IERC721Receiver.sol";
import { IWrappedGasToken } from "./interfaces/tokens/IWrappedGasToken.sol";
import { IERC20PermitA } from "./interfaces/tokens/IERC20PermitA.sol";
import { IERC20PermitB } from "./interfaces/tokens/IERC20PermitB.sol";
import { IERC20PermitC } from "./interfaces/tokens/IERC20PermitC.sol";


/**
 * @title HydrogenNucleus
 * @author Hysland Finance
 * @notice The main Hydrogen contract.
 */
// solhint-disable max-states-count
contract HydrogenNucleus is IHydrogenNucleus {

    /***************************************
    STATE VARIABLES
    ***************************************/

    // erc721 data

    // num tokens minted
    uint256 internal _totalSupply;
    // token name
    string internal _name;
    // token symbol
    string internal _symbol;
    // token ID => owner address
    mapping(uint256 => address) internal _owners;
    // owner address => token count
    mapping(address => uint256) internal _balances;
    // token ID => approved address
    mapping(uint256 => address) internal _tokenApprovals;
    // owner => operator approvals
    mapping(address => mapping(address => bool)) internal _operatorApprovals;

    // token internal balances

    // account => token => balance
    mapping(address => mapping(address => uint256)) internal _tokenInternalBalanceOfAccount;
    // poolID => token => balance
    mapping(uint256 => mapping(address => uint256)) internal _tokenInternalBalanceOfPool;

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
    // bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"))
    bytes4 internal constant ON_ERC721_RECEIVED_MAGIC_VALUE = 0x150b7a02;

    // contract owner

    // owner
    address internal _owner;
    // pending owner (2 step)
    address internal _pendingOwner;

    // reentrancy guard

    // current state
    uint256 internal _reentrancyGuardState;
    // allow entrance
    uint256 internal constant ENTERABLE = 1;
    // deny entrance
    uint256 internal constant NOT_ENTERABLE = 2;

    // wrapped gas token

    address internal _wrappedGasToken;

    // uri data

    string internal _tokenURIbase;
    string internal _contractURI;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the HydrogenNucleus contract.
     * @param contractOwner The initial owner of the contract.
     */
    constructor(address contractOwner) {
        _owner = contractOwner;
        emit OwnershipTransferred(address(0), contractOwner);
        _reentrancyGuardState = ENTERABLE;
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
        // checks
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        if(token == address(this)) revert Errors.HydrogenSelfReferrence();
        location = _validateOrTransformLocation(location);
        bytes32 locationType = Locations.getLocationType(location);
        // if external address type
        if(locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) {
            // get erc20 balanceOf
            address account = Locations.locationToAddress(location);
            return IERC20(token).balanceOf(account);
        }
        // if internal address type
        else if(locationType == Locations.LOCATION_TYPE_INTERNAL_ADDRESS) {
            // get internal balance
            address account = Locations.locationToAddress(location);
            return _tokenInternalBalanceOfAccount[account][token];
        }
        // if pool type
        else {
            // get internal balance
            uint256 poolID = Locations.locationToPoolID(location);
            return _tokenInternalBalanceOfPool[poolID][token];
        }
    }

    /**
     * @notice Transfers a token from `src` to `dst`.
     * @param params token, amount, src, and dst.
     */
    function tokenTransfer(
        TokenTransferParams calldata params
    ) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        _reentrancyGuardState = NOT_ENTERABLE;
        if(params.token == address(this)) revert Errors.HydrogenSelfReferrence();
        bytes32 src = _validateOrTransformLocation(params.src);
        bytes32 dst = _validateOrTransformLocation(params.dst);
        _validateLocationTransferFromAuthorization(src);
        _performTokenTransfer(params.token, params.amount, src, dst);
        _reentrancyGuardState = ENTERABLE;
    }

    /***************************************
    GAS TOKEN FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the address of the wrapped gas token.
     * @return _wgas The address of the wrapped gas token.
     */
    function wrappedGasToken() external view override returns (address _wgas) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        return _wrappedGasToken;
    }

    /**
     * @notice Wraps the gas token into the wrapped gas token.
     * Wraps this contracts entire gas token balance.
     * @param receiverLocation The location to receive the wrapped gas token.
     */
    function wrapGasToken(bytes32 receiverLocation) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        _reentrancyGuardState = NOT_ENTERABLE;
        address wgas = _wrappedGasToken;
        if(wgas == address(0)) revert Errors.HydrogenWrappedGasTokenNotSet();
        uint256 amount = address(this).balance;
        IWrappedGasToken(payable(wgas)).deposit{value:amount}();
        _performTokenTransferTo(wgas, amount, receiverLocation);
        emit TokensTransferred(wgas, Locations.externalAddressToLocation(msg.sender), receiverLocation, amount);
        _reentrancyGuardState = ENTERABLE;
    }

    /**
     * @notice Unwraps some the wrapped gas token.
     * If `dst` is an external location type, transfers gas token.
     * If `dst` is an internal location type, transfers wrapped gas token.
     * @param amount The amount of gas token to unwrap.
     * @param src The location to transfer the wrapped gas token from.
     * @param dst The location to transfer the unwrapped gas token to.
     */
    function unwrapGasToken(uint256 amount, bytes32 src, bytes32 dst) external payable override {
        // checks
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        _reentrancyGuardState = NOT_ENTERABLE;
        address wgas = _wrappedGasToken;
        if(wgas == address(0)) revert Errors.HydrogenWrappedGasTokenNotSet();
        src = _validateOrTransformLocation(src);
        dst = _validateOrTransformLocation(dst);
        _validateLocationTransferFromAuthorization(src);
        // pull wgas
        _performTokenTransferFrom(wgas, amount, src);
        // send gas
        bytes32 locationType = Locations.getLocationType(dst);
        // if transferring to an external address
        if(locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) {
            // unwrap and transfer
            address account = Locations.locationToAddress(dst);
            if(account == wgas) revert Errors.HydrogenInvalidTransferToWgas();
            IWrappedGasToken(payable(wgas)).withdraw(amount);
            _transferGasToken(account, amount);
        }
        // if transfering to an internal address or pool
        else {
            // do not unwrap. transfer as wrapped
            _performTokenTransferTo(wgas, amount, dst);
        }
        emit TokensTransferred(wgas, src, dst, amount);
        _reentrancyGuardState = ENTERABLE;
    }

    /**
     * @notice Sets the address of the wrapped gas token.
     * Can only be called by the contract owner.
     * Can only be set once.
     * @param wgas The address of the wrapped gas token.
     */
    function setWrappedGasToken(address wgas) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        if(msg.sender != _owner) revert Errors.HydrogenNotContractOwner();
        if(_wrappedGasToken != address(0)) revert Errors.HydrogenWrappedGasTokenAlreadySet();
        if(wgas == address(0)) revert Errors.HydrogenAddressZero();
        _wrappedGasToken = wgas;
        emit WrappedGasTokenSet(wgas);
    }

    /**
     * @notice Allows this contract to receive the gas token.
     */
    // solhint-disable-next-line no-empty-blocks
    receive() external payable override {}

    /***************************************
    POOL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the type of a pool.
     * You can also check the last three digits of the poolID.
     * @param poolID The ID of the pool to query.
     * @return poolType The type of the pool.
     */
    function getPoolType(uint256 poolID) external view override returns (uint256 poolType) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
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
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
        // if the pool exists, it must be either a limit order or a grid order
        uint256 poolType = Pools.getPoolType(poolID);
        amountA = _tokenInternalBalanceOfPool[poolID][tokenA];
        // if is limit order
        if(poolType == Pools.LIMIT_ORDER_POOL_TYPE) {
            LimitOrderPoolData storage poolData = _limitOrderPoolData[poolID];
            // if match
            if( (poolData.tokenA == tokenA) && (poolData.tokenB == tokenB) ) {
                return (amountA, poolData.exchangeRate, poolData.locationB);
            }
            // if mismatch
            else {
                return (amountA, bytes32(0), bytes32(0));
            }
        }
        // if is grid order
        else {
            GridOrderPoolData storage poolData = _gridOrderPoolData[poolID];
            exchangeRate = poolData.tokenPairToExchangeRate[tokenA][tokenB];
            return(amountA, exchangeRate, poolData.tokenPairToLocation[tokenA][tokenB]);
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
        // checks
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
        if(!Pools.isLimitOrderPool(poolID)) revert Errors.HydrogenNotALimitOrderPool();
        // return
        LimitOrderPoolData memory poolData = _limitOrderPoolData[poolID];
        return (
            poolData.tokenA,
            poolData.tokenB,
            _tokenInternalBalanceOfPool[poolID][poolData.tokenA],
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
    ) external payable override returns (
        uint256 poolID
    ) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        _reentrancyGuardState = NOT_ENTERABLE;
        // verify params
        bytes32 locationA = _validateOrTransformLocation(params.locationA);
        _validateLocationTransferFromAuthorization(locationA);
        if(params.tokenA == params.tokenB) revert Errors.HydrogenSameToken();
        if((params.tokenA == address(this)) || params.tokenB == address(this)) revert Errors.HydrogenSelfReferrence();
        // calculate poolID
        uint256 poolIndex = ++_totalSupply;
        poolID = (poolIndex * Pools.POOL_ID_DECIMAL_OFFSET) + Pools.LIMIT_ORDER_POOL_TYPE;
        if(poolID > uint256(Locations.MASK_POOL_ID)) revert Errors.HydrogenMaxPoolCount();
        // mint pool token
        emit PoolCreated(poolID);
        _mint(params.hptReceiver, poolID);
        // store pool data
        bytes32 poolLocation = Locations.poolIDtoLocation(poolID);
        bytes32 locationB = params.locationB;
        if(locationB == Locations.LOCATION_FLAG_POOL) {
            locationB = poolLocation;
        } else {
            locationB = _validateOrTransformLocation(locationB);
        }
        _limitOrderPoolData[poolID] = LimitOrderPoolData({
            tokenA: params.tokenA,
            tokenB: params.tokenB,
            exchangeRate: params.exchangeRate,
            locationB: locationB
        });
        // transfer tokens into pool
        _performTokenTransfer(params.tokenA, params.amountA, locationA, poolLocation);
        // events
        emit TradeRequestUpdated(poolID, params.tokenA, params.tokenB, params.exchangeRate, locationB);
        _reentrancyGuardState = ENTERABLE;
    }

    /**
     * @notice Updates a LimitOrderPool.
     * @param params poolID, exchangeRate, locationB
     */
    function updateLimitOrderPool(
        UpdateLimitOrderParams calldata params
    ) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        // checks
        uint256 poolID = params.poolID;
        if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
        if(_ownerOf(poolID) != msg.sender) revert Errors.HydrogenNotPoolOwner();
        if(!Pools.isLimitOrderPool(poolID)) revert Errors.HydrogenNotALimitOrderPool();
        bytes32 locationB = params.locationB;
        if(locationB == Locations.LOCATION_FLAG_POOL) {
            locationB = Locations.poolIDtoLocation(poolID);
        } else {
            locationB = _validateOrTransformLocation(locationB);
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
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        // checks
        if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
        if(!Pools.isGridOrderPool(poolID)) revert Errors.HydrogenNotAGridOrderPool();
        // return data
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
            balances[i] = _tokenInternalBalanceOfPool[poolID][tokenA];
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
    ) external payable override returns (
        uint256 poolID
    ) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        _reentrancyGuardState = NOT_ENTERABLE;
        // calculate poolID
        uint256 poolIndex = ++_totalSupply;
        poolID = (poolIndex * Pools.POOL_ID_DECIMAL_OFFSET) + Pools.GRID_ORDER_POOL_TYPE;
        if(poolID > uint256(Locations.MASK_POOL_ID)) revert Errors.HydrogenMaxPoolCount();
        // mint pool token
        emit PoolCreated(poolID);
        _mint(params.hptReceiver, poolID);
        // store pool data
        _updateGridOrderPool(poolID, params.tokenSources, params.tradeRequests);
        _reentrancyGuardState = ENTERABLE;
    }

    /**
     * @notice Updates a GridOrderPool.
     * @param params poolID, tokenSources, tradeRequests.
     */
    function updateGridOrderPool(
        UpdateGridOrderPoolParams calldata params
    ) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        _reentrancyGuardState = NOT_ENTERABLE;
        // checks
        if(!_exists(params.poolID)) revert Errors.HydrogenPoolDoesNotExist();
        if(_ownerOf(params.poolID) != msg.sender) revert Errors.HydrogenNotPoolOwner();
        if(!Pools.isGridOrderPool(params.poolID)) revert Errors.HydrogenNotAGridOrderPool();
        // store pool data
        _updateGridOrderPool(params.poolID, params.tokenSources, params.tradeRequests);
        _reentrancyGuardState = ENTERABLE;
    }

    /***************************************
    MARKET ORDER FUNCTIONS
    ***************************************/

    /**
     * @notice Executes a market order.
     * @param params poolID, tokenA, tokenB, amountA, amountB, locationA, locationB, flashSwapCallee, callbackData.
     */
    function executeMarketOrder(ExecuteMarketOrderParams calldata params) external payable override {
        // reentrancy guard enter
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        _reentrancyGuardState = NOT_ENTERABLE;
        // checks
        bytes32 locationA = _validateOrTransformLocation(params.locationA);
        bytes32 locationB = _validateOrTransformLocation(params.locationB);
        _validateLocationTransferFromAuthorization(locationB);
        bytes32 poolLocation = Locations.poolIDtoLocation(params.poolID);
        if((locationA == poolLocation) || (locationB == poolLocation)) revert Errors.HydrogenPoolCannotTradeAgainstItself();

        // math
        (bytes32 exchangeRate, bytes32 poolLocationB) = _getTradeRequest(params.poolID, params.tokenA, params.tokenB);
        (uint256 feePPM, bytes32 feeReceiver) = _getSwapFeeForPair(params.tokenA, params.tokenB);
        uint256 amountBToFeeReceiver = (params.amountB * feePPM) / MAX_PPM;
        uint256 amountBToPool = params.amountB - amountBToFeeReceiver;
        if(!ExchangeRateMath.isMarketOrderAcceptable(params.amountA, amountBToPool, exchangeRate)) revert Errors.HydrogenExchangeRateDisagreement();
        uint256 capacity = _tokenInternalBalanceOfPool[params.poolID][params.tokenA];
        if(capacity < params.amountA) revert Errors.HydrogenInsufficientCapacity();

        // effects
        // transfer tokenA from pool to market taker
        _performTokenTransfer(params.tokenA, params.amountA, poolLocation, locationA);
        // optional callback
        if(params.flashSwapCallee != address(0)) {
            // reentrancy guard hand over control
            _reentrancyGuardState = ENTERABLE;
            // callback
            if(IHydrogenFlashSwapCallee(params.flashSwapCallee).hydrogenNucleusFlashSwapCallback(
                IHydrogenFlashSwapCallee.FlashSwapCallbackParams({
                    initiator: msg.sender,
                    tokenA: params.tokenA,
                    tokenB: params.tokenB,
                    amountA: params.amountA,
                    amountB: params.amountB,
                    locationA: locationA,
                    locationB: locationB,
                    callbackData: params.callbackData
                })
            ) != FLASH_SWAP_MAGIC_VALUE) revert Errors.HydrogenFlashSwapCallbackFailed();
            // reentrancy guard take back control
            _reentrancyGuardState = NOT_ENTERABLE;
        }
        // double check authorization in case pool transferred
        //_validateLocationTransferFromAuthorization(params.locationB);
        _validateLocationTransferFromAuthorization(locationB);
        // transfer tokenB from market taker
        _performTokenTransferFrom(params.tokenB, params.amountB, locationB);
        // transfer tokenB to pool
        _performTokenTransferTo(params.tokenB, amountBToPool, poolLocation);
        emit TokensTransferred(params.tokenB, locationB, poolLocation, amountBToPool);
        // transfer tokenB from pool to market maker
        if(poolLocation != poolLocationB) {
            _performTokenTransfer(params.tokenB, amountBToPool, poolLocation, poolLocationB);
        }
        // transfer tokenB to fee receiver
        if(amountBToFeeReceiver > 0) {
            _performTokenTransferTo(params.tokenB, amountBToFeeReceiver, feeReceiver);
            emit TokensTransferred(params.tokenB, locationB, feeReceiver, amountBToFeeReceiver);
        }

        // emit event
        emit MarketOrderExecuted(params.poolID, params.tokenA, params.tokenB, params.amountA, params.amountB, amountBToPool);
        // reentrancy guard exit
        _reentrancyGuardState = ENTERABLE;
    }

    /***************************************
    ERC721 FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the total number of tokens stored by the contract.
     * @return supply The total number of tokens that have been minted.
     */
    function totalSupply() external view returns (uint256 supply) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        return _totalSupply;
    }

    /**
     * @notice Returns the number of tokens in `holder`'s account.
     * @param holder The account to query.
     * @return balance The account's balance.
     */
    function balanceOf(address holder) external view override returns (uint256 balance) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        if(holder == address(0)) revert Errors.HydrogenAddressZero();
        return _balances[holder];
    }

    /**
     * @notice Returns the owner of the `poolID` token.
     * Reverts if the token does not exist.
     * @param poolID The ID of the pool to query.
     * @return holder The owner of the token.
     */
    function ownerOf(uint256 poolID) external view override returns (address holder) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        holder = _owners[poolID];
        if(holder == address(0)) revert Errors.HydrogenPoolDoesNotExist();
        return holder;
    }

    /**
     * @notice Returns true if the pool exists.
     * @param poolID The ID of the pool to query.
     * @return status True if the pool exists, false otherwise.
     */
    function exists(uint256 poolID) external view override returns (bool status) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        return _exists(poolID);
    }

    /**
     * @notice Returns the account approved for `poolID` token.
     * Reverts if the token does not exist.
     * @param poolID The ID of the pool to query.
     * @return operator The account approved for the specific token.
     */
    function getApproved(uint256 poolID) external view override returns (address operator) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        return _getApproved(poolID);
    }

    /**
     * @notice Returns if the `operator` is allowed to manage all of the assets of `owner`.
     * @param holder The holder account to query.
     * @param operator The operator account to query.
     * @return isApproved True if operator is approved, false otherwise.
     */
    function isApprovedForAll(address holder, address operator) external view override returns (bool isApproved) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        return _isApprovedForAll(holder, operator);
    }

    /**
     * @notice Gives permission to `to` to transfer `poolID` pool to another account.
     * @param to The account to give approval to.
     * @param poolID The pool to approve.
     */
    function approve(address to, uint256 poolID) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        address holder = _ownerOf(poolID);
        if(!(msg.sender == holder || _isApprovedForAll(holder, msg.sender))) revert Errors.HydrogenNotPoolOwnerOrOperator();
        if(to == holder) revert Errors.HydrogenApprovePoolToOwner();
        _tokenApprovals[poolID] = to;
        emit Approval(holder, to, poolID);
    }

    /**
     * @notice Approve or remove `operator` as an operator for the caller.
     * @param operator The account to manage approval for.
     * @param approved True to grant approval, false to revoke.
     */
    function setApprovalForAll(address operator, bool approved) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        if(msg.sender == operator) revert Errors.HydrogenApprovePoolToOwner();
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /**
     * @notice Transfers `poolID` token from `from` to `to`.
     * @param from The account to transfer the token from.
     * @param to The account to transfer the pool to.
     * @param poolID The ID of the pool to transfer.
     */
    function transferFrom(address from, address to, uint256 poolID) external payable override {
        _transfer(from, to, poolID);
    }

    /**
     * @notice Transfers `poolID` token from `from` to `to`.
     * @param from The account to transfer the token from.
     * @param to The account to transfer the pool to.
     * @param poolID The ID of the pool to transfer.
     */
    function safeTransferFrom(address from, address to, uint256 poolID) external payable override {
        _safeTransfer(from, to, poolID, "");
    }

    /**
     * @notice Transfers `poolID` token from `from` to `to`.
     * @param from The account to transfer the token from.
     * @param to The account to transfer the pool to.
     * @param poolID The ID of the pool to transfer.
     * @param data Arbitrary data to be passed to `to`.
     */
    function safeTransferFrom(address from, address to, uint256 poolID, bytes memory data) external payable override {
        _safeTransfer(from, to, poolID, data);
    }

    /***************************************
    MULTICALL FUNCTIONS
    ***************************************/

    /**
     * @notice Receives and executes a batch of function calls on this contract.
     * @param data The batch of function calls.
     * @return results The batch of results.
     */
    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            results[i] = _selfDelegateCall(data[i]);
        }
        return results;
    }

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
    function erc2612Permit(address holder, address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        _reentrancyGuardState = NOT_ENTERABLE;
        IERC20PermitA(token).permit(holder, address(this), amount, deadline, v, r, s);
        _reentrancyGuardState = ENTERABLE;
    }

    /**
     * @notice Sets the amount of an `ERC20` token that this contract is allowed to transfer from `holder` using a modified version of `EIP2612`.
     * @param holder The account to approve tokens.
     * @param token The address of the token to permit.
     * @param amount The amount of the token to permit.
     * @param deadline The timestamp that the transaction must go through before.
     * @param signature secp256k1 signature
     */
    function erc2612Permit(address holder, address token, uint256 amount, uint256 deadline, bytes calldata signature) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        _reentrancyGuardState = NOT_ENTERABLE;
        IERC20PermitB(token).permit(holder, address(this), amount, deadline, signature);
        _reentrancyGuardState = ENTERABLE;
    }

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
    function erc2612Permit(address holder, address token, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        _reentrancyGuardState = NOT_ENTERABLE;
        IERC20PermitC(token).permit(holder, address(this), nonce, expiry, allowed, v, r, s);
        _reentrancyGuardState = ENTERABLE;
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
    ) external view override returns (
        uint256 feePPM,
        bytes32 receiverLocation
    ) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        return _getSwapFeeForPair(tokenA, tokenB);
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
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        return (_swapFeeForPair[tokenA][tokenB], _swapFeeReceiverForPair[tokenA][tokenB]);
    }

    /**
     * @notice Sets the swap fee for multiple pairs.
     * @param params tokenA, tokenB, feePPM, receiverLocation.
     */
    function setSwapFeesForPairs(SetSwapFeeForPairParam[] calldata params) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        if(msg.sender != _owner) revert Errors.HydrogenNotContractOwner();
        uint256 len = params.length;
        for(uint256 i = 0; i < len; i++) {
            address tokenA = params[i].tokenA;
            address tokenB = params[i].tokenB;
            uint256 feePPM = params[i].feePPM;
            bytes32 receiverLocation = _validateOrTransformLocation(params[i].receiverLocation);
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
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
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
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        (uint256 feePPM, ) = _getFlashLoanFeeForToken(token);
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
    ) external payable override returns (bool status) {
        // reentrancy guard enter
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        _reentrancyGuardState = NOT_ENTERABLE;
        // math
        (uint256 feePPM, bytes32 feeReceiver) = _getFlashLoanFeeForToken(token);
        uint256 fee = amount * feePPM / MAX_PPM;
        // token transfer to
        _transferERC20To(token, receiver, amount);
        // reentrancy guard hand over control
        _reentrancyGuardState = ENTERABLE;
        // callback
        if(IERC3156FlashBorrower(receiver).onFlashLoan(msg.sender, token, amount, fee, data) != FLASH_LOAN_MAGIC_VALUE) revert Errors.HydrogenFlashLoanCallbackFailed();
        // reentrancy guard take back control
        _reentrancyGuardState = NOT_ENTERABLE;
        // token transfer from
        _transferERC20From(token, receiver, amount+fee);
        // process fees
        if(fee > 0) {
            _performTokenTransferTo(token, fee, feeReceiver);
            emit TokensTransferred(token, Locations.externalAddressToLocation(receiver), feeReceiver, fee);
        }
        // reentrancy guard exit
        _reentrancyGuardState = ENTERABLE;
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
    ) external view override returns (
        uint256 feePPM,
        bytes32 receiverLocation
    ) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        return _getFlashLoanFeeForToken(token);
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
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        if(token == address(this)) revert Errors.HydrogenSelfReferrence();
        return (_flashLoanFeeForToken[token], _flashLoanFeeReceiverForToken[token]);
    }

    /**
     * @notice Sets the flash loan fee for multiple tokens.
     * @param params token, feePPM, receiverLocation.
     */
    function setFlashLoanFeesForTokens(SetFlashLoanFeeForTokenParam[] calldata params) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        if(msg.sender != _owner) revert Errors.HydrogenNotContractOwner();
        uint256 len = params.length;
        for(uint256 i = 0; i < len; i++) {
            address token = params[i].token;
            uint256 feePPM = params[i].feePPM;
            bytes32 receiverLocation = _validateOrTransformLocation(params[i].receiverLocation);
            _flashLoanFeeForToken[token] = feePPM;
            _flashLoanFeeReceiverForToken[token] = receiverLocation;
            emit FlashLoanFeeSetForToken(token, feePPM, receiverLocation);
        }
    }

    /***************************************
    REENTRANCY GUARD FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the stored state of reentrancy guard.
     * @return rgState The current state.
     */
    function reentrancyGuardState() external view override returns (uint256 rgState) {
        return _reentrancyGuardState;
    }

    /***************************************
    METADATA FUNCTIONS
    ***************************************/

    /**
     * @notice A descriptive name for a collection of NFTs in this contract.
     * @return name_ The NFT name.
     */
    function name() external pure override returns (string memory name_) {
        return "Hydrogen Pool Token";
    }

    /**
     * @notice An abbreviated name for NFTs in this contract.
     * @return symbol_ The NFT symbol.
     */
    function symbol() external pure override returns (string memory symbol_) {
        return "HPT";
    }

    /**
     * @notice Returns the Uniform Resource Identifier (URI) for `poolID` token.
     * Reverts if the token does not exist.
     * @param poolID The ID of the pool to query.
     * @return uri The token uri.
     */
    function tokenURI(uint256 poolID) external view override returns (string memory uri) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
        return string(abi.encodePacked(_tokenURIbase, Strings.toString(poolID)));
    }

    /**
     * @notice Returns the base URI for computing tokenURI.
     * @return uri The base URI.
     */
    function baseURI() external view override returns (string memory uri) {
        return _tokenURIbase;
    }

    /**
     * @notice Sets the base URI for computing tokenURI.
     * @param uri The new base URI.
     */
    function setBaseURI(string calldata uri) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        if(msg.sender != _owner) revert Errors.HydrogenNotContractOwner();
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
    function setContractURI(string calldata uri) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        if(msg.sender != _owner) revert Errors.HydrogenNotContractOwner();
        _contractURI = uri;
        emit ContractURISet(uri);
    }

    /**
     * @notice Returns true if this contract implements the interface defined by `interfaceId`.
     * @param interfaceId The id of the interface to query.
     * @return status True if supported, false otherwise.
     */
    function supportsInterface(bytes4 interfaceId) external pure returns (bool status) {
        return (
            (interfaceId == 0x01ffc9a7) || // erc165
            (interfaceId == 0x80ac58cd) || // erc721
            (interfaceId == 0x5b5e139f) || // erc721 metadata
            (interfaceId == 0x4f558e79)    // erc721 exists
        );
    }

    /***************************************
    OWNER FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the address of the current owner.
     * @return contractOwner The address of the contract owner.
     */
    function owner() external view override returns (address contractOwner) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        return _owner;
    }

    /**
     * @notice Returns the address of the pending owner.
     * @return pendingContractOwner The address of the pending contract owner.
     */
    function pendingOwner() external view override returns (address pendingContractOwner) {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        return _pendingOwner;
    }

    /**
     * @notice Starts the ownership transfer of the contract to a new account. Replaces the pending transfer if there is one. The transfer will not be finalized until the new owner calls `acceptOwnership()`.
     * Can only be called by the current owner.
     * @param newOwner The new owner of the contract.
     */
    function transferOwnership(address newOwner) external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        address oldOwner = _owner;
        if(msg.sender != oldOwner) revert Errors.HydrogenNotContractOwner();
        _pendingOwner = newOwner;
        emit OwnershipTransferStarted(oldOwner, newOwner);
    }

    /**
     * @notice The new owner accepts the ownership transfer.
     * Can only be called by the new owner.
     */
    function acceptOwnership() external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        address newOwner = msg.sender;
        if(newOwner != _pendingOwner) revert Errors.HydrogenNotPendingContractOwner();
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /**
     * @notice Leaves the contract without an owner. It will not be possible to call `onlyOwner` functions anymore.
     * Can only be called by the current owner.
     */
    function renounceOwnership() external payable override {
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        address oldOwner = _owner;
        if(msg.sender != oldOwner) revert Errors.HydrogenNotContractOwner();
        _owner = address(0);
        _pendingOwner = address(0);
        emit OwnershipTransferStarted(oldOwner, address(0));
        emit OwnershipTransferred(oldOwner, address(0));
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
        // this call always follows _validateOrTransformLocation(src), so we know location is a valid location
        // verify the balance is sufficient, but don't modify
        bytes32 locationType = Locations.getLocationType(location);
        // if external address type
        if(locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) {
            // check erc20 balance
            address account = Locations.locationToAddress(location);
            uint256 balance = IERC20(token).balanceOf(account);
            if(balance < amount) revert Errors.HydrogenInsufficientBalance();
        }
        // if internal address type
        else if(locationType == Locations.LOCATION_TYPE_INTERNAL_ADDRESS) {
            // check internal balance
            address account = Locations.locationToAddress(location);
            uint256 balance = _tokenInternalBalanceOfAccount[account][token];
            if(balance < amount) revert Errors.HydrogenInsufficientBalance();
        }
        // if pool type
        else {
            // check internal balance
            uint256 poolID = Locations.locationToPoolID(location);
            uint256 balance = _tokenInternalBalanceOfPool[poolID][token];
            if(balance < amount) revert Errors.HydrogenInsufficientBalance();
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
        // this call always follows _validateOrTransformLocation(src), so we know src is a valid location
        bytes32 locationType = Locations.getLocationType(src);
        // if external address type
        if(locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) {
            // erc20 transfer from
            address account = Locations.locationToAddress(src);
            _transferERC20From(token, account, amount);
        }
        // if internal address type
        else if(locationType == Locations.LOCATION_TYPE_INTERNAL_ADDRESS) {
            // deduct from internal balance
            address account = Locations.locationToAddress(src);
            uint256 balance = _tokenInternalBalanceOfAccount[account][token];
            if(balance < amount) revert Errors.HydrogenInsufficientBalance();
            unchecked {
                _tokenInternalBalanceOfAccount[account][token] = balance - amount;
            }
        }
        // if pool type
        else {
            // deduct from internal balance
            uint256 poolID = Locations.locationToPoolID(src);
            uint256 balance = _tokenInternalBalanceOfPool[poolID][token];
            if(balance < amount) revert Errors.HydrogenInsufficientBalance();
            unchecked {
                _tokenInternalBalanceOfPool[poolID][token] = balance - amount;
            }
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
        // this call always follows _validateOrTransformLocation(src), so we know src is a valid location
        bytes32 locationType = Locations.getLocationType(dst);
        // if external address type
        if(locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) {
            // erc20 transfer to
            address account = Locations.locationToAddress(dst);
            _transferERC20To(token, account, amount);
        }
        // if internal address type
        else if(locationType == Locations.LOCATION_TYPE_INTERNAL_ADDRESS) {
            // add to internal balance
            address account = Locations.locationToAddress(dst);
            _tokenInternalBalanceOfAccount[account][token] += amount;
        }
        // if pool type
        else {
            // add to internal balance
            uint256 poolID = Locations.locationToPoolID(dst);
            _tokenInternalBalanceOfPool[poolID][token] += amount;
        }
    }

    /**
     * @notice Transfers the gas token from this contract to `to`.
     * @param to The address to receive the gas token.
     * @param amount The amount of the gas token to send.
     */
    function _transferGasToken(address to, uint256 amount) internal {
        // perform low level call
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = payable(to).call{value: amount}("");
        // detect error
        if(!success) {
            // revert
            if (returndata.length == 0) {
                // reason not given, use custom error
                revert Errors.HydrogenGasTokenTransferFailed();
            } else {
                // reason given, bubble up
                // solhint-disable-next-line no-inline-assembly
                assembly {
                    revert(add(32, returndata), mload(returndata))
                }
            }
        }
    }

    /**
     * @notice Transfers an ERC20 from this contract to another address.
     * @param token The token to transfer.
     * @param to The recipient of the token.
     * @param amount The amount to transfer.
     */
    function _transferERC20To(address token, address to, uint256 amount) internal {
        _transferERC20(token, abi.encodeWithSelector(IERC20(token).transfer.selector, to, amount));
    }

    /**
     * @notice Transfers an ERC20 from another address to this contract.
     * @param token The token to transfer.
     * @param from The sender of the token.
     * @param amount The amount to transfer.
     */
    function _transferERC20From(address token, address from, uint256 amount) internal {
        _transferERC20(token, abi.encodeWithSelector(IERC20(token).transferFrom.selector, from, address(this), amount));
    }

    /**
     * @notice Transfers an ERC20.
     * @param token The token to transfer.
     * @param data The call data (encoded using abi.encode or one of its variants).
     */
    function _transferERC20(address token, bytes memory data) private {
        // perform low level call
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = token.call(data);
        // detect error
        if(!success || (returndata.length > 0 && !abi.decode(returndata, (bool)))) {
            // revert
            if (returndata.length == 0 || success) {
                // reason not given, use custom error
                revert Errors.HydrogenERC20TransferFailed();
            } else {
                // reason given, bubble up
                // solhint-disable-next-line no-inline-assembly
                assembly {
                    revert(add(32, returndata), mload(returndata))
                }
            }
        }
        // success but no data returned
        else if(returndata.length == 0) {
            // verify token is contract
            if(!Address.isContract(token)) revert Errors.HydrogenERC20TransferFailed();
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
        // if the pool exists, it must be either a limit order or a grid order
        uint256 poolType = Pools.getPoolType(poolID);
        if(poolType == Pools.LIMIT_ORDER_POOL_TYPE) {
            LimitOrderPoolData storage poolData = _limitOrderPoolData[poolID];
            if((poolData.tokenA != tokenA) || (poolData.tokenB != tokenB)) revert Errors.HydrogenPoolCannotTradeTheseTokens();
            return (poolData.exchangeRate, poolData.locationB);
        } else {
            GridOrderPoolData storage poolData = _gridOrderPoolData[poolID];
            exchangeRate = poolData.tokenPairToExchangeRate[tokenA][tokenB];
            return(exchangeRate, poolData.tokenPairToLocation[tokenA][tokenB]);
        }
    }

    /***************************************
    LOCATION VALIDATION HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Validates a location. Applies a transformation if needed. Reverts if invalid.
     * This simply checks that token transfers to and from the location will succeed.
     * It does not check for example if the poolID exists.
     * @param loc The location to validate.
     * @return validatedLocation The location, validated and possibly transformed.
     */
    function _validateOrTransformLocation(bytes32 loc) internal view returns (bytes32 validatedLocation) {
        bytes32 locationType = Locations.getLocationType(loc);
        // if address type
        if(
            (locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) ||
            (locationType == Locations.LOCATION_TYPE_INTERNAL_ADDRESS)
        ) {
            address account = Locations.locationToAddress(loc);
            if(account == address(0)) revert Errors.HydrogenAddressZero();
            if(account == address(this)) revert Errors.HydrogenSelfReferrence();
            return loc;
        }
        // if pool type
        else if(locationType == Locations.LOCATION_TYPE_POOL) {
            // for the purpose of this test, all poolIDs are considered valid, even if they don't exist or are not owned by msg.sender
            return loc;
        }
        // if flag type
        else if(locationType == Locations.LOCATION_TYPE_FLAGS) {
            // if external address flag
            if(loc == Locations.LOCATION_FLAG_EXTERNAL_ADDRESS) {
                // return msg.sender
                return Locations.externalAddressToLocation(msg.sender);
            }
            // if internal address flag
            else if(loc == Locations.LOCATION_FLAG_INTERNAL_ADDRESS) {
                // return msg.sender
                return Locations.internalAddressToLocation(msg.sender);
            }
            // if pool flag
            else if(loc == Locations.LOCATION_FLAG_POOL) {
                // if the poolID was known, loc would have been transformed before passing into this function
                // don't know which poolID the caller is talking about
                revert Errors.HydrogenMissingPoolContext();
            }
            // if unknown flag type
            else {
                // revert
                revert Errors.HydrogenInvalidLocationFlag();
            }
        }
        // if unknown location type
        else {
            // revert
            revert Errors.HydrogenInvalidLocationType();
        }
    }

    /**
     * @notice Reverts if `msg.sender` is not authorized to access the location.
     * @param src The location to query.
     */
    function _validateLocationTransferFromAuthorization(bytes32 src) internal view {
        // this call always follows _validateOrTransformLocation(src), so we know src is a valid location
        // if its an address type, make sure its msg.sender
        // if its a pool type, make sure its owned by msg.sender
        bytes32 locationType = Locations.getLocationType(src);
        if(
            (locationType == Locations.LOCATION_TYPE_EXTERNAL_ADDRESS) ||
            (locationType == Locations.LOCATION_TYPE_INTERNAL_ADDRESS)
        ) {
            address account = Locations.locationToAddress(src);
            if(account != msg.sender) revert Errors.HydrogenTransferFromAccountNotMsgSender();
        } else {
            uint256 poolID = Locations.locationToPoolID(src);
            if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
            if(_ownerOf(poolID) != msg.sender) revert Errors.HydrogenNotPoolOwner();
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
            bytes32 srcLocation = _validateOrTransformLocation(tokenSources[i].location);
            _validateLocationTransferFromAuthorization(srcLocation);
            _performTokenTransfer(token, tokenSources[i].amount, srcLocation, poolLocation);
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
            if(locationB == Locations.LOCATION_FLAG_POOL) {
                locationB = poolLocation;
            } else {
                locationB = _validateOrTransformLocation(locationB);
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
    ERC721 HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the owner of the `poolID` token.
     * Reverts if the token does not exist.
     * @param poolID The ID of the pool to query.
     * @return holder The owner of the token.
     */
    function _ownerOf(uint256 poolID) internal view returns (address holder) {
        return _owners[poolID];
    }

    /**
     * @notice Returns true if the pool exists.
     * @param poolID The ID of the pool to query.
     * @return status True if the pool exists, false otherwise.
     */
    function _exists(uint256 poolID) internal view returns (bool status) {
        return (_ownerOf(poolID) != address(0));
    }

    /**
     * @notice Returns the account approved for `poolID` token.
     * Reverts if the token does not exist.
     * @param poolID The ID of the pool to query.
     * @return operator The account approved for the specific token.
     */
    function _getApproved(uint256 poolID) internal view returns (address operator) {
        if(!_exists(poolID)) revert Errors.HydrogenPoolDoesNotExist();
        return _tokenApprovals[poolID];
    }

    /**
     * @notice Returns if the `operator` is allowed to manage all of the assets of `owner`.
     * @param holder The holder account to query.
     * @param operator The operator account to query.
     * @return isApproved True if operator is approved, false otherwise.
     */
    function _isApprovedForAll(address holder, address operator) internal view returns (bool isApproved) {
        return _operatorApprovals[holder][operator];
    }

    /**
     * @notice Transfers `poolID` token from `from` to `to`.
     * @param from The account to transfer the token from.
     * @param to The account to transfer the pool to.
     * @param poolID The ID of the pool to transfer.
     */
    function _transfer(address from, address to, uint256 poolID) internal virtual {
        // reentrancy guard enter
        if(_reentrancyGuardState == NOT_ENTERABLE) revert Errors.HydrogenReentrancyGuard();
        // checks
        address holder = _ownerOf(poolID);
        // existance
        if(holder == address(0)) revert Errors.HydrogenPoolDoesNotExist();
        // ownership or approval
        if(!((holder == msg.sender) || _isApprovedForAll(holder, msg.sender) || (_getApproved(poolID) == msg.sender))) revert Errors.HydrogenNotPoolOwnerOrOperator();
        // from
        if(holder != from) revert Errors.HydrogenNotPoolOwner();
        // to
        if(to == address(0)) revert Errors.HydrogenAddressZero();
        if(to == address(this)) revert Errors.HydrogenSelfReferrence();
        // effects
        // clear approvals from the previous owner
        delete _tokenApprovals[poolID];
        // manage balances
        unchecked {
            _balances[from] -= 1;
            _balances[to] += 1;
        }
        // assign ownership
        _owners[poolID] = to;
        emit Transfer(from, to, poolID);
    }

    /**
     * @notice Transfers `poolID` token from `from` to `to`.
     * @param from The account to transfer the token from.
     * @param to The account to transfer the pool to.
     * @param poolID The ID of the pool to transfer.
     * @param data Arbitrary data to be passed to `to`.
     */
    function _safeTransfer(address from, address to, uint256 poolID, bytes memory data) internal virtual {
        // transfer ownership
        _transfer(from, to, poolID);
        // call to receiver onERC721Received
        if (Address.isContract(to)) {
            // call out. allowed to reenter safely
            try IERC721Receiver(to).onERC721Received(msg.sender, from, poolID, data) returns (bytes4 retval) {
                // check return value
                if(retval != ON_ERC721_RECEIVED_MAGIC_VALUE) revert Errors.HydrogenNotERC721Receiver();
            } catch (bytes memory reason) {
                // revert
                if (reason.length == 0) {
                    // reason not given, use custom error
                    revert Errors.HydrogenNotERC721Receiver();
                } else {
                    // reason given, bubble up
                    // solhint-disable-next-line no-inline-assembly
                    assembly {
                        revert(add(32, reason), mload(reason))
                    }
                }
            }
        }
    }

    /**
     * @notice Mints `poolID` and transfers it to `to`.
     * @param to The receiver of the new pool.
     * @param poolID The ID of the pool to mint.
     */
    function _mint(address to, uint256 poolID) internal {
        if(to == address(0)) revert Errors.HydrogenAddressZero();
        if(_exists(poolID)) revert Errors.HydrogenPoolAlreadyExists();
        unchecked {
            _balances[to] += 1;
        }
        _owners[poolID] = to;
        emit Transfer(address(0), to, poolID);
    }

    /***************************************
    MULTICALL HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Executes a single function.
     * @param data The function to execute.
     * @return result The result of the function.
     */
    function _selfDelegateCall(bytes calldata data) internal returns (bytes memory result) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = address(this).delegatecall(data);
        if (success) {
            return returndata;
        } else {
            _revert(returndata);
        }
    }

    /**
     * @notice Reverts the returndata.
     * @param returndata The data for the revert message.
     */
    function _revert(bytes memory returndata) internal pure {
        // Look for revert reason and bubble it up if present
        if (returndata.length > 0) {
            // reason given, bubble up
            // solhint-disable-next-line no-inline-assembly
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            // reason not given, use custom error
            revert Errors.HydrogenUnknownError();
        }
    }

    /***************************************
    SWAP FEE HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Gets the swap fee for a pair.
     * The default fee is stored at [address zero, address zero].
     * @param tokenA The token that market takers buy.
     * @param tokenB The token that market takers sell.
     * @return feePPM The fee measured in parts per million.
     * @return receiverLocation The receiver of fees.
     */
    function _getSwapFeeForPair(
        address tokenA,
        address tokenB
    ) internal view returns (
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

    /***************************************
    FLASH LOAN HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Gets the flash loan fee for a token.
     * The default fee is stored at address zero.
     * @param token The loan currency.
     * @return feePPM The fee measured in parts per million.
     * @return receiverLocation The receiver of fees.
     */
    function _getFlashLoanFeeForToken(
        address token
    ) internal view returns (
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
}
// solhint-enable max-states-count
