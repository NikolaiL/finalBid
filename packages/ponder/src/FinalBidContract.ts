// @ts-nocheck
import { ponder } from "ponder:registry";
import { auctionCreated, auctionEnded, bidPlaced } from "ponder:schema";
import { eq, and, gt } from "drizzle-orm";
import { getFarcasterUser } from "../../nextjs/lib/farcaster";

// Get or create global change emitter instance
type Listener = () => void;

class ChangeEmitter {
  private listeners: Set<Listener> = new Set();

  emit() {
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (e) {
        console.error("Listener error:", e);
      }
    });
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const getChangeEmitter = (): ChangeEmitter => {
  if (!(globalThis as any).__PONDER_CHANGE_EMITTER__) {
    (globalThis as any).__PONDER_CHANGE_EMITTER__ = new ChangeEmitter();
  }
  return (globalThis as any).__PONDER_CHANGE_EMITTER__;
};

const formatTokenString = (amount: number, decimals: number, digits: number, tokenSymbol: string): string => {
  const tokenAmount = amount / 10 ** decimals;
  return tokenAmount.toFixed(digits) + " " + String(tokenSymbol ?? "");
};

const changeEmitter = getChangeEmitter();

const reportNewBid = async (event: any) => {
  // we need to have process.env.REPORT_NEW_BID_URL and process.env.REPORT_NEW_BID_API_KEY

  const timestamp = Number(event.block.timestamp);
  // if it's not withinn last 20 seconds return to avoid reporting old bids

  if (timestamp < Math.floor(Date.now()/1000) - 20) {
    console.error("Bid is too old to report", timestamp, Math.floor(Date.now()/1000) - 20);
    return;
  }

  try {

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const url = process.env.NEYNAR_POST_URL;
    const apiKey = process.env.NEYNAR_API_KEY;
    const signerUuid = process.env.NEYNAR_SIGNER_UUID;

    const userRequestUrl = `${appUrl}/api/farcaster-user?address=${event.args.bidder}`;
    
    const user = await fetch(userRequestUrl).then(res => res.json());
    const username = user?.user?.username ? "@" + user.user.username : "Someone";
    
    const tokenSymbol = process.env.TOKEN_SYMBOL ? '$' + process.env.TOKEN_SYMBOL : "";
    const tokenDecimals = process.env.TOKEN_DECIMALS ? Number(process.env.TOKEN_DECIMALS) : 18;
    const tokenDigits = process.env.TOKEN_DIGITS !== null ? Number(process.env.TOKEN_DIGITS) : 0;
    const amount = formatTokenString(Number(event.args.auctionAmount), tokenDecimals, tokenDigits, tokenSymbol);
    console.log("Amount", amount, event.args.auctionAmount);

    const postText = `${username} just added some tokens to the pot. The pot is ${amount} now. It's time to grab it:`;
    const idem = event.transaction.hash;
    const data = {
      text: postText,
      signer_uuid: signerUuid,
      embeds: [{
        url: appUrl,
      }],
      idem: idem,
    };
    const body = JSON.stringify(data);
    console.log("Data to report", data);



    if (!process.env.NEYNAR_POST_URL || !process.env.NEYNAR_API_KEY || !process.env.NEYNAR_SIGNER_UUID) {
      console.error("NEYNAR_POST_URL, NEYNAR_API_KEY, or NEYNAR_SIGNER_UUID is not set");
      return;
    }


    


    console.log("Reporting new bid to", url, body, Number(event.args.auctionAmount));
    const response = await fetch(url, {
      method: "POST",
      headers: { 'x-api-key': `${apiKey}`, 'Content-Type': 'application/json' },
      body: body,
    });
    console.log("Reported new bid to", url, response.status, response.statusText, response);
  } catch (error) {
    console.error("Error reporting new bid to Neynar", error.code, error.message, error.property, error.status);
    return true;
  }
};


/*
curl --request POST \
  --url https://api.neynar.com/v2/farcaster/cast/ \
  --header 'Content-Type: application/json' \
  --header 'x-api-key: <api-key>' \
  --data '{
  "signer_uuid": "19d0c5fd-9b33-4a48-a0e2-bc7b0555baec",
  "text": "<string>",
  "embeds": [
    {
      "cast_id": {
        "hash": "<string>",
        "fid": 3
      }
    }
  ],
  "parent": "<string>",
  "channel_id": "neynar",
  "idem": "<string>",
  "parent_author_fid": 3
}'
*/

ponder.on("FinalBidContract:AuctionCreated", async ({ event, context }) => {
  await context.db.insert(auctionCreated).values({
    auctionId: event.args.auctionId,
    hash: event.transaction.hash,
    auctionAmount: event.args.auctionAmount,
    startTime: event.args.startTime,
    endTime: event.args.endTime,
    referralFee: event.args.referralFee,
    deployerFee: event.args.deployerFee,
    bidFee: event.args.bidFee,
    bidCount: 0,
    highestBidder: "0x0000000000000000000000000000000000000000",
    blockNumber: BigInt(event.block.number as any),
    logIndex: Number((event.log as any)?.index ?? 0),
    timestamp: BigInt(event.block.timestamp),
  });
  console.log("AuctionCreated", event.args.auctionId, event.args.auctionAmount, event.args.startTime, event.args.endTime);
  
  // Notify SSE clients of data change
  changeEmitter.emit();
});

ponder.on("FinalBidContract:BidPlaced", async ({ event, context }) => {
  const id = `${event.transaction.hash}-${event.log.index}`;
  await context.db.insert(bidPlaced).values({
    id,
    hash: event.transaction.hash,
    auctionId: event.args.auctionId,
    bidder: event.args.bidder,
    referral: event.args.referral,
    endTime: event.args.endTime,
    auctionAmount: event.args.auctionAmount,
    bidCount: event.args.bidCount,
    blockNumber: BigInt(event.block.number as any),
    logIndex: Number((event.log as any)?.index ?? 0),
    timestamp: BigInt(event.block.timestamp),
  });
  await context.db.update(auctionCreated, {auctionId: event.args.auctionId}).set({
    auctionAmount: event.args.auctionAmount,
    highestBidder: event.args.bidder,
    endTime: event.args.endTime,
    bidCount: Number(event.args.bidCount),
  });
  console.log("BidPlaced", event.args.auctionId, event.args.bidder, event.args.auctionAmount, event.args.referral, event.args.endTime);
  
  // Notify SSE clients of data change
  changeEmitter.emit();

  await reportNewBid(event);

});

ponder.on("FinalBidContract:AuctionEnded", async ({ event, context }) => {
  await context.db.insert(auctionEnded).values({
    auctionId: event.args.auctionId,
    hash: event.transaction.hash,
    winner: event.args.winner,
    amount: event.args.amount,
    blockNumber: BigInt(event.block.number as any),
    logIndex: Number((event.log as any)?.index ?? 0),
    timestamp: BigInt(event.block.timestamp),
  });
  await context.db.update(auctionCreated, {auctionId: event.args.auctionId}).set({
    ended: true,
  });
  console.log("AuctionEnded", event.args.auctionId, event.args.winner, event.args.amount);
  
  // Notify SSE clients of data change
  changeEmitter.emit();
});


