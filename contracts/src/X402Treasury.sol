// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Per-chain payment collector. Users pay via ERC20.transfer(treasury, amount).
///         Operator/relayer calls sweepAll to move funds to vault (relayer pays gas).
contract X402Treasury {
    address public immutable vault;
    address public owner;
    address public operator;

    event Swept(address indexed token, uint256 amount, address indexed to);

    error NotOperator();
    error EmptyBalance();
    error TransferFailed();

    modifier onlyOperator() {
        if (msg.sender != operator && msg.sender != owner) revert NotOperator();
        _;
    }

    constructor(address vault_, address operator_) {
        require(vault_ != address(0), "vault=0");
        require(operator_ != address(0), "operator=0");
        vault = vault_;
        operator = operator_;
        owner = msg.sender;
    }

    function sweepAll(address token) external onlyOperator returns (uint256 amount) {
        amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) revert EmptyBalance();
        if (!IERC20(token).transfer(vault, amount)) revert TransferFailed();
        emit Swept(token, amount, vault);
    }

    function setOperator(address newOperator) external {
        require(msg.sender == owner, "not owner");
        require(newOperator != address(0), "operator=0");
        operator = newOperator;
    }

    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "not owner");
        require(newOwner != address(0), "owner=0");
        owner = newOwner;
    }
}
