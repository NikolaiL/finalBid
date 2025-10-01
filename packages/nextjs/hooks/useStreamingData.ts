import { useEffect, useMemo, useState } from "react";
import { getServerTime, useServerTimeDrift } from "~~/lib/global-time";
import { createAllStreamingDataQueryOptions, createAuctionDataQueryOptions } from "~~/lib/streaming-query";
import { useDataLiveQuery } from "~~/lib/useDataLiveQuery";

const TOKEN_DECIMALS = (() => {
  const parsed = parseInt(process.env.NEXT_PUBLIC_TOKEN_DECIMALS ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 18;
})();

// Centralized computation for an auction: calculates all participants once per tick
const useComputedStreamingForAuction = (auctionId: bigint | undefined) => {
  useServerTimeDrift();

  const [currentTime, setCurrentTime] = useState(Date.now());

  const allStreamingDataQuery = useDataLiveQuery(createAllStreamingDataQueryOptions(auctionId ?? null));
  const auctionDataQuery = useDataLiveQuery(createAuctionDataQueryOptions(auctionId ?? null));

  const computedArray = useMemo(() => {
    const allStreamingData = (allStreamingDataQuery?.data as any) || [];
    const auctionData = (auctionDataQuery?.data as any)?.[0];

    return allStreamingData
      .map((data: any) => {
        const { units, balance, flowRate, lastUpdated } = data;

        let calculatedAmount = 0n as bigint;
        if (units === 0n) {
          calculatedAmount = balance ?? 0n;
        } else {
          const streamingEndTime = auctionData?.streamingEndTime;

          if (!streamingEndTime || !lastUpdated || !flowRate) {
            calculatedAmount = balance ?? 0n;
          } else {
            const streamingEndTimeMs = Number(streamingEndTime) * 1000;
            const lastUpdatedMs = Number(lastUpdated) * 1000;

            if (isNaN(streamingEndTimeMs) || isNaN(lastUpdatedMs)) {
              calculatedAmount = balance ?? 0n;
            } else {
              const calculateUntilMs = Math.min(currentTime, streamingEndTimeMs);
              const timeSinceUpdateMs = Math.max(0, calculateUntilMs - lastUpdatedMs);

              const flowRatePerMs = Number(flowRate) / 1000;
              const additionalStreaming = flowRatePerMs * timeSinceUpdateMs;
              const currentStreamingAmount = Number(balance ?? 0n) * 1000 + additionalStreaming;

              if (isNaN(currentStreamingAmount)) {
                calculatedAmount = balance ?? 0n;
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
      .sort((a: any, b: any) => {
        if (a.calculatedAmount === b.calculatedAmount) return 0;
        return a.calculatedAmount > b.calculatedAmount ? -1 : 1;
      });
  }, [allStreamingDataQuery?.data, auctionDataQuery?.data, currentTime]);

  const addressMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const entry of computedArray) {
      const key = (entry.address as string)?.toLowerCase?.() ?? "";
      if (key) map[key] = entry;
    }
    return map;
  }, [computedArray]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getServerTime());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return { computedArray, addressMap } as const;
};

export const useStreamingData = (address: string, auctionId: bigint | undefined) => {
  const { addressMap } = useComputedStreamingForAuction(auctionId);

  const key = address?.toLowerCase?.() ?? "";
  const entry = key ? addressMap[key] : undefined;

  const streamingAmount = entry?.calculatedAmount ?? 0n;
  const streamingAmountDisplay = entry?.streamingAmountDisplay ?? 0;
  const streamingData = entry;

  return {
    streamingAmount,
    streamingAmountDisplay,
    streamingData,
  };
};

// Hook to get all streaming data for an auction (useful for leaderboards, etc.)
export const useAllStreamingData = (auctionId: bigint | undefined) => {
  const { computedArray } = useComputedStreamingForAuction(auctionId);

  return {
    streamingData: computedArray,
    totalParticipants: computedArray.length,
  };
};
