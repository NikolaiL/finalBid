"use client";

import { useEffect, useMemo, useState } from "react";
import { auctionCreatedQueryOptions, auctionEndedQueryOptions, bidPlacedQueryOptions } from "../lib/bid-events-query";
import type { NextPage } from "next";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { MiniappUserInfo } from "~~/components/MiniappUserInfo";
import { Address, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTransactor,
} from "~~/hooks/scaffold-eth";
import { useDataLiveQuery } from "~~/lib/useDataLiveQuery";

const DISPLAY_DECIMALS = Number(process.env.NEXT_PUBLIC_DISPLAY_DECIMALS) ?? 2;
const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS) ?? 6;

// Utility function to format USDC amounts (6 decimals)
const formatToken = (amount: bigint | 0n): string => {
  const amountNumber = Number(amount);
  const tokenAmount = amountNumber / 10 ** TOKEN_DECIMALS; // 6 decimals for USDC
  return tokenAmount.toFixed(DISPLAY_DECIMALS);
};

// Global constants
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Utility to format a timestamp in seconds as a brief "time ago" (seconds/minutes)
const formatTimeAgoBrief = (nowMs: number, timestampSeconds: number | bigint): string => {
  const ts = typeof timestampSeconds === "bigint" ? Number(timestampSeconds) : timestampSeconds;
  const diffSeconds = Math.max(0, Math.floor(nowMs / 1000) - ts);
  if (diffSeconds < 60) return `${diffSeconds} seconds ago`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
};

// Inline brand icons
const XIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M18.244 2H21l-7.32 8.87L22 22h-6.4l-4.7-6.8L5.6 22H2l7.2-8.86L2 2h6.4l4.3 6.2L18.244 2z" />
  </svg>
);

const FarcasterIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 1000 1000" className={className}>
    <path
      fill="currentColor"
      d="M257.778 155.556h484.444v688.889h-71.111V528.889h-.697c-7.86-87.212-81.156-155.556-170.414-155.556-89.258 0-162.554 68.344-170.414 155.556h-.697v315.556h-71.111V155.556Z"
    ></path>
    <path
      fill="currentColor"
      d="m128.889 253.333 28.889 97.778h24.444v395.556c-12.273 0-22.222 9.949-22.222 22.222v26.667h-4.444c-12.273 0-22.223 9.949-22.223 22.222v26.667h248.889v-26.667c0-12.273-9.949-22.222-22.222-22.222h-4.444v-26.667c0-12.273-9.95-22.222-22.223-22.222h-26.666V253.333H128.889ZM675.556 746.667c-12.274 0-22.223 9.949-22.223 22.222v26.667h-4.444c-12.273 0-22.222 9.949-22.222 22.222v26.667h248.889v-26.667c0-12.273-9.95-22.222-22.223-22.222h-4.444v-26.667c0-12.273-9.949-22.222-22.222-22.222V351.111h24.444L880 253.333H702.222v493.334h-26.666Z"
    ></path>
  </svg>
);

