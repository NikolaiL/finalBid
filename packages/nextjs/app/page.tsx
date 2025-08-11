"use client";

import { useEffect, useMemo, useState } from "react";
import { auctionCreatedQueryOptions, bidPlacedQueryOptions } from "../lib/bid-events-query";
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
import { useDataLiveQuery } from "~~/lib/useDataLiveQuery";

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

  const bidEventsQuery: any = useDataLiveQuery(bidPlacedQueryOptions as any);
  const BidEvents: any[] = useMemo(() => (bidEventsQuery?.data ?? []) as any[], [bidEventsQuery?.data]);

  console.log("BidEvents", BidEvents);

  // const auctionEndedQuery: any = useDataLiveQuery(auctionEndedQueryOptions as any);
  // const AuctionEndedEvents: any[] = useMemo(() => (auctionEndedQuery?.data ?? []) as any[], [auctionEndedQuery?.data]);

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
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="bg-base-100 p-5 rounded-3xl shadow-md shadow-secondary border border-base-300 flex flex-col gap-3">
        <div className="text-2xl font-bold text-center">
          Win {formatToken(latestAuction?.auctionAmount)} {String(tokenSymbol ?? "USDC")}!
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div className="text-center sm:text-left">
            <div className="text-sm text-base-content/70">Current top bid</div>
            <div className="text-lg font-semibold">
              {formatToken(currentBid)} {String(tokenSymbol ?? "USDC")}
            </div>
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
                <div className="text-lg font-semibold">{secondsRemaining} seconds</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bid action */}
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
              await writeContractAsync({ functionName: "endAuction" });
            }}
          >
            End Auction
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
      <div className="bg-base-100 p-5 rounded-3xl shadow-md shadow-secondary border border-base-300 flex flex-col gap-3">
        <div className="text-2xl font-bold text-center">Bid Events</div>
        {BidEvents.length > 0 ? (
          <div className="flex flex-col gap-2">
            {BidEvents.map(event => (
              <div key={event.id} className="flex items-center justify-between border border-base-300 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-base-content/70">Bidder</span>
                  <Address address={event.bidder as `0x${string}`} />
                </div>
                <div className="text-sm">
                  +{formatToken(event.amount as bigint)} {String(tokenSymbol ?? "USDC")}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500">No bid events yet</div>
        )}
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
