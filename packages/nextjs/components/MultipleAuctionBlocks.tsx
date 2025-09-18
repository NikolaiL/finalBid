"use client";

import ExternalAuctionBlock from "~~/components/ExternalAuctionBlock";

// Example component showing how to use multiple ExternalAuctionBlock components
// with different configurations for different auctions
export default function MultipleAuctionBlocks() {
  return (
    <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 lg:px-6">
      <div className="flex flex-col gap-4 py-4 px-2">
        <h2 className="text-2xl font-bold text-center">Multiple Auction Blocks Example</h2>

        {/* DEGEN Auction */}
        <ExternalAuctionBlock
          infoUrl="https://firebid-degen.altumbase.com/ponder/latest-auction"
          miniappUrl="https://firebid-degen.altumbase.com"
          tokenName="DEGEN"
          displayDecimals={0}
          tokenDecimals={18}
          className="border-l-4 border-l-orange-500"
        />

        {/* USDC Auction (example) */}
        <ExternalAuctionBlock
          infoUrl="https://firebid-usdc.altumbase.com/ponder/latest-auction"
          miniappUrl="https://firebid-usdc.altumbase.com"
          tokenName="USDC"
          displayDecimals={2}
          tokenDecimals={6}
          className="border-l-4 border-l-blue-500"
        />

        {/* ETH Auction (example) */}
        <ExternalAuctionBlock
          infoUrl="https://firebid-eth.altumbase.com/ponder/latest-auction"
          miniappUrl="https://firebid-eth.altumbase.com"
          tokenName="ETH"
          displayDecimals={4}
          tokenDecimals={18}
          className="border-l-4 border-l-purple-500"
        />

        {/* Custom styled auction */}
        <ExternalAuctionBlock
          infoUrl="https://firebid-custom.altumbase.com/ponder/latest-auction"
          miniappUrl="https://firebid-custom.altumbase.com"
          tokenName="CUSTOM"
          displayDecimals={1}
          tokenDecimals={12}
          className="bg-gradient-to-r from-pink-500 to-violet-500 text-white border-0"
        />
      </div>
    </div>
  );
}
