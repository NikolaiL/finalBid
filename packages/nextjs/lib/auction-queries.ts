import * as schema from "../../../packages/ponder/ponder.schema";
import { client } from "./ponder";
import { desc } from "@ponder/client";
import { getPonderQueryOptions } from "@ponder/react";

const baseLatestAuction = getPonderQueryOptions(
  client,
  db =>
    db
      .select()
      .from((schema as any).auctionCreated)
      .orderBy(desc((schema as any).auctionCreated.auctionId))
      .limit(1) as any,
);

export const latestAuctionQueryOptions = {
  ...baseLatestAuction,
  live: {
    operations: ["insert", "update", "delete"],
    // optional: batch bursts of writes
    debounceMs: 250,
  },
  refetchOnWindowFocus: false,
} as const;
