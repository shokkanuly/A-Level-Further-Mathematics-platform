import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, assertOwnsClass } from "@/lib/session";

/**
 * POST /api/assignments
 *   { class_id, title, due_at, item_slugs: [], settings }
 *
 * Задачи фиксируются ВЕРСИЕЙ на момент выдачи: если автор перевыпустит
 * задачу завтра, уже выданная домашка не изменится под учениками.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const classId = String(body.class_id ?? "");
  if (!(await assertOwnsClass(user.id, classId))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const title = String(body.title ?? "").trim();
  const slugs: string[] = Array.isArray(body.item_slugs) ? body.item_slugs.map(String) : [];
  if (title.length < 2) return NextResponse.json({ error: "TITLE_TOO_SHORT" }, { status: 400 });
  if (slugs.length === 0) return NextResponse.json({ error: "NO_ITEMS" }, { status: 400 });

  const versions = await query<{ id: string; slug: string }>(
    `select iv.id, i.slug from item i
     join item_version iv on iv.item_id = i.id and iv.status = 'published'
     where i.slug = any($1)`,
    [slugs],
  );
  if (versions.length !== slugs.length) {
    return NextResponse.json({ error: "ITEM_NOT_FOUND" }, { status: 404 });
  }

  const settings = {
    attempts_allowed: Number(body.settings?.attempts_allowed ?? 3),
    solutions_locked_until_due: body.settings?.solutions_locked_until_due !== false,
    calculator_allowed: body.settings?.calculator_allowed !== false,
    shuffle_items: body.settings?.shuffle_items === true,
  };

  const assignment = await queryOne<{ id: string }>(
    `insert into assignment (class_id, title, due_at, settings, created_by)
     values ($1, $2, $3, $4, $5) returning id`,
    [classId, title, body.due_at || null, JSON.stringify(settings), user.id],
  );

  // Порядок задач — тот, в котором учитель их выбрал.
  const order = new Map(slugs.map((s, i) => [s, i]));
  for (const v of versions) {
    await query(
      `insert into assignment_item (assignment_id, item_version_id, position)
       values ($1, $2, $3)`,
      [assignment!.id, v.id, order.get(v.slug) ?? 0],
    );
  }

  return NextResponse.json({ id: assignment!.id });
}
