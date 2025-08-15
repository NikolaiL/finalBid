import { createClient } from "@ponder/client";

// Lightweight Ponder SQL-over-HTTP client WITHOUT importing the schema.
// Use this when you only need untyped SQL queries to avoid bundling the
// ponder schema and graphql server into routes (prevents build warnings).

export const baseUrl = (process.env.NEXT_PUBLIC_PONDER_URL ?? "http://localhost:42069").replace(/\/$/, "");
export const sqlEndpoint = `${baseUrl}/sql`.replace(/^\//, "/");

export const client = createClient(sqlEndpoint);
