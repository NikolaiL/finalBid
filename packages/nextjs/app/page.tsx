"use client";

import { useMemo, useState } from "react";
import { latestAuctionQueryOptions } from "../lib/auction-queries";
import { auctionCreatedQueryOptions, auctionEndedQueryOptions, bidPlacedQueryOptions } from "../lib/bid-events-query";
import { usePonderQuery } from "@ponder/react";
import type { NextPage } from "next";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { MiniappUserInfo } from "~~/components/MiniappUserInfo";
import { Address } from "~~/components/scaffold-eth";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTransactor,
} from "~~/hooks/scaffold-eth";

const DISPLAY_DECIMALS = Number(process.env.NEXT_PUBLIC_DISPLAY_DECIMALS) ?? 2;
const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS) ?? 6;

// Utility function to format USDC amounts (6 decimals)
const formatToken = (amount: bigint | 0n): string => {
  const amountNumber = Number(amount);
  const tokenAmount = amountNumber / 10 ** TOKEN_DECIMALS; // 6 decimals for USDC
  return tokenAmount.toFixed(DISPLAY_DECIMALS);
};

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();

  // Latest auction summary from Ponder
  const latestAuctionRes: any = usePonderQuery(latestAuctionQueryOptions as any);
  const latestAuction = (latestAuctionRes?.data ?? [])[0];

  const isAuctionOver = useMemo(() => {
    if (!latestAuction?.endTime) return false;
    try {
      const now = BigInt(Math.floor(Date.now() / 1000));
      return (
        BigInt(latestAuction.endTime) <= now ||
        BigInt(latestAuction.highestBid ?? 0) >= BigInt(latestAuction.auctionAmount ?? 0)
      );
    } catch {
      return false;
    }
  }, [latestAuction?.endTime, latestAuction?.highestBid, latestAuction?.auctionAmount]);

  const bidEventsQuery: any = usePonderQuery(bidPlacedQueryOptions as any);
  const BidEvents: any[] = useMemo(() => (bidEventsQuery?.data ?? []) as any[], [bidEventsQuery?.data]);

  const auctionEndedQuery: any = usePonderQuery(auctionEndedQueryOptions as any);
  const AuctionEndedEvents: any[] = useMemo(() => (auctionEndedQuery?.data ?? []) as any[], [auctionEndedQuery?.data]);

  const auctionCreatedQuery: any = usePonderQuery(auctionCreatedQueryOptions as any);
  const AuctionCreatedEvents: any[] = useMemo(
    () => (auctionCreatedQuery?.data ?? []) as any[],
    [auctionCreatedQuery?.data],
  );

  // Combine all events and sort them chronologically
  const allEvents = useMemo(() => {
    const events: any[] = [];

    // Add BidPlaced events
    if (BidEvents) {
      BidEvents.forEach((row: any) => {
        events.push({
          transactionHash: row.hash ?? (typeof row.id === "string" ? row.id.split("-")[0] : ""),
          logIndex: row.logIndex,
          blockNumber: row.blockNumber,
          args: { auctionId: row.auctionId, bidder: row.bidder, amount: row.amount, referral: row.referral },
          eventType: "BidPlaced",
          displayName: "Bid Placed",
        });
      });
    }

    // Add AuctionEnded events
    if (AuctionEndedEvents) {
      AuctionEndedEvents.forEach((row: any) => {
        events.push({
          transactionHash: row.hash,
          logIndex: row.logIndex,
          blockNumber: row.blockNumber,
          args: { auctionId: row.auctionId, winner: row.winner, amount: row.amount, highestBid: row.highestBid },
          eventType: "AuctionEnded",
          displayName: "Auction Ended",
        });
      });
    }

    // Add AuctionCreated events
    if (AuctionCreatedEvents) {
      AuctionCreatedEvents.forEach((row: any) => {
        events.push({
          transactionHash: row.hash,
          logIndex: row.logIndex,
          blockNumber: row.blockNumber,
          args: {
            auctionId: row.auctionId,
            auctionAmount: row.auctionAmount,
            startTime: row.startTime,
            endTime: row.endTime,
            startingAmount: row.startingAmount,
          },
          eventType: "AuctionCreated",
          displayName: "Auction Created",
        });
      });
    }

    // Dedupe by tx hash + log index, then sort desc
    const map = new Map<string, any>();
    for (const e of events) {
      const k = `${e.transactionHash}-${String(e.logIndex)}`;
      if (!map.has(k)) map.set(k, e);
    }
    const deduped = Array.from(map.values());
    return deduped.sort((a: any, b: any) => {
      if (a.blockNumber !== b.blockNumber) {
        return Number(b.blockNumber - a.blockNumber);
      }
      return Number(b.logIndex - a.logIndex);
    });
  }, [BidEvents, AuctionEndedEvents, AuctionCreatedEvents]);

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
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  // Read token symbol (for rendering)
  const { data: tokenSymbol } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_METADATA_ABI,
    functionName: "symbol",
    query: { enabled: !!tokenAddress },
  });

  // Contract params used to compute next bid/required amount
  const { data: bidIncrement } = useScaffoldReadContract({
    contractName: "FinalBidContract",
    functionName: "bidIncrement",
    watch: true,
  });
  const { data: platformFee } = useScaffoldReadContract({
    contractName: "FinalBidContract",
    functionName: "platformFee",
    watch: true,
  });

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
      setIsBidding(false);
      setBidStatus("");
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="border p-3 rounded">
        <div className="flex justify-between items-center">
          <div>
            <div className="font-bold">Current Auction ID</div>
            <div>#{latestAuction?.auctionId?.toString?.() ?? "-"}</div>
          </div>
          <div>
            <div className="font-bold">Prize</div>
            <div>
              {formatToken(latestAuction?.auctionAmount)} {tokenSymbol}
            </div>
          </div>
          <div>
            <div className="font-bold">Highest Bid</div>
            <div>
              {formatToken(latestAuction?.highestBid)} {tokenSymbol}
            </div>
          </div>
        </div>
      </div>

      {/* Bid action */}
      <div className="rounded text-center w-full">
        {latestAuction?.auctionId && !isAuctionOver ? (
          <button className="btn btn-primary text-xl transition-all" onClick={handlePlaceBid} disabled={isBidding}>
            {isBidding
              ? bidStatus
              : `Bid ${formatToken(
                  (latestAuction?.highestBid
                    ? (latestAuction.highestBid as bigint) + ((bidIncrement as bigint) || 0n)
                    : (latestAuction?.startingAmount as bigint) || 0n) as unknown as bigint,
                )} ${String(tokenSymbol ?? "")}`}
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
        {isBidding ? (
          <div className="mt-1 text-gray-500 text-xs">Please wait...</div>
        ) : platformFee ? (
          <div className="mt-1 text-gray-500 text-xs">
            ({formatToken(platformFee as unknown as bigint)} {String(tokenSymbol ?? "")} fee applies)
          </div>
        ) : null}
      </div>

      <div>
        <h2 className="text-lg mb-2">Bid Story</h2>
        <div className="flex flex-col gap-3">
          {allEvents.map(event => (
            <div key={`${event.transactionHash}-${String(event.logIndex)}`} className="border p-3 rounded">
              {event.eventType === "BidPlaced" && (
                <div className="flex items-center gap-2">
                  <Address address={event.args?.bidder} size="xs" />
                  <span>bids</span>
                  <span className="font-bold">
                    {formatToken(event.args?.amount as unknown as bigint)} {tokenSymbol}
                  </span>
                </div>
              )}
              {event.eventType === "AuctionCreated" && (
                <div>New auction created: #{event.args?.auctionId?.toString()}</div>
              )}
              {event.eventType === "AuctionEnded" && (
                <div>
                  Auction ended. Winner: <Address address={event.args?.winner} size="xs" />
                </div>
              )}
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
  );
};

export default Home;
