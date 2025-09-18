import { useEffect, useMemo, useState } from "react";
import { useScaffoldReadContract } from "./scaffold-eth/useScaffoldReadContract";

const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS) ?? 18;

// Helper function to calculate streaming amount for a given address with millisecond precision
const calculateStreamingAmount = (
  address: string,
  streamingData: any,
  auctionData: any,
  currentTime: number,
): bigint => {
  if (!streamingData || !auctionData) return 0n;

  const [units, balance, flowRate, lastUpdated] = streamingData as [bigint, bigint, bigint, bigint];
  const [, , , streamingEndTime, , , , , , , ,] = auctionData as [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    string,
    bigint,
    boolean,
  ];

  // If no streaming units, return balance
  if (units === 0n) return BigInt(balance);

  // Use precise time calculations with milliseconds
  const currentTimeMs = currentTime;
  const streamingEndTimeMs = Number(streamingEndTime) * 1000;
  const lastUpdatedMs = Number(lastUpdated) * 1000;

  // Calculate until current time or streaming end time
  const calculateUntilMs = Math.min(currentTimeMs, streamingEndTimeMs);

  // Time since last update in milliseconds
  const timeSinceUpdateMs = Math.max(0, calculateUntilMs - lastUpdatedMs);

  // Convert flow rate from per-second to per-millisecond and apply
  const flowRatePerMs = Number(flowRate) / 1000;
  const additionalStreaming = flowRatePerMs * timeSinceUpdateMs;

  // Current balance plus accumulated streaming since last update
  const currentStreamingAmount = Number(balance) * 1000 + additionalStreaming;

  // Divide by 1000 to account for the precision multiplier used in the contract
  return BigInt(Math.floor(currentStreamingAmount / 1000));
};

export const useStreamingData = (address: string, auctionId: bigint | undefined) => {
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Read streaming data for this address
  const { data: streamingData } = useScaffoldReadContract({
    contractName: "FinalBidContract",
    functionName: "streamings",
    args: [address as `0x${string}`],
    watch: true,
    query: {
      staleTime: 2000, // 2 seconds stale time for streaming data
    },
  });

  // Read current auction data
  const { data: auctionData } = useScaffoldReadContract({
    contractName: "FinalBidContract",
    functionName: "auctions",
    args: [auctionId || 0n],
    watch: true,
    query: {
      staleTime: 5000, // 5 seconds stale time for auction data
    },
  });

  // Read total streaming units
  const { data: totalStreamingUnits } = useScaffoldReadContract({
    contractName: "FinalBidContract",
    functionName: "streamingUnits",
    watch: true,
    query: {
      staleTime: 10000, // 10 seconds stale time for streaming units
    },
  });

  // Calculate the actual streaming amount with millisecond precision
  const streamingAmount = useMemo(() => {
    if (!streamingData || !auctionData || !totalStreamingUnits) return 0n;
    return calculateStreamingAmount(address, streamingData, auctionData, currentTime);
  }, [streamingData, auctionData, address, currentTime, totalStreamingUnits]);

  // Convert to display value
  const streamingAmountDisplay = useMemo(() => {
    return Number(streamingAmount) / 10 ** TOKEN_DECIMALS;
  }, [streamingAmount]);

  // Update current time every 100ms (10fps) instead of 16ms (60fps) for better performance
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 100);
    return () => clearInterval(interval);
  }, []);

  return {
    streamingAmount,
    streamingAmountDisplay,
    streamingData,
    auctionData,
    totalStreamingUnits,
  };
};
