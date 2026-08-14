import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { ChatRoom } from "@/components/ChatRoom";
import { CommunityComposer } from "@/components/CommunityComposer";
import { requireUser } from "@/lib/session";
import { listAnnouncements, listEvents, listRooms } from "@/lib/community";
import { listClassesForTeacher } from "@/lib/classroom";
import { renderRich, DEFAULT_MACROS } from "@/lib/tex.mjs";

export const dynamic = "force-dynamic";

export const metadata = { title: "События и активность" };

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const user = await requireUser("/events");
  const { room: roomParam } = await searchParams;

  const canPost = ["teacher", "author", "admin"].includes(user.role);

  const [announcements, events, rooms, myClasses] = await Promise.all([
    listAnnouncements(user.id),
    listEvents(user.id),
    listRooms(user.id),
    canPost ? listClassesForTeacher(user.id) : Promise.resolve([]),
  ]);

  const room = rooms.find((r) => r.id === roomParam) ?? rooms[0];

  return (
    <>
      <AppNav user={user} />
      <main className="page" id="main">
        <div className="eyebrow">Общее место</div>
        <h1>События и активность</h1>
        <p className="lede">
          Объявления, ближайшие события и чат класса. Вопрос по задаче лучше
          задавать здесь, а не в мессенджере: тут его видит учитель вместе
          с историей.
        </p>

        {canPost && <CommunityComposer classes={myClasses} isAdmin={user.role === "admin"} />}

        <div className="community">
          <div className="community-main">
            {/* ── объявления ───────────────────────────────────────────── */}
            <h2 className="section-h">
              Объявления
              {announcements.length > 0 && (
                <span className="chip">{announcements.length}</span>
              )}
            </h2>

            {announcements.length === 0 ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden>
                  ∅
                </span>
                <strong>Объявлений пока нет</strong>
                <span>Здесь появится то, что учитель хочет сказать всему классу.</span>
              </div>
            ) : (
              <div className="cards-plain">
                {announcements.map((a) => (
                  <article key={a.id} className="ann" data-pinned={a.pinned}>
                    <div className="ann-head">
                      {a.pinned && (
                        <span className="chip" data-tone="accent">
                          закреплено
                        </span>
                      )}
                      <span className="chip">
                        {a.scope === "global" ? "всем" : a.class_name}
                      </span>
                      <span className="ann-when">{dateTime(a.created_at)}</span>
                    </div>
                    <h3 className="ann-title">{a.title}</h3>
                    <div
                      className="ann-body"
                      dangerouslySetInnerHTML={{ __html: renderRich(a.body_md, DEFAULT_MACROS) }}
                    />
                    <div className="ann-author">{a.author_name}</div>
                  </article>
                ))}
              </div>
            )}

            {/* ── события ──────────────────────────────────────────────── */}
            <h2 className="section-h">Ближайшие события</h2>

            {events.length === 0 ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden>
                  ∅
                </span>
                <strong>Ничего не запланировано</strong>
                <span>Консультации, разборы и пробники появятся здесь.</span>
              </div>
            ) : (
              <div className="cards-plain">
                {events.map((e) => (
                  <article key={e.id} className="event-row">
                    <div className="event-when">
                      <b>{new Date(e.starts_at).getDate()}</b>
                      <span>
                        {new Date(e.starts_at).toLocaleString("ru-RU", { month: "short" })}
                      </span>
                    </div>
                    <div className="event-main">
                      <div className="event-title">{e.title}</div>
                      <div className="event-meta">
                        {dateTime(e.starts_at)}
                        {e.location ? ` · ${e.location}` : ""}
                        {e.scope === "class" && e.class_name ? ` · ${e.class_name}` : ""}
                      </div>
                      {e.description_md && (
                        <div
                          className="event-desc"
                          dangerouslySetInnerHTML={{ __html: renderRich(e.description_md, DEFAULT_MACROS) }}
                        />
                      )}
                    </div>
                    {e.url && (
                      <a
                        className="btn btn-ghost btn-sm"
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                      >
                        Ссылка
                      </a>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* ── чат ────────────────────────────────────────────────────── */}
          <aside className="community-side">
            <h2 className="section-h" style={{ marginTop: 0 }}>
              Чат
            </h2>

            {rooms.length > 1 && (
              <div className="facet-options" style={{ marginBottom: 12 }}>
                {rooms.map((r) => (
                  <Link
                    key={r.id}
                    className="facet-chip"
                    data-on={r.id === room?.id}
                    href={`/events?room=${r.id}`}
                  >
                    {r.name}
                    {r.unread_hint > 0 && <span className="facet-count">{r.unread_hint}</span>}
                  </Link>
                ))}
              </div>
            )}

            {room ? (
              <ChatRoom roomId={room.id} roomName={room.name} meId={user.id} />
            ) : (
              <div className="empty">
                <span className="empty-mark" aria-hidden>
                  ∅
                </span>
                <strong>Комнат нет</strong>
                <span>Чат класса появится, когда вы вступите в класс.</span>
              </div>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
