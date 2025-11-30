"use client";

import { useCallback, useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";
import { useMiniapp } from "~~/components/MiniappProvider";

interface ExternalAuctionBlockProps {
  infoUrl: string;
  miniappUrl: string;
  tokenName: string;
  displayDecimals?: number;
  tokenDecimals?: number;
  className?: string;
}

const formatToken = (amount: bigint | 0n, tokenDecimals: number, displayDecimals: number): string => {
  const amountNumber = Number(amount);
  const tokenAmount = amountNumber / 10 ** tokenDecimals;
  return tokenAmount.toFixed(displayDecimals);
};

interface ExternalAuction {
  auctionId: string;
  hash: string;
  auctionAmount: string;
  startTime: string;
  endTime: string;
  streamingEndTime: string;
  startingAmount: string;
  bidIncrement: string;
  referralFee: string;
  platformFee: string;
  bidCount: number;
  highestBid: string;
  highestBidder: string;
  blockNumber: string;
  logIndex: number;
  timestamp: string;
  ended: boolean;
}

export default function ExternalAuctionBlock({
  infoUrl,
  miniappUrl,
  tokenName,
  displayDecimals = 0,
  tokenDecimals = 18,
  className = "",
}: ExternalAuctionBlockProps) {
  const { openMiniApp } = useMiniapp();

  // External auction state
  const [externalAuction, setExternalAuction] = useState<ExternalAuction | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Live ticking timestamp (updates every second)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch external auction data
  const fetchExternalAuction = useCallback(async () => {
    try {
      const response = await fetch(infoUrl);
      if (!response.ok) {
        return false;
      }
      const data: ExternalAuction = await response.json();
      setExternalAuction(data);
      console.log("fetchExternalAuction done");
      console.log(data);
      console.log(formatToken(BigInt(data?.auctionAmount ?? 0n), tokenDecimals, displayDecimals));
    } catch (error) {
      console.error("Failed to fetch external auction:", error);
    }
  }, [infoUrl, tokenDecimals, displayDecimals]);

  // Fetch external auction data on component mount
  useEffect(() => {
    fetchExternalAuction();
  }, [fetchExternalAuction]);

  // Refetch external auction data every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchExternalAuction();
    }, 5000); // 5 seconds

    return () => clearInterval(interval);
  }, [fetchExternalAuction]);

  const openExternalMiniApp = () => {
    console.log("openExternalMiniApp", miniappUrl);
    openMiniApp(miniappUrl);
  };

  // Don't render if no external auction or if it's ended
  if (!externalAuction || externalAuction.ended) {
    return null;
  }

  return (
    <div
      className={`bg-base-100 px-5 py-2 rounded-lg shadow-md shadow-secondary border border-base-300 flex flex-col gap-3 mb-2 ${className}`}
    >
      <div
        className="flex flex-row items-center justify-between gap-2 cursor-pointer"
        onClick={() => {
          openExternalMiniApp();
        }}
      >
        <div className="font-bold text-xs sm:text-lg">
          Win
          <span className="mx-2">
            <NumberFlow
              value={Number(externalAuction.auctionAmount) / 10 ** tokenDecimals}
              format={{
                notation: "standard",
                useGrouping: false,
                maximumFractionDigits: displayDecimals,
                minimumFractionDigits: displayDecimals,
              }}
            />
          </span>
          ${tokenName}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-lg">Ends in</span>
          <div className="text-xs sm:text-lg font-mono">
            <NumberFlow
              value={Math.max(0, Number(externalAuction.endTime) - Math.floor(now / 1000))}
              format={{
                notation: "standard",
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }}
            />
          </div>
          <span className="text-xs sm:text-lg">seconds</span>
        </div>
      </div>
    </div>
  );
}
