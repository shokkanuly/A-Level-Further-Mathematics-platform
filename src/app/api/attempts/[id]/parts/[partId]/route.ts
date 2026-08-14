import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
// Общий plain-JS модуль: его же импортирует скрипт пересчёта на голом node.
// Одна реализация грейдера на оба пути — иначе пересчёт разойдётся с приёмом.
import { grade, GRADER_VERSION } from "@/lib/grade.mjs";

/**
 * POST /api/attempts/{id}/parts/{partId}
 *   { answer_type, value, client_version }
 * → { marks_awarded, total_marks, feedback_code, per_criterion? }
 *
 * Полиморфный конверт из §8: форма `value` зависит от answer_type, оболочка
 * одна. Иначе через полгода будет пять несовместимых форматов.
 *
 * Ключевое здесь — не ответ клиенту, а то, что ложится в базу: сырой ввод
 * ученика вместе с версией грейдера и ссылкой на часть, чьим ключом его
 * проверили. Балл производен и может быть пересчитан; сырой ответ — нет.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; partId: string }> },
) {
  const { id: attemptId, partId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "BAD_ENVELOPE" }, { status: 400 });
  }

  // Писать можно только в свою попытку. Проверка условием в запросе, а не
  // сравнением после выборки: чужая попытка должна выглядеть отсутствующей.
  const attempt = await queryOne<{ id: string; item_version_id: string }>(
    `select id, item_version_id from attempt where id = $1 and student_id = $2`,
    [attemptId, user.id],
  );
  if (!attempt) return NextResponse.json({ error: "ATTEMPT_NOT_FOUND" }, { status: 404 });

  const part = await queryOne<{
    id: string;
    item_version_id: string;
    answer_type: string | null;
    answer_spec: Record<string, unknown> | null;
    marks: number | null;
  }>(
    `select id, item_version_id, answer_type, answer_spec, marks
     from item_part where id = $1`,
    [partId],
  );
  if (!part) return NextResponse.json({ error: "PART_NOT_FOUND" }, { status: 404 });

  // Часть обязана принадлежать той версии, которую открыл ученик.
  if (part.item_version_id !== attempt.item_version_id) {
    return NextResponse.json({ error: "PART_VERSION_MISMATCH" }, { status: 409 });
  }
  if (!part.answer_type || part.marks === null) {
    return NextResponse.json({ error: "PART_NOT_ANSWERABLE" }, { status: 400 });
  }
  if (body.answer_type && body.answer_type !== part.answer_type) {
    return NextResponse.json(
      { error: "ANSWER_TYPE_MISMATCH", expected: part.answer_type },
      { status: 400 },
    );
  }

  const result = grade(body.value, {
    answer_type: part.answer_type,
    answer_spec: part.answer_spec,
    marks: part.marks,
  });

  const saved = await queryOne<{
    id: string;
    marks_awarded: number;
    feedback_code: string;
  }>(
    `insert into part_response
       (attempt_id, part_id, raw_response, auto_marks_awarded, feedback_code,
        grader_version, graded_against_part_id)
     values ($1, $2, $3, $4, $5, $6, $2)
     on conflict (attempt_id, part_id) do update set
       raw_response           = excluded.raw_response,
       auto_marks_awarded     = excluded.auto_marks_awarded,
       feedback_code          = excluded.feedback_code,
       grader_version         = excluded.grader_version,
       graded_against_part_id = excluded.graded_against_part_id,
       graded_at              = now()
     returning id, marks_awarded, feedback_code`,
    [
      attemptId,
      partId,
      JSON.stringify(body.value ?? null),
      result.marks_awarded,
      result.feedback_code,
      GRADER_VERSION,
    ],
  );

  // Текущий итог по попытке — частичный зачёт первичен (§4.4).
  const totals = await queryOne<{ scored: number; possible: number }>(
    `select
       coalesce(sum(pr.marks_awarded), 0)::int as scored,
       (select coalesce(sum(marks), 0)::int from item_part
         where item_version_id = $2 and marks is not null) as possible
     from part_response pr
     where pr.attempt_id = $1`,
    [attemptId, attempt.item_version_id],
  );

  return NextResponse.json({
    part_id: partId,
    marks_awarded: saved!.marks_awarded,
    part_marks: part.marks,
    feedback_code: saved!.feedback_code,
    per_criterion: result.per_criterion,
    grader_version: GRADER_VERSION,
    attempt_total: totals,
  });
}

/** GET — что уже сохранено по этой части. Пригодится при перезагрузке страницы. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; partId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { id, partId } = await ctx.params;
  const rows = await query(
    `select pr.raw_response, pr.marks_awarded, pr.feedback_code,
            pr.grader_version, pr.graded_at
     from part_response pr
     join attempt a on a.id = pr.attempt_id
     where pr.attempt_id = $1 and pr.part_id = $2 and a.student_id = $3`,
    [id, partId, user.id],
  );
  return NextResponse.json(rows[0] ?? null);
}
