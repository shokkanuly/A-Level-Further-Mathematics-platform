import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser, assertEnrolledInAssignment } from "@/lib/session";

/**
 * POST /api/attempts  { slug, context?, assignment_id? }
 *
 * Попытка привязывается к КОНКРЕТНОЙ ВЕРСИИ задачи, а не к задаче.
 * Без этого нельзя ответить, почему у ученика 3 балла, если сейчас задача
 * оценивается в 5 (§3.4).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const slug = String(body.slug ?? "");
  const assignmentId = body.assignment_id ? String(body.assignment_id) : null;
  const context = assignmentId ? "assignment" : "practice";

  // Ученик не может создать попытку в контексте чужого задания:
  // иначе достаточно подставить чужой assignment_id, чтобы влиять на журнал.
  if (assignmentId && !(await assertEnrolledInAssignment(user.id, assignmentId))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const version = await queryOne<{ id: string }>(
    `select iv.id from item i
     join item_version iv on iv.item_id = i.id and iv.status = 'published'
     where i.slug = $1`,
    [slug],
  );
  if (!version) return NextResponse.json({ error: "ITEM_NOT_FOUND" }, { status: 404 });

  // Задача обязана входить в это задание — иначе баллы попадут в журнал
  // за то, что учитель не выдавал.
  if (assignmentId) {
    const inSet = await queryOne(
      `select 1 from assignment_item where assignment_id = $1 and item_version_id = $2`,
      [assignmentId, version.id],
    );
    if (!inSet) return NextResponse.json({ error: "ITEM_NOT_IN_ASSIGNMENT" }, { status: 400 });
  }

  const attempt = await queryOne<{ id: string }>(
    `insert into attempt (student_id, item_version_id, context, assignment_id)
     values ($1, $2, $3, $4)
     returning id`,
    [user.id, version.id, context, assignmentId],
  );

  return NextResponse.json({
    attempt_id: attempt!.id,
    item_version_id: version.id,
    context,
  });
}
