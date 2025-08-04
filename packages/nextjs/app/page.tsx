"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { BugAntIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { MiniappUserInfo } from "~~/components/MiniappUserInfo";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

// Utility function to format USDC amounts (6 decimals)
const formatUSDC = (amount: bigint | undefined): string => {
  if (!amount) return "0.00";

  const amountNumber = Number(amount);
  const usdcAmount = amountNumber / 1000000; // 6 decimals for USDC
  return usdcAmount.toFixed(2);
};

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();

  const fromBlock = 0n;

  // get current auction id
  const { data: AuctionId, isLoading: isAuctionIdLoading } = useScaffoldReadContract({
    contractName: "FinalBidContract",
    functionName: "auctionId",
    watch: true, // Enable live updates
  });

  console.log(AuctionId);

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
  };

  console.log("AuctionData", auctionData);

  console.log("auctionAmount", auctionData.auctionAmount);

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

  const isLoading =
    isAuctionIdLoading ||
    isAuctionDataLoading ||
    isBidEventsLoading ||
    isAuctionEndedEventsLoading ||
    isAuctionCreatedEventsLoading;

  console.log("All events in chronological order:", allEvents);

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
                </div>
              </div>
              <h2 className="text-xl font-bold mb-4">Contract Events (Chronological Order)</h2>
              {allEvents?.map((event, index) => (
                <div key={`${event.transactionHash}-${event.logIndex}`} className="border p-3 mb-2 rounded">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-blue-600">{event.displayName}</span>
                      <span className="text-gray-500 ml-2">#{index + 1}</span>
                    </div>
                    <span className="text-sm text-gray-400">Block: {event.blockNumber.toString()}</span>
                  </div>

                  {/* Display event-specific data */}
                  {event.eventType === "BidPlaced" && (
                    <div className="mt-2 text-sm">
                      <span>Auction ID: {event.args?.auctionId?.toString()}</span>
                      <span className="ml-4">Bidder: {event.args?.bidder}</span>
                      <span className="ml-4">Amount: ${formatUSDC(event.args?.amount)}</span>
                      <span className="ml-4">Referral: {event.args?.referral}</span>
                    </div>
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

                  <div className="mt-1 text-xs text-gray-400">TX: {event.transactionHash}</div>
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
