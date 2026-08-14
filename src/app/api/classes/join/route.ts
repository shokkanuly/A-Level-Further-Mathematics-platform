import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * POST /api/classes/join  { code }  — ученик вступает по коду.
 *
 * Код нормализуется агрессивно: школьник вводит его с доски или из чата,
 * и «abc def», «ABC-DEF», «abcdef» обязаны сработать одинаково.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const raw = String(body.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 6) return NextResponse.json({ error: "CODE_INVALID" }, { status: 400 });
  const code = `${raw.slice(0, 3)}-${raw.slice(3)}`;

  const klass = await queryOne<{ id: string; name: string; teacher_id: string }>(
    `select id, name, teacher_id from class where join_code = $1 and archived_at is null`,
    [code],
  );
  if (!klass) return NextResponse.json({ error: "CLASS_NOT_FOUND" }, { status: 404 });
  if (klass.teacher_id === user.id) {
    return NextResponse.json({ error: "OWN_CLASS" }, { status: 400 });
  }

  // Повторное вступление после исключения возвращает ученика обратно,
  // а не создаёт вторую запись.
  await query(
    `insert into enrolment (class_id, student_id) values ($1, $2)
     on conflict (class_id, student_id) do update set removed_at = null`,
    [klass.id, user.id],
  );

  return NextResponse.json({ ok: true, class_id: klass.id, class_name: klass.name });
}
