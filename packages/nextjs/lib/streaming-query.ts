import * as schema from "../../../packages/ponder/ponder.schema";
import { client } from "./ponder";
import { desc, eq } from "@ponder/client";
import { getPonderQueryOptions } from "@ponder/react";

// Fallback function to fetch from API endpoint
const fetchStreamingDataFromAPI = async (auctionId: bigint) => {
  try {
    // Use environment variable or default to localhost
    const apiUrl = process.env.NEXT_PUBLIC_PONDER_URL;

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const url = `${apiUrl}/streaming-data/${auctionId.toString()}`;
    console.log("Fetching streaming data from:", url);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    const data = await response.json();
    return data || [];
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("API request timed out after 5 seconds");
    } else {
      console.warn("Failed to fetch streaming data from API:", error);
    }
    return [];
  }
};

export const createAllStreamingDataQueryOptions = (auctionId: bigint | null) => {
  if (!auctionId) {
    return {
      queryKey: ["streamingData", "all", "empty"],
      queryFn: () => Promise.resolve([]),
    } as const;
  }

  return {
    ...getPonderQueryOptions(
      client,
      db =>
        db
          .select()
          .from((schema as any).streamingData)
          .where(eq((schema as any).streamingData.auctionId, auctionId))
          .orderBy(desc((schema as any).streamingData.timestamp)) as any,
    ),
    queryFn: async () => {
      try {
        // First try the normal Ponder query
        const result = await getPonderQueryOptions(
          client,
          db =>
            db
              .select()
              .from((schema as any).streamingData)
              .where(eq((schema as any).streamingData.auctionId, auctionId))
              .orderBy(desc((schema as any).streamingData.timestamp)) as any,
        ).queryFn();

        // If we got data, return it
        if (result && result.length > 0) {
          console.log("Streaming data from Ponder query...");
          return result;
        }

        // If no data from Ponder query, try API fallback
        console.log("No streaming data from Ponder query, trying API fallback...");
        const apiData = await fetchStreamingDataFromAPI(auctionId);

        // Sort by timestamp and return all data
        const sortedData = apiData.sort((a: any, b: any) => Number(b.timestamp) - Number(a.timestamp));

        return sortedData;
      } catch (error) {
        console.warn("Ponder query failed, trying API fallback:", error);
        // If Ponder query fails completely, try API fallback
        const apiData = await fetchStreamingDataFromAPI(auctionId);
        const sortedData = apiData.sort((a: any, b: any) => Number(b.timestamp) - Number(a.timestamp));

        return sortedData;
      }
    },
  };
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
