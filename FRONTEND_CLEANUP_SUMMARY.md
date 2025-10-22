# Frontend Cleanup Summary

## Overview
Removed all streaming data functionality and obsolete schema references from the frontend to match the current FinalBidContract.sol implementation.

## Files Modified

### 1. `packages/nextjs/components/HomeClient.tsx`

#### Removed Components
- `StreamingAmountWithData` - Component for displaying streaming amounts
- `PotentialAmounts` - Component for calculating potential wins/losses with streaming
- `PotentialAmountsWithData` - Component for displaying potential amounts with pre-fetched streaming data

#### Removed Imports
- `useAllStreamingData, useStreamingData` from `~~/hooks/useStreamingData`

#### Field Name Updates
| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `bidIncrement` | Removed | Contract doesn't have separate bid increment |
| `platformFee` | `bidFee` | Total fee per bid |
| `highestBid` | Removed | Calculated from BidPlaced events |
| `startingAmount` | Removed | Not in event schema |
| `nextBid` | `currentAuctionAmount` | Simplified - just shows current pot |

#### Logic Changes

**Bid Calculation:**
```typescript
// OLD:
const nextBid = latestAuction?.highestBid
  ? (latestAuction.highestBid as bigint) + ((bidIncrement as bigint) || 0n)
  : (latestAuction?.startingAmount as bigint) || 0n;

// NEW:
const currentAuctionAmount = latestAuction?.auctionAmount || 0n;
```

**Required Amount for Bidding:**
```typescript
// OLD:
const calcRequiredAmount = () => {
  const nextBid = latestAuction?.highestBid + ((bidIncrement as bigint) || 0n);
  const required = nextBid + ((platformFee as bigint) || 0n);
  return required + ((platformFee as bigint) || 0n);
};

// NEW:
const calcRequiredAmount = () => {
  return (bidFee as bigint) || 0n;
};
```

**Current Bid Display:**
```typescript
// OLD:
const currentBid = (latestAuction?.highestBid as bigint) || (latestAuction?.startingAmount as bigint) || 0n;

// NEW:
const latestBidEvent = CurrentBidEvents[0];
const currentBid = (latestBidEvent?.auctionAmount as bigint) || 0n;
```

**User Statistics:**
- Removed streaming amount calculations
- Simplified to show only: number of bids, total spent
- Removed potential profit/loss calculations that relied on streaming

#### UI Text Changes

**Main Description:**
```
OLD: "50% goes to the winner. 50% is streamed to the last 10 bidders"
NEW: "Winner takes all the pot!"
```

**Sharing Text:**
```
OLD: "place a X bid and win half of it! Plus, everyone wins: the other half gets streamed"
NEW: "place a X bid and win it all!"
```

**Bid Button:**
```
OLD: "Bid ${formatToken(nextBid)} ${tokenSymbol}"
NEW: "Place Bid"
```

**Fee Display:**
```
OLD: "(platformFee fee applies)"
NEW: "(bidFee bid fee)"
```

**Bid History:**
```
OLD: "bids ${amount} USDC"
NEW: "placed a bid - pot now at ${auctionAmount} USDC"
```

**Past Auctions:**
```
OLD: "wins ${amount/2} USDC with a ${highestBid} bid"
NEW: "wins ${amount} USDC"
```

#### Removed Sections
- Potential amounts calculation section (Stop Now vs Bid Now)
- Streaming stats table columns
- Streaming end time countdown

#### Updated Stats Table
| Old Columns | New Columns |
|-------------|-------------|
| User | User |
| Bids / Last / Streamed | Bids |
| Potential Win / Loss | Total Spent |

### 2. `packages/nextjs/app/about/page.tsx`

#### Field Updates
```typescript
// OLD:
const platformFee = (latestAuction?.platformFee as bigint) ?? (0n as bigint);
const referralFeePercentage = Math.round((Number(referralFee) / Number(platformFee)) * 100);

// NEW:
const bidFee = (latestAuction?.bidFee as bigint) ?? (0n as bigint);
const referralFeePercentage = Math.round((Number(referralFee) / Number(bidFee)) * 100);
```

#### Content Updates

**How It Works:**

OLD:
- ✗ Highest bid wins 1/2 of the prize pot
- ✗ The other 1/2 is streamed to last 10 bidders
- ✗ If you're outbid, your bid is returned
- ✗ Bidding fee breakdown with streaming references

NEW:
- ✓ Highest bidder wins the entire prize pot
- ✓ Each bid costs X and increases pot by Y%
- ✓ Referral rewards and platform cost breakdown
- ✓ Auction extension mechanic

## Schema Field Mapping

### BidPlaced Event
| Event Field | Frontend Usage |
|-------------|----------------|
| `auctionId` | Filter current auction bids |
| `bidder` | Display bidder address |
| `referral` | Track referrals (backend) |
| `endTime` | Show auction countdown |
| `auctionAmount` | **Show current pot size** |
| `bidCount` | Track number of bids |

### AuctionCreated Event
| Event Field | Frontend Usage |
|-------------|----------------|
| `auctionId` | Auction identifier |
| `auctionAmount` | Initial pot amount |
| `startTime` | Auction start |
| `endTime` | Auction end countdown |
| `referralFee` | Display referral rewards |
| `deployerFee` | Show platform fee |
| `bidFee` | **Display bid cost** |
| `highestBidder` | Show current leader |

### AuctionEnded Event
| Event Field | Frontend Usage |
|-------------|----------------|
| `auctionId` | Past auction ID |
| `winner` | Winner address |
| `amount` | **Full prize amount** |

## Breaking Changes

### For Users
1. **No more streaming rewards** - Only the highest bidder wins
2. **Winner takes all** - Gets the full pot, not 50%
3. **Simpler fee structure** - Just one `bidFee` instead of multiple fees

### For Developers
1. Remove all `useStreamingData` hook usage
2. Replace `platformFee` with `bidFee`
3. Remove `highestBid`, `bidIncrement`, `startingAmount` references
4. Use `auctionAmount` from `BidPlaced` events for current bid display
5. Winner receives full `amount` from `AuctionEnded` event (not divided by 2)

## Testing Checklist

- [ ] Auction displays current pot correctly
- [ ] Bid button shows correct fee
- [ ] Bid history shows pot progression
- [ ] Past auctions show full prize amount
- [ ] User stats table displays correctly
- [ ] About page describes current mechanics
- [ ] No console errors related to missing fields
- [ ] Referral rewards calculate correctly

## Next Steps

1. Test auction flow end-to-end
2. Reset Ponder database to re-index with new schema
3. Deploy updated frontend
4. Update any external documentation

## Notes

- The contract logic is simpler now: each bid adds `(bidFee - referralFee - deployerFee)` to the pot
- Removed all complexity around streaming calculations
- UI is cleaner and easier to understand
- Gas costs should be lower without streaming logic


