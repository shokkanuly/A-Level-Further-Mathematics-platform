import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
export const projectRoot = join(here, "..");

/** Минимальный .env-ридер: незачем тащить dotenv ради одной строки. */
function loadEnvFile() {
  for (const name of [".env.local", ".env"]) {
    const p = join(projectRoot, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}
loadEnvFile();

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fm:fm@localhost:5439/fm";

export function newPool() {
  const isLocal = DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1");
  return new pg.Pool({
    connectionString: DATABASE_URL,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
}

/** Открыть пул, выполнить fn, закрыть. Ошибку печатаем читаемо и выходим с кодом 1. */
export async function withPool(fn) {
  const pool = newPool();
  try {
    await fn(pool);
  } catch (err) {
    console.error("\n✗ " + (err?.message ?? err));
    if (err?.detail) console.error("  " + err.detail);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
