import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { newJoinCode } from "@/lib/auth.mjs";
import { ensureClassRoom } from "@/lib/community";

/** POST /api/classes  { name }  — учитель создаёт класс. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!["teacher", "author", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (name.length < 2) return NextResponse.json({ error: "NAME_TOO_SHORT" }, { status: 400 });

  // join_code уникален; на коллизию — несколько попыток, а не падение.
  for (let i = 0; i < 5; i++) {
    const code = newJoinCode();
    const exists = await queryOne(`select 1 from class where join_code = $1`, [code]);
    if (exists) continue;

    const created = await queryOne<{ id: string; join_code: string }>(
      `insert into class (teacher_id, name, join_code) values ($1, $2, $3)
       returning id, join_code`,
      [user.id, name, code],
    );

    // Комната заводится вместе с классом, а не при первом заходе в чат:
    // «создать, если нет» в обработчике — гонка, а уникальный индекс из 010
    // превратил бы её в 500 у того, кто нажал вторым.
    if (created) await ensureClassRoom(created.id, name);

    return NextResponse.json(created);
  }
  return NextResponse.json({ error: "CODE_COLLISION" }, { status: 500 });
}

/** DELETE /api/classes?id=… — архивирует, но не удаляет: попытки учеников остаются. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  const updated = await query(
    `update class set archived_at = now()
     where id = $1 and teacher_id = $2 and archived_at is null
     returning id`,
    [id, user.id],
  );
  if (!updated.length) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
