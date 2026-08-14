import { getCurrentUser } from "@/lib/session";
import { canUseRoom, listMessages } from "@/lib/community";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/{roomId}/stream?after=<seq> — поток новых сообщений (SSE).
 *
 * ПОЧЕМУ SSE, А НЕ WEBSOCKET. Хостинг ещё не выбран, и решение не должно его
 * предрешать. WebSocket требует процесса, который живёт между запросами:
 * на Vercel и любом serverless его нет, и пришлось бы брать сторонний сервис.
 * SSE — обычный HTTP-ответ, который долго не закрывается: он работает
 * и на VPS, и на serverless, и через любой прокси, и переживает
 * корпоративные фильтры, которые режут Upgrade.
 *
 * ПОЧЕМУ ВНУТРИ ОПРОС БАЗЫ, А НЕ LISTEN/NOTIFY. NOTIFY требует выделенного
 * соединения на каждого слушателя; при пуле из пяти соединений шестой
 * читатель повесит приложение целиком. Опрос раз в полторы секунды для
 * школьного чата — это мгновенно на глаз и один дешёвый индексный запрос
 * по (room_id, seq).
 *
 * Соединение закрывается через MAX_LIFETIME сознательно: у serverless есть
 * свой потолок, и лучше переподключиться самим в предсказуемый момент,
 * чем однажды оборваться на середине. EventSource переподключается сам,
 * а курсор `after` не даёт потерять сообщения на стыке.
 */

const POLL_MS = 1500;
const HEARTBEAT_MS = 15_000;
const MAX_LIFETIME_MS = 4 * 60_000;

export async function GET(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("unauthenticated", { status: 401 });

  const room = await canUseRoom(user.id, roomId);
  if (!room) return new Response("forbidden", { status: 403 });

  let cursor = new URL(req.url).searchParams.get("after") ?? undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      const startedAt = Date.now();
      let lastBeat = Date.now();

      // Клиент уходит со страницы — прекращаем опрашивать базу немедленно,
      // иначе брошенные вкладки продолжают её нагружать.
      req.signal.addEventListener("abort", () => {
        closed = true;
      });

      send("ready", { room: room.id, cursor: cursor ?? null });

      while (!closed && Date.now() - startedAt < MAX_LIFETIME_MS) {
        try {
          // Право проверяется не только на входе: если ученика отчислили,
          // поток обязан закрыться, а не доигрывать до конца жизни соединения.
          const still = await canUseRoom(user.id, roomId);
          if (!still) {
            send("closed", { reason: "FORBIDDEN" });
            break;
          }

          const fresh = await listMessages(roomId, { after: cursor });
          if (fresh.length > 0) {
            cursor = fresh.at(-1)!.seq;
            send("messages", { messages: fresh, cursor });
            lastBeat = Date.now();
          } else if (Date.now() - lastBeat > HEARTBEAT_MS) {
            // Комментарий SSE: держит соединение живым через прокси,
            // которые рвут «молчащие» ответы.
            if (!closed) controller.enqueue(encoder.encode(`: keep-alive\n\n`));
            lastBeat = Date.now();
          }
        } catch {
          // Ошибка базы не должна ронять поток: клиент переподключится
          // и дочитает по курсору.
          break;
        }

        await new Promise((r) => setTimeout(r, POLL_MS));
      }

      if (!closed) send("bye", { cursor: cursor ?? null });
      closed = true;
      try {
        controller.close();
      } catch {
        /* уже закрыт */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // nginx буферизует ответы и съедает весь смысл SSE.
      "x-accel-buffering": "no",
    },
  });
}
