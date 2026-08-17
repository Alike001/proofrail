import {
  createDatabaseConnection,
  migrateDatabase
} from "../dist/index.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (databaseUrl === undefined || databaseUrl === "") {
  throw new Error("DATABASE_URL is required to migrate ProofRail PostgreSQL.");
}

const connection = createDatabaseConnection(databaseUrl);

try {
  await migrateDatabase(connection.db);
  console.log("ProofRail PostgreSQL migrations completed.");
} finally {
  await connection.close();
}