const Home: NextPage = () => {
  const { address: connectedAddress, isConnecting, isReconnecting } = useAccount();

  const bidEventsQuery: any = useDataLiveQuery(bidPlacedQueryOptions as any);
  const BidEvents: any[] = useMemo(() => (bidEventsQuery?.data ?? []) as any[], [bidEventsQuery?.data]);

  const auctionEndedQuery: any = useDataLiveQuery(auctionEndedQueryOptions as any);
  const AuctionEndedEvents: any[] = useMemo(() => (auctionEndedQuery?.data ?? []) as any[], [auctionEndedQuery?.data]);

  // Exclude auctions with zero-address winner
  const PastAuctions = useMemo(() => {
    const zero = ZERO_ADDRESS.toLowerCase();
    return (AuctionEndedEvents || []).filter((e: any) => (e?.winner || "").toLowerCase() !== zero);
  }, [AuctionEndedEvents]);

  const auctionCreatedQuery: any = useDataLiveQuery(auctionCreatedQueryOptions as any);
  const AuctionCreatedEvents: any[] = useMemo(
    () => (auctionCreatedQuery?.data ?? []) as any[],
    [auctionCreatedQuery?.data],
  );

  const { writeContractAsync } = useScaffoldWriteContract({
    contractName: "FinalBidContract",
  });

  // Get FinalBidContract address from deployed contracts
  const { data: finalBidContractInfo } = useDeployedContractInfo({
    contractName: "FinalBidContract",
  });

  // Get token address from FinalBidContract
  const { data: tokenAddress } = useScaffoldReadContract({
    contractName: "FinalBidContract",
    functionName: "tokenAddress",
  });

  const { writeContractAsync: writeTokenContractAsync } = useWriteContract();

  // ERC20 ABI for allowance and approve functions
  const ERC20_ABI = [
    {
      inputs: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
      ],
      name: "allowance",
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      name: "approve",
      outputs: [{ name: "", type: "bool" }],
      stateMutability: "nonpayable",
      type: "function",
    },
  ];

  // Minimal ERC20 metadata ABI (symbol/name/decimals)
  const ERC20_METADATA_ABI = [
    {
      inputs: [],
      name: "symbol",
      outputs: [{ name: "", type: "string" }],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "name",
      outputs: [{ name: "", type: "string" }],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "decimals",
      outputs: [{ name: "", type: "uint8" }],
      stateMutability: "view",
      type: "function",
    },
  ] as const;

  // Read allowance using useReadContract with automatic refetching
  const { refetch: refetchAllowance } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [connectedAddress, finalBidContractInfo?.address],
    query: {
      enabled: !!tokenAddress && !!connectedAddress && !!finalBidContractInfo?.address,
    },
  });

  // Initialize useTransactor for approval transactions
  const writeApprovalTx = useTransactor();

  // State for button and transaction status
  const [isBidding, setIsBidding] = useState(false);
  const [bidStatus, setBidStatus] = useState<string>("");

  // Constants

  // Read token symbol (for rendering)
  const { data: tokenSymbol } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_METADATA_ABI,
    functionName: "symbol",
    query: { enabled: !!tokenAddress },
  });

  const latestAuction = AuctionCreatedEvents[0];
  const bidIncrement = latestAuction?.bidIncrement;
  const platformFee = latestAuction?.platformFee;

  const auctionId = latestAuction?.auctionId ?? 0;

  const nextBid = latestAuction?.highestBid
    ? (latestAuction.highestBid as bigint) + ((bidIncrement as bigint) || 0n)
    : (latestAuction?.startingAmount as bigint) || 0n;

  const isAuctionOver = latestAuction?.ended;

  // Live ticking timestamp (updates every second)
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const nowSecBig = BigInt(Math.floor(now / 1000));
  const isAcutionReadytoBeOver =
    (latestAuction?.endTime as bigint) < nowSecBig ||
    (latestAuction?.highestBid as bigint) >= (latestAuction?.auctionAmount as bigint);
  const isAuctionActive = !isAcutionReadytoBeOver && !isAuctionOver && auctionId > 0;

  const isUserHighestBidder =
    connectedAddress && latestAuction?.highestBidder?.toLowerCase() === connectedAddress?.toLowerCase();

  // Lazy-load confetti on demand to avoid SSR issues
  const launchConfetti = async () => {
    const confetti = (await import("canvas-confetti")).default;
    confetti({ particleCount: 250, spread: 100, origin: { y: 0.6 } });
    if (isUserHighestBidder) {
      await new Promise(r => setTimeout(r, 250));
      confetti({ particleCount: 250, spread: 120, origin: { y: 0.6 } });
      await new Promise(r => setTimeout(r, 250));
      confetti({ particleCount: 250, spread: 140, origin: { y: 0.6 } });
    }
  };

  // Only show bid events for current auction
  const CurrentBidEvents = useMemo(() => {
    if (!latestAuction?.auctionId) return [] as any[];
    const currentId = String(latestAuction.auctionId);
    return (BidEvents || []).filter((e: any) => String(e.auctionId) === currentId);
  }, [BidEvents, latestAuction?.auctionId]);

  // Compute required token amount for the next bid (includes platform fee)
  const calcRequiredAmount = () => {
    const nextBid = latestAuction?.highestBid
      ? (latestAuction.highestBid as bigint) + ((bidIncrement as bigint) || 0n)
      : (latestAuction?.startingAmount as bigint) || 0n;
    const required = nextBid + ((platformFee as bigint) || 0n);
    // Buffer like before to avoid tight allowances
    return required + (((bidIncrement as bigint) || 0n) + ((platformFee as bigint) || 0n)) * 2n;
  };

  // Fetch allowance as bigint
  const fetchAllowanceBig = async (): Promise<bigint> => {
    const { data } = await refetchAllowance();
    return BigInt(data as string);
  };

  // Get referrer from sessionStorage or fallback to zero
  const getReferrer = (): `0x${string}` => {
    if (typeof window === "undefined") return ZERO_ADDRESS as `0x${string}`;
    const val = sessionStorage.getItem("referrer");
    return val && /^0x[a-fA-F0-9]{40}$/.test(val) ? (val as `0x${string}`) : (ZERO_ADDRESS as `0x${string}`);
  };

  // Ensure allowance >= required; if not, approve then poll until updated
  const ensureAllowance = async (required: bigint) => {
    let allowance = await fetchAllowanceBig();
    console.log("Allowance:", allowance, "Required:", required);
    if (allowance >= required) return;
    console.log("Approving allowance...", required, "Current allowance:", allowance);
    setBidStatus("Approving allowance...");

    const approvalTx = () =>
      writeTokenContractAsync({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [finalBidContractInfo?.address, required * 2n], // buffer
      });

    await writeApprovalTx(approvalTx, {
      blockConfirmations: 1,
      successMessage: "Allowance approved!",
      awaitingConfirmationMessage: "Awaiting to approve allowance",
      waitingForTransactionMessage: "Waiting for allowance approval to complete.",
    });

    // Poll until allowance is sufficient
    // short sleep between refetches to avoid hammering RPC
    while (allowance < required) {
      await new Promise(r => setTimeout(r, 500));
      allowance = await fetchAllowanceBig();
    }
    console.log("Updated allowance:", allowance);
  };

  const handlePlaceBid = async () => {
    if (!connectedAddress) return;

    setIsBidding(true);
    setBidStatus("Checking allowance...");

    try {
      const required = calcRequiredAmount() as bigint;
      await ensureAllowance(required);

      const referrer = getReferrer();
      setBidStatus("Placing bid...");

      await writeContractAsync(
        {
          functionName: "placeBid",
          args: [referrer],
        },
        {
          onError: (error: any) => {
            // Suppress known allowance error; clear UI for others
            if (error instanceof Error && error.message.includes("Insufficient allowance")) return;
            setIsBidding(false);
            setBidStatus("");
          },
          onBlockConfirmation: (receipt: any) => {
            console.log("Bid confirmed in block:", receipt.blockNumber);
          },
          successMessage: "Bid placed!",
          blockConfirmations: 1,
        },
      );
    } catch (e) {
      console.error("handlePlaceBid error:", e);
      setIsBidding(false);
      setBidStatus("");
    } finally {
      setBidStatus("Bid placed!");
      await new Promise(r => setTimeout(r, 3000));
      setIsBidding(false);
      setBidStatus("");
    }
  };

  const currentBid = (latestAuction?.highestBid as bigint) || (latestAuction?.startingAmount as bigint) || 0n;
  const topBidderAddress = (latestAuction?.highestBidder as `0x${string}`) || (ZERO_ADDRESS as `0x${string}`);
  const secondsRemaining = (() => {
    const endTime = latestAuction?.endTime as bigint;
    if (!endTime) return 0;
    return endTime > nowSecBig ? Number(endTime - nowSecBig) : 0;
  })();

  // Loading gate: wait for initial wallet resolution and first fetch of auction-related data
  const isWalletInitializing = isConnecting || isReconnecting;
  const isLoadingApp = !!(
    bidEventsQuery?.isPending ||
    auctionCreatedQuery?.isPending ||
    auctionEndedQuery?.isPending ||
    isWalletInitializing
  );

  if (isLoadingApp) {
    return (
      <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 lg:px-6">
        <div className="flex items-center justify-center py-24">
          <span className="loading loading-spinner loading-xl text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 lg:px-6">
      <div className="flex flex-col gap-4 py-4 px-2">
        <div className="bg-base-100 p-5 rounded-3xl shadow-md shadow-secondary border border-base-300 flex flex-col gap-3">
          <div className="text-2xl font-light text-center items-center">
            Win{" "}
            <span className="mx-1 font-black text-6xl text-primary">{formatToken(latestAuction?.auctionAmount)}</span>{" "}
            {String(tokenSymbol ?? "USDC")}!
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div className="text-center sm:text-left">
              <div className="text-sm text-base-content/70">Current top bid</div>
              <div className="text-2xl font-black">{formatToken(currentBid)}</div>
              <div className="text-sm text-base-content/70"> {String(tokenSymbol ?? "USDC")}</div>
            </div>
            <div className="text-center">
              {topBidderAddress !== ZERO_ADDRESS && (
                <>
                  <div className="text-sm text-base-content/70">Top bid by</div>
                  <div className="flex justify-center">
                    <Address address={topBidderAddress} />
                  </div>
                </>
              )}
            </div>
            <div className="text-center sm:text-right">
              {isAcutionReadytoBeOver ? (
                <>
                  <div className="text-sm text-base-content/70">&nbsp;</div>
                  <div className="text-lg font-semibold">Auction Ended</div>
                </>
              ) : isAuctionOver ? (
                <>
                  <div className="text-sm text-base-content/70">&nbsp;</div>
                  <div className="text-lg font-semibold">Auction Ended</div>
                </>
              ) : (
                <>
                  <div className="text-sm text-base-content/70">Auction ends in</div>
                  <div className="text-2xl font-black">{secondsRemaining}</div>
                  <div className="text-sm text-base-content/70">seconds</div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="min-h-24 items-center justify-center flex">
          {/* Bid action */}
          {/* if address is connected */}
          {connectedAddress ? (
            <>
              <div className="rounded-lg text-center w-full">
                {latestAuction?.auctionId && isAuctionActive ? (
                  <>
                    {isUserHighestBidder ? (
                      <>
                        <div className="text-xl font-bold p-1">You are the highest bidder</div>
                        <div className="mt-1 text-gray-500 text-xs">
                          {(() => {
                            const endTime = latestAuction?.endTime as bigint;
                            const remaining = endTime > nowSecBig ? Number(endTime - nowSecBig) : 0;
                            return `Auction ends in ${remaining} seconds`;
                          })()}
                        </div>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-primary text-xl transition-all"
                          onClick={handlePlaceBid}
                          disabled={isBidding}
                        >
                          {isBidding
                            ? bidStatus
                            : `Bid ${formatToken(nextBid as unknown as bigint)} ${String(tokenSymbol ?? "")}`}
                        </button>
                        {isBidding ? (
                          <div className="mt-1 text-gray-500 text-xs">Please wait...</div>
                        ) : platformFee ? (
                          <div className="mt-1 text-gray-500 text-xs">
                            ({formatToken(platformFee as unknown as bigint)} {String(tokenSymbol ?? "")} fee applies)
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                ) : null}
                {latestAuction?.auctionId && isAcutionReadytoBeOver && !isAuctionOver ? (
                  <button
                    className="btn btn-primary text-xl"
                    onClick={async () => {
                      const receipt = await writeContractAsync(
                        { functionName: "endAuction" },
                        {
                          onBlockConfirmation: () => {
                            // no-op here; we'll launch confetti after success
                          },
                          successMessage: "Auction finalized!",
                          blockConfirmations: 1,
                        },
                      );
                      if (receipt) {
                        // fire and forget
                        launchConfetti();
                      }
                    }}
                  >
                    {isUserHighestBidder ? (
                      <span>
                        🎉 <span className="mx-2">Claim My Win!</span> 🎉
                      </span>
                    ) : (
                      "Finalize the auction"
                    )}
                  </button>
                ) : null}
                {!latestAuction?.auctionId || isAuctionOver ? (
                  <button
                    className="btn btn-primary text-xl"
                    onClick={async () => {
                      await writeContractAsync({ functionName: "startAuction" });
                    }}
                  >
                    Start a New Auction
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-center items-center">
                <RainbowKitCustomConnectButton className="btn-lg" />
              </div>
            </>
          )}
        </div>

        {/* Share block */}
        <div className="bg-base-100 p-4 rounded-3xl shadow-md shadow-secondary border border-base-300 flex flex-col gap-3">
          <div className="text-lg font-light text-center items-center">
            Share and earn{" "}
            <span className="font-black text-lg text-primary">{formatToken(latestAuction?.referralFee)}</span>{" "}
            {String(tokenSymbol ?? "USDC")} from every bid:
          </div>
          <div className="flex gap-2 justify-center items-center">
            <a
              className="btn btn-accent btn-sm flex items-center gap-2"
              href={`https://warpcast.com/~/compose?text=${encodeURIComponent(
                `Win on FireBid:`,
              )}&embeds[]=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              <FarcasterIcon className="w-4 h-4" /> Cast
            </a>
            <a
              className="btn btn-accent btn-sm flex items-center gap-2"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                `Win on FireBid:`,
              )}&url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              <XIcon className="w-4 h-4" /> Tweet
            </a>
          </div>
        </div>

        {/* Bid history */}
        <div className="bg-base-100 p-5 rounded-3xl shadow-md shadow-secondary border border-base-300 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {/* if auction os nto ended yet */}
            {isAuctionActive && (
              <>
                {CurrentBidEvents.map(event => (
                  <div
                    key={event.id}
                    className="flex items-center justify-center border border-base-300 rounded-xl p-3"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex flex-col sm:flex-row items-center gap-2 text-sm">
                        <Address size="sm" address={event.bidder as `0x${string}`} />
                        <div className="">
                          bids <span className="font-black">{formatToken(event.amount as bigint)}</span>{" "}
                          {String(tokenSymbol ?? "USDC")}
                        </div>
                      </div>
                      <div className="text-xs text-base-content/50">
                        {formatTimeAgoBrief(now, event.timestamp as number)}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
            {PastAuctions.map(event => (
              <div
                key={String(event.auctionId)}
                className="flex flex-col items-center justify-center border border-base-300 rounded-xl p-3 relative"
              >
                <div className="flex flex-col items-center gap-1">
                  <div className="flex flex-col sm:flex-row items-center gap-2 text-sm">
                    <Address size="sm" address={event.winner as `0x${string}`} />
                    <div className="text-sm">
                      wins <span className="font-black">{formatToken(event.amount as bigint)}</span>{" "}
                      {String(tokenSymbol ?? "USDC")}
                    </div>
                    <div className="text-sm">
                      with a <span className="font-black">{formatToken(event.highestBid as bigint)}</span> bid
                    </div>
                    {event.winner.toLowerCase() === connectedAddress?.toLowerCase() && (
                      <button onClick={() => launchConfetti()} className="absolute top-2 right-2 btn btn-accent btn-sm">
                        🎉
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-base-content/50">
                    {formatTimeAgoBrief(now, event.timestamp as number)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="font-medium">Connected Address</div>
          <Address address={connectedAddress} />
          <MiniappUserInfo />
        </div>
      </div>
    </div>
  );
};

export default Home;
