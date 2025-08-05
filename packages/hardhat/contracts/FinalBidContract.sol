//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

// Useful for debugging. Remove when deploying to a live network.
import "hardhat/console.sol";

// Use openzeppelin to inherit battle-tested implementations (ERC20, ERC721, etc)
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * A smart contract that allows changing a state variable of the contract and tracking the changes
 * It also allows the owner to withdraw the Ether in the contract
 * @author BuidlGuidl
 */
contract FinalBidContract is Ownable, Pausable {
    // State Variables
    address public tokenAddress;
    uint256 public auctionId;
    uint256 public auctionAmount = 100000000; // 100 USDC
    uint256 public auctionDuration = 60; // 1 minute
    uint256 public auctionDurationIncrease = 60; // 1 minute
    uint256 public startingAmount = 1000000; // 1 USDC
    uint256 public bidIncrement = 250000; // 0.25 USDC
    uint256 public referralFee = 250000; // 0.25 USDC
    uint256 public platformFee = 1000000; // 1 USDC
    uint256 public platformFeesCollected;
    uint256 public platformFeesClaimed;
    uint256 public totalReferralRewardsCollected;
    uint256 public totalReferralRewardsClaimed;
    

    struct Auction {
        address tokenAddress;
        uint256 auctionAmount;
        uint256 startTime;
        uint256 endTime;
        uint256 startingAmount;
        uint256 bidIncrement;
        uint256 referralFee;
        uint256 platformFee;
        uint256 bidCount;
        address highestBidder;
        uint256 highestBid;
        bool ended;
    }

    mapping(uint256 => Auction) public auctions;

    mapping(address => uint256) public referralRewards;

    event AuctionCreated(uint256 indexed auctionId, address indexed tokenAddress, uint256 auctionAmount, uint256 startTime, uint256 endTime, uint256 startingAmount);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount, address indexed referral);
    event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 amount, uint256 highestBid);

    // Constructor: Called once on contract deployment
    // Check packages/hardhat/deploy/00_deploy_your_contract.ts
    constructor(address _owner, address _tokenAddress) Ownable(_owner) {
        // Owner is set in the Ownable constructor
        tokenAddress = _tokenAddress;
    }

    function _createAuction(uint256 _auctionId, address _tokenAddress, uint256 _auctionAmount, uint256 _startTime, uint256 _endTime, uint256 _startingAmount, uint256 _bidIncrement, uint256 _referralFee, uint256 _platformFee) internal {
        // check if _auctionAmount is available
        uint256 availableAmount = IERC20(_tokenAddress).balanceOf(address(this));
        uint256 totalReferralFees = totalReferralRewardsCollected - totalReferralRewardsClaimed;
        uint256 totalPlatfromFees = platformFeesCollected - platformFeesClaimed;
        require (availableAmount > totalReferralFees + _startingAmount + _bidIncrement, "Insufficient balance to start auction");
        uint256 auctionAmountToUse = availableAmount > _auctionAmount ? _auctionAmount : availableAmount;

        if (auctionAmountToUse > availableAmount - totalPlatfromFees) {
            platformFeesClaimed += (auctionAmountToUse - (availableAmount - totalPlatfromFees));
        }
        
        auctions[_auctionId] = Auction({
            tokenAddress: _tokenAddress,
            auctionAmount: auctionAmountToUse,
            startTime: _startTime,
            endTime: _endTime,
            startingAmount: _startingAmount,
            bidIncrement: _bidIncrement,
            referralFee: _referralFee,
            platformFee: _platformFee,
            bidCount: 0,
            highestBidder: address(0),
            highestBid: 0,
            ended: false
        });
    }

    function _finalizeAuction(uint256 _auctionId) internal {
        Auction storage auction = auctions[_auctionId];
        require (_auctionId > 0 && _auctionId <= auctionId, "Auction not found");
        require(auction.ended == false, "Auction already ended");
        require(auction.endTime < block.timestamp || auction.highestBid >= auction.auctionAmount, "Auction not ended");

        auction.ended = true;
        if (auction.highestBidder != address(0)) {
            // pay the winner
            IERC20 token = IERC20(auction.tokenAddress);
            token.transfer(auction.highestBidder, auction.auctionAmount);
        }
        emit AuctionEnded(_auctionId, auction.highestBidder, auction.auctionAmount, auction.highestBid);
    }

    function startAuction() public whenNotPaused {
        // no active auction or last auction time is finished
        Auction storage auction = auctions[auctionId];
        require(auctionId == 0 || auction.endTime < block.timestamp || auction.highestBid >= auction.auctionAmount, "Auction already active");
        // if auctionId > 0, we need to finalize the old auction, pay the winner etc...
        if (auctionId > 0 && auctions[auctionId].ended == false) {
            _finalizeAuction(auctionId);
        }
        auctionId ++;
        // create new auction
        _createAuction(auctionId, tokenAddress, auctionAmount, block.timestamp, block.timestamp + auctionDuration, startingAmount, bidIncrement, referralFee, platformFee);
        emit AuctionCreated(auctionId, tokenAddress, auctionAmount, block.timestamp, block.timestamp + auctionDuration, startingAmount);
    }

    // this call must also transfer the bid amount in tokenAddress to the contract
    function placeBid(address _referral) public whenNotPaused {
        Auction storage auction = auctions[auctionId];
        uint256 _bidAmount = (auction.highestBid == 0) ? auction.startingAmount : auction.highestBid + auction.bidIncrement;
        uint256 _totalBidAmount = _bidAmount + platformFee;
        require(auction.startTime <= block.timestamp && auction.endTime > block.timestamp, "Auction not active");
        // check for allowance, if less than required, ask for allowance
        IERC20 token = IERC20(auction.tokenAddress);
        uint256 allowance = token.allowance(msg.sender, address(this));
        require(allowance >= _totalBidAmount, "Insufficient allowance");
        
        // transfer the bid amount to the contract
        token.transferFrom(msg.sender, address(this), _totalBidAmount);

        // we need to send back the previous highest bid to the previous highest bidder
        if (auction.highestBidder != address(0)) {
            token.transfer(auction.highestBidder, auction.highestBid);
        }

        // place bid
        auction.highestBidder = msg.sender;
        auction.highestBid = _bidAmount;
        auction.bidCount++;

        // pay the referral
        if (_referral != address(0) && _referral != msg.sender) {
            referralRewards[_referral] += referralFee;
            platformFeesCollected += (platformFee - referralFee);
            totalReferralRewardsCollected += referralFee;
        } else {
            platformFeesCollected += platformFee;
        }

        // check if the auction duration needs to be increased
        if (auction.endTime - block.timestamp < auctionDurationIncrease && auction.highestBid < auction.auctionAmount) {
            auction.endTime += auctionDurationIncrease;
        }
        emit BidPlaced(auctionId, msg.sender, _bidAmount, _referral);

        if (auction.highestBid >= auction.auctionAmount) {
            startAuction();
        }
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     * Function that allows the owner to withdraw all the Ether in the contract
     * The function can only be called by the owner of the contract as defined by the onlyOwner modifier
     */
    function withdraw() public onlyOwner {
        (bool success, ) = owner().call{ value: address(this).balance }("");
        require(success, "Failed to send Ether");
    }

    function withdrawPlatformFees() public onlyOwner {
        // withdraw from token contract
        require(platformFeesCollected > platformFeesClaimed, "No fees to claim");
        IERC20 token = IERC20(tokenAddress);
        uint256 platfromFeesToClaim = platformFeesCollected - platformFeesClaimed;
        token.transfer(owner(), platfromFeesToClaim);
        platformFeesClaimed += platfromFeesToClaim;
    }

    /**
     * function that allows a referral to withdraw his referral fees
     */
    function withdrawReferralRewards() public {
        require(referralRewards[msg.sender] > 0, "No rewards to claim");
        IERC20 token = IERC20(tokenAddress);
        token.transfer(msg.sender, referralRewards[msg.sender]);
        totalReferralRewardsClaimed += referralRewards[msg.sender];
        referralRewards[msg.sender] = 0;
    }

    /**
     * Function that allows the contract to receive ETH
     */
    receive() external payable {}
    


}
