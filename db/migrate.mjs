// Плоский раннер SQL-миграций.
//
// Никакого ORM и никакого фреймворка миграций: §13 требует, чтобы схема
// целиком читалась из репозитория человеком, который видит проект впервые.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { withPool, projectRoot } from "./client.mjs";

const dir = join(projectRoot, "db", "migrations");

await withPool(async (pool) => {
  await pool.query(`
    create table if not exists schema_migration (
      name        text primary key,
      applied_at  timestamptz not null default now()
    )
  `);

  const applied = new Set(
    (await pool.query("select name from schema_migration")).rows.map((r) => r.name),
  );

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migration (name) values ($1)", [file]);
      await client.query("commit");
      console.log("  ✓", file);
      ran++;
    } catch (err) {
      await client.query("rollback");
      throw new Error(`миграция ${file} упала: ${err.message}`);
    } finally {
      client.release();
    }
  }

  console.log(ran ? `\n✓ применено миграций: ${ran}` : "✓ схема уже актуальна");
});
