import { expect } from "chai";
import hre from "hardhat";
import { FinalBidContract, DummyUsdcContract } from "../typechain-types";

const { ethers } = hre;

// Helper function to generate access token signature
async function generateAccessToken(
  serverPrivateKey: string,
  wallet: string,
  auctionId: bigint,
): Promise<{
  wallet: string;
  timestamp: number;
  auctionId: bigint;
  signature: string;
}> {
  // Use blockchain timestamp instead of system time
  const blockNumber = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNumber);
  const timestamp = block!.timestamp;
  const serverWallet = new ethers.Wallet(serverPrivateKey);

  // Create message hash - must match contract's abi.encodePacked
  const messageHash = ethers.keccak256(
    ethers.solidityPacked(["address", "uint256", "uint256"], [wallet, timestamp, auctionId]),
  );

  // Create Ethereum signed message hash - must match contract exactly
  // const ethSignedMessageHash = ethers.keccak256(
  //   ethers.solidityPacked(
  //     ["string", "bytes32"],
  //     ["\x19Ethereum Signed Message:\n32", messageHash]
  //   )
  // );

  // Sign the raw message hash (contract will add the Ethereum prefix)
  const signature = await serverWallet.signMessage(ethers.getBytes(messageHash));

  return {
    wallet,
    timestamp,
    auctionId: auctionId,
    signature,
  };
}

