// @ts-nocheck
import { onchainTable, index } from "ponder";

// Tables for FinalBidContract events
export const bidPlaced = onchainTable("bidPlaced", (t) => ({
  id: t.text().primaryKey(),
  hash: t.text().notNull(),
  auctionId: t.bigint().notNull(),
  bidder: t.hex().notNull(),
  referral: t.hex().notNull(),
  endTime: t.bigint().notNull(),
  auctionAmount: t.bigint().notNull(),
  bidCount: t.bigint().notNull(),
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
  referralFee: t.bigint().notNull(),
  deployerFee: t.bigint().notNull(),
  bidFee: t.bigint().notNull(),
  // Computed fields that get updated by BidPlaced events
  bidCount: t.integer().notNull().default(0),
  highestBidder: t.hex().notNull().default("0x0000000000000000000000000000000000000000"),
  blockNumber: t.bigint().notNull(),
  logIndex: t.integer().notNull(),
  timestamp: t.bigint().notNull(),
  postHash: t.text(),
  ended: t.boolean().notNull().default(false),
}), (table) => ({
  highestBidderIdx: index().on(table.highestBidder),
}));

export const auctionEnded = onchainTable("auctionEnded", (t) => ({
  auctionId: t.bigint().primaryKey(),
  hash: t.text().notNull(),
  winner: t.hex().notNull(),
  amount: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  logIndex: t.integer().notNull(),
  timestamp: t.bigint().notNull(),
}), (table) => ({
  winnerIdx: index().on(table.winner),
}));