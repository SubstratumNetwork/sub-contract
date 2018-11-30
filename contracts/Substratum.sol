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
        _legacyToken = legacyToken;
        ERC20.approve(this, INITIAL_SUPPLY);

        ERC20._mint(msg.sender, INITIAL_SUPPLY);
    }

    function approve(address _spender, uint256 _value) public returns (bool) {
        require(_value == 0 || allowance(msg.sender, _spender) == 0, "Use increaseApproval or decreaseApproval to prevent double-spend.");

        return ERC20.approve(_spender, _value);
    }

    function migrate(address account, uint256 amount) public {
        _legacyToken.transferFrom(account, this, amount);
        this.transferFrom(owner(), account, amount);
    }

    function migrateAll(address account) public {
        uint256 balance = _legacyToken.balanceOf(account);
        uint256 allowance = _legacyToken.allowance(account, this);
        uint256 amount = Math.min(balance, allowance);
        migrate(account, amount);
    }
}