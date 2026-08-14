// Сносит схему public целиком. Только для разработки.
import { withPool } from "./client.mjs";

await withPool(async (pool) => {
  await pool.query("drop schema public cascade");
  await pool.query("create schema public");
  console.log("✓ схема public пересоздана");
});
