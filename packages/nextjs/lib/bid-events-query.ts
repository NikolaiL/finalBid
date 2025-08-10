import * as schema from "../../../packages/ponder/ponder.schema";
import { client } from "./ponder";
import { desc } from "@ponder/client";
import { getPonderQueryOptions } from "@ponder/react";

const baseBidPlaced = getPonderQueryOptions(
  client,
  db =>
    db
      .select()
      .from((schema as any).bidPlaced)
      .orderBy(desc((schema as any).bidPlaced.blockNumber))
      .limit(500) as any,
);
export const bidPlacedQueryOptions = {
  ...baseBidPlaced,
  refetchInterval: 1000,
} as const;

const baseAuctionCreated = getPonderQueryOptions(
  client,
  db =>
    db
      .select()
      .from((schema as any).auctionCreated)
      .orderBy(desc((schema as any).auctionCreated.blockNumber))
      .limit(200) as any,
);
export const auctionCreatedQueryOptions = {
  ...baseAuctionCreated,
  refetchInterval: 1000,
} as const;

const baseAuctionEnded = getPonderQueryOptions(
  client,
  db =>
    db
      .select()
      .from((schema as any).auctionEnded)
      .orderBy(desc((schema as any).auctionEnded.blockNumber))
      .limit(200) as any,
);
export const auctionEndedQueryOptions = {
  ...baseAuctionEnded,
  refetchInterval: 1000,
} as const;
