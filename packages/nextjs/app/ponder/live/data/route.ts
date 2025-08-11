// @ts-nocheck
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ponderPort = process.env.PONDER_PORT || "42069";
  const ponderHost = process.env.PONDER_HOST || "localhost";
  const url = `http://${ponderHost}:${ponderPort}/live/data`;

  const upstream = await fetch(url, {
    // Ensure no caching and proper accept header for SSE
    cache: "no-store",
    headers: { Accept: "text/event-stream" },
  });

  // Mirror SSE semantics; avoid compression/buffering where possible
  const headers = new Headers();
  headers.set("Content-Type", "text/event-stream");
  headers.set("Cache-Control", "no-cache");
  headers.set("Connection", "keep-alive");
  headers.set("X-Accel-Buffering", "no");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
