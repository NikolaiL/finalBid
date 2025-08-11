import { expect } from "chai";
import hre from "hardhat";
import { FinalBidContract, DummyUsdcContract } from "../typechain-types";

const { ethers } = hre;

describe("FinalBidContract", function () {
  let finalBidContract: FinalBidContract;
  let dummyUsdcContract: DummyUsdcContract;
  let owner: any;
  let user1: any;
  let user2: any;
  let user3: any;

  before(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const initialSupply = 1000000000000;

    const dummyUsdcContractFactory = await ethers.getContractFactory("DummyUsdcContract");
    dummyUsdcContract = (await dummyUsdcContractFactory.deploy(owner.address, initialSupply)) as DummyUsdcContract;
    await dummyUsdcContract.waitForDeployment();

    const tokenAddress = await dummyUsdcContract.getAddress();

    const finalBidContractFactory = await ethers.getContractFactory("FinalBidContract");
    finalBidContract = (await finalBidContractFactory.deploy(owner.address, tokenAddress)) as FinalBidContract;
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
      expect(auction.auctionAmount).to.equal(balance);
    });
    it("Should revert if the balance is below the minimum amount", async function () {
      // burn everything from the contract
      const balanceBefore = await dummyUsdcContract.balanceOf(finalBidContract.target);
      await dummyUsdcContract.connect(owner).burnFrom(finalBidContract.target, balanceBefore);

      const balance = 500000; // 0.5 USDC
      await dummyUsdcContract.mint(finalBidContract.target, balance);

      await expect(finalBidContract.startAuction()).to.be.revertedWith("Insufficient balance to start auction");
    });
    it("Should increase claimed platfom fees if we need to use some of it to start a new auction", async function () {
      // burn everything from the contract

      const zeroAddress = "0x0000000000000000000000000000000000000000";
      const balanceBefore = await dummyUsdcContract.balanceOf(finalBidContract.target);
      await dummyUsdcContract.connect(owner).burnFrom(finalBidContract.target, balanceBefore);

      const balance = 100000000; // 100 USDC
      await dummyUsdcContract.mint(finalBidContract.target, balance);

      // now, let's start an auction
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      // now, let's place 20 bids
      for (let i = 0; i < 20; i++) {
        await finalBidContract.connect(user1).placeBid(zeroAddress);
        await finalBidContract.connect(user2).placeBid(zeroAddress);
      }

      const auction = await finalBidContract.auctions(1);

      const increaseTime = Number(auction.endTime - auction.startTime) + 10;
      await ethers.provider.send("evm_increaseTime", [increaseTime]);
      await ethers.provider.send("evm_mine");

      const platformFeesClaimedBefore = await finalBidContract.platformFeesClaimed();

      // now lets start the new auction
      await finalBidContract.endAuction();
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(2);

      const platformFeesClaimedAfter = await finalBidContract.platformFeesClaimed();

      expect(platformFeesClaimedAfter).to.be.greaterThan(platformFeesClaimedBefore);
    });
  });

  describe("Place Bid", function () {
    it("Should allow anybody to place a bid", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const referralAddress = "0x0000000000000000000000000000000000000000";

      const balanceBefore = await dummyUsdcContract.balanceOf(finalBidContract.target);

      // call as user1
      await finalBidContract.connect(user1).placeBid(referralAddress);
      const auction = await finalBidContract.auctions(1);

      expect(auction.highestBidder).to.equal(user1.address);
      expect(auction.highestBid).to.equal(1000000); // 1 USD
      expect(auction.bidCount).to.equal(1);

      expect((await dummyUsdcContract.balanceOf(finalBidContract.target)) - balanceBefore).to.equal(2000000);

      // we should also expect the platformFeesCollected to be 1000000
      expect(await finalBidContract.platformFeesCollected()).to.equal(1000000);

      // we should also expect the referralRewards to be 1000000
    });
    it("Should not allow the same user to place a bid twice", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      await finalBidContract.connect(user1).placeBid(user1.address);
      await expect(finalBidContract.connect(user1).placeBid(user1.address)).to.be.revertedWith(
        "You are already the highest bidder",
      );
    });
    it("Should increase the actual bid by incresae amount after each bid", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const bidIncrement = await finalBidContract.bidIncrement();

      const referralAddress = "0x0000000000000000000000000000000000000000";

      // call as user1
      await finalBidContract.connect(user1).placeBid(referralAddress);

      let auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(1000000);

      // call as user2
      await finalBidContract.connect(user2).placeBid(user1);

      auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(1000000 + Number(bidIncrement));

      // call as user3
      await finalBidContract.connect(user3).placeBid(user2);

      auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(1000000 + Number(bidIncrement) * 2);
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

      await finalBidContract.connect(user1).placeBid(zeroAddress);

      auction = await finalBidContract.auctions(1);
      expect(Number(auction.endTime)).to.be.greaterThan(initialEndTime);
    });
    it("Should not increase the auction duration and should finalize the auction if the latest bet is equal or more than the auction amount", async function () {
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
        await finalBidContract.connect(actUser).placeBid(zeroAddress);
        actUser = actUser == user1 ? user2 : user1;
        auction = await finalBidContract.auctions(1);
      }

      expect(Number(auction.endTime)).to.equal(endTime);
      expect(auction.ended).to.equal(true);
    });
    it("Should repay the previous highest bidder when new bid is placed", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const zeroAddress = "0x0000000000000000000000000000000000000000";

      await finalBidContract.connect(user1).placeBid(zeroAddress);

      const user1BalanceAfterBid = await dummyUsdcContract.balanceOf(user1.address);

      await finalBidContract.connect(user2).placeBid(zeroAddress);

      const user1BalanceAfterNextBid = await dummyUsdcContract.balanceOf(user1.address);

      expect(user1BalanceAfterNextBid).to.be.greaterThan(user1BalanceAfterBid);
    });

    it("Should allow the owner to withdraw the platform fees", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const zeroAddress = "0x0000000000000000000000000000000000000000";

      await finalBidContract.connect(user1).placeBid(zeroAddress);
      await finalBidContract.connect(user2).placeBid(zeroAddress);
      await finalBidContract.connect(user3).placeBid(zeroAddress);

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

      // call as user1
      await finalBidContract.connect(user1).placeBid(zeroAddress);

      let auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(1000000);

      // call as user2
      await finalBidContract.connect(user2).placeBid(user1);

      auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(1000000 + Number(bidIncrement));

      // get user1 balance
      const user1BalanceBefore = await dummyUsdcContract.balanceOf(user1.address);
      // call as user3
      await finalBidContract.connect(user3).placeBid(user1);

      auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(1000000 + Number(bidIncrement) * 2);

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
      await finalBidContract.connect(user1).placeBid(user1.address);

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
        await finalBidContract.connect(user1).placeBid(zeroAddress);
        await finalBidContract.connect(user2).placeBid(zeroAddress);
        await finalBidContract.connect(user3).placeBid(zeroAddress);
      }

      const auction = await finalBidContract.auctions(1);

      const increaseTime = Number(auction.endTime - auction.startTime) + 10;
      await ethers.provider.send("evm_increaseTime", [increaseTime]);
      await ethers.provider.send("evm_mine");

      const ownerBalanceBefore = await dummyUsdcContract.balanceOf(owner.address);
      const platformFeesClaimedBefore = await finalBidContract.platformFeesClaimed();

      await finalBidContract.endAuction();
      await finalBidContract.startAuction();

      const ownerBalanceAfter = await dummyUsdcContract.balanceOf(owner.address);
      const platformFeesClaimedAfter = await finalBidContract.platformFeesClaimed();

      expect(ownerBalanceAfter).to.be.greaterThan(ownerBalanceBefore);
      expect(platformFeesClaimedAfter).to.be.greaterThan(platformFeesClaimedBefore);
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
      await expect((finalBidContract.connect(user1) as any).setReferralFee(1)).to.be.reverted;
      // greater than platformFee should revert
      await expect((finalBidContract as any).setReferralFee(platformFee + 1n)).to.be.revertedWith(
        "referralFee cannot exceed platformFee",
      );
      // equal should work
      await (finalBidContract as any).setReferralFee(platformFee);
      expect(await finalBidContract.referralFee()).to.equal(platformFee);
      // less should work
      await (finalBidContract as any).setReferralFee(platformFee - 1n);
      expect(await finalBidContract.referralFee()).to.equal(platformFee - 1n);
    });

    it("Platform fee > 0 and cannot be set below current referralFee; only owner can set", async function () {
      await expect((finalBidContract.connect(user1) as any).setPlatformFee(100)).to.be.reverted;
      await expect((finalBidContract as any).setPlatformFee(0)).to.be.revertedWith("platformFee must be > 0");

      // set referralFee to some value, then attempt lowering platformFee below it
      await (finalBidContract as any).setReferralFee(500000); // 0.5 USDC
      await expect((finalBidContract as any).setPlatformFee(499999)).to.be.revertedWith(
        "referralFee cannot exceed platformFee",
      );

      await (finalBidContract as any).setPlatformFee(1500000); // 1.5 USDC
      expect(await finalBidContract.platformFee()).to.equal(1500000);
    });
  });
});
