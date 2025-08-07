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

  // let's convert AuctioNData to named properties
  const auctionData = {
    tokenAddress: AuctionData?.[0],
    auctionAmount: AuctionData?.[1],
    startTime: AuctionData?.[2],
    endTime: AuctionData?.[3],
    startingAmount: AuctionData?.[4],
    bidIncrement: AuctionData?.[5],
    referralFee: AuctionData?.[6],
    platformFee: AuctionData?.[7],
    bidCount: AuctionData?.[8],
    highestBidder: AuctionData?.[9],
    highestBid: AuctionData?.[10],
    ended: AuctionData?.[11],
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

  // Read allowance using useReadContract with automatic refetching
  const {
    data: allowance,
    refetch: refetchAllowance,
    isLoading: isAllowanceLoading,
  } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [connectedAddress, finalBidContractInfo?.address],
    query: {
      enabled: !!tokenAddress && !!connectedAddress && !!finalBidContractInfo?.address,
    },
  });

  console.log("Allowance:", allowance);
  console.log("Is Allowance Loading:", isAllowanceLoading);

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

  // Simple and reliable bid function
  const handlePlaceBid = async () => {
    if (!connectedAddress) {
      console.error("No connected address");
      return;
    }

    setIsBidding(true);
    setBidStatus("Checking allowance...");

    // Calculate the next bid amount
    const nextBidAmount = auctionData.highestBid
      ? auctionData.highestBid + (auctionData.bidIncrement || 0n) + (auctionData.platformFee || 0n)
      : (auctionData.startingAmount || 0n) + (auctionData.platformFee || 0n);

    console.log("Next Bid amount:", nextBidAmount);

    let { data: currentAllowance } = await refetchAllowance();
    currentAllowance = BigInt(currentAllowance as string);
    console.log("Current allowance:", currentAllowance);

    // Ensure currentAllowance is a bigint before comparison
    if (typeof currentAllowance === "bigint" && currentAllowance < nextBidAmount) {
      console.log("Current allowance is less than next bid amount, approving...");
      setBidStatus("Approving allowance...");

      const approvalTransaction = () =>
        writeTokenContractAsync({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [finalBidContractInfo?.address, nextBidAmount * 2n],
        });

      // Send approval transaction using useTransactor
      try {
        await writeApprovalTx(approvalTransaction, { blockConfirmations: 1 });
      } catch (error: any) {
        console.log("Error placing approval transaction", error);
        setIsBidding(false);
        setBidStatus("");
        return; // Exit early if user rejects
      }

      while ((currentAllowance as bigint) < nextBidAmount) {
        console.log("Current allowance is less than next bid amount, approving...");
        const { data: currentAllowance2 } = await refetchAllowance();
        currentAllowance = BigInt(currentAllowance2 as string);
        console.log("Current allowance after approval:", currentAllowance2);
        //wait half a second
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log("Approval confirmed, retrying bid...");

      // Wait a bit for the allowance to propagate

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Get referrer from sessionStorage, fallback to zero address
    let referrer = "0x0000000000000000000000000000000000000000";
    if (typeof window !== "undefined") {
      const storedRef = sessionStorage.getItem("referrer");
      if (storedRef && /^0x[a-fA-F0-9]{40}$/.test(storedRef)) {
        referrer = storedRef;
      }
      console.log("referrer used:", referrer);
    }

    try {
      // Always try to place the bid first
      console.log("Attempting to place bid...");
      setBidStatus("Placing bid...");

      try {
        await writeContractAsync(
          {
            functionName: "placeBid",
            args: [referrer],
          },
          {
            onError: (error: any) => {
              // Suppress "Insufficient allowance" error notifications
              console.log("Error in onError:", error);
              if (error instanceof Error && error.message.includes("Insufficient allowance")) {
                console.log("Suppressing 'Insufficient allowance' error notification in onError");
                return; // Don't show notification for this specific error
              }
              // Show notification for other errors
              setIsBidding(false);
              setBidStatus("");
            },
          },
        );
      } catch (error: any) {
        console.log("Error placing bid transaction", error);
        setIsBidding(false);
        setBidStatus("");
        return; // Exit early if user rejects
      }

      console.log("Bid placed successfully!");
    } catch (error: any) {
      console.error("Error placing bid:", error);
    } finally {
      // Reset button state
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

  const nextBidAmount = auctionData.highestBid
    ? auctionData.highestBid + (auctionData.bidIncrement || 0n)
    : auctionData.startingAmount || 0n;

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
                        <span className="text-gray-500 ml-2">Win ${formatUSDC(auctionData.auctionAmount)}</span>
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
                        {isBidding ? bidStatus : `Bid ${formatUSDC(nextBidAmount)} USDC`}
                      </button>
                      <div className="mt-1 text-gray-500 text-xs">
                        {isBidding ? "Please wait..." : `(${formatUSDC(auctionData.platformFee)} USDC fee applies)`}
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
                        <span className="ml-2 font-bold text-4xl">${formatUSDC(event.args?.amount)}</span>
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
                      <span className="ml-4">Token: {event.args?.tokenAddress}</span>
                      <span className="ml-4">Amount: {event.args?.auctionAmount?.toString()}</span>
                    </div>
                  )}

                  {event.eventType === "AuctionEnded" && (
                    <div className="mt-2 text-sm">
                      <span>Auction ID: {event.args?.auctionId?.toString()}</span>
                      <span className="ml-4">Winner: {event.args?.winner}</span>
                      <span className="ml-4">Amount: {event.args?.amount?.toString()}</span>
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
