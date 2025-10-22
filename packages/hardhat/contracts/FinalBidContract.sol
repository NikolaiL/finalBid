//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

// Useful for debugging. Remove when deploying to a live network.
import "hardhat/console.sol";

// Use openzeppelin to inherit battle-tested implementations (ERC20, ERC721, etc)
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * A smart contract that allows changing a state variable of the contract and tracking the changes
 * It also allows the owner to withdraw the Ether in the contract
 * @author BuidlGuidl
 */
contract FinalBidContract is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    // State Variables
    address public tokenAddress;
    uint256 public auctionId;
    uint256 public auctionDuration = 600; // 600 seconds
    uint256 public auctionDurationIncrease = 300; // 300 seconds
    uint256 public startingAmount = 1 ether; // 1 Token
    uint256 public referralFee = 0.1 ether; // 0.1 Token
    uint256 public deployerFee = 0.1 ether; // 0.1 Token
    uint256 public bidFee = 1 ether; // 1 Token
    uint256 public totalReferralRewardsCollected;
    bool public newAuctionIsAllowed = false;
    
    // Signature verification for bot prevention
    address public validSigner;
    uint256 public accessTokenValidity = 60; // 30 seconds

    struct AccessToken {
        address wallet;
        uint256 timestamp;
        uint256 auctionId;
        bytes signature;
    }

    struct Auction {
        uint256 auctionAmount;
        uint256 startTime;
        uint256 endTime;
        uint256 referralFee;
        uint256 deployerFee;
        uint256 bidFee;
        uint256 bidCount;
        address highestBidder;
        bool ended;
    }

    mapping(uint256 => Auction) public auctions;
    event AuctionCreated(uint256 indexed auctionId, uint256 auctionAmount, uint256 startTime, uint256 endTime, uint256 referralFee, uint256 deployerFee, uint256 bidFee);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, address indexed referral, uint256 endTime, uint256 auctionAmount, uint256 bidCount);
    event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 amount);

    // Admin update events
    event AuctionDurationUpdated(uint256 oldDuration, uint256 newDuration);
    event AuctionDurationIncreaseUpdated(uint256 oldIncrease, uint256 newIncrease);
    event StartingAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event ReferralFeeUpdated(uint256 oldAmount, uint256 newAmount);
    event BidFeeUpdated(uint256 oldAmount, uint256 newAmount);
    event DeployerFeeUpdated(uint256 oldAmount, uint256 newAmount);
    // Constructor: Called once on contract deployment
    // Check packages/hardhat/deploy/00_deploy_your_contract.ts
    constructor(address _owner, address _tokenAddress, address _validSigner) Ownable(_owner) {
        // Owner is set in the Ownable constructor
        tokenAddress = _tokenAddress;
        validSigner = _validSigner;
    }

    function _createAuction(uint256 _auctionId, address _tokenAddress, uint256 _startTime, uint256 _endTime, uint256 _startingAmount, uint256 _referralFee, uint256 _deployerFee, uint256 _bidFee) internal {
        // check if _auctionAmount is available
        uint256 availableAmount = IERC20(_tokenAddress).balanceOf(address(this));
        //uint256 totalReferralFees = totalReferralRewardsCollected - totalReferralRewardsClaimed;
        require (availableAmount > _startingAmount, "Insufficient balance to start auction");

        auctions[_auctionId] = Auction({
            auctionAmount: _startingAmount,
            startTime: _startTime,
            endTime: _endTime,
            referralFee: _referralFee,
            deployerFee: _deployerFee,
            bidFee: _bidFee,
            bidCount: 0,
            highestBidder: address(0),
            ended: false
        });

        emit AuctionCreated(auctionId, _startingAmount, _startTime, _endTime, _referralFee, _deployerFee, _bidFee);


    }

    function _withdrawExcess(uint256 _amount) internal {
        uint256 availableAmount = IERC20(tokenAddress).balanceOf(address(this));
        require(availableAmount > _amount, "Insufficient balance to withdraw");
        // Effects
        
        // Interactions
        IERC20(tokenAddress).safeTransfer(owner(), _amount);
    }

    function withdrawExcess(uint256 _amount) public onlyOwner {
        _withdrawExcess(_amount);
    }

    function _finalizeAuction(uint256 _auctionId) internal {
        Auction storage auction = auctions[_auctionId];
        require (_auctionId > 0 && _auctionId <= auctionId, "Auction not found");
        require(auction.ended == false, "Auction already ended");
        require(auction.endTime < block.timestamp, "Auction not ended");

        auction.ended = true;
        
        if (auction.highestBidder != address(0)) {
            // pay the winner
            IERC20 token = IERC20(tokenAddress);
            token.safeTransfer(auction.highestBidder, auction.auctionAmount);
        }
        emit AuctionEnded(_auctionId, auction.highestBidder, auction.auctionAmount);
    }

    function startAuction() public whenNotPaused nonReentrant {
        // no active auction or last auction time is finished
        require(newAuctionIsAllowed == true, "New auction not allowed");
        Auction storage auction = auctions[auctionId];
        require(auctionId == 0 || auction.ended == true, "Auction already active");
        // if auctionId > 0, we need to finalize the old auction, pay the winner etc...
        auctionId ++;
        // create new auction
        _createAuction(auctionId, tokenAddress, block.timestamp, block.timestamp + auctionDuration, startingAmount, referralFee, deployerFee, bidFee);
        
    }

    function endAuction() public whenNotPaused nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.ended == false, "Auction already ended");
        require(auction.endTime < block.timestamp, "Auction not ended");
        _finalizeAuction(auctionId);
    }

    // this call must also transfer the bid amount in tokenAddress to the contract
    function placeBid(AccessToken calldata accessToken, address _referral) public whenNotPaused nonReentrant {
        // Verify access token
        require(verifyAccessToken(accessToken, msg.sender), "Invalid access token");
        Auction storage auction = auctions[auctionId];
        require(auction.startTime <= block.timestamp && auction.endTime > block.timestamp && auction.ended == false, "Auction not active");
        require(auction.highestBidder != msg.sender, "You are already the highest bidder");
        uint256 _totalBidAmount = auction.bidFee;

        IERC20 token = IERC20(tokenAddress);

        // Checks
        uint256 balance = token.balanceOf(msg.sender);
        require(balance >= _totalBidAmount, "Insufficient balance");
        uint256 allowance = token.allowance(msg.sender, address(this));
        require(allowance >= _totalBidAmount, "Insufficient allowance");

        // Interactions
        token.safeTransferFrom(msg.sender, address(this), _totalBidAmount);

        // Normalize referral
        if (_referral == msg.sender) {
            _referral = address(0);
        }

        // Effects
        auction.highestBidder = msg.sender;
        auction.bidCount++;
        if (auction.endTime - block.timestamp < auctionDurationIncrease) {
            auction.endTime = block.timestamp +auctionDurationIncrease;
        }

        auction.auctionAmount += (bidFee - referralFee - deployerFee);

        // pay the referral and deployer fees
        if (_referral != address(0)) {
            token.safeTransfer(_referral, referralFee);
            //token.safeTransfer(owner(), deployerFee);
            totalReferralRewardsCollected += referralFee;
        } else {
            //token.safeTransfer(owner(), referralFee+deployerFee);
        }

        // emit event
        emit BidPlaced(auctionId, msg.sender, _referral, auction.endTime, auction.auctionAmount, auction.bidCount);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    // --- Admin setters ---

    function setAuctionDuration(uint256 _auctionDuration) external onlyOwner {
        require(_auctionDuration > 0, "auctionDuration must be > 0");
        uint256 old = auctionDuration;
        auctionDuration = _auctionDuration;
        emit AuctionDurationUpdated(old, _auctionDuration);
    }

    function setAuctionDurationIncrease(uint256 _auctionDurationIncrease) external onlyOwner {
        uint256 old = auctionDurationIncrease;
        auctionDurationIncrease = _auctionDurationIncrease;
        emit AuctionDurationIncreaseUpdated(old, _auctionDurationIncrease);
    }

    function setStartingAmount(uint256 _startingAmount) external onlyOwner {
        require(_startingAmount > 0, "startingAmount must be > 0");
        uint256 old = startingAmount;
        startingAmount = _startingAmount;
        emit StartingAmountUpdated(old, _startingAmount);
    }

    function setReferralFee(uint256 _referralFee) external onlyOwner {
        require(_referralFee <= bidFee-deployerFee, "referralFee + deployerFee cannot exceed bidFee");
        uint256 old = referralFee;
        referralFee = _referralFee;
        emit ReferralFeeUpdated(old, _referralFee);
    }

    function setDeployerFee(uint256 _deployerFee) external onlyOwner {
        require(_deployerFee <= bidFee-referralFee, "referralFee + deployerFee cannot exceed bidFee");
        uint256 old = deployerFee;
        deployerFee = _deployerFee;
        emit DeployerFeeUpdated(old, _deployerFee);
    }

    function setBidFee(uint256 _bidFee) external onlyOwner {
        require(_bidFee > 0, "bidFee must be > 0");
        require(referralFee + deployerFee <= _bidFee, "referralFee + deployerFee cannot exceed bidFee");
        uint256 old = bidFee;
        bidFee = _bidFee;
        emit BidFeeUpdated(old, _bidFee);
    }

    function setNewAuctionIsAllowed() external onlyOwner {
        newAuctionIsAllowed =true;
    }

    function setNewAuctionIsNotAllowed() external onlyOwner {
        newAuctionIsAllowed = false;
    }

    /**
     * Function that allows the owner to withdraw all the Ether in the contract
     * The function can only be called by the owner of the contract as defined by the onlyOwner modifier
     */
    function withdraw() public onlyOwner nonReentrant {
        (bool success, ) = owner().call{ value: address(this).balance }("");
        require(success, "Failed to send Ether");
    }

    receive() external payable {}
    
    // Signature verification functions for bot prevention
    
    function verifyAccessToken(
        AccessToken calldata token,
        address sender
    ) internal view returns (bool) {
        // Check if signer is valid
        if (!isValidSigner(token.signature, token.wallet, token.timestamp, token.auctionId)) {
            return false;
        }

        // Check if wallet matches sender
        if (token.wallet != sender) {
            return false;
        }

        // Check if timestamp is within allowed time
        if (block.timestamp > token.timestamp + accessTokenValidity) {
            return false;
        }

        // Check if auction ID matches current auction
        if (token.auctionId != auctionId) {
            return false;
        }

        return true;
    }

    function isValidSigner(
        bytes calldata signature,
        address wallet,
        uint256 timestamp,
        uint256 _auctionId
    ) public view returns (bool) {
        bytes32 messageHash = keccak256(abi.encodePacked(wallet, timestamp, _auctionId));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        
        address recoveredSigner = ECDSA.recover(ethSignedMessageHash, signature);
        return recoveredSigner == validSigner;
    }

    // Admin function to update valid signer
    function setValidSigner(address _validSigner) external onlyOwner {
        validSigner = _validSigner;
    }

    // Admin function to update access token validity
    function setAccessTokenValidity(uint256 _accessTokenValidity) external onlyOwner {
        require(_accessTokenValidity > 0, "Access token validity must be greater than 0");
        accessTokenValidity = _accessTokenValidity;
    }
}
