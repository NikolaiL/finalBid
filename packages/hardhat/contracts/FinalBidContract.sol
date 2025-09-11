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
    uint256 public auctionAmount = 20_000_000; // 20 USDC
    uint256 public auctionDuration = 3_600; // 1 hour
    uint256 public auctionDurationIncrease = 45; // 1 minute
    uint256 public startingAmount = 200_000; // 0.2 USDC
    uint256 public bidIncrement = 10_000; // 0.01 USDC
    uint256 public referralFee = 50_000; // 0.05 USDC
    uint256 public platformFee = 200_000; // 0.2 USDC
    uint256 public deployerFee = 20_000; // 0.02 UCDC
    uint256 public platformFeesCollected;
    uint256 public platformFeesClaimed;
    uint256 public totalReferralRewardsCollected;
    uint256 public percentageToWithdraw = 1;
    uint256 public percentageToUse = 10;
    bool public newAuctionIsAllowed = true;
    //uint256 public totalReferralRewardsClaimed;
    
    // Signature verification for bot prevention
    address public validSigner;
    uint256 public accessTokenValidity = 60; // 30 seconds

    uint256 public streamingUnits = 0;

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
        uint256 streamingEndTime;
        uint256 startingAmount;
        uint256 bidIncrement;
        uint256 referralFee;
        uint256 platformFee;
        uint256 bidCount;
        address highestBidder;
        uint256 highestBid;
        bool ended;
    }

    struct Streaming {
        uint256 units;
        uint256 balance;
        uint256 flowRate;
        uint256 lastUpdated;
    }

    mapping(uint256 => Auction) public auctions;

    mapping(address => Streaming) public streamings;
    address[] public streamingAddresses;

    // mapping(address => uint256) public referralRewards;

    event AuctionCreated(uint256 indexed auctionId, uint256 auctionAmount, uint256 startTime, uint256 endTime, uint256 startingAmount, uint256 bidIncrement, uint256 referralFee, uint256 platformFee);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount, address indexed referral, uint256 endTime);
    event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 amount, uint256 highestBid);

    // Admin update events
    event AuctionAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event AuctionDurationUpdated(uint256 oldDuration, uint256 newDuration);
    event AuctionDurationIncreaseUpdated(uint256 oldIncrease, uint256 newIncrease);
    event StartingAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event BidIncrementUpdated(uint256 oldAmount, uint256 newAmount);
    event ReferralFeeUpdated(uint256 oldAmount, uint256 newAmount);
    event PlatformFeeUpdated(uint256 oldAmount, uint256 newAmount);
    event DeployerFeeUpdated(uint256 oldAmount, uint256 newAmount);

    // Constructor: Called once on contract deployment
    // Check packages/hardhat/deploy/00_deploy_your_contract.ts
    constructor(address _owner, address _tokenAddress, address _validSigner) Ownable(_owner) {
        // Owner is set in the Ownable constructor
        tokenAddress = _tokenAddress;
        validSigner = _validSigner;
    }

    function _calculateFlowRatePerUnit() internal view returns (uint256) {
        // calculate streaming per unit
        // we need to calculate total length of the current auction
        // then calculate total flow rate per second
        // then divide it by streamingUnits
        if (streamingUnits == 0) {
            return 0;
        }
        uint256 auctionLength = auctions[auctionId].streamingEndTime - auctions[auctionId].startTime;
        if (auctionLength == 0) {
            return 0;
        }
        // Use a larger multiplier to avoid precision loss
        uint256 totalFlowRate = (auctions[auctionId].auctionAmount / 2) * 1000 / auctionLength;
        uint256 flowRatePerUnit = totalFlowRate / streamingUnits;
        return flowRatePerUnit;
    }

    function _recalculateFlowRate() internal {
        // recalculate streaming per unit
        uint256 flowRatePerUnit = _calculateFlowRatePerUnit();

        uint256 calculateUntil = auctions[auctionId].streamingEndTime;
        if (block.timestamp < calculateUntil) {
            calculateUntil = block.timestamp;
        }

        for (uint256 i = 0; i < streamingAddresses.length; i++) {
            address streamingAddress = streamingAddresses[i];
            Streaming storage streaming = streamings[streamingAddress];
            // Accumulate balance using the flow rate
            uint256 streamingTime = calculateUntil > streaming.lastUpdated ? calculateUntil - streaming.lastUpdated : 0;
            streaming.balance += streaming.flowRate * streamingTime / 1000;
            streaming.flowRate = flowRatePerUnit * streaming.units;
            streaming.lastUpdated = calculateUntil;
        }
    }

    function _finalizeStreaming() internal {
        // recalculate first
        _recalculateFlowRate();
        // then send the balance to the streaming address
        for (uint256 i = 0; i < streamingAddresses.length; i++) {
            address streamingAddress = streamingAddresses[i];
            Streaming storage streaming = streamings[streamingAddress];
            if (streaming.balance > 0) {
                IERC20(tokenAddress).safeTransfer(streamingAddress, streaming.balance);
            }
        }

        
        // delete streamings
        for (uint256 i = 0; i < streamingAddresses.length; i++) {
            address streamingAddress = streamingAddresses[i];
            delete streamings[streamingAddress];
        }
        
        // delete streamingAddresses
        delete streamingAddresses;

        // reset streamingUnits
        streamingUnits = 0;
    }

    function _addStreamingUnits(address _address, uint256 _units) internal {

        // first we will halfve all existing units and calculate total units in the system
        uint256 totalUnits = 0;
        for (uint256 i = 0; i < streamingAddresses.length; i++) {
            address streamingAddress = streamingAddresses[i];
            streamings[streamingAddress].units /= 2;
            totalUnits += streamings[streamingAddress].units;
        }
        // Add address to array if it's the first time
        if (streamings[_address].units == 0) {
            streamingAddresses.push(_address);
        }
        streamings[_address].units += _units;
        streamingUnits += _units;
        _recalculateFlowRate();
    }

    function _createAuction(uint256 _auctionId, address _tokenAddress, uint256 _startTime, uint256 _endTime, uint256 _startingAmount, uint256 _bidIncrement, uint256 _referralFee, uint256 _platformFee) internal {
        // check if _auctionAmount is available
        uint256 availableAmount = IERC20(_tokenAddress).balanceOf(address(this));
        //uint256 totalReferralFees = totalReferralRewardsCollected - totalReferralRewardsClaimed;
        require (availableAmount * percentageToUse / 100 > _startingAmount + _bidIncrement, "Insufficient balance to start auction");
        uint256 auctionAmountToUse = availableAmount * percentageToUse / 100;

        
        if (availableAmount > auctionAmountToUse && percentageToWithdraw > 0) {
            uint256 amountToWithdraw = availableAmount * percentageToWithdraw / 100;
            _withdrawExcess(amountToWithdraw);
        }

        auctions[_auctionId] = Auction({
            auctionAmount: auctionAmountToUse,
            startTime: _startTime,
            endTime: _endTime,
            streamingEndTime: _endTime,
            startingAmount: _startingAmount,
            bidIncrement: _bidIncrement,
            referralFee: _referralFee,
            platformFee: _platformFee,
            bidCount: 0,
            highestBidder: address(0),
            highestBid: 0,
            ended: false
        });

        emit AuctionCreated(auctionId, auctionAmountToUse, _startTime, _endTime, _startingAmount, _bidIncrement, _referralFee, _platformFee);


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
        require(auction.endTime < block.timestamp || auction.highestBid >= auction.auctionAmount, "Auction not ended");

        auction.ended = true;
        
        // Finalize streaming before paying the winner
        _finalizeStreaming();
        
        if (auction.highestBidder != address(0)) {
            // pay the winner
            IERC20 token = IERC20(tokenAddress);
            token.safeTransfer(auction.highestBidder, auction.auctionAmount / 2);
        }
        emit AuctionEnded(_auctionId, auction.highestBidder, auction.auctionAmount, auction.highestBid);
    }

    function startAuction() public whenNotPaused nonReentrant {
        // no active auction or last auction time is finished
        require(newAuctionIsAllowed == true, "New auction not allowed");
        Auction storage auction = auctions[auctionId];
        require(auctionId == 0 || auction.ended == true, "Auction already active");
        // if auctionId > 0, we need to finalize the old auction, pay the winner etc...
        auctionId ++;
        // create new auction
        _createAuction(auctionId, tokenAddress, block.timestamp, block.timestamp + auctionDuration, startingAmount, bidIncrement, referralFee, platformFee);
        
    }

    function endAuction() public whenNotPaused nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.ended == false, "Auction already ended");
        require(auction.endTime < block.timestamp || auction.highestBid >= auction.auctionAmount, "Auction not ended");
        _finalizeAuction(auctionId);
    }

    // this call must also transfer the bid amount in tokenAddress to the contract
    function placeBid(AccessToken calldata accessToken, address _referral) public whenNotPaused nonReentrant {
        // Verify access token
        require(verifyAccessToken(accessToken, msg.sender), "Invalid access token");
        Auction storage auction = auctions[auctionId];
        require(auction.startTime <= block.timestamp && auction.endTime > block.timestamp && auction.ended == false, "Auction not active");
        require(auction.highestBidder != msg.sender, "You are already the highest bidder");
        uint256 _bidAmount = (auction.highestBid == 0) ? auction.startingAmount : auction.highestBid + auction.bidIncrement;
        uint256 _totalBidAmount = _bidAmount + platformFee;

        IERC20 token = IERC20(tokenAddress);

        // Checks
        uint256 balance = token.balanceOf(msg.sender);
        require(balance >= _totalBidAmount, "Insufficient balance");
        uint256 allowance = token.allowance(msg.sender, address(this));
        require(allowance >= _totalBidAmount, "Insufficient allowance");

        // Snapshot previous highest
        address previousHighestBidder = auction.highestBidder;
        uint256 previousHighestBid = auction.highestBid;

        // Interactions
        token.safeTransferFrom(msg.sender, address(this), _totalBidAmount);

        // Normalize referral
        if (_referral == msg.sender) {
            _referral = address(0);
        }

        // Effects
        auction.highestBidder = msg.sender;
        auction.highestBid = _bidAmount;
        auction.bidCount++;
        if (auction.endTime - block.timestamp < auctionDurationIncrease && _bidAmount < auction.auctionAmount) {
            auction.endTime += auctionDurationIncrease;
        }

        // send previous highest bidder their bid back
        if (previousHighestBidder != address(0)) {
            token.safeTransfer(previousHighestBidder, previousHighestBid);
        }
        if (_referral != address(0)) {
            token.safeTransfer(_referral, referralFee);
            token.safeTransfer(owner(), deployerFee);
            totalReferralRewardsCollected += referralFee;
        } else {
            token.safeTransfer(owner(), referralFee+deployerFee);
        }

        // add streamin units
        _addStreamingUnits(msg.sender, 1024);

        platformFeesCollected += (platformFee - referralFee - deployerFee);

        emit BidPlaced(auctionId, msg.sender, _bidAmount, _referral, auction.endTime);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    // --- Admin setters ---

    function setAuctionAmount(uint256 _auctionAmount) external onlyOwner {
        require(_auctionAmount > 0, "auctionAmount must be > 0");
        uint256 old = auctionAmount;
        auctionAmount = _auctionAmount;
        emit AuctionAmountUpdated(old, _auctionAmount);
    }

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

    function setBidIncrement(uint256 _bidIncrement) external onlyOwner {
        require(_bidIncrement > 0, "bidIncrement must be > 0");
        uint256 old = bidIncrement;
        bidIncrement = _bidIncrement;
        emit BidIncrementUpdated(old, _bidIncrement);
    }

    function setReferralFee(uint256 _referralFee) external onlyOwner {
        require(_referralFee <= platformFee-deployerFee, "referralFee + deployerFee cannot exceed platformFee");
        uint256 old = referralFee;
        referralFee = _referralFee;
        emit ReferralFeeUpdated(old, _referralFee);
    }

    function setDeployerFee(uint256 _deployerFee) external onlyOwner {
        require(_deployerFee <= platformFee-referralFee, "referralFee + deployerFee cannot exceed platformFee");
        uint256 old = deployerFee;
        deployerFee = _deployerFee;
        emit DeployerFeeUpdated(old, _deployerFee);
    }

    function setPlatformFee(uint256 _platformFee) external onlyOwner {
        require(_platformFee > 0, "platformFee must be > 0");
        require(referralFee + deployerFee <= _platformFee, "referralFee + deployerFee cannot exceed platformFee");
        uint256 old = platformFee;
        platformFee = _platformFee;
        // Ensure referralFee is not larger than platformFee after update
        if (referralFee > platformFee) {
            referralFee = platformFee;
        }
        emit PlatformFeeUpdated(old, _platformFee);
    }

    function setPercentageToWithdraw(uint256 _percentageToWithdraw) external onlyOwner {
        require(_percentageToWithdraw <= 100, "percentageToWithdraw must be <= 100");
        require(_percentageToWithdraw + percentageToUse <= 100, "percentageToWithdraw + percentageToUse cannot exceed 100");
        percentageToWithdraw = _percentageToWithdraw;
    }

    function setPercentageToUse(uint256 _percentageToUse) external onlyOwner {
        require(_percentageToUse > 0, "percentageToUse must be > 0");
        require(_percentageToUse <= 100, "percentageToUse must be <= 100");
        require(_percentageToUse + percentageToWithdraw <= 100, "percentageToUse + percentageToWithdraw cannot exceed 100");
        percentageToUse = _percentageToUse;
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

    function withdrawPlatformFees() public onlyOwner nonReentrant {
        // withdraw from token contract
        require(platformFeesCollected > platformFeesClaimed, "No fees to claim");
        IERC20 token = IERC20(tokenAddress);
        //get balance of token
        uint256 tokenBalance = token.balanceOf(address(this));
        uint256 platfromFeesToClaim = platformFeesCollected - platformFeesClaimed;
        if (platfromFeesToClaim > tokenBalance) {
            platfromFeesToClaim = tokenBalance;
        }
        // Effects
        platformFeesClaimed += platfromFeesToClaim;
        // Interactions
        token.safeTransfer(owner(), platfromFeesToClaim);
    }

    /**
     * function that allows a referral to withdraw his referral fees
     * removed as we will pay the referral fee to the referral directly
     */
    // function withdrawReferralRewards() public {
    //     require(referralRewards[msg.sender] > 0, "No rewards to claim");
    //     IERC20 token = IERC20(tokenAddress);
    //     token.transfer(msg.sender, referralRewards[msg.sender]);
    //     totalReferralRewardsClaimed += referralRewards[msg.sender];
    //     referralRewards[msg.sender] = 0;
    // }

    /**
     * Function that allows the contract to receive ETH
     */
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
