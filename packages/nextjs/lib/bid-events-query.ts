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
      .orderBy(desc((schema as any).bidPlaced.blockNumber), desc((schema as any).bidPlaced.logIndex))
      .limit(20) as any,
);
export const bidPlacedQueryOptions = {
  ...baseBidPlaced,
} as const;

const baseAuctionCreated = getPonderQueryOptions(
  client,
  db =>
    db
      .select()
      .from((schema as any).auctionCreated)
      .orderBy(desc((schema as any).auctionCreated.blockNumber), desc((schema as any).auctionCreated.logIndex))
      .limit(20) as any,
);
export const auctionCreatedQueryOptions = {
  ...baseAuctionCreated,
} as const;

const baseAuctionEnded = getPonderQueryOptions(
  client,
  db =>
    db
      .select()
      .from((schema as any).auctionEnded)
      .orderBy(desc((schema as any).auctionEnded.blockNumber), desc((schema as any).auctionEnded.logIndex))
      .limit(20) as any,
);
export const auctionEndedQueryOptions = {
  ...baseAuctionEnded,
} as const;
