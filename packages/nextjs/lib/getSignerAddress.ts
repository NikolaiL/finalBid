// packages/nextjs/lib/getSignerAddress.ts
import { ethers } from "ethers";

export function getSignerAddress(): string {
  const privateKey = process.env.SERVER_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("SERVER_PRIVATE_KEY not found in environment variables");
  }

  // Create wallet from private key to get the address
  const wallet = new ethers.Wallet(privateKey);
  return wallet.address; // This is what goes in the contract
}
