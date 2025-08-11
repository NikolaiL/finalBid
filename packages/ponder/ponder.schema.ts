// @ts-nocheck
import { onchainTable, index } from "ponder";

// Tables for FinalBidContract events
export const bidPlaced = onchainTable("bidPlaced", (t) => ({
  id: t.text().primaryKey(),
  hash: t.text().notNull(),
  auctionId: t.bigint().notNull(),
  bidder: t.hex().notNull(),
  amount: t.bigint().notNull(),
  referral: t.hex().notNull(),
  endTime: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  logIndex: t.integer().notNull(),
  timestamp: t.bigint().notNull(),
}), (table) => ({
  auctionIdx: index().on(table.auctionId),
  bidderIdx: index().on(table.bidder),
}));

export const auctionCreated = onchainTable("auctionCreated", (t) => ({
  auctionId: t.bigint().primaryKey(),
  hash: t.text().notNull(),
  auctionAmount: t.bigint().notNull(),
  startTime: t.bigint().notNull(),
  endTime: t.bigint().notNull(),
  startingAmount: t.bigint().notNull(),
  highestBid: t.bigint().notNull(),
  highestBidder: t.hex().notNull(),
  blockNumber: t.bigint().notNull(),
  logIndex: t.integer().notNull(),
  timestamp: t.bigint().notNull(),
  ended: t.boolean().notNull().default(false),
}), (table) => ({
  highestBidderIdx: index().on(table.highestBidder),
}));

export const auctionEnded = onchainTable("auctionEnded", (t) => ({
  auctionId: t.bigint().primaryKey(),
  hash: t.text().notNull(),
  winner: t.hex().notNull(),
  amount: t.bigint().notNull(),
  highestBid: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  logIndex: t.integer().notNull(),
  timestamp: t.bigint().notNull(),
}), (table) => ({
  winnerIdx: index().on(table.winner),
}));


