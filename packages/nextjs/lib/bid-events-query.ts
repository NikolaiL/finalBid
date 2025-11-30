import * as schema from "../../../packages/ponder/ponder.schema";
import { client } from "./ponder";
import { desc, eq } from "@ponder/client";
import { getPonderQueryOptions } from "@ponder/react";

// Function to create bid query options for a specific auction ID
export const createBidPlacedQueryOptions = (auctionId: bigint | null) => {
  if (!auctionId) {
    // Return empty query options when no auction ID is provided
    return {
      queryKey: ["bidPlaced", "empty"],
      queryFn: () => Promise.resolve([]),
    } as const;
  }

  const baseBidPlaced = getPonderQueryOptions(
    client,
    db =>
      db
        .select()
        .from((schema as any).bidPlaced)
        .where(eq((schema as any).bidPlaced.auctionId, auctionId))
        .orderBy(desc((schema as any).bidPlaced.blockNumber), desc((schema as any).bidPlaced.logIndex)) as any,
  );

  return {
    ...baseBidPlaced,
    // Ensure the query key includes the auction ID for proper cache invalidation
    queryKey: [...baseBidPlaced.queryKey, auctionId.toString()],
  } as const;
};

// Default empty query options
export const bidPlacedQueryOptions = {
  queryKey: ["bidPlaced", "empty"],
  queryFn: () => Promise.resolve([]),
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

// Wrap the queryFn to add logging
const wrappedQueryFn = async () => {
  console.log("🔍 Fetching auction created events...");
  try {
    const result = await baseAuctionCreated.queryFn();
    console.log("✅ Auction created events fetched:", {
      count: Array.isArray(result) ? result.length : "not array",
      data: result,
    });
    return result;
  } catch (error) {
    console.error("❌ Error fetching auction created events:", error);
    throw error;
  }
};

export const auctionCreatedQueryOptions = {
  ...baseAuctionCreated,
  queryFn: wrappedQueryFn,
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

const latestAuctionCreated = getPonderQueryOptions(
  client,
  db =>
    db
      .select()
      .from((schema as any).auctionCreated)
      .orderBy(desc((schema as any).auctionCreated.auctionId))
      .limit(1) as any,
);
export const latestAuctionCreatedQueryOptions = {
  ...latestAuctionCreated,
} as const;
