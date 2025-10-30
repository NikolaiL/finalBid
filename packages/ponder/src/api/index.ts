// @ts-nocheck
import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { client, graphql, desc, eq, gte, and, count } from "ponder";
import { replaceBigInts } from "@ponder/utils";
import { streamSSE } from "hono/streaming";

const app = new Hono();

// =====================
// Change emitter singleton
// =====================
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

// Get or create global emitter instance
const getChangeEmitter = (): ChangeEmitter => {
  if (!(globalThis as any).__PONDER_CHANGE_EMITTER__) {
    (globalThis as any).__PONDER_CHANGE_EMITTER__ = new ChangeEmitter();
  }
  return (globalThis as any).__PONDER_CHANGE_EMITTER__;
};

const changeEmitter = getChangeEmitter();

// Allow cross-origin requests from Next.js dev server WITH credentials (cookies)
app.use(
  "*",
  cors({
    origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    credentials: true,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type"],
  }),
);

// Expose Ponder SQL client endpoint for @ponder/client
app.use("/sql/*", client({ db, schema }));

// Expose GraphQL API for convenience
app.use("/graphql", graphql({ db, schema }));

// =====================
// Data-change SSE with event emitter
// =====================

// Small promise-with-resolvers helper
const createSignal = () => {
  let resolve: () => void;
  const promise = new Promise<void>(r => (resolve = r));
  // @ts-ignore - resolve is assigned synchronously above
  return { promise, resolve } as { promise: Promise<void>; resolve: () => void };
};

let changeSignal = createSignal();

// Subscribe to change events from event handlers
changeEmitter.subscribe(() => {
  //console.log("Change event received, notifying SSE clients");
  changeSignal.resolve();
  changeSignal = createSignal();
});

// SSE endpoint that fires on data changes
app.get("/live/data", c => {
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  c.header("X-Accel-Buffering", "no");

  return streamSSE(c, async stream => {
    try { 
      await stream.writeSSE({ data: "connected" }); 
      console.log("SSE client connected");
    } catch {}
    
    while (!stream.closed && !stream.aborted) {
      await changeSignal.promise;
      try { 
        await stream.writeSSE({ data: "change" }); 
        console.log("SSE change event sent to client");
      } catch (e) {
        console.log("SSE write error, client disconnected");
        break;
      }
    }
    console.log("SSE client disconnected");
  });
});


app.get("/hello", (c) => {
  return c.text("Hello, world!"); 
}); 

// Return latest auctionCreated row in plain JSON (safe for server-to-server fetches)
app.get("/latest-auction", async (c) => {
  try {
    const rows = await db
      .select()
      .from((schema as any).auctionCreated)
      .orderBy(
        desc((schema as any).auctionCreated.auctionId),
      )
      .limit(1);
    const row = rows?.[0] ?? null;
    const safe = replaceBigInts(row, (v) => v.toString());
    return c.json(safe);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/streaming-data/:auctionId", async (c) => {
  try {
    const auctionId = c.req.param("auctionId");
    const rows = await db
      .select()
      .from((schema as any).streamingData)
      .where(eq((schema as any).streamingData.auctionId, auctionId))
      .orderBy(desc((schema as any).streamingData.timestamp));
    const safe = replaceBigInts(rows, (v) => v.toString());
    return c.json(safe);
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/user-stats/:address/:fromTimestamp?", async (c) => {
  try {
    const address = c.req.param("address").toLowerCase();
    const fromTimestamp = Number(c.req.param("fromTimestamp")) || 0;
    const result = await db
      .select({ count: count() })
      .from((schema as any).bidPlaced)
      .where(and(eq((schema as any).bidPlaced.bidder, address), gte((schema as any).bidPlaced.timestamp, fromTimestamp)));
    //const safe = replaceBigInts(rows, (v) => v.toString());
    return c.json({ address, fromTimestamp, numberOfBids: result[0].count });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/table-counts", async (c) => {
  try {
    const viewsSchema = (globalThis as any).PONDER_NAMESPACE_BUILD?.schema as string;
    const driver = (globalThis as any).PONDER_DATABASE.driver;
    
    const query = async (sql: string) => {
      if (driver.dialect === "pglite") {
        const res = await driver.instance.query(sql);
        // @ts-ignore
        return Number(res.rows?.[0]?.c ?? 0);
      }
      const admin = driver.admin;
      const c = await admin.connect();
      try {
        const res = await c.query(sql);
        return Number(res.rows?.[0]?.c ?? 0);
      } finally {
        c.release();
      }
    };
    
    const ac = await query(`SELECT COUNT(*)::int AS c FROM "${viewsSchema}"."auctionCreated"`);
    const bp = await query(`SELECT COUNT(*)::int AS c FROM "${viewsSchema}"."bidPlaced"`);
    const ae = await query(`SELECT COUNT(*)::int AS c FROM "${viewsSchema}"."auctionEnded"`);
    
    return c.json({ auctionCreated: ac, bidPlaced: bp, auctionEnded: ae });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/tables", async (c) => {
  try {
    const driver = (globalThis as any).PONDER_DATABASE.driver;
    
    if (driver.dialect === "pglite") {
      // Get all tables from information_schema
      const tablesResult = await driver.instance.query(`
        SELECT table_name, table_schema 
        FROM information_schema.tables 
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY table_schema, table_name
      `);
      
      // Get record counts for each table
      const tablesWithCounts = await Promise.all(
        (tablesResult.rows || []).map(async (table) => {
          try {
            const countResult = await driver.instance.query(`
              SELECT COUNT(*)::int AS count 
              FROM "${table.table_schema}"."${table.table_name}"
            `);
            return {
              table_name: table.table_name,
              table_schema: table.table_schema,
              row_count: countResult.rows?.[0]?.count || 0
            };
          } catch (countError) {
            // If we can't count records (e.g., view or permission issue), return -1
            return {
              table_name: table.table_name,
              table_schema: table.table_schema,
              row_count: -1
            };
          }
        })
      );
      
      return c.json({
        dialect: "pglite",
        tables: tablesWithCounts
      });
    } else {
      // For PostgreSQL, use the same approach
      const admin = driver.admin;
      const conn = await admin.connect();
      try {
        const tablesResult = await conn.query(`
          SELECT table_name, table_schema 
          FROM information_schema.tables 
          WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
          ORDER BY table_schema, table_name
        `);
        
        // Get record counts for each table
        const tablesWithCounts = await Promise.all(
          (tablesResult.rows || []).map(async (table) => {
            try {
              const countResult = await conn.query(`
                SELECT COUNT(*)::int AS count 
                FROM "${table.table_schema}"."${table.table_name}"
              `);
              return {
                table_name: table.table_name,
                table_schema: table.table_schema,
                row_count: countResult.rows?.[0]?.count || 0
              };
            } catch (countError) {
              // If we can't count records (e.g., view or permission issue), return -1
              return {
                table_name: table.table_name,
                table_schema: table.table_schema,
                row_count: -1
              };
            }
          })
        );
        
        return c.json({
          dialect: "postgresql",
          tables: tablesWithCounts
        });
      } finally {
        conn.release();
      }
    }
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

export default app;