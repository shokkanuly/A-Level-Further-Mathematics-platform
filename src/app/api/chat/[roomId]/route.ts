import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { canUseRoom, listMessages, postMessage } from "@/lib/community";

export const dynamic = "force-dynamic";

/**
 * GET  /api/chat/{roomId}?after=<seq>   — дочитать сообщения
 * POST /api/chat/{roomId}   {body}      — отправить
 *
 * Право на комнату проверяется на КАЖДЫЙ запрос через canUseRoom, а не один
 * раз при открытии страницы: ученика могут отчислить из класса посреди
 * разговора, и после этого он не должен дочитывать переписку опросом.
 */

export async function GET(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const room = await canUseRoom(user.id, roomId);
  if (!room) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const after = new URL(req.url).searchParams.get("after") ?? undefined;
  const messages = await listMessages(roomId, { after: after || undefined });

  return NextResponse.json({
    room: { id: room.id, name: room.name, kind: room.kind },
    messages,
    cursor: messages.at(-1)?.seq ?? after ?? null,
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const room = await canUseRoom(user.id, roomId);
  if (!room) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let body: string;
  try {
    body = String((await req.json()).body ?? "");
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const trimmed = body.trim();
  if (!trimmed) return NextResponse.json({ error: "EMPTY" }, { status: 400 });
  // Тот же потолок, что в CHECK-ограничении таблицы: ошибка формы понятнее,
  // чем 500 из-за нарушенного ограничения.
  if (trimmed.length > 2000) {
    return NextResponse.json({ error: "TOO_LONG" }, { status: 400 });
  }

  const row = await postMessage(roomId, user.id, trimmed);
  return NextResponse.json({ ok: true, seq: row?.seq, id: row?.id });
}
