/* eslint-disable no-console */
/**
 * Zero-install development database.
 *
 * Boots an embedded PostgreSQL (binaries ship with the `embedded-postgres` dev
 * dependency) on localhost:5432 with the same credentials as .env.example, so
 * `npm run db:dev` replaces Docker/system Postgres on developer machines.
 * Data persists in server/.pgdata. Press Ctrl+C to stop.
 */
import fs from "fs";
import path from "path";
import EmbeddedPostgres from "embedded-postgres";

const DATA_DIR = path.resolve(__dirname, "..", ".pgdata");
const DB_NAME = "real_estate_crm";

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "crm",
  password: "crm_password",
  port: 5432,
  persistent: true,
  // UTF8 + C locale: matches production Postgres defaults and avoids
  // Windows libc locale crashes during initdb.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

async function main() {
  const freshCluster = !fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));
  if (freshCluster) {
    console.log("Initialising new Postgres cluster in .pgdata …");
    await pg.initialise();
  }
  await pg.start();

  if (freshCluster) {
    await pg.createDatabase(DB_NAME);
  } else {
    // createDatabase throws if it already exists — ignore in that case.
    await pg.createDatabase(DB_NAME).catch(() => undefined);
  }

  console.log("");
  console.log(`✅ PostgreSQL ready: postgresql://crm:crm_password@localhost:5432/${DB_NAME}`);
  console.log("   Next (in another terminal): npx prisma migrate deploy && npm run seed && npm run dev");
  console.log("   Press Ctrl+C to stop the database.");

  const shutdown = async () => {
    console.log("\nStopping embedded Postgres…");
    await pg.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(async (err) => {
  console.error("Failed to start embedded Postgres:", err);
  await pg.stop().catch(() => undefined);
  process.exit(1);
});
