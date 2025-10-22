"use client";

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { latestAuctionCreatedQueryOptions } from "~~/lib/bid-events-query";
import { useDataLiveQuery } from "~~/lib/useDataLiveQuery";

const DISPLAY_DECIMALS = Number(process.env.NEXT_PUBLIC_DISPLAY_DECIMALS) ?? 2;

const ERC20_METADATA_ABI = [
  { inputs: [], name: "symbol", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8" }], stateMutability: "view", type: "function" },
] as const;

function formatToken(amount: bigint | 0n, decimals: number): string {
  const amountNumber = Number(amount);
  const tokenAmount = amountNumber / 10 ** (decimals || 0);
  return tokenAmount.toFixed(DISPLAY_DECIMALS);
}

export default function AboutPage() {
  // Read token address from contract
  const { data: deployerFee } = useScaffoldReadContract({
    contractName: "FinalBidContract",
    functionName: "deployerFee",
  });

  const { data: tokenAddress } = useScaffoldReadContract({
    contractName: "FinalBidContract",
    functionName: "tokenAddress",
  });

  // Read token symbol/decimals
  const { data: tokenSymbol } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_METADATA_ABI,
    functionName: "symbol",
    query: { enabled: !!tokenAddress },
  });
  const { data: tokenDecimalsRaw } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_METADATA_ABI,
    functionName: "decimals",
    query: { enabled: !!tokenAddress },
  });
  const tokenDecimals = Number(tokenDecimalsRaw ?? 6);

  // Live: latest auction (to get bidFee & referralFee values currently in-play)
  const latestAuctionQuery: any = useDataLiveQuery(latestAuctionCreatedQueryOptions as any);
  const latestAuction = useMemo(() => (latestAuctionQuery?.data ?? [])[0], [latestAuctionQuery?.data]);

  // Fallback to contract-level values if event missing
  const bidFee = (latestAuction?.bidFee as bigint) ?? (0n as bigint);
  const referralFee = (latestAuction?.referralFee as bigint) ?? (0n as bigint);

  const referralFeePercentage = Math.round((Number(referralFee) / Number(bidFee)) * 100);
  const deployerFeePercentage = Math.round((Number(deployerFee) / Number(bidFee)) * 100);
  const nextPrizePercentage = Math.round(100 - referralFeePercentage - deployerFeePercentage);

  // Read auctionDurationIncrease directly from contract (seconds)
  const { data: auctionDurationIncrease } = useScaffoldReadContract({
    contractName: "FinalBidContract",
    functionName: "auctionDurationIncrease",
  });

  return (
    <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 lg:px-6">
      <div className="flex flex-col gap-4 py-6">
        <div className="bg-base-100 p-6 rounded-3xl shadow-md shadow-secondary border border-base-300">
          <h2 className="text-2xl font-extrabold mb-2 text-primary">About FireBid on Celo</h2>
          <p className="text-base leading-relaxed mb-3">
            FireBid on Celo is an experiment miniApp, an implementation of fomo3d, powered by a smart contract on the
            Celo network. It’s built with Scaffold-ETH 2 and designed to run as a Farcaster Mini App.
          </p>
          <h3 className="text-xl font-bold mt-8 mb-4 text-primary">How it works</h3>
          <ul className="list-disc ml-6 space-y-2">
            <li>
              <span className="font-semibold">Latest person to click the button wins the entire prize pot</span>
            </li>
            <li>
              Each click costs
              <span className="font-bold mx-1">
                {formatToken(bidFee || 0n, tokenDecimals)} {String(tokenSymbol ?? "")}
              </span>
              and increases the prize pot by {nextPrizePercentage}% of the fee. The rest goes to referrals (
              {referralFeePercentage}%) and platform costs ({deployerFeePercentage}%).
            </li>
            <li>
              Share your link and earn a referral reward of
              <span className="font-bold mx-1">
                {formatToken(referralFee || 0n, tokenDecimals)} {String(tokenSymbol ?? "")}
              </span>
              for every button click made through it.
            </li>
            <li>
              If the remaining time is below
              <span className="font-bold mx-1">{Number(auctionDurationIncrease ?? 0)} seconds</span>
              when a new bid arrives, the auction timer is set to {Number(auctionDurationIncrease ?? 0)} seconds to keep
              things exciting.
            </li>
          </ul>
          <p className="text-base mt-8 text-center mt-6">🔑 Please play responsibly!</p>
          <p className="text-base mt-8 text-center">Have fun! 🚀🚀🚀</p>
        </div>
      </div>
    </div>
  );
}
