import * as schema from "../../../packages/ponder/ponder.schema";
import { client } from "./ponder";
import { and, desc, eq } from "@ponder/client";
import { getPonderQueryOptions } from "@ponder/react";

export const createStreamingDataQueryOptions = (auctionId: bigint | null, address: string | null) => {
  if (!auctionId || !address) {
    return {
      queryKey: ["streamingData", "empty"],
      queryFn: () => Promise.resolve(null),
    } as const;
  }

  return getPonderQueryOptions(
    client,
    db =>
      db
        .select()
        .from((schema as any).streamingData)
        .where(
          and(
            eq((schema as any).streamingData.auctionId, auctionId),
            eq((schema as any).streamingData.address, address.toLowerCase()),
          ),
        )
        .orderBy(desc((schema as any).streamingData.timestamp))
        .limit(1) as any,
  );
};

export const createAllStreamingDataQueryOptions = (auctionId: bigint | null) => {
  if (!auctionId) {
    return {
      queryKey: ["streamingData", "all", "empty"],
      queryFn: () => Promise.resolve([]),
    } as const;
  }

  return getPonderQueryOptions(
    client,
    db =>
      db
        .select()
        .from((schema as any).streamingData)
        .where(eq((schema as any).streamingData.auctionId, auctionId))
        .orderBy(desc((schema as any).streamingData.timestamp)) as any,
  );
};

export const createAuctionDataQueryOptions = (auctionId: bigint | null) => {
  if (!auctionId) {
    return {
      queryKey: ["auctionData", "empty"],
      queryFn: () => Promise.resolve(null),
    } as const;
  }

  return getPonderQueryOptions(
    client,
    db =>
      db
        .select()
        .from((schema as any).auctionCreated)
        .where(eq((schema as any).auctionCreated.auctionId, auctionId))
        .limit(1) as any,
  );
};
