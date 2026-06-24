// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PocketAgentCredit
 * @notice Minimal ERC-20-like credit token for the PocketAgent x402 delegation demo.
 *
 * The facilitator holds the admin role and can mint/burn credits on behalf of
 * subscribers. Session keys can be granted the burner role for delegated burns.
 *
 * Deployed on testnet (Base Sepolia or Ethereum Sepolia) for the on-chain
 * credit balance and settlement flow.
 */
contract PocketAgentCredit {
    string public constant name = "PocketAgent Credit";
    string public constant symbol = "PAC";
    uint8 public constant decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public admin;
    mapping(address => bool) public minters;
    mapping(address => bool) public burners;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Mint(address indexed to, uint256 value);
    event Burn(address indexed from, uint256 value);

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    modifier onlyMinter() {
        require(minters[msg.sender], "not minter");
        _;
    }

    modifier onlyBurner() {
        require(burners[msg.sender], "not burner");
        _;
    }

    constructor() {
        admin = msg.sender;
        minters[msg.sender] = true;
        burners[msg.sender] = true;
    }

    function mint(address to, uint256 amount) external onlyMinter {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
        emit Mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyBurner {
        require(balanceOf[from] >= amount, "insufficient balance");
        balanceOf[from] -= amount;
        emit Transfer(from, address(0), amount);
        emit Burn(from, amount);
    }

    function setMinter(address minter, bool active) external onlyAdmin {
        minters[minter] = active;
    }

    function setBurner(address burner, bool active) external onlyAdmin {
        burners[burner] = active;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
