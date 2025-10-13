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

  // Live: latest auction (to get platformFee & referralFee values currently in-play)
  const latestAuctionQuery: any = useDataLiveQuery(latestAuctionCreatedQueryOptions as any);
  const latestAuction = useMemo(() => (latestAuctionQuery?.data ?? [])[0], [latestAuctionQuery?.data]);

  // Fallback to contract-level values if event missing
  const platformFee = (latestAuction?.platformFee as bigint) ?? (0n as bigint);
  const referralFee = (latestAuction?.referralFee as bigint) ?? (0n as bigint);

  const referralFeePercentage = Math.round((Number(referralFee) / Number(platformFee)) * 100);
  const deployerFeePercentage = Math.round((Number(deployerFee) / Number(platformFee)) * 100);
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
          <h2 className="text-2xl font-extrabold mb-2 text-primary">About FireBid</h2>
          <p className="text-base leading-relaxed mb-3">
            FireBid is an experiment miniApp, an implementation of penny auction, powered by a smart contract on the
            Celo network. It’s built with Scaffold-ETH 2 and designed to run as a Farcaster Mini App.
          </p>
          <h3 className="text-xl font-bold mt-8 mb-4 text-primary">How it works</h3>
          <ul className="list-disc ml-6 space-y-2">
            <li>
              <span className="font-semibold">Highest bid wins 1/2 of the prize pot</span> — the final top bidder
              receives 1/2 of the prize pot.
            </li>
            <li>
              <span className="font-semibold">
                The other 1/2 of the prize pot is streamed to the last 10 bidders, based on their bid amount -{" "}
              </span>
              bid early to start your stream, bid often to increase it.
            </li>
            <li>If you’re outbid, your bid is immediately returned to you on the next bid.</li>
            <li>
              There’s a bidding fee of
              <span className="font-bold mx-1">
                {formatToken(platformFee || 0n, tokenDecimals)} {String(tokenSymbol ?? "")}
              </span>
              per bid. This fee is not refunded. {nextPrizePercentage}% of the fee is used to provide the next auction
              prize. {referralFeePercentage}% is paid to referrals. {deployerFeePercentage}% is used to pay for the
              platform, server costs, and other expenses.
            </li>
            <li>
              Share your link and earn a referral reward of
              <span className="font-bold mx-1">
                {formatToken(referralFee || 0n, tokenDecimals)} {String(tokenSymbol ?? "")}
              </span>
              for every bid placed through it.
            </li>
            <li>
              If the remaining time is below
              <span className="font-bold mx-1">{Number(auctionDurationIncrease ?? 0)} seconds</span>
              when a new bid arrives, the auction extends by {Number(auctionDurationIncrease ?? 0)} seconds to keep
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
