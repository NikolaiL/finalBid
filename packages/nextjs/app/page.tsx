"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount, useBlockNumber, useReadContract, useWriteContract } from "wagmi";
import { BugAntIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { MiniappUserInfo } from "~~/components/MiniappUserInfo";
import { Address } from "~~/components/scaffold-eth";
import {
  useDeployedContractInfo,
  useScaffoldEventHistory,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTransactor,
} from "~~/hooks/scaffold-eth";

// Utility function to format USDC amounts (6 decimals)
const formatUSDC = (amount: bigint | undefined): string => {
  if (!amount) return "0.00";

  const amountNumber = Number(amount);
  const usdcAmount = amountNumber / 1000000; // 6 decimals for USDC
  return usdcAmount.toFixed(2);
};

const Home: NextPage = () => {
  let isLoading = true;
  const { address: connectedAddress } = useAccount();

  // get the latest block number and decrease by 500
  const { data: latestBlock } = useBlockNumber({ watch: true });
  const fromBlock = latestBlock ? (latestBlock > 500n ? latestBlock - 500n : 0n) : 0n;
  // get current auction id
  const { data: AuctionId, isLoading: isAuctionIdLoading } = useScaffoldReadContract({
    contractName: "FinalBidContract",
    functionName: "auctionId",
    watch: true, // Enable live updates
  });

  // get current auction data and keep it updated
  const { data: AuctionData, isLoading: isAuctionDataLoading } = useScaffoldReadContract({
    contractName: "FinalBidContract",
    functionName: "auctions",
    args: [AuctionId],
    watch: true, // Enable live updates
  });

  // Map Auction tuple from contract (no tokenAddress in struct)
  const auctionData = {
    auctionAmount: AuctionData?.[0],
    startTime: AuctionData?.[1],
    endTime: AuctionData?.[2],
    startingAmount: AuctionData?.[3],
    bidIncrement: AuctionData?.[4],
    referralFee: AuctionData?.[5],
    platformFee: AuctionData?.[6],
    bidCount: AuctionData?.[7],
    highestBidder: AuctionData?.[8],
    highestBid: AuctionData?.[9],
    ended: AuctionData?.[10],
    auctionId: AuctionId,
    readyToEnd: false,
  };

  const { data: BidEvents, isLoading: isBidEventsLoading } = useScaffoldEventHistory({
    contractName: "FinalBidContract",
    eventName: "BidPlaced",
    fromBlock: fromBlock,
    watch: true, // Enable live updates
  });

  const { data: AuctionEndedEvents, isLoading: isAuctionEndedEventsLoading } = useScaffoldEventHistory({
    contractName: "FinalBidContract",
    eventName: "AuctionEnded",
    fromBlock: fromBlock,
    watch: true, // Enable live updates
  });

  const { data: AuctionCreatedEvents, isLoading: isAuctionCreatedEventsLoading } = useScaffoldEventHistory({
    contractName: "FinalBidContract",
    eventName: "AuctionCreated",
    fromBlock: fromBlock,
    watch: true, // Enable live updates
  });

  // Combine all events and sort them chronologically
  const allEvents = useMemo(() => {
    const events: any[] = [];

    // Add BidPlaced events
    if (BidEvents) {
      BidEvents.forEach((event: any) => {
        events.push({
          ...event,
          eventType: "BidPlaced",
          displayName: "Bid Placed",
        });
      });
    }

    // Add AuctionEnded events
    if (AuctionEndedEvents) {
      AuctionEndedEvents.forEach((event: any) => {
        events.push({
          ...event,
          eventType: "AuctionEnded",
          displayName: "Auction Ended",
        });
      });
    }

    // Add AuctionCreated events
    if (AuctionCreatedEvents) {
      AuctionCreatedEvents.forEach((event: any) => {
        events.push({
          ...event,
          eventType: "AuctionCreated",
          displayName: "Auction Created",
        });
      });
    }

    // Sort by block number and log index
    return events.sort((a: any, b: any) => {
      if (a.blockNumber !== b.blockNumber) {
        return Number(b.blockNumber - a.blockNumber);
      }
      return Number(b.logIndex - a.logIndex);
    });
  }, [BidEvents, AuctionEndedEvents, AuctionCreatedEvents]);

  isLoading =
    isAuctionIdLoading ||
    isAuctionDataLoading ||
    isBidEventsLoading ||
    isAuctionEndedEventsLoading ||
    isAuctionCreatedEventsLoading;

  const { writeContractAsync } = useScaffoldWriteContract({
    contractName: "FinalBidContract",
  });

  // Get current timestamp
  const [currentTimestamp, setCurrentTimestamp] = useState<bigint>(BigInt(Math.floor(Date.now() / 1000)));

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

  auctionData.readyToEnd =
    auctionData.endTime &&
    currentTimestamp &&
    auctionData.endTime > currentTimestamp &&
    !auctionData.ended &&
    (auctionData.highestBid || 0n) < (auctionData.auctionAmount || 0n)
      ? false
      : true;

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

  // Compute required token amount for the next bid (includes platform fee)
  const calcRequiredAmount = () =>
    auctionData.highestBid
      ? auctionData.highestBid + (auctionData.bidIncrement || 0n) * 3n + (auctionData.platformFee || 0n) * 3n
      : (auctionData.startingAmount || 0n) +
        (auctionData.bidIncrement || 0n) * 3n +
        (auctionData.platformFee || 0n) * 3n;

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

  //
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimestamp(BigInt(Math.floor(Date.now() / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const displayNextBidAmount = useMemo(
    () =>
      auctionData.highestBid
        ? auctionData.highestBid + (auctionData.bidIncrement || 0n)
        : auctionData.startingAmount || 0n,
    [auctionData.highestBid, auctionData.bidIncrement, auctionData.startingAmount],
  );

  return (
    <>
      <div className="flex items-center flex-col grow pt-2">
        <div className="px-5">
          {/* if isLoading, show a loading spinner */}
          {isLoading ? (
            <div className="flex justify-center items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900"></div>
            </div>
          ) : (
            <>
              {!isAuctionDataLoading && (auctionData.auctionId || 0n) > 0n && (
                <div>
                  <h2 className="text-xl font-bold mb-4">Current Auction Data</h2>
                  <div className="border p-3 mb-2 rounded">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-blue-600">Auction ID</span>
                        <span className="text-gray-500 ml-2">#{AuctionId}</span>
                      </div>
                      <div>
                        <span className="font-bold text-blue-600">Auction Data</span>
                        <span className="text-gray-500 ml-2">
                          Win {formatUSDC(auctionData.auctionAmount as unknown as bigint)} {String(tokenSymbol ?? "")}
                        </span>
                      </div>
                      <div>
                        <span className="font-bold text-blue-600">Auction Ends In</span>
                        <span className="text-gray-500 ml-2">
                          {auctionData.endTime && currentTimestamp ? Number(auctionData.endTime - currentTimestamp) : 0}{" "}
                          seconds
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="rounded my-4 text-center w-full">
                {AuctionId === 0n && (
                  <button
                    className="btn btn-primary text-xl"
                    onClick={async () => {
                      console.log("Starting auction");
                      await writeContractAsync({
                        functionName: "startAuction",
                      });
                    }}
                  >
                    Start Auction
                  </button>
                )}
                {AuctionId &&
                  AuctionId > 0n &&
                  !auctionData.readyToEnd &&
                  auctionData.highestBidder != connectedAddress && (
                    <div>
                      <button
                        className="btn btn-primary text-xl transition-all"
                        onClick={handlePlaceBid}
                        disabled={isBidding}
                      >
                        {isBidding
                          ? bidStatus
                          : `Bid ${formatUSDC(displayNextBidAmount as unknown as bigint)} ${String(tokenSymbol ?? "")}`}
                      </button>
                      <div className="mt-1 text-gray-500 text-xs">
                        {isBidding
                          ? "Please wait..."
                          : `(${formatUSDC(auctionData.platformFee)} ${String(tokenSymbol ?? "")} fee applies)`}
                      </div>
                    </div>
                  )}
                {AuctionId &&
                  AuctionId > 0n &&
                  !auctionData.readyToEnd &&
                  auctionData.highestBidder == connectedAddress && (
                    <div className="text-gray-500 ml-2">You are the highest bidder!</div>
                  )}
                {AuctionId && AuctionId > 0n && auctionData.readyToEnd && (
                  <button
                    className="btn btn-primary text-xl"
                    onClick={async () => {
                      console.log("Ending auction and starting a new one");
                      await writeContractAsync({
                        functionName: "startAuction",
                      });
                    }}
                  >
                    {auctionData.highestBidder == connectedAddress
                      ? "🎉 Congrats! Collect your winnings!"
                      : "Start a New Auction"}
                  </button>
                )}
              </div>
              <h2 className="text-lg mb-4 w-full text-center">Bid Story</h2>
              {allEvents?.map(event => (
                <div
                  key={`${event.transactionHash}-${event.logIndex}`}
                  className="border mb-4 px-3 py-2 rounded-xl shadow-lg"
                >
                  {/* Display event-specific data */}
                  {event.eventType === "BidPlaced" && (
                    <>
                      <div className="mt-2 text-xl flex justify-center w-full items-center">
                        <Address address={event.args?.bidder} size="xl" />
                        <span className="ml-2">bids</span>
                        <span className="ml-2 font-bold text-4xl">
                          {formatUSDC(event.args?.amount as unknown as bigint)}
                        </span>
                        <span className="ml-2">{String(tokenSymbol ?? "")}</span>
                      </div>
                      {event.args?.referral &&
                        event.args?.referral !== "0x0000000000000000000000000000000000000000" && (
                          <div className="opacity-50 mt-2 text-xs flex justify-center w-full items-center">
                            <span className="ml-4 flex mr-2">Referred by:</span>
                            <Address address={event.args?.referral} size="xs" />
                          </div>
                        )}
                    </>
                  )}

                  {event.eventType === "AuctionCreated" && (
                    <div className="mt-2 text-sm">
                      <span>Auction ID: {event.args?.auctionId?.toString()}</span>
                      <span className="ml-4">
                        Amount: {formatUSDC(event.args?.auctionAmount as unknown as bigint)} {String(tokenSymbol ?? "")}
                      </span>
                    </div>
                  )}

                  {event.eventType === "AuctionEnded" && (
                    <div className="mt-2 text-sm">
                      <span>Auction ID: {event.args?.auctionId?.toString()}</span>
                      <span className="ml-4">
                        Winner: <Address address={event.args?.winner} size="xs" />
                      </span>
                      <span className="ml-4">
                        Amount: {formatUSDC(event.args?.amount as unknown as bigint)} {String(tokenSymbol ?? "")}
                      </span>
                    </div>
                  )}

                  {event.eventType === "AuctionCancelled" && (
                    <div className="mt-2 text-sm">
                      <span>Auction ID: {event.args?.auctionId?.toString()}</span>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
          <div className="flex justify-center items-center space-x-2 flex-col">
            <p className="my-2 font-medium">Connected Address:</p>
            <Address address={connectedAddress} />
          </div>

          {/* MiniApp User Info */}
          <MiniappUserInfo />
          <p className="text-center text-lg">
            Get started by editing{" "}
            <code className="italic bg-base-300 text-base font-bold max-w-full break-words break-all inline-block">
              packages/nextjs/app/page.tsx
            </code>
          </p>
          <p className="text-center text-lg">
            Edit your smart contract{" "}
            <code className="italic bg-base-300 text-base font-bold max-w-full break-words break-all inline-block">
              YourContract.sol
            </code>{" "}
            in{" "}
            <code className="italic bg-base-300 text-base font-bold max-w-full break-words break-all inline-block">
              packages/hardhat/contracts
            </code>
          </p>
        </div>

        <div className="grow bg-base-300 w-full mt-16 px-8 py-12">
          <div className="flex justify-center items-center gap-12 flex-col md:flex-row">
            <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-xs rounded-3xl">
              <BugAntIcon className="h-8 w-8 fill-secondary" />
              <p>
                Tinker with your smart contract using the{" "}
                <Link href="/debug" passHref className="link">
                  Debug Contracts
                </Link>{" "}
                tab.
              </p>
            </div>
            <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-xs rounded-3xl">
              <MagnifyingGlassIcon className="h-8 w-8 fill-secondary" />
              <p>
                Explore your local transactions with the{" "}
                <Link href="/blockexplorer" passHref className="link">
                  Block Explorer
                </Link>{" "}
                tab.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
