// @ts-nocheck
import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { client, graphql, desc, eq } from "ponder";
import { replaceBigInts } from "@ponder/utils";
import { streamSSE } from "hono/streaming";

const app = new Hono();

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
// Data-change-only SSE
// =====================
// Uses a dedicated LISTEN/NOTIFY channel that triggers only when app tables change,
// not for every new block checkpoint.

// Small promise-with-resolvers helper
const createSignal = () => {
  let resolve: () => void;
  const promise = new Promise<void>(r => (resolve = r));
  // @ts-ignore - resolve is assigned synchronously above
  return { promise, resolve } as { promise: Promise<void>; resolve: () => void };
};

const viewsSchema = (globalThis as any).PONDER_NAMESPACE_BUILD?.schema as string;
const DATA_CHANNEL = `${viewsSchema}_data_changes_channel`;

// Ensure function + triggers exist (idempotent) for our three app tables
async function ensureDataChangeObjects() {
  console.log("creating triggers started");
  const driver = (globalThis as any).PONDER_DATABASE.driver;

  // Helper to run a statement on admin connection (or pglite instance)
  const run = async (sql: string) => {
    if (driver.dialect === "pglite") {
      await driver.instance.query(sql);
      return;
    }
    const admin = driver.admin;
    const c = await admin.connect();
    try {
      await c.query(sql);
    } finally {
      c.release();
    }
  };

  // Create notifier function
  await run(`
    CREATE OR REPLACE FUNCTION "${viewsSchema}".data_notify()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NOTIFY "${DATA_CHANNEL}";
      RETURN NULL;
    END;
    $$;
  `);

  const makeTrigger = async (table: string) => {
    await run(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'data_trigger_${table}'
        ) THEN
          CREATE TRIGGER "data_trigger_${table}"
          AFTER INSERT OR UPDATE OR DELETE
          ON "${viewsSchema}"."${table}"
          FOR EACH STATEMENT
          EXECUTE PROCEDURE "${viewsSchema}".data_notify();
        END IF;
      END $$;
    `);
  };

  // commented out trigger creation for now
  // await makeTrigger("auctionCreated");
  // await makeTrigger("bidPlaced");
  // await makeTrigger("auctionEnded");
  // console.log("triggers created");
}

let changeSignal = createSignal();
let checking = false;
let prevCounts: { auctionCreated: number; bidPlaced: number; auctionEnded: number } | null = null;

async function getTableCounts() {
  const driver = (globalThis as any).PONDER_DATABASE.driver;
  const query = async (sql: string) => {
    if (driver.dialect === "pglite") {
      const res = await driver.instance.query(sql);
      // pglite returns rows on .rows
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
  const sd = await query(`SELECT COUNT(*)::int AS c FROM "${viewsSchema}"."streamingData"`);
  return { auctionCreated: ac, bidPlaced: bp, auctionEnded: ae, streamingData: sd };
}

async function maybeEmitChange() {
  if (checking) return;
  checking = true;
  try {
    const counts = await getTableCounts();
    if (
      prevCounts === null ||
      counts.auctionCreated > prevCounts.auctionCreated ||
      counts.bidPlaced > prevCounts.bidPlaced ||
      counts.auctionEnded > prevCounts.auctionEnded
    ) {
      prevCounts = counts;
      changeSignal.resolve();
      changeSignal = createSignal();
      console.log("change detected");
    }
  } catch (e) {
    // ignore
  } finally {
    checking = false;
  }
}

async function listenToDataChannel() {
  const driver = (globalThis as any).PONDER_DATABASE.driver;

  if (driver.dialect === "pglite") {
    await driver.instance.query(`LISTEN "${DATA_CHANNEL}"`);
    driver.instance.onNotification(() => {
      void maybeEmitChange();
    });
    return;
  }

  const pool = driver.admin;
  const connectAndListen = async () => {
    // Close previous listener if present
    try {
      (driver as any).dataListen?.release?.();
    } catch {}
    const c = await pool.connect();
    (driver as any).dataListen = c;
    await c.query(`LISTEN "${DATA_CHANNEL}"`);
    c.on("error", async () => {
      try { c.release(); } catch {}
      await connectAndListen();
    });
    c.on("notification", () => {
      void maybeEmitChange();
    });
  };
  await connectAndListen();
}

// Initialize objects and listener at startup
ensureDataChangeObjects().then(async () => {
  prevCounts = await getTableCounts().catch(() => null as any);
  await listenToDataChannel();
}).catch(err => {
  console.error("data-change SSE init error", err);
});

// SSE endpoint that fires only for data changes
app.get("/live/data", c => {
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  return streamSSE(c, async stream => {
    // send an initial tick
    try { await stream.writeSSE({ data: "" }); } catch {}
    while (!stream.closed && !stream.aborted) {
      await changeSignal.promise;
      try { await stream.writeSSE({ data: "" }); } catch {}
    }
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

app.get("/table-counts", async (c) => {
  try {
    const counts = await getTableCounts();
    return c.json(counts);
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