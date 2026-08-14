import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

/**
 * Пароли и сессии (SYSTEM-DESIGN §10).
 *
 * scrypt из стандартной библиотеки: bcrypt и argon2 тянут нативную сборку,
 * которой на serverless-хостинге быть не должно, а scrypt устойчив к подбору
 * на видеокартах и уже есть в node.
 *
 * Модуль plain-JS по той же причине, что грейдер: его зовут и роуты, и сид.
 */

const scryptAsync = promisify(scrypt);

// N=16384 — компромисс: ~50–100 мс на вход, но перебор дорогой.
const KEYLEN = 64;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string" || !stored.startsWith("scrypt$")) return false;
  const [, N, r, p, saltB64, keyB64] = stored.split("$");
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");

  const actual = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });

  // Постоянное по времени сравнение: иначе длина совпадающего префикса
  // утекает через задержку ответа.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Сырой токен уходит в cookie, в базу кладётся только его хеш. */
export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export const SESSION_COOKIE = "fm_session";
export const SESSION_TTL_DAYS = 30;

/**
 * Код вступления в класс. Без 0/O/1/I/L — школьники переписывают его
 * с доски или из чата, и одна перепутанная буква стоит урока.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newJoinCode() {
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out.slice(0, 3) + "-" + out.slice(3);
}

/** Ошибки регистрации возвращаются кодом, текст живёт в интерфейсе. */
export function validateSignup({ email, password, displayName }) {
  const problems = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email ?? ""))) problems.push("EMAIL_INVALID");
  if (String(password ?? "").length < 8) problems.push("PASSWORD_TOO_SHORT");
  if (String(displayName ?? "").trim().length < 2) problems.push("NAME_TOO_SHORT");
  return problems;
}
