import fs from "fs/promises";
import path from "path";
import { createPublicClient, http } from "viem";
import scaffoldConfig from "~~/scaffold.config";

export type TokenMeta = {
  tokenAddress: `0x${string}`;
  symbol: string;
  decimals: number;
};

// Reads token meta from static file or /tmp; if missing, fetches from chain and caches to /tmp
export async function readTokenMeta(): Promise<TokenMeta | null> {
  const staticPath = path.join(process.cwd(), "public/token-meta.json");
  console.log("staticPath", staticPath);
  const tmpPath = "/tmp/token-meta.json";

  const tryRead = async (p: string) => {
    try {
      const data = await fs.readFile(p, "utf8");
      return JSON.parse(data) as TokenMeta & Record<string, unknown>;
    } catch {
      return null;
    }
  };

  let meta = await tryRead(staticPath);
  if (meta && meta.tokenAddress && meta.symbol && typeof meta.decimals === "number") {
    return meta as TokenMeta;
  }

  meta = await tryRead(tmpPath);
  if (meta && meta.tokenAddress && meta.symbol && typeof meta.decimals === "number") {
    return meta as TokenMeta;
  }

  // Fallback to RPC once
  try {
    // Select chain from scaffold.config.ts (first target network)
    const targetChain = scaffoldConfig.targetNetworks[0];
    const rpcOverrides = (scaffoldConfig.rpcOverrides ?? {}) as Record<number, string>;
    const rpcOverride = rpcOverrides?.[targetChain.id as number];
    const fallbackRpc = (targetChain.rpcUrls as any).public?.http?.[0] ?? targetChain.rpcUrls.default.http[0];
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? rpcOverride ?? fallbackRpc;
    const publicClient = createPublicClient({ chain: targetChain as any, transport: http(rpcUrl) });

    const finalBid = process.env.NEXT_PUBLIC_FINAL_BID_CONTRACT_ADDRESS as `0x${string}` | undefined;
    if (!finalBid) return null;

    const tokenAddress = await publicClient.readContract({
      address: finalBid,
      abi: [
        { name: "tokenAddress", inputs: [], outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
      ] as const,
      functionName: "tokenAddress",
    });

    const [symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: [
          { name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view", type: "function" },
        ] as const,
        functionName: "symbol",
      }) as Promise<string>,
      publicClient.readContract({
        address: tokenAddress,
        abi: [
          { name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view", type: "function" },
        ] as const,
        functionName: "decimals",
      }) as Promise<number>,
    ]);

    const computed: TokenMeta = { tokenAddress: tokenAddress as `0x${string}`, symbol, decimals: Number(decimals) };
    try {
      await fs.writeFile(tmpPath, JSON.stringify(computed));
    } catch {}
    return computed;
  } catch {
    return null;
  }
}

export function formatToken(amount: string | bigint, decimals: number): string {
  return (Number(amount) / Math.pow(10, Math.max(0, decimals || 0))).toFixed(2);
}
