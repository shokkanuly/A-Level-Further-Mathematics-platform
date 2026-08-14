import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { RoleEditor } from "@/components/RoleEditor";
import { requireUser } from "@/lib/session";
import { totals, listUsers, itemPipeline, programCoverage, recentActivity } from "@/lib/admin";
import { plural } from "@/lib/plural";

export const dynamic = "force-dynamic";

export const metadata = { title: "Админка" };

const ACTIVITY_LABEL: Record<string, string> = {
  attempt: "решал",
  lesson: "выложил урок",
  message: "написал",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser("/admin");
  // Роль проверяется здесь, а не в middleware: middleware не ходит в базу,
  // а роль живёт в базе, и «роль из куки» — это роль, которую можно подделать.
  if (user.role !== "admin") redirect("/cabinet");

  const { q } = await searchParams;
  const [t, users, pipeline, coverage, activity] = await Promise.all([
    totals(),
    listUsers(q),
    itemPipeline(),
    programCoverage(),
    recentActivity(),
  ]);

  return (
    <>
      <AppNav user={user} />
      <main className="page page-wide" id="main">
        <div className="eyebrow">Состояние платформы</div>
        <h1>Админка</h1>

        <div className="cabinet-stats">
          <div className="stat">
            <b>{t.users}</b>
            <span>
              всего · {t.students} {plural(t.students, "ученик", "ученика", "учеников")}, {t.teachers}{" "}
              преп.
            </span>
          </div>
          <div className="stat">
            <b>{t.items_published}</b>
            <span>
              задач в банке{t.items_draft > 0 ? ` · ${t.items_draft} в черновиках` : ""}
            </span>
          </div>
          <div className="stat">
            <b>{t.classes}</b>
            <span>{plural(t.classes, "класс", "класса", "классов")}</span>
          </div>
          <div className="stat">
            <b>{t.attempts}</b>
            <span>{plural(t.attempts, "попытка", "попытки", "попыток")}</span>
          </div>
          <div className="stat">
            <b>{t.lessons}</b>
            <span>{plural(t.lessons, "урок", "урока", "уроков")}</span>
          </div>
          <div className="stat">
            <b>{t.messages_7d}</b>
            <span>сообщений за неделю</span>
          </div>
        </div>

        {/* ── покрытие программ ─────────────────────────────────────────── */}
        <h2 className="section-h">Покрытие программ</h2>
        <div className="cards-plain">
          {coverage.map((c) => (
            <div key={c.name_ru} className="roster-row">
              <div>
                <strong>{c.name_ru}</strong>
                <div className="roster-sub">
                  {c.items} {plural(c.items, "задача", "задачи", "задач")} ·{" "}
                  {c.lessons} {plural(c.lessons, "урок", "урока", "уроков")}
                </div>
              </div>
              <span className="chip" data-tone={c.items === 0 ? "bad" : c.items < 5 ? "warn" : "ok"}>
                {c.items === 0 ? "пусто" : c.items < 5 ? "мало" : "есть"}
              </span>
            </div>
          ))}
        </div>
        <div className="note">
          Блок с нулём задач виден ученикам как пустой экран. Пока в программе
          нет задач, её лучше не показывать на витрине.
        </div>

        {/* ── конвейер ──────────────────────────────────────────────────── */}
        {pipeline.length > 0 && (
          <>
            <h2 className="section-h">Банк по видам</h2>
            <div className="table-scroll">
              <table className="gradebook">
                <thead>
                  <tr>
                    <th>Вид</th>
                    <th>Статус</th>
                    <th>Версий</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.map((r, i) => (
                    <tr key={i}>
                      <td>{r.kind_name}</td>
                      <td>{r.status}</td>
                      <td data-tone={r.status === "published" ? "ok" : "none"}>{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── пользователи ──────────────────────────────────────────────── */}
        <h2 className="section-h">
          Пользователи <span className="chip">{users.length}</span>
        </h2>

        <form className="inline-form" method="get" style={{ marginBottom: 14 }}>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Поиск по имени или почте"
            aria-label="Поиск пользователей"
          />
          <button className="btn btn-secondary btn-sm" type="submit">
            Найти
          </button>
        </form>

        <div className="table-scroll">
          <table className="gradebook">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Почта</th>
                <th>Роль</th>
                <th>Классы</th>
                <th>Попытки</th>
                <th>Последний вход</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.display_name}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>{u.email}</td>
                  <td>
                    <RoleEditor userId={u.id} role={u.role} isSelf={u.id === user.id} />
                  </td>
                  <td>{u.classes}</td>
                  <td>{u.attempts}</td>
                  <td style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleDateString("ru-RU")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── активность ────────────────────────────────────────────────── */}
        <h2 className="section-h">Что происходило</h2>
        {activity.length === 0 ? (
          <div className="empty">
            <span className="empty-mark" aria-hidden>
              ∅
            </span>
            <strong>Тихо</strong>
            <span>Ни попыток, ни уроков, ни сообщений.</span>
          </div>
        ) : (
          <div className="cards-plain">
            {activity.map((a, i) => (
              <div key={i} className="recent-row">
                <span className="recent-dot" aria-hidden />
                <span className="recent-title">
                  <strong>{a.who}</strong> {ACTIVITY_LABEL[a.kind] ?? a.kind} — {a.what}
                </span>
                <span className="recent-score">
                  {new Date(a.at).toLocaleString("ru-RU", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
