import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { queryOne } from "@/lib/db";
import { aiEnabled, explainForStudent, diagnoseForTeacher } from "@/lib/ai";

export const dynamic = "force-dynamic";

// Ответ модели может занять больше стандартных 10 секунд serverless-функции.
export const maxDuration = 60;

/**
 * POST /api/ai
 *   { action: "explain",  slug, question }        — ученик про свою задачу
 *   { action: "diagnose", student_id, question }  — учитель про своего ученика
 *
 * Кто про кого может спрашивать — решается здесь и только здесь.
 * Ученик спрашивает исключительно про себя: student_id из тела запроса
 * не читается вовсе, берётся id из сессии. Учитель — только про учеников
 * своих классов, и это проверяется запросом, а не доверием к параметру.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  if (!aiEnabled()) {
    return NextResponse.json({ ok: false, error: "AI_DISABLED" });
  }

  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").slice(0, 2000);

  if (body.action === "explain") {
    const slug = String(body.slug ?? "");
    if (!slug) return NextResponse.json({ error: "SLUG_REQUIRED" }, { status: 400 });

    // Про себя — и только про себя.
    const result = await explainForStudent(user.id, slug, question);
    return NextResponse.json(result);
  }

  if (body.action === "diagnose") {
    if (!["teacher", "author", "admin"].includes(user.role)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const studentId = String(body.student_id ?? "");
    if (!studentId) {
      return NextResponse.json({ error: "STUDENT_REQUIRED" }, { status: 400 });
    }

    // Ученик обязан состоять в классе этого учителя. Без этой проверки любой
    // учитель читал бы разбор по любому ученику платформы.
    if (user.role !== "admin") {
      const mine = await queryOne(
        `select 1 from enrolment e
         join class c on c.id = e.class_id
         where e.student_id = $1 and c.teacher_id = $2 and e.removed_at is null`,
        [studentId, user.id],
      );
      if (!mine) return NextResponse.json({ error: "NOT_YOUR_STUDENT" }, { status: 403 });
    }

    const result = await diagnoseForTeacher(studentId, question);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
}
