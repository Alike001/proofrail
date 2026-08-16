import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { PoolConfig } from "pg";

import * as schema from "./schema.js";

export type ProofRailDatabase = NodePgDatabase<typeof schema>;

export interface ProofRailDatabaseConnection {
  readonly db: ProofRailDatabase;
  readonly pool: Pool;
  close(): Promise<void>;
}

export function createDatabaseConnection(
  connection: string | PoolConfig
): ProofRailDatabaseConnection {
  const pool = new Pool(
    typeof connection === "string" ? { connectionString: connection } : connection
  );
  return {
    db: drizzle(pool, { schema }),
    pool,
    close: () => pool.end()
  };
}
