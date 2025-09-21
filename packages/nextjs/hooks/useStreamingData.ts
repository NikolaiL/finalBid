import { useEffect, useMemo, useState } from "react";
import { getServerTime, useServerTimeDrift } from "~~/lib/global-time";
import { createAllStreamingDataQueryOptions, createAuctionDataQueryOptions } from "~~/lib/streaming-query";
import { useDataLiveQuery } from "~~/lib/useDataLiveQuery";

const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS) ?? 18;

export const useStreamingData = (address: string, auctionId: bigint | undefined) => {
  // Initialize server time drift calculation
  useServerTimeDrift();

  const [currentTime, setCurrentTime] = useState(Date.now());

  // Query all streaming data for the auction (single query)
  const allStreamingDataQuery = useDataLiveQuery(createAllStreamingDataQueryOptions(auctionId ?? null));

  // Find streaming data for the specific address
  const streamingData = useMemo(() => {
    const allData = (allStreamingDataQuery?.data as any) || [];
    return allData.find((data: any) => data.address.toLowerCase() === address.toLowerCase());
  }, [allStreamingDataQuery?.data, address]);

  // Get auction data to access streamingEndTime
  const auctionDataQuery = useDataLiveQuery(createAuctionDataQueryOptions(auctionId ?? null));

  const auctionData = (auctionDataQuery?.data as any)?.[0];

  // Calculate the actual streaming amount with millisecond precision
  const streamingAmount = useMemo(() => {
    if (!streamingData) return 0n;

    // Use the streaming data from Ponder to calculate current amount
    const { units, balance, flowRate, lastUpdated } = streamingData;

    // If no streaming units, return balance
    if (units === 0n) return balance;

    // Get streaming end time from auction data
    const streamingEndTime = auctionData?.streamingEndTime;

    // Validate that we have all required data
    if (!streamingEndTime || !lastUpdated || !flowRate) {
      return balance || 0n;
    }

    // Calculate additional streaming since last update, but cap at streaming end time
    const streamingEndTimeMs = Number(streamingEndTime) * 1000;
    const lastUpdatedMs = Number(lastUpdated) * 1000;

    // Validate that the numbers are valid
    if (isNaN(streamingEndTimeMs) || isNaN(lastUpdatedMs)) {
      return balance || 0n;
    }

    // Calculate until current time or streaming end time, whichever is earlier
    const calculateUntilMs = Math.min(currentTime, streamingEndTimeMs);
    const timeSinceUpdateMs = Math.max(0, calculateUntilMs - lastUpdatedMs);

    const flowRatePerMs = Number(flowRate) / 1000;
    const additionalStreaming = flowRatePerMs * timeSinceUpdateMs;

    // Current balance plus accumulated streaming since last update
    const currentStreamingAmount = Number(balance) * 1000 + additionalStreaming;

    // Validate the final calculation
    if (isNaN(currentStreamingAmount)) {
      return balance || 0n;
    }

    // Divide by 1000 to account for the precision multiplier used in the contract
    return BigInt(Math.floor(currentStreamingAmount / 1000));
  }, [streamingData, currentTime, auctionData]);

  // Convert to display value
  const streamingAmountDisplay = useMemo(() => {
    return Number(streamingAmount) / 10 ** TOKEN_DECIMALS;
  }, [streamingAmount]);

  // Update current time every 100ms with blockchain synchronization
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getServerTime());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return {
    streamingAmount,
    streamingAmountDisplay,
    streamingData,
  };
};

// Hook to get all streaming data for an auction (useful for leaderboards, etc.)
export const useAllStreamingData = (auctionId: bigint | undefined) => {
  // Initialize server time drift calculation
  useServerTimeDrift();

  const [currentTime, setCurrentTime] = useState(Date.now());

  // Query all streaming data for the auction
  const allStreamingDataQuery = useDataLiveQuery(createAllStreamingDataQueryOptions(auctionId ?? null));

  // Get auction data to access streamingEndTime
  const auctionDataQuery = useDataLiveQuery(createAuctionDataQueryOptions(auctionId ?? null));

  // Calculate streaming amounts for all participants
  const streamingDataWithAmounts = useMemo(() => {
    const allStreamingData = (allStreamingDataQuery?.data as any) || [];
    const auctionData = (auctionDataQuery?.data as any)?.[0];

    return allStreamingData
      .map((data: any) => {
        const { units, balance, flowRate, lastUpdated } = data;

        let calculatedAmount = 0n;
        if (units === 0n) {
          calculatedAmount = balance;
        } else {
          // Get streaming end time from auction data
          const streamingEndTime = auctionData?.streamingEndTime;

          // Validate that we have all required data
          if (!streamingEndTime || !lastUpdated || !flowRate || !balance) {
            calculatedAmount = balance || 0n;
          } else {
            // Calculate additional streaming since last update, but cap at streaming end time
            const streamingEndTimeMs = Number(streamingEndTime) * 1000;
            const lastUpdatedMs = Number(lastUpdated) * 1000;

            // Validate that the numbers are valid
            if (isNaN(streamingEndTimeMs) || isNaN(lastUpdatedMs)) {
              calculatedAmount = balance || 0n;
            } else {
              // Calculate until current time or streaming end time, whichever is earlier
              const calculateUntilMs = Math.min(currentTime, streamingEndTimeMs);
              const timeSinceUpdateMs = Math.max(0, calculateUntilMs - lastUpdatedMs);

              const flowRatePerMs = Number(flowRate) / 1000;
              const additionalStreaming = flowRatePerMs * timeSinceUpdateMs;
              const currentStreamingAmount = Number(balance) * 1000 + additionalStreaming;

              // Validate the final calculation
              if (isNaN(currentStreamingAmount)) {
                calculatedAmount = balance || 0n;
              } else {
                calculatedAmount = BigInt(Math.floor(currentStreamingAmount / 1000));
              }
            }
          }
        }

        return {
          ...data,
          calculatedAmount,
          streamingAmountDisplay: Number(calculatedAmount) / 10 ** TOKEN_DECIMALS,
        };
      })
      .sort((a: any, b: any) => Number(b.calculatedAmount - a.calculatedAmount)); // Sort by amount descending
  }, [allStreamingDataQuery?.data, auctionDataQuery?.data, currentTime]);

  // Update current time every 1000ms with blockchain synchronization
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getServerTime());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    streamingData: streamingDataWithAmounts,
    totalParticipants: streamingDataWithAmounts.length,
  };
};
