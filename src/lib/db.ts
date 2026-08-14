import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __fmPool: Pool | undefined;
}

const pool =
  global.__fmPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://fm:fm@localhost:5439/fm",
    max: 5,
  });

// В dev пул переживает hot reload, иначе каждое сохранение файла плодит соединения.
if (process.env.NODE_ENV !== "production") global.__fmPool = pool;

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
