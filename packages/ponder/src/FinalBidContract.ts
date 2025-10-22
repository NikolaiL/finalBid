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
    referralFee: event.args.referralFee,
    deployerFee: event.args.deployerFee,
    bidFee: event.args.bidFee,
    bidCount: 0,
    highestBidder: "0x0000000000000000000000000000000000000000",
    blockNumber: BigInt(event.block.number as any),
    logIndex: Number((event.log as any)?.index ?? 0),
    timestamp: BigInt(event.block.timestamp),
  });
  console.log("AuctionCreated", event.args.auctionId, event.args.auctionAmount, event.args.startTime, event.args.endTime);
});

ponder.on("FinalBidContract:BidPlaced", async ({ event, context }) => {
  const id = `${event.transaction.hash}-${event.log.index}`;
  await context.db.insert(bidPlaced).values({
    id,
    hash: event.transaction.hash,
    auctionId: event.args.auctionId,
    bidder: event.args.bidder,
    referral: event.args.referral,
    endTime: event.args.endTime,
    auctionAmount: event.args.auctionAmount,
    bidCount: event.args.bidCount,
    blockNumber: BigInt(event.block.number as any),
    logIndex: Number((event.log as any)?.index ?? 0),
    timestamp: BigInt(event.block.timestamp),
  });
  await context.db.update(auctionCreated, {auctionId: event.args.auctionId}).set({
    auctionAmount: event.args.auctionAmount,
    highestBidder: event.args.bidder,
    endTime: event.args.endTime,
    bidCount: Number(event.args.bidCount),
  });
  console.log("BidPlaced", event.args.auctionId, event.args.bidder, event.args.auctionAmount, event.args.referral, event.args.endTime);
});

ponder.on("FinalBidContract:AuctionEnded", async ({ event, context }) => {
  await context.db.insert(auctionEnded).values({
    auctionId: event.args.auctionId,
    hash: event.transaction.hash,
    winner: event.args.winner,
    amount: event.args.amount,
    blockNumber: BigInt(event.block.number as any),
    logIndex: Number((event.log as any)?.index ?? 0),
    timestamp: BigInt(event.block.timestamp),
  });
  await context.db.update(auctionCreated, {auctionId: event.args.auctionId}).set({
    ended: true,
  });
  console.log("AuctionEnded", event.args.auctionId, event.args.winner, event.args.amount);
});


