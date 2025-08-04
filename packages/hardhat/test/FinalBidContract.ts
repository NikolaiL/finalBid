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

    // mint 1000000000000 USDC to user1
    await dummyUsdcContract.mint(user1.address, 1000000000000);
    await dummyUsdcContract.mint(user2.address, 1000000000000);
    await dummyUsdcContract.mint(user3.address, 1000000000000);

    // allowance for user1 to spend 1000000000000 USDC
    await dummyUsdcContract.connect(user1).approve(finalBidContract.target, 1000000000000);
    await dummyUsdcContract.connect(user2).approve(finalBidContract.target, 1000000000000);
    await dummyUsdcContract.connect(user3).approve(finalBidContract.target, 1000000000000);
  });

  describe("Start Auction", function () {
    it("Should allow anybody start an auction", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);
    });

    it("Should not allow anybody to start an auction if there is an active auction", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);
      await expect(finalBidContract.startAuction()).to.be.revertedWith("Auction already active");
    });

    it("Should allow anybody to launch a new auction if old one is over endtimestamp", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const auction = await finalBidContract.auctions(1);

      const increaseTime = Number(auction.endTime - auction.startTime) + 1;
      await ethers.provider.send("evm_increaseTime", [increaseTime]);
      await ethers.provider.send("evm_mine");

      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(2);
    });
  });

  describe("Place Bid", function () {
    it("Should allow anybody to place a bid", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const referralAddress = "0x0000000000000000000000000000000000000000";

      // call as user1
      await finalBidContract.connect(user1).placeBid(referralAddress);
      const auction = await finalBidContract.auctions(1);

      expect(auction.highestBidder).to.equal(user1.address);
      expect(auction.highestBid).to.equal(1000000); // 1 USD
      expect(auction.bidCount).to.equal(1);

      expect(await dummyUsdcContract.balanceOf(finalBidContract.target)).to.equal(2000000);

      // we should also expect the platformFeesCollected to be 1000000
      expect(await finalBidContract.platformFeesCollected()).to.equal(1000000);

      // we should also expect the referralRewards to be 1000000
    });
    it("Should increase the actual bid by increae amount after each bid", async function () {
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

    it("Should grant referral rewards to the referral address", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const bidIncrement = await finalBidContract.bidIncrement();
      const referralFee = await finalBidContract.referralFee();

      const zeroAddress = "0x0000000000000000000000000000000000000000";

      // call as user1
      await finalBidContract.connect(user1).placeBid(zeroAddress);

      let auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(1000000);

      // call as user2
      await finalBidContract.connect(user2).placeBid(user1);

      auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(1000000 + Number(bidIncrement));

      // call as user3
      await finalBidContract.connect(user3).placeBid(user1);

      auction = await finalBidContract.auctions(1);
      expect(auction.highestBid).to.equal(1000000 + Number(bidIncrement) * 2);

      // check the referral rewards
      expect(await finalBidContract.referralRewards(user1)).to.equal(Number(referralFee) * 2);
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
    it("Should not increase the auction duration and should finalize the auctionif the latest bet is equal or more than the auction amount", async function () {
      const zeroAddress = "0x0000000000000000000000000000000000000000";

      await finalBidContract.startAuction();

      expect(await finalBidContract.auctionId()).to.equal(1);

      let auction = await finalBidContract.auctions(1);
      let endTime = Number(auction.endTime);

      const increaseTime = Number(auction.endTime - auction.startTime) - 10;
      await ethers.provider.send("evm_increaseTime", [increaseTime]);
      await ethers.provider.send("evm_mine");

      while (Number(auction.highestBid) < Number(auction.auctionAmount)) {
        endTime = Number(auction.endTime);
        await finalBidContract.connect(user1).placeBid(zeroAddress);
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

      auction = await finalBidContract.auctions(1);

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

    it("Should allow the referral to withdraw the referral rewards", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      await finalBidContract.connect(user2).placeBid(user1.address);
      await finalBidContract.connect(user3).placeBid(user1.address);

      const user1BalanceBeforeWithdraw = await dummyUsdcContract.balanceOf(user1.address);

      await finalBidContract.connect(user1).withdrawReferralRewards();

      const user1BalanceAfterWithdraw = await dummyUsdcContract.balanceOf(user1.address);

      expect(user1BalanceAfterWithdraw).to.be.greaterThan(user1BalanceBeforeWithdraw);
    });
  });
});
