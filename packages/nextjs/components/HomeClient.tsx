"use client";

import { useEffect, useMemo, useState } from "react";
import NumberFlow from "@number-flow/react";
import { toast } from "react-hot-toast";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { useMiniapp } from "~~/components/MiniappProvider";
import { AddressFarcaster, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTransactor,
} from "~~/hooks/scaffold-eth";
import { useAllStreamingData, useStreamingData } from "~~/hooks/useStreamingData";
import {
  auctionCreatedQueryOptions,
  auctionEndedQueryOptions,
  createBidPlacedQueryOptions,
} from "~~/lib/bid-events-query";
import { getAddressDisplayName } from "~~/lib/farcaster";
import { formatTimeAgo, getServerTime, useServerTimeDrift } from "~~/lib/global-time";
import { useDataLiveQuery } from "~~/lib/useDataLiveQuery";

const DISPLAY_DECIMALS = Number(process.env.NEXT_PUBLIC_DISPLAY_DECIMALS) ?? 2;
const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS) ?? 18;

const formatToken = (amount: bigint | 0n, decimals: number = DISPLAY_DECIMALS): string => {
  const amountNumber = Number(amount);
  const tokenAmount = amountNumber / 10 ** TOKEN_DECIMALS;
  return tokenAmount.toFixed(decimals);
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// formatTimeAgoBrief function removed - now using blockchain-synchronized formatTimeAgo

// Component for displaying real-time streaming amounts with pre-fetched data
const StreamingAmountWithData = ({ address, allStreamingData }: { address: string; allStreamingData: any[] }) => {
  // Find streaming data for the specific address
  const streamingData = allStreamingData.find((data: any) => data.address?.toLowerCase() === address.toLowerCase());

  if (!streamingData || streamingData.streamingAmountDisplay === 0) {
    return <div className="text-base-content/50">&nbsp;</div>;
  }

  return (
    <div className="text-success font-mono">
      +
      <NumberFlow
        value={streamingData.streamingAmountDisplay}
        format={{
          notation: "standard",
          useGrouping: false,
          minimumFractionDigits: 5,
          maximumFractionDigits: 5,
        }}
      />
    </div>
  );
};

// Component for displaying potential loss/profit with streaming amounts
const PotentialAmounts = ({
  address,
  auctionId,
  totalFees,
  auctionValue,
  nextBidAmount,
  showOnlyLoss = false,
  showOnlyProfit = false,
  showStopNowOutcome = false,
  tokenSymbol = "",
}: {
  address: string;
  auctionId: bigint | undefined;
  totalFees: bigint;
  auctionValue: bigint;
  nextBidAmount: bigint;
  showOnlyLoss?: boolean;
  showOnlyProfit?: boolean;
  showStopNowOutcome?: boolean;
  tokenSymbol?: string;
}) => {
  const { streamingAmount } = useStreamingData(address, auctionId);

  // Calculate potential loss and profit with streaming
  const actualLoss = useMemo(() => {
    return streamingAmount - totalFees;
  }, [totalFees, streamingAmount]);

  const actualProfit = useMemo(() => {
    return BigInt(Math.floor(Number(auctionValue) / 2)) - totalFees - nextBidAmount + streamingAmount;
  }, [auctionValue, totalFees, nextBidAmount, streamingAmount]);

  // Convert to display values
  const lossValue = Number(actualLoss) / 10 ** TOKEN_DECIMALS;
  const profitValue = Number(actualProfit) / 10 ** TOKEN_DECIMALS;

  if (showOnlyLoss) {
    return (
      <NumberFlow
        value={Math.abs(lossValue)}
        format={{
          notation: "standard",
          useGrouping: false,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }}
      />
    );
  }

  if (showOnlyProfit) {
    return (
      <NumberFlow
        value={profitValue}
        format={{
          notation: "standard",
          useGrouping: false,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }}
        prefix={actualProfit > 0n ? "+" : ""}
      />
    );
  }

  if (showStopNowOutcome) {
    const isWinning = actualLoss > 0n;
    return (
      <>
        <div className="text-base font-bold text-base-content/90">Stop Now </div>
        <div className="text-sm text-base-content/70">and you {isWinning ? "win" : "lose"}</div>
        <div className={`text-xl font-bold font-mono ${isWinning ? "text-success" : "text-error"}`}>
          <NumberFlow
            value={Math.abs(lossValue)}
            format={{
              notation: "standard",
              useGrouping: false,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }}
            prefix={actualLoss > 0n ? "+" : ""}
          />
        </div>
        <div className="text-xs text-base-content/50">{tokenSymbol}</div>
      </>
    );
  }

  return (
    <>
      <div
        className={
          actualLoss === 0n
            ? "text-base-content/50"
            : actualLoss > 0n
              ? "font-bold text-success"
              : "font-bold text-error"
        }
      >
        <NumberFlow
          value={Math.abs(lossValue)}
          format={{
            notation: "standard",
            useGrouping: false,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }}
          prefix={actualLoss > 0n ? "+" : "-"}
        />
      </div>
      <div className={actualProfit > 0n ? "font-bold text-success" : "font-bold text-error"}>
        <NumberFlow
          value={profitValue}
          format={{
            notation: "standard",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }}
          prefix={actualProfit > 0n ? "+" : ""}
        />
      </div>
    </>
  );
};

// Component for displaying potential loss/profit with pre-fetched streaming data
const PotentialAmountsWithData = ({
  address,
  allStreamingData,
  totalFees,
  auctionValue,
  nextBidAmount,
  showOnlyLoss = false,
  showOnlyProfit = false,
  showStopNowOutcome = false,
  tokenSymbol = "",
}: {
  address: string;
  allStreamingData: any[];
  totalFees: bigint;
  auctionValue: bigint;
  nextBidAmount: bigint;
  showOnlyLoss?: boolean;
  showOnlyProfit?: boolean;
  showStopNowOutcome?: boolean;
  tokenSymbol?: string;
}) => {
  // Find streaming data for the specific address
  const streamingData = allStreamingData.find((data: any) => data.address?.toLowerCase() === address.toLowerCase());

  const streamingAmount = streamingData?.calculatedAmount || 0n;

  // Calculate potential loss and profit with streaming
  const actualLoss = useMemo(() => {
    return streamingAmount - totalFees;
  }, [totalFees, streamingAmount]);

  const actualProfit = useMemo(() => {
    return BigInt(Math.floor(Number(auctionValue) / 2)) - totalFees - nextBidAmount + streamingAmount;
  }, [auctionValue, totalFees, nextBidAmount, streamingAmount]);

  // Convert to display values
  const lossValue = Number(actualLoss) / 10 ** TOKEN_DECIMALS;
  const profitValue = Number(actualProfit) / 10 ** TOKEN_DECIMALS;

  if (showOnlyLoss) {
    return (
      <NumberFlow
        value={Math.abs(lossValue)}
        format={{
          notation: "standard",
          useGrouping: false,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }}
      />
    );
  }

  if (showOnlyProfit) {
    return (
      <NumberFlow
        value={profitValue}
        format={{
          notation: "standard",
          useGrouping: false,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }}
        prefix={actualProfit > 0n ? "+" : ""}
      />
    );
  }

  if (showStopNowOutcome) {
    const isWinning = actualLoss > 0n;
    return (
      <>
        <div className="text-base font-bold text-base-content/90">Stop Now </div>
        <div className="text-sm text-base-content/70">and you {isWinning ? "win" : "lose"}</div>
        <div className={`text-xl font-bold font-mono ${isWinning ? "text-success" : "text-error"}`}>
          <NumberFlow
            value={Math.abs(lossValue)}
            format={{
              notation: "standard",
              useGrouping: false,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }}
            prefix={actualLoss > 0n ? "+" : ""}
          />
        </div>
        <div className="text-xs text-base-content/50">{tokenSymbol}</div>
      </>
    );
  }

  return (
    <>
      <div className={actualProfit > 0n ? "font-bold text-success" : "font-bold text-error"}>
        <NumberFlow
          value={profitValue}
          format={{
            notation: "standard",
            useGrouping: false,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }}
          animated={false}
          prefix={actualProfit > 0n ? "+" : ""}
        />
      </div>
      <div
        className={
          actualLoss === 0n
            ? "text-base-content/50"
            : actualLoss > 0n
              ? "font-bold text-success"
              : "font-bold text-error"
        }
      >
        <NumberFlow
          value={Math.abs(lossValue)}
          format={{
            notation: "standard",
            useGrouping: false,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }}
          animated={false}
          prefix={actualLoss > 0n ? "+" : "-"}
        />
      </div>
    </>
  );
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

const UrlCopyIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1z" />
    <path d="M19 5H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
  </svg>
);

export default function HomeClient({
  tokenAddress: tokenAddressProp,
  tokenSymbol: tokenSymbolProp,
}: {
  tokenAddress?: `0x${string}`;
  tokenSymbol?: string;
}) {
  const { address: connectedAddress, isConnecting, isReconnecting } = useAccount();
  const { composeCast } = useMiniapp();

  // First, fetch auction created events to get the latest auction
  const auctionCreatedQuery: any = useDataLiveQuery(auctionCreatedQueryOptions as any);
  const AuctionCreatedEvents: any[] = useMemo(
    () => (auctionCreatedQuery?.data ?? []) as any[],
    [auctionCreatedQuery?.data],
  );

  // Get the latest auction ID
  const latestAuctionId = useMemo(() => {
    if (AuctionCreatedEvents.length === 0) return null;
    return AuctionCreatedEvents[0]?.auctionId;
  }, [AuctionCreatedEvents]);

  // Only fetch bids after we have the latest auction ID
  const bidPlacedQueryOptions = useMemo(() => createBidPlacedQueryOptions(latestAuctionId), [latestAuctionId]);

  const bidEventsQuery: any = useDataLiveQuery(bidPlacedQueryOptions as any);
  const BidEvents: any[] = useMemo(() => (bidEventsQuery?.data ?? []) as any[], [bidEventsQuery?.data]);

  const auctionEndedQuery: any = useDataLiveQuery(auctionEndedQueryOptions as any);
  const AuctionEndedEvents: any[] = useMemo(() => (auctionEndedQuery?.data ?? []) as any[], [auctionEndedQuery?.data]);

  // Exclude auctions with zero-address winner
  const PastAuctions = useMemo(() => {
    const zero = ZERO_ADDRESS.toLowerCase();
    return (AuctionEndedEvents || []).filter((e: any) => (e?.winner || "").toLowerCase() !== zero);
  }, [AuctionEndedEvents]);

  const { writeContractAsync } = useScaffoldWriteContract({
    contractName: "FinalBidContract",
  });

  // Get FinalBidContract address from deployed contracts
  const { data: finalBidContractInfo } = useDeployedContractInfo({
    contractName: "FinalBidContract",
  });

  // Token address sourced from server (token-meta.json via readTokenMeta)
  const tokenAddress = tokenAddressProp;

  // Check if new auction is allowed
  const { data: newAuctionIsAllowed } = useScaffoldReadContract({
    contractName: "FinalBidContract",
    functionName: "newAuctionIsAllowed",
    watch: true,
    query: {
      staleTime: 5000, // 5 seconds stale time for auction status
    },
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
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
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
  const [latestResults, setLatestResults] = useState<string>("");
  const [isApproving, setIsApproving] = useState(0);
  const [isRevoking, setIsRevoking] = useState(false);

  // Constants

  // Read token symbol (for rendering)
  const { data: tokenSymbolRpc } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_METADATA_ABI,
    functionName: "symbol",
    query: { enabled: !!tokenAddress && !tokenSymbolProp },
  });
  const tokenSymbol = tokenSymbolProp ?? tokenSymbolRpc;

  const latestAuction = AuctionCreatedEvents[0];
  const bidIncrement = latestAuction?.bidIncrement;
  const platformFee = latestAuction?.platformFee;

  const auctionId = latestAuction?.auctionId ?? 0;

  const nextBid = latestAuction?.highestBid
    ? (latestAuction.highestBid as bigint) + ((bidIncrement as bigint) || 0n)
    : (latestAuction?.startingAmount as bigint) || 0n;

  const isAuctionOver = latestAuction?.ended;

  // Initialize blockchain time drift calculation
  useServerTimeDrift();

  // Get all streaming data once at the top level
  const { streamingData: allStreamingData } = useAllStreamingData(latestAuction?.auctionId);

  // Local timer for frequent updates (every second)
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch latest auction results when PastAuctions changes
  useEffect(() => {
    const fetchResults = async () => {
      const latestResults = PastAuctions.slice(0, 5); // Get latest 5 auctions
      if (latestResults.length === 0) {
        setLatestResults("");
        return;
      }

      const resultsPromises = latestResults.map(async event => {
        const winner = event.winner as string;
        const displayName = await getAddressDisplayName(winner);
        const amount = formatToken((event.amount / 2n) as unknown as bigint);
        const bid = formatToken(event.highestBid as bigint);
        const token = String(tokenSymbol ?? "USDC");
        return `${displayName} bids ${bid} wins ${amount} ${token}`;
      });

      const results = await Promise.all(resultsPromises);
      setLatestResults("🎉 Congrats to the latest winners:\n" + results.join("\n") + "\n\nCould You be next?");
    };
    fetchResults();
  }, [PastAuctions, tokenSymbol]);

  // Check if auction is ready to be over using blockchain-synchronized time
  const isAcutionReadytoBeOver = useMemo(() => {
    if (!latestAuction) return false;

    // Check if end time has passed
    const serverTime = getServerTime();
    const currentSeconds = Math.floor(serverTime / 1000);
    const endTimePassed = latestAuction.endTime ? Number(latestAuction.endTime) <= currentSeconds : false;

    // Check if highest bid reached auction amount
    const highestBidReached = (latestAuction.highestBid as bigint) >= (latestAuction.auctionAmount as bigint);

    return endTimePassed || highestBidReached;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestAuction, now]);
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
    //return required + (((bidIncrement as bigint) || 0n) + ((platformFee as bigint) || 0n));
    return required + ((platformFee as bigint) || 0n);
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
        args: [finalBidContractInfo?.address, required], // buffer
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

  // Helper function to verify human (reCAPTCHA)
  const verifyHuman = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (typeof window !== "undefined" && (window as any).grecaptcha) {
        (window as any).grecaptcha.ready(() => {
          const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
          if (!siteKey) {
            reject(new Error("reCAPTCHA site key not configured"));
            return;
          }

          (window as any).grecaptcha
            .execute(siteKey, { action: "bid" })
            .then((token: string) => resolve(token))
            .catch(reject);
        });
      } else {
        reject(new Error("reCAPTCHA not loaded"));
      }
    });
  };

  // Helper function to get access token from backend
  const getAccessToken = async (params: { address: string; humanProof: string; auctionId: bigint }) => {
    const response = await fetch("/api/verify-and-sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...params,
        auctionId: params.auctionId.toString(),
      }),
    });

    if (!response.ok) {
      toast.error("Are you human? Please reload and try again!");
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to get access token");
    }

    return response.json();
  };

  const handlePlaceBid = async () => {
    if (!connectedAddress) return;

    setIsBidding(true);
    setBidStatus("Placing Bid...");

    try {
      // Step 1: Check allowance
      setBidStatus("Checking allowance...");
      const required = calcRequiredAmount() as bigint;
      await ensureAllowance(required);

      // Step 2: Human verification (reCAPTCHA)
      const humanProof = await verifyHuman();
      if (!humanProof) {
        toast.error("Are you human? Please reload and try again!");
        throw new Error("Human verification failed");
      }

      // Step 3: Get signed access token from backend
      //setBidStatus("Getting access token...");
      const { accessToken } = await getAccessToken({
        address: connectedAddress,
        humanProof,
        auctionId: latestAuction?.auctionId || 0n,
      });

      // Step 4: Place bid with access token
      const referrer = getReferrer();
      setBidStatus("Placing bid...");
      console.log("Placing bid... referrer is:", referrer);

      await writeContractAsync(
        {
          functionName: "placeBid",
          args: [
            {
              wallet: accessToken.message.wallet,
              timestamp: accessToken.message.timestamp,
              auctionId: accessToken.message.auctionId,
              signature: accessToken.signature,
            },
            referrer,
          ] as any,
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
            launchConfetti();
            // Refresh allowance after block confirmation with delay to ensure blockchain state is updated
            setTimeout(() => refetchAllowance(), 3000);
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
      // Refresh allowance after bid to show updated amount with delay to ensure blockchain state is updated
      await new Promise(resolve => setTimeout(resolve, 2000));
      await refetchAllowance();
      await new Promise(r => setTimeout(r, 3000));
      setIsBidding(false);
      setBidStatus("");
    }
  };

  // Handle pre-approval for specific amounts
  const handlePreApprove = async (amount: number) => {
    if (!tokenAddress || !finalBidContractInfo?.address) return;

    // Set the appropriate approval state based on amount
    setIsApproving(amount);

    try {
      const amountInWei = BigInt(amount * 10 ** TOKEN_DECIMALS);

      const approvalTx = () =>
        writeTokenContractAsync({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [finalBidContractInfo.address, amountInWei],
        });

      await writeApprovalTx(approvalTx, {
        blockConfirmations: 1,
        successMessage: `${amount} ${String(tokenSymbol ?? "USDC")} approved!`,
        awaitingConfirmationMessage: "Awaiting approval confirmation",
        waitingForTransactionMessage: "Waiting for approval to complete.",
        onBlockConfirmation: (receipt: any) => {
          console.log("Approval confirmed in block:", receipt.blockNumber);
          // Refresh allowance after block confirmation with delay to ensure blockchain state is updated
          setTimeout(() => refetchAllowance(), 3000);
        },
      });

      // Refresh allowance after approval with delay to ensure blockchain state is updated
      await new Promise(resolve => setTimeout(resolve, 2000));
      await refetchAllowance();
    } catch (error) {
      console.error("Pre-approval error:", error);
      toast.error("Failed to approve allowance");
    } finally {
      // Reset the appropriate approval state based on amount
      setIsApproving(0);
    }
  };

  // Handle allowance revocation
  const handleRevoke = async () => {
    if (!tokenAddress || !finalBidContractInfo?.address) return;

    setIsRevoking(true);
    try {
      const approvalTx = () =>
        writeTokenContractAsync({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [finalBidContractInfo.address, 0n],
        });

      await writeApprovalTx(approvalTx, {
        blockConfirmations: 1,
        successMessage: "Allowance revoked!",
        awaitingConfirmationMessage: "Awaiting revocation confirmation",
        waitingForTransactionMessage: "Waiting for revocation to complete.",
        onBlockConfirmation: (receipt: any) => {
          console.log("Revocation confirmed in block:", receipt.blockNumber);
          // Refresh allowance after block confirmation with delay to ensure blockchain state is updated
          setTimeout(() => refetchAllowance(), 3000);
        },
      });

      // Refresh allowance after revocation with delay to ensure blockchain state is updated
      await new Promise(resolve => setTimeout(resolve, 2000));
      await refetchAllowance();
    } catch (error) {
      console.error("Revocation error:", error);
      toast.error("Failed to revoke allowance");
    } finally {
      setIsRevoking(false);
    }
  };

  const currentBid = (latestAuction?.highestBid as bigint) || (latestAuction?.startingAmount as bigint) || 0n;
  const topBidderAddress = (latestAuction?.highestBidder as `0x${string}`) || (ZERO_ADDRESS as `0x${string}`);
  const secondsRemaining = useMemo(() => {
    if (!latestAuction?.endTime) return 0;
    const endTime = Number(latestAuction.endTime);
    const serverTime = getServerTime();
    const currentSeconds = Math.floor(serverTime / 1000);
    return Math.max(0, endTime - currentSeconds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestAuction?.endTime, now]);

  // Calculate user statistics for the current auction
  const userStats = useMemo(() => {
    if (!BidEvents || !latestAuction) return [];

    // Group bids by user
    const userBidMap = new Map<string, any[]>();
    BidEvents.forEach((bid: any) => {
      const bidder = bid.bidder.toLowerCase();
      if (!userBidMap.has(bidder)) {
        userBidMap.set(bidder, []);
      }
      userBidMap.get(bidder)!.push(bid);
    });

    // Add current user if they're not in the map
    if (connectedAddress && !userBidMap.has(connectedAddress.toLowerCase())) {
      userBidMap.set(connectedAddress.toLowerCase(), []);
    }

    // Calculate stats for each user
    const stats = Array.from(userBidMap.entries()).map(([address, bids]) => {
      const numBids = bids.length;
      const lastBid = bids.length > 0 ? bids.sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0] : null;
      const lastBidAmount = lastBid ? (lastBid.amount as bigint) : 0n;

      // Calculate total cost (sum of all bids + fees)
      const platformFeePerBid = (latestAuction.platformFee as bigint) || 0n;
      const totalFees = BigInt(numBids) * platformFeePerBid;

      // For now, we'll calculate streaming amount as a placeholder
      // This will be updated by the StreamingAmount component
      const streamingAmount = 0n; // Placeholder - actual streaming will be calculated per user

      // Calculate potential loss (total cost if they don't win) - subtract streaming amount
      const potentialLoss = streamingAmount - totalFees;

      // Calculate potential profit (auction value - total cost - next bid if they're not highest) + streaming amount
      const auctionValue = latestAuction.auctionAmount as bigint;
      const isHighestBidder = address.toLowerCase() === topBidderAddress.toLowerCase();
      const nextBidAmount = isHighestBidder ? lastBidAmount : (nextBid as bigint) + (platformFee as bigint);
      const potentialProfit =
        BigInt(Math.floor(Number(auctionValue) / 2)) - totalFees - nextBidAmount + streamingAmount;

      return {
        address,
        numBids,
        lastBidAmount,
        potentialLoss,
        potentialProfit,
        streamingAmount,
        isCurrentUser: connectedAddress && address.toLowerCase() === connectedAddress.toLowerCase(),
        isHighestBidder: address.toLowerCase() === topBidderAddress.toLowerCase(),
      };
    });

    // Sort by number of bids (descending), then by last bid amount (descending)
    return stats.sort((a, b) => {
      return Number(b.lastBidAmount) - Number(a.lastBidAmount);
    });
  }, [BidEvents, latestAuction, connectedAddress, topBidderAddress, nextBid, platformFee]);

  const sharingUrl =
    (process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000") +
    (connectedAddress ? "/" + connectedAddress + "/" + new Date().getTime() : "");

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

  const signature = "🔥 @firebid by @nikolaii.eth";
  const signatureTwitter = "🔥 @Firebid_eth by @NikolaiLeb";

  // let change it to: The pot is 4.49 USDC—place a 0.03 bid and win half of it!
  //

  const baseText = isAuctionActive
    ? `The pot is ${formatToken(latestAuction?.auctionAmount)} $${String(tokenSymbol ?? "")} - place a ${formatToken(nextBid as unknown as bigint)} $${String(tokenSymbol ?? "")} bid and win half of it!\nPlus, everyone wins: the other half gets streamed to all bidders!`
    : `Win on FireBid`;

  const sharingText = latestResults ? `${baseText}\n\n${latestResults}\n\n${signature}` : `${baseText}\n${signature}`;
  const sharingTextTwitter = baseText + "\n\n" + signatureTwitter;

  const timeRunningOutLimit = 30;
  const isTimeRunningOut = secondsRemaining < timeRunningOutLimit && !isBidding;

  return (
    <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 lg:px-6">
      <div className="flex flex-col gap-1 py-4 px-2">
        {/* Auction info */}
        <div className="bg-base-100 px-5 py-3 rounded-xl shadow-md shadow-secondary border border-base-300 flex flex-col gap-3">
          {latestAuction ? (
            <>
              <div className="flex flex-row gap-1 mb-2">
                <div className="flex flex-1 flex-col gap-0 items-start">
                  <div className="text-left flex-1 text-sm font-light text-base-content/70 items-start">
                    Winning Pot
                  </div>
                  <div className="flex-none items-center font-mono font-black text-3xl text-primary">
                    {formatToken(latestAuction?.auctionAmount)}
                  </div>
                  <div className="text-center sm:text-left flex-1 text-sm font-light items-start my-1">
                    {String(tokenSymbol ?? "USDC")}
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-0 items-end">
                  <div className="text-center">
                    {isAcutionReadytoBeOver ? (
                      <>
                        <div className="text-sm text-right font-light text-base-content/70 items-end">&nbsp;</div>
                        <div className="text-2xl text-right text-[#9ae600] font-black text-2xl font-mono">
                          Auction Ended
                        </div>
                      </>
                    ) : isAuctionOver ? (
                      <>
                        <div className="text-sm text-right font-light text-base-content/70 items-end">&nbsp;</div>
                        <div className="text-2xl text-right text-[#9ae600] font-black text-2xl font-mono">
                          Auction Ended
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm text-right font-light text-base-content/70 items-end">
                          Auction ends in
                        </div>
                        <div className="text-2xl text-right text-[#9ae600] font-black text-3xl font-mono">
                          <NumberFlow
                            value={secondsRemaining}
                            format={{
                              notation: "standard",
                              useGrouping: false,
                            }}
                          />
                        </div>
                        <div className="text-sm text-right text-base-content/70">seconds</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-xs text-base-content/50 text-left w-full -mt-4">
                <sup>*</sup>50% goes to the winner. 50% is streamed to the last 10 bidders, based on their bid size.
              </div>
              <div className="grid grid-cols-2 gap-4 items-center">
                <div className="text-left">
                  <div className="text-sm text-base-content/70">
                    {topBidderAddress !== ZERO_ADDRESS ? "Current top bid" : "Be the first to bid"}
                  </div>
                  <div className="text-2xl font-black">{formatToken(currentBid)}</div>
                  <div className="text-sm text-base-content/70"> {String(tokenSymbol ?? "USDC")}</div>
                </div>
                <div className="text-right">
                  {topBidderAddress !== ZERO_ADDRESS && (
                    <>
                      <div className="text-sm text-base-content/70">Top bid by</div>
                      <div className="flex justify-end">
                        <AddressFarcaster address={topBidderAddress} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center">
              <div className="my-8 text-4xl sm:text-5xl md:text-6xl font-black">LFG 🚀🚀🚀</div>
            </div>
          )}
        </div>

        <div className="min-h-36 flex flex-col justify-center">
          {/* Potential amounts section - only show if auction is active and user is connected */}
          {connectedAddress && latestAuction?.auctionId && isAuctionActive && !isUserHighestBidder && (
            <div className="mb-2">
              {(() => {
                const currentUserStats = userStats.find(stat => stat.isCurrentUser);
                const hasPlacedBids = currentUserStats && currentUserStats.numBids > 0;

                if (hasPlacedBids) {
                  // Show both columns when user has placed bids
                  const totalFees =
                    BigInt(currentUserStats?.numBids || 0) * ((latestAuction?.platformFee as bigint) || 0n);

                  return (
                    <div className="grid grid-cols-2 gap-4">
                      {/* Stop Now - Left column, left aligned */}
                      <div className="text-left p-3">
                        <PotentialAmounts
                          address={connectedAddress}
                          auctionId={latestAuction?.auctionId}
                          totalFees={totalFees}
                          auctionValue={latestAuction?.auctionAmount as bigint}
                          nextBidAmount={(nextBid as bigint) + ((platformFee as bigint) || 0n)}
                          showStopNowOutcome={true}
                          tokenSymbol={String(tokenSymbol ?? "")}
                        />
                      </div>

                      {/* Bid Now - Right column, right aligned */}
                      <div className="text-right p-3">
                        <div className="text-base font-bold text-base-content/90">Bid Now </div>
                        <div className="text-sm text-base-content/70">and you could win</div>
                        <div className="text-xl font-bold text-success font-mono">
                          <PotentialAmounts
                            address={connectedAddress}
                            auctionId={latestAuction?.auctionId}
                            totalFees={totalFees}
                            auctionValue={latestAuction?.auctionAmount as bigint}
                            nextBidAmount={(nextBid as bigint) + ((platformFee as bigint) || 0n)}
                            showOnlyProfit={true}
                          />
                        </div>
                        <div className="text-xs text-base-content/50">{String(tokenSymbol ?? "")}</div>
                      </div>
                    </div>
                  );
                } else {
                  // Show only Bid Now centered when user hasn't placed bids
                  return (
                    <div className="text-center p-3 hidden">
                      <div className="text-base font-bold text-base-content/90">Bid Now </div>
                      <div className="text-sm text-base-content/70">and you could win</div>
                      <div className="text-xl font-bold text-success font-mono">
                        <PotentialAmounts
                          address={connectedAddress}
                          auctionId={latestAuction?.auctionId}
                          totalFees={0n}
                          auctionValue={latestAuction?.auctionAmount as bigint}
                          nextBidAmount={(nextBid as bigint) + ((platformFee as bigint) || 0n)}
                          showOnlyProfit={true}
                        />
                      </div>
                      <div className="text-xs text-base-content/50">{String(tokenSymbol ?? "")}</div>
                    </div>
                  );
                }
              })()}
            </div>
          )}

          <div className="items-center justify-center flex">
            {/* Bid action */}
            {/* if address is connected */}
            {connectedAddress ? (
              <>
                <div className="rounded-lg text-center w-full">
                  {latestAuction?.auctionId && isAuctionActive ? (
                    <>
                      {isUserHighestBidder ? (
                        <>
                          <div className="text-xl font-bold p-1">✅ You are the highest bidder</div>
                          <div className="mt-1 text-base-content/50 text-xs">
                            {(() => {
                              const remaining = secondsRemaining;
                              return `Auction ends in ${remaining} seconds`;
                            })()}
                          </div>
                        </>
                      ) : (
                        <>
                          <div
                            className={`mt-0 text-base-content/70 text-sm font-bold mb-2 animate-pulse text-success ${isTimeRunningOut ? "" : "invisible"}`}
                          >
                            Time is running out! Bid Now!
                          </div>
                          <button
                            className={
                              "btn btn-primary text-xl transition-all h-14 px-6 " +
                              (isTimeRunningOut ? "animate-pulse" : "")
                            } //if time is running out, add pulse class
                            onClick={handlePlaceBid}
                            disabled={isBidding}
                          >
                            {isBidding
                              ? bidStatus
                              : `Bid ${formatToken(nextBid as unknown as bigint)} ${String(tokenSymbol ?? "")}`}
                          </button>
                          {isBidding ? (
                            <div className="mt-1 text-gray-500 text-xs mb-4">Please wait...</div>
                          ) : platformFee ? (
                            <div className="mt-1 text-base-content/70 text-xs mb-4">
                              ({formatToken(platformFee as unknown as bigint)} {String(tokenSymbol ?? "")} fee applies)
                            </div>
                          ) : null}
                        </>
                      )}
                    </>
                  ) : null}
                  {latestAuction?.auctionId && isAcutionReadytoBeOver && !isAuctionOver ? (
                    <button
                      className="btn btn-primary text-xl transition-all h-14 px-6"
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
                    newAuctionIsAllowed ? (
                      <button
                        className="btn btn-primary text-xl transition-all h-14 px-6 "
                        onClick={async () => {
                          await writeContractAsync({ functionName: "startAuction" });
                        }}
                      >
                        Start a New Auction
                      </button>
                    ) : (
                      <div className="text-xl sm:text-2xl font-black text-center py-8">Something is Cooking 🚀🚀🚀</div>
                    )
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
        </div>

        {/* Share block */}
        <div className="bg-base-100 p-4 rounded-xl shadow-md shadow-secondary border border-base-300 flex flex-col gap-3">
          {connectedAddress ? (
            <div className="text-lg font-light text-center items-center">
              Share and earn{" "}
              <span className="font-black text-lg text-primary">
                {formatToken(latestAuction?.referralFee ?? 10 * 10 ** 18)}
              </span>{" "}
              {String(tokenSymbol ?? "USDC")} from every bid:
            </div>
          ) : (
            <div className="text-lg font-light text-center items-center">Share FireBid:</div>
          )}
          <div className="flex gap-2 justify-center items-center">
            <button
              type="button"
              className="btn btn-accent btn-sm flex items-center gap-2"
              onClick={() => composeCast({ text: sharingText, embeds: [sharingUrl] })}
            >
              <FarcasterIcon className="w-4 h-4" /> Cast
            </button>
            <a
              className="btn btn-accent btn-sm flex items-center gap-2"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                sharingTextTwitter,
              )}&url=${encodeURIComponent(sharingUrl)}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              <XIcon className="w-4 h-4" /> Tweet
            </a>
            <a
              className="btn btn-accent btn-sm flex items-center gap-2"
              onClick={() => {
                navigator.clipboard.writeText(sharingUrl);
                toast.success("Link copied to clipboard");
              }}
              target="_blank"
              rel="noreferrer noopener"
            >
              <UrlCopyIcon className="w-4 h-4" /> Copy
            </a>
          </div>
        </div>

        {/* preapprove block */}
        {/* only show if wallet is connected */}
        {connectedAddress && (
          <div className="bg-base-100 p-4 rounded-xl shadow-md shadow-secondary border border-base-300 flex flex-col gap-1 mt-4">
            <div className="text-lg font-light text-center items-center">Pre-Approve for faster bidding</div>
            <div className="text-center items-center text-base-content/50 text-xs mb-2">
              Your current allowance is {allowance ? formatToken(allowance as bigint) : "0"}{" "}
              {String(tokenSymbol ?? "USDC")}.{" "}
            </div>
            <div className="flex gap-2 justify-center items-center">
              <button
                className="btn btn-accent btn-sm flex items-center gap-2"
                onClick={() => handlePreApprove(2000)}
                disabled={isApproving === 2000}
              >
                {isApproving === 2000 ? "Approving..." : "2,000" + " " + String(tokenSymbol ?? "USDC")}
              </button>
              <button
                className="btn btn-accent btn-sm flex items-center gap-2"
                onClick={() => handlePreApprove(10000)}
                disabled={isApproving === 10000}
              >
                {isApproving === 10000 ? "Approving..." : "10,000" + " " + String(tokenSymbol ?? "USDC")}
              </button>
              <button
                className="btn btn-secondary btn-sm flex items-center gap-2"
                onClick={handleRevoke}
                disabled={isRevoking}
              >
                {isRevoking ? "Revoking..." : "Revoke"}
              </button>
            </div>
          </div>
        )}

        {/* Current Auction Stats */}
        {latestAuction && userStats.length > 0 && (
          <div className="bg-base-100 mt-4 p-0 rounded-xl shadow-md shadow-secondary border border-base-300 flex flex-col">
            <div className="text-lg font-light text-center mt-3">Current Auction Stats</div>
            {(() => {
              const streamingEndTime = latestAuction?.streamingEndTime;
              if (!streamingEndTime)
                return <div className="text-xs text-center text-base-content/50">Streaming ended</div>;

              const serverTime = getServerTime();
              const currentSeconds = Math.floor(serverTime / 1000);
              const remaining = Math.max(0, Number(streamingEndTime) - currentSeconds);

              return remaining > 0 ? (
                <div className="text-xs text-center text-base-content/50">Streaming ends in {remaining} seconds</div>
              ) : (
                <div className="text-xs text-center text-base-content/50">Streaming ended</div>
              );
            })()}
            <div className="overflow-x-auto overflow-y-hidden">
              <table className="table table-sm w-full">
                <thead>
                  <tr>
                    <th className="py-1 pl-1 pr-px text-xs font-light">User</th>
                    <th className="py-1 px-px text-xs text-right font-light">
                      Bids / Last
                      <br />
                      Streamed
                    </th>
                    <th className="py-1 pr-1 pl-px text-xs text-right font-light">
                      Potential Win
                      <br />
                      Potential Loss
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {userStats.map(stat => (
                    <tr key={stat.address}>
                      <td className="p-1 text-xs">
                        <div className="flex items-center gap-2">
                          <AddressFarcaster size="xs" address={stat.address as `0x${string}`} />
                        </div>
                      </td>
                      <td className="p-1 text-right font-mono text-xs whitespace-nowrap">
                        <div className="text-base-content/70">
                          {stat.numBids > 0 ? stat.numBids + " / " + formatToken(stat.lastBidAmount) : " "}
                        </div>
                        <StreamingAmountWithData address={stat.address} allStreamingData={allStreamingData} />
                      </td>
                      <td className="p-1 text-right font-mono text-xs whitespace-nowrap">
                        <PotentialAmountsWithData
                          address={stat.address}
                          allStreamingData={allStreamingData}
                          totalFees={BigInt(stat.numBids) * ((latestAuction?.platformFee as bigint) || 0n)}
                          auctionValue={latestAuction?.auctionAmount as bigint}
                          nextBidAmount={
                            stat.isHighestBidder ? 0n : (nextBid as bigint) + ((platformFee as bigint) || 0n)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Bid history */}
        <div className="flex flex-col gap-4 mt-4">
          {/* if auction os nto ended yet */}
          {isAuctionActive && (
            <>
              {CurrentBidEvents.map(event => (
                <div
                  key={event.id}
                  className="flex items-center justify-center border border-base-300 rounded-xl bg-base-100 p-4 shadow-md shadow-secondary"
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex flex-col sm:flex-row items-center gap-2 text-sm">
                      <AddressFarcaster size="sm" address={event.bidder as `0x${string}`} />
                      <div className="">
                        bids <span className="font-black">{formatToken(event.amount as bigint)}</span>{" "}
                        {String(tokenSymbol ?? "USDC")}
                      </div>
                    </div>
                    <div className="text-xs text-base-content/50">{formatTimeAgo(event.timestamp as number)}</div>
                  </div>
                </div>
              ))}
            </>
          )}
          {PastAuctions.map(event => (
            <div
              key={String(event.auctionId)}
              className="relative flex flex-col items-center justify-center border border-base-300 rounded-xl bg-base-100 p-4 shadow-md shadow-secondary"
            >
              <div className="flex flex-col items-center gap-1">
                <div className="flex flex-col sm:flex-row items-center gap-2 text-sm">
                  <AddressFarcaster size="sm" address={event.winner as `0x${string}`} />
                  <div className="text-sm">
                    wins <span className="font-black">{formatToken((event.amount / 2n) as bigint)}</span>{" "}
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
                <div className="text-xs text-base-content/50">{formatTimeAgo(event.timestamp as number)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
