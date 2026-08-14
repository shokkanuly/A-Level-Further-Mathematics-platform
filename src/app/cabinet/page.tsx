import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { requireUser } from "@/lib/session";
import {
  studentMastery,
  studentSummary,
  studentRecent,
  studentClasses,
  teacherSummary,
  studentsAtRisk,
  teacherWeakConcepts,
} from "@/lib/cabinet";
import { listAssignmentsForStudent, listClassesForTeacher } from "@/lib/classroom";
import { conceptStyle } from "@/lib/concept-color";
import { students as nStudents, marks as nMarks, plural } from "@/lib/plural";

export const dynamic = "force-dynamic";

export const metadata = { title: "Личный кабинет" };

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** Уровень красит шкалу: провал виден до чтения процента. */
const level = (a: number | null) =>
  a === null ? "mid" : a >= 0.8 ? "ok" : a >= 0.6 ? "mid" : "bad";

export default async function CabinetPage() {
  const user = await requireUser("/cabinet");
  return user.role === "student" ? (
    <StudentCabinet user={user} />
  ) : (
    <TeacherCabinet user={user} />
  );
}

// ── ученик ─────────────────────────────────────────────────────────────────

async function StudentCabinet({
  user,
}: {
  user: { id: string; display_name: string; role: string };
}) {
  const [summary, mastery, recent, classes, assignments] = await Promise.all([
    studentSummary(user.id),
    studentMastery(user.id),
    studentRecent(user.id),
    studentClasses(user.id),
    listAssignmentsForStudent(user.id),
  ]);

  const due = assignments.filter((a) => a.attempted_items < a.item_count);
  const weakest = mastery.slice(0, 5);
  const strongest = [...mastery].reverse().slice(0, 3);

  return (
    <>
      <AppNav user={user} />
      <main className="page" id="main">
        <div className="cabinet-head">
          <div className="avatar" aria-hidden>
            {user.display_name.slice(0, 1)}
          </div>
          <div>
            <div className="eyebrow">Личный кабинет</div>
            <h1>{user.display_name}</h1>
          </div>
        </div>

        <div className="cabinet-stats">
          <div className="stat">
            <b>{summary.items}</b>
            <span>{plural(summary.items, "задача решалась", "задачи решались", "задач решались")}</span>
          </div>
          <div className="stat">
            <b>
              {summary.earned}
              <small>/{summary.possible}</small>
            </b>
            <span>баллов набрано</span>
          </div>
          <div className="stat">
            <b>{pct(summary.accuracy)}</b>
            <span>точность по баллам</span>
          </div>
          <div className="stat">
            <b>{summary.active_days}</b>
            <span>{plural(summary.active_days, "день занятий", "дня занятий", "дней занятий")}</span>
          </div>
        </div>

        {summary.possible === 0 && (
          <div className="empty" style={{ marginTop: 26 }}>
            <span className="empty-mark" aria-hidden>
              ∅
            </span>
            <strong>Здесь появится ваша статистика</strong>
            <span>
              Решите первую задачу в <Link href="/bank">банке</Link> — и кабинет
              покажет, какие темы даются, а какие нет.
            </span>
          </div>
        )}

        {due.length > 0 && (
          <>
            <h2 className="section-h">
              Незакрытая домашка <span className="chip">{due.length}</span>
            </h2>
            <div className="cards-plain">
              {due.map((a) => (
                <Link key={a.id} className="due-row" href={`/learn/${a.id}`} data-overdue={a.is_overdue}>
                  <div>
                    <div className="due-title">{a.title}</div>
                    <div className="due-sub">
                      {a.class_name} · {a.attempted_items} из {a.item_count}
                    </div>
                  </div>
                  <span className="chip" data-tone={a.is_overdue ? "bad" : undefined}>
                    {a.due_at
                      ? a.is_overdue
                        ? "срок прошёл"
                        : `до ${new Date(a.due_at).toLocaleDateString("ru-RU")}`
                      : "без срока"}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        {mastery.length > 0 && (
          <>
            <h2 className="section-h">
              Слабые темы <span className="chip">по баллам, не по числу задач</span>
            </h2>
            <div className="cards-plain">
              {weakest.map((m) => (
                <div
                  key={m.slug}
                  className="weak-row"
                  data-level={level(m.accuracy)}
                  style={conceptStyle(m.family_slug)}
                >
                  <span className="weak-name">{m.name_ru}</span>
                  <span className="weak-bar">
                    <i style={{ width: `${Math.round((m.accuracy ?? 0) * 100)}%` }} />
                  </span>
                  <span className="weak-num">{pct(m.accuracy)}</span>
                  <span className="weak-meta">
                    {m.earned}/{m.possible} б · {m.items_seen}{" "}
                    {plural(m.items_seen, "задача", "задачи", "задач")}
                  </span>
                </div>
              ))}
            </div>

            {strongest.length > 0 && strongest[0].accuracy >= 0.8 && (
              <div className="note">
                Уверенно идут:{" "}
                <strong>{strongest.map((s) => s.name_ru).join(", ")}</strong>. Точность
                считается по сумме баллов: задача на 8 баллов, решённая на 6, — это
                не «неверно».
              </div>
            )}
          </>
        )}

        {recent.length > 0 && (
          <>
            <h2 className="section-h">Последние попытки</h2>
            <div className="cards-plain">
              {recent.map((r) => (
                <Link
                  key={r.attempt_id}
                  className="recent-row"
                  href={`/item/${r.slug}`}
                  style={conceptStyle(r.title_slug)}
                >
                  <span className="recent-dot" aria-hidden />
                  <span className="recent-title">{r.title_ru}</span>
                  <span className="chip chip-kind">{r.kind_name}</span>
                  <span className="chip">
                    {r.context === "assignment" ? "домашка" : "практика"}
                  </span>
                  <span className="recent-score" data-ok={r.earned === r.possible}>
                    {r.earned}/{r.possible}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        {classes.length > 0 && (
          <>
            <h2 className="section-h">Мои классы</h2>
            <div className="cards-plain">
              {classes.map((c) => (
                <div key={c.id} className="roster-row">
                  <div>
                    <strong>{c.name}</strong>
                    <div className="roster-sub">
                      {c.teacher_name} · {nStudents(c.students)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}

// ── учитель ────────────────────────────────────────────────────────────────

async function TeacherCabinet({
  user,
}: {
  user: { id: string; display_name: string; role: string };
}) {
  const [summary, classes, risk, weak] = await Promise.all([
    teacherSummary(user.id),
    listClassesForTeacher(user.id),
    studentsAtRisk(user.id),
    teacherWeakConcepts(user.id),
  ]);

  return (
    <>
      <AppNav user={user} />
      <main className="page" id="main">
        <div className="cabinet-head">
          <div className="avatar" aria-hidden>
            {user.display_name.slice(0, 1)}
          </div>
          <div>
            <div className="eyebrow">Личный кабинет · {user.role === "admin" ? "администратор" : "учитель"}</div>
            <h1>{user.display_name}</h1>
          </div>
        </div>

        <div className="cabinet-stats">
          <div className="stat">
            <b>{summary.classes}</b>
            <span>{plural(summary.classes, "класс", "класса", "классов")}</span>
          </div>
          <div className="stat">
            <b>{summary.students}</b>
            <span>{plural(summary.students, "ученик", "ученика", "учеников")}</span>
          </div>
          <div className="stat">
            <b>{summary.assignments}</b>
            <span>{plural(summary.assignments, "задание", "задания", "заданий")}</span>
          </div>
          <div className="stat">
            <b>{summary.authored}</b>
            <span>{plural(summary.authored, "своя задача", "свои задачи", "своих задач")}</span>
          </div>
        </div>

        <h2 className="section-h">
          К кому подойти
          {risk.length > 0 && <span className="chip">{risk.length}</span>}
        </h2>

        {risk.length === 0 ? (
          <div className="empty">
            <span className="empty-mark" aria-hidden>
              ✓
            </span>
            <strong>Никто не выпадает</strong>
            <span>
              Ни пропущенных сроков, ни точности ниже 60%. Список наполнится сам,
              когда появится, о чём говорить.
            </span>
          </div>
        ) : (
          <div className="cards-plain">
            {risk.map((r) => (
              <Link
                key={`${r.student_id}-${r.class_id}`}
                className="risk-row"
                href={`/teach/${r.class_id}`}
              >
                <div className="risk-who">
                  <strong>{r.display_name}</strong>
                  <span className="roster-sub">{r.class_name}</span>
                </div>

                <div className="risk-why">
                  {/* Два разных повода, и они не складываются в один балл:
                      «не открывал» и «не понял» лечатся по-разному. */}
                  {r.missed > 0 && (
                    <span className="chip" data-tone="bad">
                      не начато: {r.missed}{" "}
                      {plural(r.missed, "задание", "задания", "заданий")}
                    </span>
                  )}
                  {r.accuracy !== null && r.accuracy < 0.6 && (
                    <span className="chip" data-tone="warn">
                      точность {pct(r.accuracy)}
                    </span>
                  )}
                  {r.weakest && <span className="chip chip-concept">{r.weakest}</span>}
                </div>

                <span className="risk-score">
                  {r.possible > 0 ? `${r.earned}/${r.possible}` : "—"}
                </span>
              </Link>
            ))}
          </div>
        )}

        {weak.length > 0 && (
          <>
            <h2 className="section-h">Слабые темы по всем классам</h2>
            <div className="cards-plain">
              {weak.slice(0, 6).map((m) => (
                <div
                  key={m.slug}
                  className="weak-row"
                  data-level={level(m.accuracy)}
                  style={conceptStyle(m.family_slug)}
                >
                  <span className="weak-name">{m.name_ru}</span>
                  <span className="weak-bar">
                    <i style={{ width: `${Math.round((m.accuracy ?? 0) * 100)}%` }} />
                  </span>
                  <span className="weak-num">{pct(m.accuracy)}</span>
                  <span className="weak-meta">
                    {nMarks(m.earned)} из {m.possible} · {nStudents(m.items_seen)}
                  </span>
                </div>
              ))}
            </div>
            <div className="note">
              Темы — концепты, а не юниты комиссии. Ученик, сменивший программу,
              не теряет накопленную статистику: «квадратные уравнения» — одна
              и та же строка и в школьном блоке, и в A-Level.
            </div>
          </>
        )}

        <h2 className="section-h">Мои классы</h2>
        {classes.length === 0 ? (
          <div className="empty">
            <span className="empty-mark" aria-hidden>
              ∅
            </span>
            <strong>Классов пока нет</strong>
            <span>
              <Link href="/teach">Создайте класс</Link> и выдайте ученикам код
              вступления.
            </span>
          </div>
        ) : (
          <div className="cards-plain">
            {classes.map((c) => (
              <Link key={c.id} className="roster-row" href={`/teach/${c.id}`}>
                <div>
                  <strong>{c.name}</strong>
                  <div className="roster-sub">
                    {nStudents(c.student_count)} ·{" "}
                    {plural(c.assignment_count, "задание", "задания", "заданий")}:{" "}
                    {c.assignment_count}
                  </div>
                </div>
                <span className="join-code">{c.join_code}</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