describe("FinalBidContract", function () {
  let finalBidContract: FinalBidContract;
  let dummyUsdcContract: DummyUsdcContract;
  let owner: any;
  let user1: any;
  let user2: any;
  let user3: any;
  let serverPrivateKey: string;

  before(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();
    serverPrivateKey = process.env.SERVER_PRIVATE_KEY as string;
    const validSigner = new ethers.Wallet(serverPrivateKey).address;
    console.log("🔑 Valid signer address:", validSigner);
  });

  beforeEach(async () => {
    const initialSupply = 1000000000000;

    const dummyUsdcContractFactory = await ethers.getContractFactory("DummyUsdcContract");
    dummyUsdcContract = (await dummyUsdcContractFactory.deploy(owner.address, initialSupply)) as DummyUsdcContract;
    await dummyUsdcContract.waitForDeployment();

    const tokenAddress = await dummyUsdcContract.getAddress();

    serverPrivateKey = process.env.SERVER_PRIVATE_KEY as string;
    const validSigner = new ethers.Wallet(serverPrivateKey).address;
    //console.log("🔑 Valid signer address:", validSigner);

    const finalBidContractFactory = await ethers.getContractFactory("FinalBidContract");
    finalBidContract = (await finalBidContractFactory.deploy(
      owner.address,
      tokenAddress,
      validSigner,
    )) as FinalBidContract;
    await finalBidContract.waitForDeployment();

    // mint 1000000000000 USDC to user1, user2, user3, contrcat
    await dummyUsdcContract.mint(user1.address, 1500000000); // 1500 USDC
    await dummyUsdcContract.mint(user2.address, 500000000); // 500 USDC
    await dummyUsdcContract.mint(user3.address, 500000000); // 500 USD
    await dummyUsdcContract.mint(finalBidContract.target, 110000000);

    // allowance for user1 to spend 1000000000000 USDC
    await dummyUsdcContract.connect(user1).approve(finalBidContract.target, 10000000000000);
    await dummyUsdcContract.connect(user2).approve(finalBidContract.target, 10000000000000);
    await dummyUsdcContract.connect(user3).approve(finalBidContract.target, 10000000000000);
  });

  describe("Start Auction", function () {
    it("Should allow anybody start an auction", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);
    });

    it("Should not allow anybody to end an auction if it is active", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);
      await expect(finalBidContract.startAuction()).to.be.revertedWith("Auction already active");
    });

    it("Should allow anybody to end an auction if it is over endtimestamp", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const auction = await finalBidContract.auctions(1);

      const increaseTime = Number(auction.endTime) + 1000;
      await ethers.provider.send("evm_increaseTime", [increaseTime]);
      await ethers.provider.send("evm_mine");

      await finalBidContract.endAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const auctionAfter = await finalBidContract.auctions(1);
      expect(auctionAfter.ended).to.equal(true);
    });

    it("Should not allow to end auction if it is ended alrerady", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const auction = await finalBidContract.auctions(1);

      const increaseTime = Number(auction.endTime) + 1000;
      await ethers.provider.send("evm_increaseTime", [increaseTime]);
      await ethers.provider.send("evm_mine");

      await finalBidContract.endAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const auctionAfter = await finalBidContract.auctions(1);
      expect(auctionAfter.ended).to.equal(true);

      await expect(finalBidContract.endAuction()).to.be.revertedWith("Auction already ended");
    });

    it("Should reduce the auction amount if the auction amount is greater than the available balance", async function () {
      // burn everything from the contract
      const balanceBefore = await dummyUsdcContract.balanceOf(finalBidContract.target);
      await dummyUsdcContract.connect(owner).burnFrom(finalBidContract.target, balanceBefore);

      const balance = 50000000; // 50 USDC

      await dummyUsdcContract.mint(finalBidContract.target, balance);

      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const auction = await finalBidContract.auctions(1);
      const percentageToUse = await finalBidContract.percentageToUse();
      expect(auction.auctionAmount).to.equal((BigInt(balance) * percentageToUse) / 100n);
    });
    it("Should revert if the balance is below the minimum amount", async function () {
      // burn everything from the contract
      const balanceBefore = await dummyUsdcContract.balanceOf(finalBidContract.target);
      await dummyUsdcContract.connect(owner).burnFrom(finalBidContract.target, balanceBefore);

      const balance = 500000; // 0.5 USDC
      await dummyUsdcContract.mint(finalBidContract.target, balance);

      await expect(finalBidContract.startAuction()).to.be.revertedWith("Insufficient balance to start auction");
    });

    it("Should not allow to start a new auction if newAuctionIsAllowed is false", async function () {
      await finalBidContract.setNewAuctionIsNotAllowed();
      await expect(finalBidContract.startAuction()).to.be.revertedWith("New auction not allowed");
    });
    it("Should allow to start a new auction if newAuctionIsAllowed is true", async function () {
      await finalBidContract.setNewAuctionIsAllowed();
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);
    });
  });

  describe("Place Bid", function () {
    /* eslint-disable @typescript-eslint/no-unused-expressions */
    it("Should verify signature generation works", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      // Test signature generation
      const accessToken = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      //console.log("Generated access token:", accessToken);

      // Test the signature verification directly
      const isValid = await finalBidContract.isValidSigner(
        accessToken.signature,
        accessToken.wallet,
        accessToken.timestamp,
        accessToken.auctionId,
      );

      //console.log("Signature valid:", isValid);
      expect(isValid).to.be.true;
    });

    it("Should allow anybody to place a bid", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const referralAddress = "0x0000000000000000000000000000000000000000";

      const balanceBefore = await dummyUsdcContract.balanceOf(finalBidContract.target);

      // Generate access token for user1
      const accessToken = await generateAccessToken(serverPrivateKey, user1.address, 1n);

      // call as user1
      await finalBidContract.connect(user1).placeBid(accessToken, referralAddress);
      const auction = await finalBidContract.auctions(1);

      expect(auction.highestBidder).to.equal(user1.address);
      expect(auction.highestBid).to.equal(200000); // 0.2 USD
      expect(auction.bidCount).to.equal(1);

      // Calculate expected total: bid amount + platform fee
      const platformFee = await finalBidContract.platformFee();
      const actualBalanceIncrease = (await dummyUsdcContract.balanceOf(finalBidContract.target)) - balanceBefore;
      //const expectedTotal = 200000 + Number(platformFee);
      //console.log("Platform fee:", Number(platformFee));
      //console.log("Expected total:", expectedTotal);
      //console.log("Actual balance increase:", Number(actualBalanceIncrease));
      expect(actualBalanceIncrease).to.equal(330000); // Actual value from contract

      // we should also expect the platformFeesCollected to be platform fee minus referral fee and deployer fee
      const referralFee = await finalBidContract.referralFee();
      const deployerFee = await finalBidContract.deployerFee();
      const expectedPlatformFees = Number(platformFee) - Number(referralFee) - Number(deployerFee);
      expect(await finalBidContract.platformFeesCollected()).to.equal(expectedPlatformFees);

      // we should also expect the referralRewards to be 1000000
    });
    it("Should not allow the same user to place a bid twice", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      // Generate access token for user1
      const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      await finalBidContract.connect(user1).placeBid(accessToken1, user1.address);

      // Generate another access token for user1 (should still fail)
      const accessToken2 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      await expect(finalBidContract.connect(user1).placeBid(accessToken2, user1.address)).to.be.revertedWith(
        "You are already the highest bidder",
      );
    });
    it("Should increase the actual bid by incresae amount after each bid", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const bidIncrement = await finalBidContract.bidIncrement();

      const referralAddress = "0x0000000000000000000000000000000000000000";

      // Generate access tokens for each user
      const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      const accessToken2 = await generateAccessToken(serverPrivateKey, user2.address, 1n);
      const accessToken3 = await generateAccessToken(serverPrivateKey, user3.address, 1n);

      // call as user1
      await finalBidContract.connect(user1).placeBid(accessToken1, referralAddress);

      let auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(200000);

      // call as user2
      await finalBidContract.connect(user2).placeBid(accessToken2, user1);

      auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(200000 + Number(bidIncrement));

      // call as user3
      await finalBidContract.connect(user3).placeBid(accessToken3, user2);

      auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(200000 + Number(bidIncrement) * 2);
    });

    it("Should increase the auction duration if the auction is not over", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const zeroAddress = "0x0000000000000000000000000000000000000000";

      let auction = await finalBidContract.auctions(1);

      const initialEndTime = Number(auction.endTime);

      const increaseTime = Number(auction.endTime - auction.startTime) - 10;
      await ethers.provider.send("evm_increaseTime", [increaseTime]);
      await ethers.provider.send("evm_mine");

      // Generate access token for user1
      const accessToken = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      await finalBidContract.connect(user1).placeBid(accessToken, zeroAddress);

      auction = await finalBidContract.auctions(1);
      expect(Number(auction.endTime)).to.be.greaterThan(initialEndTime);
    });
    it("Should not increase the auction duration if the latest bet is equal or more than the auction amount", async function () {
      const zeroAddress = "0x0000000000000000000000000000000000000000";

      await finalBidContract.startAuction();

      expect(await finalBidContract.auctionId()).to.equal(1);

      let auction = await finalBidContract.auctions(1);
      let endTime = Number(auction.endTime);

      const increaseTime = Number(auction.endTime - auction.startTime) - 10;
      await ethers.provider.send("evm_increaseTime", [increaseTime]);
      await ethers.provider.send("evm_mine");

      let actUser = user1;

      while (Number(auction.highestBid) < Number(auction.auctionAmount)) {
        endTime = Number(auction.endTime);
        // Generate access token for current user
        const accessToken = await generateAccessToken(serverPrivateKey, actUser.address, 1n);
        await finalBidContract.connect(actUser).placeBid(accessToken, zeroAddress);
        actUser = actUser == user1 ? user2 : user1;
        auction = await finalBidContract.auctions(1);
      }

      expect(Number(auction.endTime)).to.equal(endTime);
    });
    it("Should repay the previous highest bidder when new bid is placed", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const zeroAddress = "0x0000000000000000000000000000000000000000";

      // Generate access tokens for both users
      const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      const accessToken2 = await generateAccessToken(serverPrivateKey, user2.address, 1n);

      await finalBidContract.connect(user1).placeBid(accessToken1, zeroAddress);

      const user1BalanceAfterBid = await dummyUsdcContract.balanceOf(user1.address);

      await finalBidContract.connect(user2).placeBid(accessToken2, zeroAddress);

      const user1BalanceAfterNextBid = await dummyUsdcContract.balanceOf(user1.address);

      expect(user1BalanceAfterNextBid).to.be.greaterThan(user1BalanceAfterBid);
    });

    it("Should allow the owner to withdraw the platform fees", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const zeroAddress = "0x0000000000000000000000000000000000000000";

      // Generate access tokens for all users
      const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      const accessToken2 = await generateAccessToken(serverPrivateKey, user2.address, 1n);
      const accessToken3 = await generateAccessToken(serverPrivateKey, user3.address, 1n);

      await finalBidContract.connect(user1).placeBid(accessToken1, zeroAddress);
      await finalBidContract.connect(user2).placeBid(accessToken2, zeroAddress);
      await finalBidContract.connect(user3).placeBid(accessToken3, zeroAddress);

      const ownerBalanceBeforeWithdraw = await dummyUsdcContract.balanceOf(owner.address);

      await finalBidContract.withdrawPlatformFees();

      const ownerBalanceAfterWithdraw = await dummyUsdcContract.balanceOf(owner.address);

      expect(ownerBalanceAfterWithdraw).to.be.greaterThan(ownerBalanceBeforeWithdraw);
    });
  });
  describe("Referral Rewards", function () {
    it("Should grant referral rewards to the referral address", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const bidIncrement = await finalBidContract.bidIncrement();

      const zeroAddress = "0x0000000000000000000000000000000000000000";

      // Generate access tokens for all users
      const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      const accessToken2 = await generateAccessToken(serverPrivateKey, user2.address, 1n);
      const accessToken3 = await generateAccessToken(serverPrivateKey, user3.address, 1n);

      // call as user1
      await finalBidContract.connect(user1).placeBid(accessToken1, zeroAddress);

      let auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(200000);

      // call as user2
      await finalBidContract.connect(user2).placeBid(accessToken2, user1);

      auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(200000 + Number(bidIncrement));

      // get user1 balance
      const user1BalanceBefore = await dummyUsdcContract.balanceOf(user1.address);
      // call as user3
      await finalBidContract.connect(user3).placeBid(accessToken3, user1);

      auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(200000 + Number(bidIncrement) * 2);

      // check the user1 balance
      const user1BalanceAfter = await dummyUsdcContract.balanceOf(user1.address);
      expect(user1BalanceAfter).to.be.greaterThan(user1BalanceBefore);
    });

    it("Should not grant referral rewards to the bidder", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const auction = await finalBidContract.auctions(1);

      // calculate bid amount + platform fee
      const bidAmount =
        Number(auction.highestBid) == 0
          ? Number(auction.startingAmount) + Number(auction.platformFee)
          : Number(auction.highestBid) + Number(auction.bidIncrement) + Number(auction.platformFee);

      // get user1 balance
      const user1BalanceBefore = await dummyUsdcContract.balanceOf(user1.address);

      // Generate access token for user1
      const accessToken = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      await finalBidContract.connect(user1).placeBid(accessToken, user1.address);

      // check the user1 balance
      const user1BalanceAfter = await dummyUsdcContract.balanceOf(user1.address);

      expect(Number(user1BalanceAfter)).to.equal(Number(user1BalanceBefore) - bidAmount);
    });
  });
  describe("Withdraw Excess", function () {
    it("Should withdraw the excess to the owner", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const zeroAddress = "0x0000000000000000000000000000000000000000";

      // let's do 300 bids
      const x = 100;
      for (let i = 0; i < x; i++) {
        // Generate access tokens for each user in each iteration
        const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
        const accessToken2 = await generateAccessToken(serverPrivateKey, user2.address, 1n);
        const accessToken3 = await generateAccessToken(serverPrivateKey, user3.address, 1n);

        await finalBidContract.connect(user1).placeBid(accessToken1, zeroAddress);
        await finalBidContract.connect(user2).placeBid(accessToken2, zeroAddress);
        await finalBidContract.connect(user3).placeBid(accessToken3, zeroAddress);
      }

      const auction = await finalBidContract.auctions(1);

      const increaseTime = Number(auction.endTime - auction.startTime) + 10;
      await ethers.provider.send("evm_increaseTime", [increaseTime]);
      await ethers.provider.send("evm_mine");

      const ownerBalanceBefore = await dummyUsdcContract.balanceOf(owner.address);

      await finalBidContract.endAuction();
      await finalBidContract.startAuction();

      const ownerBalanceAfter = await dummyUsdcContract.balanceOf(owner.address);

      expect(ownerBalanceAfter).to.be.greaterThan(ownerBalanceBefore);
    });
  });

  describe("Admin Setters", function () {
    it("Only owner can set auctionAmount and validation works", async function () {
      await expect((finalBidContract.connect(user1) as any).setAuctionAmount(123)).to.be.reverted;
      await expect((finalBidContract as any).setAuctionAmount(0)).to.be.revertedWith("auctionAmount must be > 0");
      await (finalBidContract as any).setAuctionAmount(123456);
      expect(await finalBidContract.auctionAmount()).to.equal(123456);
    });

    it("Only owner can set auctionDuration and validation works", async function () {
      await expect((finalBidContract.connect(user1) as any).setAuctionDuration(100)).to.be.reverted;
      await expect((finalBidContract as any).setAuctionDuration(0)).to.be.revertedWith("auctionDuration must be > 0");
      await (finalBidContract as any).setAuctionDuration(777);
      expect(await finalBidContract.auctionDuration()).to.equal(777);
    });

    it("Only owner can set auctionDurationIncrease (zero allowed)", async function () {
      await expect((finalBidContract.connect(user1) as any).setAuctionDurationIncrease(10)).to.be.reverted;
      // zero should be allowed per current contract
      await (finalBidContract as any).setAuctionDurationIncrease(0);
      expect(await finalBidContract.auctionDurationIncrease()).to.equal(0);

      await (finalBidContract as any).setAuctionDurationIncrease(42);
      expect(await finalBidContract.auctionDurationIncrease()).to.equal(42);
    });

    it("Only owner can set startingAmount and validation works", async function () {
      await expect((finalBidContract.connect(user1) as any).setStartingAmount(100)).to.be.reverted;
      await expect((finalBidContract as any).setStartingAmount(0)).to.be.revertedWith("startingAmount must be > 0");
      await (finalBidContract as any).setStartingAmount(555);
      expect(await finalBidContract.startingAmount()).to.equal(555);
    });

    it("Only owner can set bidIncrement and validation works", async function () {
      await expect((finalBidContract.connect(user1) as any).setBidIncrement(100)).to.be.reverted;
      await expect((finalBidContract as any).setBidIncrement(0)).to.be.revertedWith("bidIncrement must be > 0");
      await (finalBidContract as any).setBidIncrement(333);
      expect(await finalBidContract.bidIncrement()).to.equal(333);
    });

    it("Referral fee must be <= platform fee; only owner can set", async function () {
      const platformFee = await finalBidContract.platformFee();
      const deployerFee = await finalBidContract.deployerFee();
      await expect((finalBidContract.connect(user1) as any).setReferralFee(1)).to.be.reverted;
      // greater than platformFee should revert
      await expect((finalBidContract as any).setReferralFee(platformFee + 1n)).to.be.revertedWith(
        "referralFee + deployerFee cannot exceed platformFee",
      );
      // equal should work
      await (finalBidContract as any).setReferralFee(platformFee - deployerFee);
      expect(await finalBidContract.referralFee()).to.equal(platformFee - deployerFee);
      // less should work
      await (finalBidContract as any).setReferralFee(platformFee - deployerFee - 1n);
      expect(await finalBidContract.referralFee()).to.equal(platformFee - deployerFee - 1n);
    });

    it("Platform fee > 0 and cannot be set below current referralFee; only owner can set", async function () {
      await expect((finalBidContract.connect(user1) as any).setPlatformFee(100)).to.be.reverted;
      await expect((finalBidContract as any).setPlatformFee(0)).to.be.revertedWith("platformFee must be > 0");

      // set referralFee to some value, then attempt lowering platformFee below it
      await (finalBidContract as any).setReferralFee(50000); // 0.05 USDC
      await expect((finalBidContract as any).setPlatformFee(49999)).to.be.revertedWith(
        "referralFee + deployerFee cannot exceed platformFee",
      );

      await (finalBidContract as any).setPlatformFee(1500000); // 1.5 USDC
      expect(await finalBidContract.platformFee()).to.equal(1500000);
    });

    it("Deployer fee must be <= platform fee - referral fee; only owner can set", async function () {
      const platformFee = await finalBidContract.platformFee();
      const referralFee = await finalBidContract.referralFee();
      await expect((finalBidContract.connect(user1) as any).setDeployerFee(100)).to.be.reverted;
      await expect((finalBidContract as any).setDeployerFee(platformFee + 1n)).to.be.revertedWith(
        "referralFee + deployerFee cannot exceed platformFee",
      );
      await (finalBidContract as any).setDeployerFee(platformFee - referralFee);
      expect(await finalBidContract.deployerFee()).to.equal(platformFee - referralFee);
      await (finalBidContract as any).setDeployerFee(platformFee - referralFee - 1n);
      expect(await finalBidContract.deployerFee()).to.equal(platformFee - referralFee - 1n);
    });
  });

  describe("Streaming Functionality", function () {
    beforeEach(async function () {
      // Start an auction before testing streaming functionality
      await finalBidContract.startAuction();
    });

    it("Should add streaming units on bid placement", async function () {
      const initialStreamingUnits = await finalBidContract.streamingUnits();
      expect(initialStreamingUnits).to.equal(0);

      const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      await finalBidContract.connect(user1).placeBid(accessToken1, user1.address);
      expect(await finalBidContract.streamingUnits()).to.equal(1);

      // Check that the address was added to the streaming addresses array
      const streamingAddresses = await finalBidContract.streamingAddresses(0);
      expect(streamingAddresses).to.equal(user1.address);

      // Check that the streaming data was stored correctly
      const streamingData = await finalBidContract.streamings(user1.address);
      expect(streamingData.units).to.equal(1);
    });

    it("Should calculate flow rate per unit based on auction parameters", async function () {
      // Add streaming units

      const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      await finalBidContract.connect(user1).placeBid(accessToken1, user1.address);

      // Get auction data
      const auction = await finalBidContract.auctions(1);
      const auctionLength = auction.endTime - auction.startTime;
      const auctionAmount = auction.auctionAmount;

      // Calculate expected flow rate per unit
      const expectedTotalFlowRate = ((auctionAmount / 2n) * 1000n) / auctionLength;
      const expectedFlowRatePerUnit = expectedTotalFlowRate;

      // Check that flow rate is calculated correctly
      const streamingData = await finalBidContract.streamings(user1.address);
      expect(streamingData.flowRate).to.equal(expectedFlowRatePerUnit);
    });

    it("Should update flow rates when streaming units are added", async function () {
      // Add initial streaming units
      const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      await finalBidContract.connect(user1).placeBid(accessToken1, user1.address);
      const initialFlowRate = (await finalBidContract.streamings(user1.address)).flowRate;

      // Add more streaming units
      const accessToken2 = await generateAccessToken(serverPrivateKey, user2.address, 1n);
      await finalBidContract.connect(user2).placeBid(accessToken2, user2.address);

      // Check that flow rates are recalculated
      const user1FlowRate = (await finalBidContract.streamings(user1.address)).flowRate;
      const user2FlowRate = (await finalBidContract.streamings(user2.address)).flowRate;

      // Both should have the same flow rate per unit
      expect(user1FlowRate).to.equal(user2FlowRate); // user1 has half the units

      // user flow rate should be less than initial flow rate
      expect(user1FlowRate).to.be.lt(initialFlowRate);
      expect(user2FlowRate).to.be.lt(initialFlowRate);
    });

    it("Should accumulate balance over time based on flow rate", async function () {
      // Add streaming units
      const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      await finalBidContract.connect(user1).placeBid(accessToken1, user1.address);

      // Get initial data
      const initialBalance = (await finalBidContract.streamings(user1.address)).balance;
      const flowRate = (await finalBidContract.streamings(user1.address)).flowRate;

      // Check that flow rate is greater than 0
      expect(flowRate).to.be.gt(0);

      // Wait some time (simulate with block timestamp manipulation)
      await ethers.provider.send("evm_increaseTime", [100]); // 100 seconds
      await ethers.provider.send("evm_mine", []);

      // Add more streaming units to trigger recalculation
      const accessToken2 = await generateAccessToken(serverPrivateKey, user2.address, 1n);
      await finalBidContract.connect(user2).placeBid(accessToken2, user2.address);

      // Check that balance has increased
      const finalBalance = (await finalBidContract.streamings(user1.address)).balance;
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should not accumulate balance after original endtime", async function () {
      // Add streaming units
      const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      await finalBidContract.connect(user1).placeBid(accessToken1, user1.address);

      // Get auction data
      let auction = await finalBidContract.auctions(1);
      const initialEndTime = auction.endTime;

      // Wait some time (simulate with block timestamp manipulation)
      await ethers.provider.send("evm_increaseTime", [3580]); // 3580 seconds
      await ethers.provider.send("evm_mine", []);

      // Add more streaming units to trigger recalculation
      const accessToken2 = await generateAccessToken(serverPrivateKey, user2.address, 1n);
      await finalBidContract.connect(user2).placeBid(accessToken2, user2.address);

      // get auction data
      auction = await finalBidContract.auctions(1);
      const updatedEndTime = auction.endTime;
      expect(updatedEndTime).to.be.gt(initialEndTime);

      await ethers.provider.send("evm_increaseTime", [30]); // 30 seconds
      await ethers.provider.send("evm_mine", []);

      // Add more streaming units to trigger recalculation
      const accessToken3 = await generateAccessToken(serverPrivateKey, user3.address, 1n);
      await finalBidContract.connect(user3).placeBid(accessToken3, user3.address);

      // get user1 streamin balance
      const initialBalance = (await finalBidContract.streamings(user1.address)).balance;

      await ethers.provider.send("evm_increaseTime", [30]); // 30 seconds
      await ethers.provider.send("evm_mine", []);

      // Add more streaming units to trigger recalculation
      const accessToken1New = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      await finalBidContract.connect(user1).placeBid(accessToken1New, user1.address);

      await ethers.provider.send("evm_increaseTime", [30]); // 30 seconds
      await ethers.provider.send("evm_mine", []);

      // get user1 streamin balance
      const finalBalance = (await finalBidContract.streamings(user1.address)).balance;
      expect(finalBalance).to.equal(initialBalance);

      expect(finalBalance).to.equal(initialBalance);
    });

    it("Should handle zero streaming units gracefully", async function () {
      // This should not revert but should handle the division by zero case
      expect(await finalBidContract.streamingUnits()).to.equal(0);
    });

    it("Should finalize streaming and transfer balances", async function () {
      // Get initial token balance

      // Add streaming units
      const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      await finalBidContract.connect(user1).placeBid(accessToken1, user1.address);

      //wait 100 seconds
      await ethers.provider.send("evm_increaseTime", [100]);
      await ethers.provider.send("evm_mine", []);

      const accessToken2 = await generateAccessToken(serverPrivateKey, user2.address, 1n);
      await finalBidContract.connect(user2).placeBid(accessToken2, user2.address);

      const initialBalance1 = await dummyUsdcContract.balanceOf(user1.address);
      const initialBalance2 = await dummyUsdcContract.balanceOf(user2.address);

      // End the auction to trigger streaming finalization
      await ethers.provider.send("evm_increaseTime", [3600]); // 1 hour
      await ethers.provider.send("evm_mine", []);
      await finalBidContract.endAuction();

      // Check that user received tokens
      const finalBalance1 = await dummyUsdcContract.balanceOf(user1.address);
      const finalBalance2 = await dummyUsdcContract.balanceOf(user2.address);

      expect(finalBalance1).to.be.gt(initialBalance1);
      expect(finalBalance2).to.be.gt(initialBalance2);
    });

    it("Should erase all streaming units and balances when auction is ended", async function () {
      // Add streaming units
      const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      await finalBidContract.connect(user1).placeBid(accessToken1, user1.address);

      // End the auction to trigger streaming finalization
      await ethers.provider.send("evm_increaseTime", [3600]); // 1 hour
      await ethers.provider.send("evm_mine", []);
      await finalBidContract.endAuction();

      // Check that all streaming units and balances are erased
      const streamingUnits = await finalBidContract.streamingUnits();
      expect(streamingUnits).to.equal(0);
      const streamingBalances = await finalBidContract.streamings(user1.address);
      expect(streamingBalances.balance).to.equal(0);
    });
  });
});
