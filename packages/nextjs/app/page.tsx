import type { Metadata } from "next";
import HomeClient from "~~/components/HomeClient";
import { readTokenMeta } from "~~/lib/tokenMeta";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export default async function Page() {
  const tokenMeta = await readTokenMeta();
  return <HomeClient tokenAddress={tokenMeta?.tokenAddress as any} tokenSymbol={tokenMeta?.symbol} />;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ ref?: string; t?: string }>;
}): Promise<Metadata> {
  const sp = searchParams ? await searchParams : undefined;
  return getMetadata({
    title: process.env.NEXT_PUBLIC_APP_NAME || "FireBid",
    description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || "Outburn Outlast Outbid",
    ref: sp?.ref,
    t: sp?.t,
  });
}
