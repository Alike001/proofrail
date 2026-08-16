import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import type { ProofRailDatabase } from "./client.js";

export async function migrateDatabase(
  db: ProofRailDatabase,
  migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url))
): Promise<void> {
  await migrate(db, { migrationsFolder });
}
