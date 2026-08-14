import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, queryOne } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  newSessionToken,
  hashToken,
  validateSignup,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
} from "@/lib/auth.mjs";

/**
 * POST /api/auth  { action: "signup" | "login" | "logout", … }
 *
 * Один роут на три действия: формы аутентификации всегда ходят парой,
 * и держать их рядом дешевле, чем размазывать по трём файлам.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "logout") {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (token) await query(`delete from session where token_hash = $1`, [hashToken(token)]);
    jar.delete(SESSION_COOKIE);
    return NextResponse.json({ ok: true });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (action === "signup") {
    const problems = validateSignup({
      email,
      password,
      displayName: body.display_name,
    });
    if (problems.length) {
      return NextResponse.json({ error: problems[0] }, { status: 400 });
    }

    const role = body.role === "teacher" ? "teacher" : "student";
    const exists = await queryOne(`select id from app_user where email = $1`, [email]);
    if (exists) return NextResponse.json({ error: "EMAIL_TAKEN" }, { status: 409 });

    const user = await queryOne<{ id: string; role: string }>(
      `insert into app_user (email, display_name, role, password_hash)
       values ($1, $2, $3, $4) returning id, role`,
      [email, String(body.display_name).trim(), role, await hashPassword(password)],
    );
    await startSession(user!.id, req);
    return NextResponse.json({ ok: true, role: user!.role });
  }

  if (action === "login") {
    const user = await queryOne<{ id: string; role: string; password_hash: string | null }>(
      `select id, role, password_hash from app_user where email = $1`,
      [email],
    );

    // Один и тот же ответ на «нет такого пользователя» и «неверный пароль»:
    // иначе форма входа превращается в справочник зарегистрированных почт.
    const ok = user?.password_hash
      ? await verifyPassword(password, user.password_hash)
      : false;
    if (!ok) return NextResponse.json({ error: "BAD_CREDENTIALS" }, { status: 401 });

    await query(`update app_user set last_login_at = now() where id = $1`, [user!.id]);
    await startSession(user!.id, req);
    return NextResponse.json({ ok: true, role: user!.role });
  }

  return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
}

async function startSession(userId: string, req: Request) {
  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await query(
    `insert into session (token_hash, user_id, expires_at, user_agent)
     values ($1, $2, $3, $4)`,
    [hashToken(token), userId, expires, req.headers.get("user-agent")?.slice(0, 300) ?? null],
  );

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}
