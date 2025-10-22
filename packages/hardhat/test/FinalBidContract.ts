import { expect } from "chai";
import hre from "hardhat";
import { FinalBidContract, DummyTokenContract } from "../typechain-types";

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
  let dummyTokenContract: DummyTokenContract;
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
    const initialSupply = 1000;

    const dummyTokenContractFactory = await ethers.getContractFactory("DummyTokenContract");
    dummyTokenContract = (await dummyTokenContractFactory.deploy(
      owner.address,
      initialSupply,
      "Dummy Token",
      "dTOKEN",
    )) as DummyTokenContract;
    await dummyTokenContract.waitForDeployment();

    const tokenAddress = await dummyTokenContract.getAddress();

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

    await finalBidContract.setNewAuctionIsAllowed();

    // mint 1000 USDC to user1, user2, user3, contract
    await dummyTokenContract.mint(user1.address, ethers.parseEther("1000000")); // 1,000 USDC
    await dummyTokenContract.mint(user2.address, ethers.parseEther("1000000")); // 1,000 USDC
    await dummyTokenContract.mint(user3.address, ethers.parseEther("1000000")); // 1,000 USDC
    await dummyTokenContract.mint(finalBidContract.target, ethers.parseEther("1000000"));

    // allowance for users to spend 1,000 Degen
    await dummyTokenContract.connect(user1).approve(finalBidContract.target, ethers.parseEther("1000000"));
    await dummyTokenContract.connect(user2).approve(finalBidContract.target, ethers.parseEther("1000000"));
    await dummyTokenContract.connect(user3).approve(finalBidContract.target, ethers.parseEther("1000000"));
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

    it("Should revert if the balance is below the minimum amount", async function () {
      // burn everything from the contract
      const balanceBefore = await dummyTokenContract.balanceOf(finalBidContract.target);
      await dummyTokenContract.connect(owner).burnFrom(finalBidContract.target, balanceBefore);

      const balance = ethers.parseEther("0.05"); // 0.5 USDC
      await dummyTokenContract.mint(finalBidContract.target, balance);

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

      const referralAddress = user2.address;

      const bidFee = await finalBidContract.bidFee();
      const referralFee = await finalBidContract.referralFee();
      //const deployerFee = await finalBidContract.deployerFee();
      const expectedPlatformFee = bidFee - referralFee; // (removed) - deployerFee;

      const balanceBefore = await dummyTokenContract.balanceOf(finalBidContract.target);

      // Generate access token for user1
      const accessToken = await generateAccessToken(serverPrivateKey, user1.address, 1n);

      // call as user1
      await finalBidContract.connect(user1).placeBid(accessToken, referralAddress);
      const auction = await finalBidContract.auctions(1);

      expect(auction.highestBidder).to.equal(user1.address);
      expect(auction.bidCount).to.equal(1);

      // Calculate expected total: bid amount + platform fee
      const actualBalanceIncrease = (await dummyTokenContract.balanceOf(finalBidContract.target)) - balanceBefore;
      //const expectedTotal = 200000 + Number(platformFee);
      //console.log("Platform fee:", Number(platformFee));
      //console.log("Expected total:", expectedTotal);
      //console.log("Actual balance increase:", Number(actualBalanceIncrease));
      expect(actualBalanceIncrease).to.equal(expectedPlatformFee); // Actual value from contract
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
  });

  describe("Referral Rewards", function () {
    it("Should grant referral rewards to the referral address", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const zeroAddress = "0x0000000000000000000000000000000000000000";

      // Generate access tokens for all users
      const accessToken1 = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      const accessToken2 = await generateAccessToken(serverPrivateKey, user2.address, 1n);
      const accessToken3 = await generateAccessToken(serverPrivateKey, user3.address, 1n);

      // call as user1
      await finalBidContract.connect(user1).placeBid(accessToken1, zeroAddress);

      //const startingAmount = await finalBidContract.startingAmount();

      //let auction = await finalBidContract.auctions(1);

      // call as user2
      await finalBidContract.connect(user2).placeBid(accessToken2, user1);

      auction = await finalBidContract.auctions(1);

      // get user1 balance
      const user1BalanceBefore = await dummyTokenContract.balanceOf(user1.address);
      // call as user3
      await finalBidContract.connect(user3).placeBid(accessToken3, user1);

      auction = await finalBidContract.auctions(1);

      // check the user1 balance
      const user1BalanceAfter = await dummyTokenContract.balanceOf(user1.address);
      expect(user1BalanceAfter).to.be.greaterThan(user1BalanceBefore);
    });

    it("Should not grant referral rewards to the bidder", async function () {
      await finalBidContract.startAuction();
      expect(await finalBidContract.auctionId()).to.equal(1);

      const auction = await finalBidContract.auctions(1);

      // calculate bid amount + platform fee
      const bidAmount = Number(auction.bidFee);

      // get user1 balance
      const user1BalanceBefore = await dummyTokenContract.balanceOf(user1.address);

      // Generate access token for user1
      const accessToken = await generateAccessToken(serverPrivateKey, user1.address, 1n);
      await finalBidContract.connect(user1).placeBid(accessToken, user1.address);

      // check the user1 balance
      const user1BalanceAfter = await dummyTokenContract.balanceOf(user1.address);

      expect(Number(user1BalanceAfter)).to.equal(Number(user1BalanceBefore) - bidAmount);
    });
  });

  describe("Admin Setters", function () {
    it("Only owner can set startingAmount and validation works", async function () {
      await expect((finalBidContract.connect(user1) as any).setStartingAmount(123)).to.be.reverted;
      await expect((finalBidContract as any).setStartingAmount(0)).to.be.revertedWith("startingAmount must be > 0");
      await (finalBidContract as any).setStartingAmount(123456);
      expect(await finalBidContract.startingAmount()).to.equal(123456);
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

    it("Referral fee must be <= platform fee; only owner can set", async function () {
      const bidFee = await finalBidContract.bidFee();
      const deployerFee = await finalBidContract.deployerFee();
      await expect((finalBidContract.connect(user1) as any).setReferralFee(1)).to.be.reverted;
      // greater than platformFee should revert
      await expect((finalBidContract as any).setReferralFee(bidFee + 1n)).to.be.revertedWith(
        "referralFee + deployerFee cannot exceed bidFee",
      );
      // equal should work
      await (finalBidContract as any).setReferralFee(bidFee - deployerFee);
      expect(await finalBidContract.referralFee()).to.equal(bidFee - deployerFee);
      // less should work
      await (finalBidContract as any).setReferralFee(bidFee - deployerFee - 1n);
      expect(await finalBidContract.referralFee()).to.equal(bidFee - deployerFee - 1n);
    });

    it("Bid fee > 0 and cannot be set below current referralFee; only owner can set", async function () {
      await expect((finalBidContract.connect(user1) as any).setBidFee(100)).to.be.reverted;
      await expect((finalBidContract as any).setBidFee(0)).to.be.revertedWith("bidFee must be > 0");

      const referralFee = await finalBidContract.referralFee();
      const deployerFee = await finalBidContract.deployerFee();
      //const platformFee = await finalBidContract.platformFee();

      // set referralFee to some value, then attempt lowering platformFee below it
      await (finalBidContract as any).setReferralFee(referralFee / 2n); // 0.05 USDC

      await expect((finalBidContract as any).setBidFee(referralFee / 2n - 10n)).to.be.revertedWith(
        "referralFee + deployerFee cannot exceed bidFee",
      );

      await (finalBidContract as any).setBidFee(referralFee + deployerFee + 1n);
      expect(await finalBidContract.bidFee()).to.equal(referralFee + deployerFee + 1n);
    });

    it("Deployer fee must be <= platform fee - referral fee; only owner can set", async function () {
      const bidFee = await finalBidContract.bidFee();
      const referralFee = await finalBidContract.referralFee();
      await expect((finalBidContract.connect(user1) as any).setDeployerFee(100)).to.be.reverted;
      await expect((finalBidContract as any).setDeployerFee(bidFee + 1n)).to.be.revertedWith(
        "referralFee + deployerFee cannot exceed bidFee",
      );
      await (finalBidContract as any).setDeployerFee(bidFee - referralFee);
      expect(await finalBidContract.deployerFee()).to.equal(bidFee - referralFee);
      await (finalBidContract as any).setDeployerFee(bidFee - referralFee - 1n);
      expect(await finalBidContract.deployerFee()).to.equal(bidFee - referralFee - 1n);
    });
  });
});
