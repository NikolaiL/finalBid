import * as schema from "../../../packages/ponder/ponder.schema";
import { createClient } from "@ponder/client";
import { sqlEndpoint } from "~~/lib/ponderLight";

// Typed Ponder client (Drizzle/query builder) reusing endpoint from ponderLight
export const client = createClient(sqlEndpoint, { schema });
export { schema };
