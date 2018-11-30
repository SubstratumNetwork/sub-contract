pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/Math.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Burnable.sol";

contract Substratum is ERC20Burnable, Ownable {
    string public constant name = "Substratum";
    string public constant symbol = "SUB";
    uint8 public constant decimals = 18;

    IERC20 private _legacyToken;

    // 472 million tokens * decimal places (10^18)
    uint256 public constant INITIAL_SUPPLY = 472000000000000000000000000;

    constructor(IERC20 legacyToken) public {
        require(legacyToken != address(0));
        _legacyToken = legacyToken;
        ERC20.approve(this, INITIAL_SUPPLY);

        ERC20._mint(msg.sender, INITIAL_SUPPLY);
    }

    /**
     * @dev Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
     * Requires no previous allowance to prevent a race condition with multiple approvals.
     * See https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     */
    function approve(address spender, uint256 value) public returns (bool) {
        require(value == 0 || allowance(msg.sender, spender) == 0, "Use increaseApproval or decreaseApproval to prevent double-spend.");

        return ERC20.approve(spender, value);
    }

    /**
     * @dev Transfers part of your balance of old token to this
     * contract, and transfers the same amount of new tokens back to you.
     * The amount should first be approved for this contract address.
     * @param amount amount of tokens to be migrated
     */
    function migrate(uint256 amount) public {
        address account = msg.sender;
        _legacyToken.transferFrom(account, this, amount);
        this.transferFrom(owner(), account, amount);
    }

    /**
     * @dev Transfers all of your balance of old tokens to
     * this contract, and transfers the same amount of new tokens back to you.
     * The amount should first be approved for this contract address. If less than
     * the full amount is approved then the approval amount will be migrated.
     */
    function migrateAll() public {
        address account = msg.sender;
        uint256 balance = _legacyToken.balanceOf(account);
        uint256 allowance = _legacyToken.allowance(account, this);
        uint256 amount = Math.min(balance, allowance);
        migrate(amount);
    }
}