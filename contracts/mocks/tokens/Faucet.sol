// SPDX-License-Identifier: none
pragma solidity 0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


/**
 * @title Faucet
 * @author Hysland Finance
 * @notice A faucet that drips ERC20 tokens.
 *
 * This is only useful on testnet.
 */
contract Faucet {

    /**
     * @notice Drips some token to msg.sender.
     * @param token The token to drip.
     */
    function drip(address token) external {
        IERC20 tkn = IERC20(token);
        uint256 balance = tkn.balanceOf(address(this));
        uint256 dripAmount = balance / 10000;
        require(dripAmount > 0, "faucet is dry");
        address receiver = msg.sender;
        SafeERC20.safeTransfer(tkn, receiver, dripAmount);
    }

    /**
     * @notice Drips some token.
     * @param token The token to drip.
     * @param receiver The receiver of tokens.
     */
    function drip(address token, address receiver) external {
        IERC20 tkn = IERC20(token);
        uint256 balance = tkn.balanceOf(address(this));
        uint256 dripAmount = balance / 10000;
        require(dripAmount > 0, "faucet is dry");
        SafeERC20.safeTransfer(tkn, receiver, dripAmount);
    }
}
