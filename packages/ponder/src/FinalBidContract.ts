// @ts-nocheck
import { ponder } from "ponder:registry";
import { auctionCreated, auctionEnded, bidPlaced } from "ponder:schema";
import { eq, and, gt } from "drizzle-orm";

ponder.on("FinalBidContract:AuctionCreated", async ({ event, context }) => {
  await context.db.insert(auctionCreated).values({
    auctionId: event.args.auctionId,
    hash: event.transaction.hash,
    auctionAmount: event.args.auctionAmount,
    startTime: event.args.startTime,
    endTime: event.args.endTime,
    startingAmount: event.args.startingAmount,
    bidIncrement: event.args.bidIncrement,
    referralFee: event.args.referralFee,
    platformFee: event.args.platformFee,
    bidCount: 0,
    highestBid: 0n,
    highestBidder: "0x0000000000000000000000000000000000000000",
    blockNumber: BigInt(event.block.number as any),
    logIndex: Number((event.log as any)?.index ?? 0),
    timestamp: Number(event.block.timestamp),
  });
  console.log("AuctionCreated", event.args.auctionId, event.args.auctionAmount, event.args.startTime, event.args.endTime, event.args.startingAmount);
});

ponder.on("FinalBidContract:BidPlaced", async ({ event, context }) => {
  const id = `${event.transaction.hash}-${event.log.index}`;
  await context.db.insert(bidPlaced).values({
    id,
    hash: event.transaction.hash,
    auctionId: event.args.auctionId,
    bidder: event.args.bidder,
    amount: event.args.amount,
    referral: event.args.referral,
    endTime: event.args.endTime,
    blockNumber: BigInt(event.block.number as any),
    logIndex: Number((event.log as any)?.index ?? 0),
    timestamp: Number(event.block.timestamp),
  });
  await context.db.update(auctionCreated, {auctionId: event.args.auctionId}).set({
    highestBid: event.args.amount,
    highestBidder: event.args.bidder,
    endTime: event.args.endTime,
  });
  console.log("BidPlaced", event.args.auctionId, event.args.bidder, event.args.amount, event.args.referral, event.args.endTime);
});

ponder.on("FinalBidContract:AuctionEnded", async ({ event, context }) => {
  await context.db.insert(auctionEnded).values({
    auctionId: event.args.auctionId,
    hash: event.transaction.hash,
    winner: event.args.winner,
    amount: event.args.amount,
    highestBid: event.args.highestBid,
    blockNumber: BigInt(event.block.number as any),
    logIndex: Number((event.log as any)?.index ?? 0),
    timestamp: Number(event.block.timestamp),
  });
  await context.db.update(auctionCreated, {auctionId: event.args.auctionId}).set({
    ended: true,
  });
  console.log("AuctionEnded", event.args.auctionId, event.args.winner, event.args.amount, event.args.highestBid);
});


