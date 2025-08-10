import * as schema from "../../../packages/ponder/ponder.schema";
import { createClient } from "@ponder/client";

// Prefer same-origin + Next.js rewrites for dev; allow override via env when needed
const baseUrl = (process.env.NEXT_PUBLIC_PONDER_URL ?? "http://localhost:42069").replace(/\/$/, "");
const sqlEndpoint = `${baseUrl}/sql`.replace(/^\//, "/");

export const client = createClient(sqlEndpoint, { schema });
export { schema };
