import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

// Types
interface VerifyAndSignRequest {
  address: string;
  humanProof: string;
  auctionId: string;
}

interface AccessToken {
  message: {
    wallet: string;
    timestamp: number;
    auctionId: string;
  };
  signature: string;
}

// Verify reCAPTCHA token
async function verifyRecaptcha(token: string): Promise<boolean> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    console.error("RECAPTCHA_SECRET_KEY not found in environment variables");
    return false;
  }

  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `secret=${secretKey}&response=${token}`,
    });

    const data = await response.json();

    // Log the full reCAPTCHA response for debugging
    console.log("reCAPTCHA response:", {
      success: data.success,
      score: data.score,
      action: data.action,
      hostname: data.hostname,
      challenge_ts: data.challenge_ts,
      error_codes: data["error-codes"],
    });

    // Check if the request was successful
    if (!data.success) {
      console.log("reCAPTCHA verification failed - success: false");
      return false;
    }

    // Check the score (0.0 = bot, 1.0 = human)
    // Using 0.5 as the default threshold as recommended by Google
    const scoreThreshold = 0.5;
    const score = data.score || 0;

    console.log(`reCAPTCHA score: ${score} (threshold: ${scoreThreshold})`);

    if (score < scoreThreshold) {
      console.log(`reCAPTCHA score too low: ${score} < ${scoreThreshold}`);
      return false;
    }

    // Verify the action matches what we expect
    const expectedAction = "bid";
    if (data.action !== expectedAction) {
      console.log(`reCAPTCHA action mismatch: expected '${expectedAction}', got '${data.action}'`);
      return false;
    }

    console.log("reCAPTCHA verification successful");
    return true;
  } catch (error) {
    console.error("reCAPTCHA verification failed:", error);
    return false;
  }
}

// Sign message with server private key
async function signMessage(message: { wallet: string; timestamp: number; auctionId: string }): Promise<string> {
  const privateKey = process.env.SERVER_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("SERVER_PRIVATE_KEY not found in environment variables");
  }

  try {
    // Create message hash using abi.encodePacked equivalent
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(["address", "uint256", "uint256"], [message.wallet, message.timestamp, message.auctionId]),
    );

    // Create Ethereum signed message hash
    // const ethSignedMessageHash = ethers.keccak256(
    //   ethers.solidityPacked(
    //     ["string", "bytes32"],
    //     ["\x19Ethereum Signed Message:\n32", messageHash]
    //   )
    // );

    // Sign with server private key
    const wallet = new ethers.Wallet(privateKey);
    const signature = await wallet.signMessage(ethers.getBytes(messageHash));

    return signature;
  } catch (error) {
    console.error("Message signing failed:", error);
    throw new Error("Failed to sign message");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyAndSignRequest = await request.json();
    const { address, humanProof, auctionId } = body;

    // Validate input
    if (!address || !humanProof || !auctionId) {
      return NextResponse.json({ error: "Missing required fields: address, humanProof, auctionId" }, { status: 400 });
    }

    // Validate Ethereum address
    if (!ethers.isAddress(address)) {
      return NextResponse.json({ error: "Invalid Ethereum address" }, { status: 400 });
    }

    // Step 1: Verify human proof (reCAPTCHA)
    console.log("Verifying human proof...");
    const isHuman = await verifyRecaptcha(humanProof);
    if (!isHuman) {
      console.log("reCAPTCHA verification failed for token:", humanProof);
      return NextResponse.json({ error: "Human verification failed" }, { status: 400 });
    }

    // Step 2: Generate signed message
    console.log("Generating signed message...");
    const timestamp = Math.floor(Date.now() / 1000);
    const message = {
      wallet: address,
      timestamp,
      auctionId,
    };

    // Step 3: Sign with server private key
    const signature = await signMessage(message);

    const accessToken: AccessToken = {
      message,
      signature,
    };

    console.log("Access token generated successfully for:", address);
    return NextResponse.json({ accessToken });
  } catch (error) {
    console.error("Error in verify-and-sign:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
