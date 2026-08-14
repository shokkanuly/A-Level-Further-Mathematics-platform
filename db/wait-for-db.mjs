import pg from "pg";
import { DATABASE_URL } from "./client.mjs";

const deadline = Date.now() + 60_000;

while (true) {
  const c = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await c.connect();
    await c.query("select 1");
    await c.end();
    console.log("✓ Postgres принимает соединения:", DATABASE_URL);
    break;
  } catch (err) {
    await c.end().catch(() => {});
    if (Date.now() > deadline) {
      console.error("✗ Postgres не поднялся за 60 с:", err.message);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
