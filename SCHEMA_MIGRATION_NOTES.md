# Ponder Schema Migration Notes

## Changes Made to Ponder Schema

The Ponder schema has been updated to match the actual FinalBidContract.sol events.

### Smart Contract Events (Actual)

1. **AuctionCreated**: `auctionId`, `auctionAmount`, `startTime`, `endTime`, `referralFee`, `deployerFee`, `bidFee`
2. **BidPlaced**: `auctionId`, `bidder`, `referral`, `endTime`, `auctionAmount`, `bidCount`
3. **AuctionEnded**: `auctionId`, `winner`, `amount`

### Schema Changes

#### `auctionCreated` Table
**Removed fields:**
- `streamingEndTime` - Not in contract event
- `startingAmount` - Not in contract event  
- `bidIncrement` - Not in contract event
- `platformFee` - Contract uses `bidFee` instead
- `highestBid` - Not emitted, computed from BidPlaced events

**Added fields:**
- `referralFee` - From contract event
- `deployerFee` - From contract event
- `bidFee` - From contract event (this is the total fee per bid)

**Kept computed fields:**
- `bidCount` - Updated by BidPlaced handler
- `highestBidder` - Updated by BidPlaced handler

#### `bidPlaced` Table
**Changed fields:**
- `amount` → `auctionAmount` - To match event parameter name
- `bidCount` - Now stored as bigint to match event type

#### `auctionEnded` Table
**Removed fields:**
- `highestBid` - Not in contract event

#### `streamingData` Table
**Removed** - No corresponding event in current contract

### Frontend Code That Needs Updates

The following frontend code references old schema fields and needs to be updated:

#### `packages/nextjs/components/HomeClient.tsx`
Issues:
- Line 506: References `bidIncrement` (doesn't exist)
- Line 507: References `platformFee` (should be `bidFee`)
- Line 511-513: References `highestBid` and `startingAmount`
- Lines 521, 1321-1333: References `streamingEndTime` 
- Multiple places: Uses `platformFee` instead of `bidFee`

**Recommended changes:**
```typescript
// OLD:
const bidIncrement = latestAuction?.bidIncrement;
const platformFee = latestAuction?.platformFee;
const nextBid = latestAuction?.highestBid ? ...

// NEW:
const bidFee = latestAuction?.bidFee;
// Calculate next bid from current auctionAmount (which gets updated on each bid)
const nextBid = latestAuction?.auctionAmount; // The current auction amount IS the next bid
```

#### `packages/nextjs/app/about/page.tsx`
Issues:
- Line 54: References `platformFee` (should use `bidFee`)
- Line 57-59: Fee percentage calculations assume `platformFee`

**Recommended changes:**
```typescript
// OLD:
const platformFee = (latestAuction?.platformFee as bigint) ?? (0n as bigint);

// NEW:  
const bidFee = (latestAuction?.bidFee as bigint) ?? (0n as bigint);
```

### Migration Strategy

1. **Rebuild Ponder database** - The schema changes require re-indexing from scratch
2. **Update frontend code** - Replace all references to removed fields
3. **Update logic** - The contract doesn't have separate `bidIncrement`, instead each bid adds `(bidFee - referralFee - deployerFee)` to the auction amount
4. **Remove streaming-related UI** - The current contract doesn't have streaming functionality

### Contract Logic Clarification

Based on the smart contract code:

```solidity
// Line 180 in FinalBidContract.sol
auction.auctionAmount += (bidFee - referralFee - deployerFee);
```

- Each bid increases the auction pot by `(bidFee - referralFee - deployerFee)`
- The `auctionAmount` field in the event represents the TOTAL pot (not the next bid amount)
- There's no separate `bidIncrement` - it's implicitly `bidFee - referralFee - deployerFee`
- The winner receives the full `auctionAmount` when auction ends

### Next Steps

1. Update `HomeClient.tsx` to use correct field names
2. Update `AboutPage.tsx` to use correct field names
3. Remove or comment out streaming-related functionality
4. Reset Ponder database and re-index
5. Test auction flow end-to-end

