import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { parseVideoUrl } from "@/lib/video";

export const dynamic = "force-dynamic";

/**
 * POST /api/lessons — учитель заводит урок.
 *
 * Ссылка на видео разбирается ЗДЕСЬ и в базу уходит уже разобранной:
 * провайдер и идентификатор. Хранить исходный URL и подставлять его в iframe
 * означало бы отдать чужому скрипту наш origin (см. src/lib/video.ts).
 * Поэтому нераспознанная ссылка — это ошибка формы, а не «сохраним как есть».
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!["teacher", "author", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });

  const title = String(body.title ?? "").trim();
  if (title.length < 3) return NextResponse.json({ error: "TITLE_TOO_SHORT" }, { status: 400 });

  const classId = body.class_id ? String(body.class_id) : null;
  if (classId && user.role !== "admin") {
    const owns = await queryOne(`select 1 from class where id = $1 and teacher_id = $2`, [
      classId,
      user.id,
    ]);
    if (!owns) return NextResponse.json({ error: "NOT_YOUR_CLASS" }, { status: 403 });
  }

  const rawVideo = String(body.video_url ?? "").trim();
  const video = rawVideo ? parseVideoUrl(rawVideo) : null;
  if (rawVideo && !video) {
    return NextResponse.json({ error: "VIDEO_UNRECOGNISED" }, { status: 400 });
  }

  const conspectus = String(body.conspectus_md ?? "").trim();
  // То же требование стоит CHECK-ограничением в 009: понятная ошибка формы
  // лучше, чем 500 из-за нарушенного ограничения.
  if (!video && !conspectus) {
    return NextResponse.json({ error: "EMPTY_LESSON" }, { status: 400 });
  }

  const created = await queryOne<{ id: string }>(
    `insert into lesson (class_id, program_id, title, summary_md,
                         video_provider, video_id, conspectus_md,
                         position, created_by, published_at)
     values ($1,$2,$3,$4,$5,$6,$7,
             coalesce((select max(position) + 1 from lesson where class_id is not distinct from $1), 1),
             $8, now())
     returning id`,
    [
      classId,
      body.program_id ? String(body.program_id) : null,
      title,
      String(body.summary_md ?? "").trim() || null,
      video?.provider ?? null,
      video?.id ?? null,
      conspectus || null,
      user.id,
    ],
  );

  const concepts: string[] = Array.isArray(body.concepts) ? body.concepts : [];
  if (created && concepts.length > 0) {
    await query(
      `insert into lesson_concept (lesson_id, concept_id)
       select $1, id from concept where slug = any($2)
       on conflict do nothing`,
      [created.id, concepts],
    );
  }

  return NextResponse.json({ ok: true, id: created?.id });
}
