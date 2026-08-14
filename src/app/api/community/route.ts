import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query, queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/community — объявление или событие.
 *
 * Писать может только учитель, автор или админ. Это не иерархия ради
 * иерархии: объявление показывается всем участникам без их согласия,
 * и право на такую рассылку не должно быть у каждого, кто завёл аккаунт.
 * Чат — другое дело, там пишут все, и он отдельным маршрутом.
 *
 * Глобальную область (видят все, включая незнакомых людей) оставляем
 * администратору: учитель адресует своим классам.
 */

async function ownsClass(userId: string, classId: string) {
  const row = await queryOne(`select 1 from class where id = $1 and teacher_id = $2`, [
    classId,
    userId,
  ]);
  return row !== null;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!["teacher", "author", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let body: Record<string, string | boolean | null>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const kind = String(body.kind ?? "");
  const scope = String(body.scope ?? "class");
  const classId = body.class_id ? String(body.class_id) : null;
  const title = String(body.title ?? "").trim();

  if (!title) return NextResponse.json({ error: "TITLE_REQUIRED" }, { status: 400 });

  if (scope === "global" && user.role !== "admin") {
    return NextResponse.json({ error: "GLOBAL_IS_ADMIN_ONLY" }, { status: 403 });
  }
  if (scope === "class") {
    if (!classId) return NextResponse.json({ error: "CLASS_REQUIRED" }, { status: 400 });
    if (user.role !== "admin" && !(await ownsClass(user.id, classId))) {
      return NextResponse.json({ error: "NOT_YOUR_CLASS" }, { status: 403 });
    }
  }

  if (kind === "announcement") {
    const text = String(body.body_md ?? "").trim();
    if (!text) return NextResponse.json({ error: "BODY_REQUIRED" }, { status: 400 });

    const row = await queryOne<{ id: string }>(
      `insert into announcement (scope, class_id, author_id, title, body_md, pinned)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [scope, classId, user.id, title, text, Boolean(body.pinned)],
    );
    return NextResponse.json({ ok: true, id: row?.id });
  }

  if (kind === "event") {
    const startsAt = String(body.starts_at ?? "");
    if (!startsAt) return NextResponse.json({ error: "START_REQUIRED" }, { status: 400 });

    const when = new Date(startsAt);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: "START_INVALID" }, { status: 400 });
    }

    // Ссылка на встречу проверяется на протокол: она уедет в href, и
    // javascript:… там означает чужой скрипт по клику.
    let url: string | null = null;
    if (body.url) {
      try {
        const parsed = new URL(String(body.url));
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          return NextResponse.json({ error: "URL_SCHEME" }, { status: 400 });
        }
        url = parsed.toString();
      } catch {
        return NextResponse.json({ error: "URL_INVALID" }, { status: 400 });
      }
    }

    const row = await queryOne<{ id: string }>(
      `insert into event (scope, class_id, title, description_md, starts_at,
                          ends_at, location, url, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [
        scope,
        classId,
        title,
        String(body.description_md ?? "").trim() || null,
        when.toISOString(),
        body.ends_at ? new Date(String(body.ends_at)).toISOString() : null,
        String(body.location ?? "").trim() || null,
        url,
        user.id,
      ],
    );
    return NextResponse.json({ ok: true, id: row?.id });
  }

  return NextResponse.json({ error: "UNKNOWN_KIND" }, { status: 400 });
}

/** Мягкое удаление: объявление исчезает из ленты, но остаётся в истории. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const kind = url.searchParams.get("kind");
  if (!id || !kind) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  // Админ убирает что угодно, автор — только своё.
  const guard = user.role === "admin" ? "" : " and author_id = $2";
  const params = user.role === "admin" ? [id] : [id, user.id];

  if (kind === "announcement") {
    await query(`update announcement set deleted_at = now() where id = $1${guard}`, params);
  } else if (kind === "event") {
    const eventGuard = user.role === "admin" ? "" : " and created_by = $2";
    await query(`update event set cancelled_at = now() where id = $1${eventGuard}`, params);
  } else {
    return NextResponse.json({ error: "UNKNOWN_KIND" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
