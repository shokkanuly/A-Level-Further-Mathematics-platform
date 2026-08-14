import Link from "next/link";
import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { AssignmentBuilder } from "@/components/AssignmentBuilder";
import { AiPanel } from "@/components/AiPanel";
import { aiEnabled } from "@/lib/ai";
import { requireTeacher } from "@/lib/session";
import {
  getClass,
  listStudents,
  listAssignments,
  classWeakConcepts,
} from "@/lib/classroom";
import { listItemsForBoard, listBoards } from "@/lib/queries";
import { students as nStudents, assignments as nAssignments, items as nItems, marks as nMarks } from "@/lib/plural";

export const dynamic = "force-dynamic";

export default async function ClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const user = await requireTeacher(`/teach/${classId}`);

  const klass = await getClass(classId);
  // Чужой класс не «пустой», а отсутствующий: существование чужих классов
  // наружу не подтверждается.
  if (!klass || klass.teacher_id !== user.id) notFound();

  const [students, assignments, weak, boards] = await Promise.all([
    listStudents(classId),
    listAssignments(classId),
    classWeakConcepts(classId),
    listBoards(),
  ]);
  const bank = await listItemsForBoard(boards[0].id);
  const ai = aiEnabled();

  return (
    <>
      <AppNav user={user} />
      <main className="page" id="main">
        <Link className="back" href="/teach">
          ← Мои классы
        </Link>

        <header className="item-head">
          <h1>{klass.name}</h1>
          <div className="bank-meta">
            <span className="chip">{nStudents(students.length)}</span>
            <span className="chip">{nAssignments(assignments.length)}</span>
            <span className="join-code">{klass.join_code}</span>
          </div>
          <p className="lede" style={{ marginTop: 12, marginBottom: 0 }}>
            Продиктуйте код ученикам — они вступят сами на странице «Домашка».
          </p>
        </header>

        <h2 className="section-h">Выдать задание</h2>
        <AssignmentBuilder classId={classId} bank={bank} />

        {assignments.length > 0 && (
          <>
            <h2 className="section-h">Выданные задания</h2>
            <div className="bank stagger">
              {assignments.map((a) => (
                <Link key={a.id} className="bank-card" href={`/teach/${classId}/${a.id}`}>
                  <div className="bank-card-top">
                    <div style={{ minWidth: 0 }}>
                      <div className="card-title">{a.title}</div>
                      <div className="bank-meta">
                        <span className="chip">{nItems(a.item_count)}</span>
                        <span className="chip">{nMarks(a.total_marks)}</span>
                        <span className="chip">
                          {a.due_at
                            ? `до ${new Date(a.due_at).toLocaleDateString("ru-RU", {
                                day: "numeric",
                                month: "long",
                              })}`
                            : "без дедлайна"}
                        </span>
                        {a.settings.solutions_locked_until_due === true && (
                          <span className="chip">разбор закрыт до дедлайна</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        <h2 className="section-h">Ученики</h2>
        {students.length === 0 ? (
          <div className="empty">
            Пока никто не вступил. Код класса — <strong>{klass.join_code}</strong>.
          </div>
        ) : (
          <div className="roster">
            {students.map((s) => (
              <details className="roster-row roster-expandable" key={s.id}>
                <summary>
                  <span className="avatar">{initials(s.display_name)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{s.display_name}</div>
                    <div className="roster-sub">{s.email}</div>
                  </div>
                  <span className="roster-more" aria-hidden>
                    разбор
                  </span>
                </summary>
                {/* Панель внутри details: запрос уходит только когда учитель
                    развернул конкретного ученика, а не при открытии класса. */}
                <AiPanel
                  mode={{ kind: "diagnose", studentId: s.id, studentName: s.display_name }}
                  enabled={ai}
                />
              </details>
            ))}
          </div>
        )}

        {weak.length > 0 && (
          <>
            <h2 className="section-h">Где класс проседает</h2>
            <p className="lede" style={{ marginBottom: 14 }}>
              Считается по концептам, а не по модулям комиссии: ученик, сменивший
              Edexcel на CIE, не теряет накопленную статистику.
            </p>
            <div className="cards-plain">
              {weak.map((w) => (
                <div className="weak-row" key={w.concept} data-level={level(w.accuracy)}>
                  <span className="weak-name">{w.concept}</span>
                  <span className="weak-bar">
                    <i style={{ width: `${Math.round(w.accuracy * 100)}%` }} />
                  </span>
                  <span className="weak-num">{Math.round(w.accuracy * 100)}%</span>
                  <span className="weak-meta">
                    {w.scored}/{w.possible} · {w.students} чел.
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}

/** Порог окраски шкалы: ниже 50% — красная, до 75% — жёлтая, выше — зелёная. */
function level(accuracy: number) {
  if (accuracy >= 0.75) return "high";
  if (accuracy >= 0.5) return "mid";
  return "low";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
