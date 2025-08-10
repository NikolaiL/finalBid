import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { client, graphql } from "ponder";

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


app.get("/hello", (c) => {
  return c.text("Hello, world!"); 
}); 

export default app;