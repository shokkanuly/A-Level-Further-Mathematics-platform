import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __fmPool: Pool | undefined;
}

const dbUrl = process.env.DATABASE_URL ?? "postgres://fm:fm@localhost:5439/fm";
const isLocal = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");

const pool =
  global.__fmPool ??
  new Pool({
    connectionString: dbUrl,
    max: 5,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
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

/**
 * Транзакция с обязательным откатом при ошибке.
 *
 * Нужна авторскому конвейеру: item_version_problems() умеет проверять только
 * то, что уже лежит в базе, поэтому «проверить, не сохраняя» — это вставить,
 * прочитать проблемы и откатить. Без транзакции каждая проверка черновика
 * оставляла бы в базе мусорную версию.
 *
 * @param fn получает `q`, привязанный к соединению транзакции. Использовать
 *           внутри обычный query() нельзя: он возьмёт другое соединение
 *           из пула и не увидит незакоммиченных строк.
 */
export async function withTransaction<T>(
  fn: (q: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>,
  { rollback = false }: { rollback?: boolean } = {},
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const q = async (text: string, params?: unknown[]) =>
      (await client.query(text, params)).rows as Record<string, unknown>[];
    const result = await fn(q);
    await client.query(rollback ? "rollback" : "commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
