import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const upstream = `https://secretapp.altumbase.com/api/user-data?address=${address}`;

  try {
    const res = await fetch(upstream, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, {
      status: res.status,
      headers: {
        // Cache on CDN for 1 hour; allow serving stale while revalidating
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600",
        // Some CDNs honor this header specifically
        "CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("farcaster-user error", err);
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
