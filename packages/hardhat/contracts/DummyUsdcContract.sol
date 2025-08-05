//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

// Useful for debugging. Remove when deploying to a live network.
import "hardhat/console.sol";

// Use openzeppelin to inherit battle-tested implementations (ERC20, ERC721, etc)
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * A dummy USDC-like ERC20 token contract for testing purposes
 * @author BuidlGuidl
 */
contract DummyUsdcContract is ERC20, Ownable {
    // USDC has 6 decimals
    uint8 private constant DECIMALS = 6;

    // Events
    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);

    /**
     * @dev Constructor that gives msg.sender all of existing tokens.
     * @param initialOwner The address that will receive the initial supply
     * @param initialSupply The initial supply of tokens (in smallest units)
     */
    constructor(address initialOwner, uint256 initialSupply) ERC20("Dummy USDC", "dUSDC") Ownable(initialOwner) {
        _mint(initialOwner, initialSupply);
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * Overrides the default value of 18 from ERC20.
     */
    function decimals() public view virtual override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @dev Mints new tokens. Only the owner can call this function.
     * @param to The address that will receive the minted tokens
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
        emit Minted(to, amount);
    }

    function grab() public {
        _mint(msg.sender, 10000000); // 10 USDC
        emit Minted(msg.sender, 10000000);
    }

    /**
     * @dev Burns tokens from the caller's account.
     * @param amount The amount of tokens to burn
     */
    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
        emit Burned(msg.sender, amount);
    }

    /**
     * @dev Burns tokens from a specific account. Only the owner can call this function.
     * @param from The address whose tokens will be burned
     * @param amount The amount of tokens to burn
     */
    function burnFrom(address from, uint256 amount) public onlyOwner {
        _burn(from, amount);
        emit Burned(from, amount);
    }

    /**
     * @dev Transfers tokens to multiple addresses in a single transaction.
     * @param recipients Array of addresses to send tokens to
     * @param amounts Array of amounts to send to each recipient
     */
    function multiTransfer(address[] memory recipients, uint256[] memory amounts) public {
        require(recipients.length == amounts.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            _transfer(msg.sender, recipients[i], amounts[i]);
        }
        
    }

    /**
     * @dev Returns the total supply of tokens in the smallest units (with 6 decimals).
     */
    function totalSupply() public view virtual override returns (uint256) {
        return super.totalSupply();
    }

    /**
     * @dev Returns the balance of tokens for a given account.
     * @param account The address to check the balance for
     */
    function balanceOf(address account) public view virtual override returns (uint256) {
        return super.balanceOf(account);
    }
} 