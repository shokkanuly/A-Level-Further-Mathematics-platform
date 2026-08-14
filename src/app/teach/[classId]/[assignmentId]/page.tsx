import Link from "next/link";
import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { requireTeacher } from "@/lib/session";
import { getAssignment, listAssignmentItems, assignmentResults } from "@/lib/classroom";
import { items as nItems, marks as nMarks, students as nStudents } from "@/lib/plural";

export const dynamic = "force-dynamic";

export default async function AssignmentResultsPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const { classId, assignmentId } = await params;
  const user = await requireTeacher(`/teach/${classId}/${assignmentId}`);

  const assignment = await getAssignment(assignmentId);
  if (!assignment || assignment.teacher_id !== user.id) notFound();

  const [items, rows] = await Promise.all([
    listAssignmentItems(assignmentId),
    assignmentResults(assignmentId),
  ]);

  // Строка на ученика, столбец на задачу — журнал с баллами, а не с галочками (§6).
  const byStudent = new Map<string, { name: string; cells: Map<string, number | null> }>();
  for (const r of rows) {
    if (!byStudent.has(r.student_id)) {
      byStudent.set(r.student_id, { name: r.display_name, cells: new Map() });
    }
    byStudent.get(r.student_id)!.cells.set(r.item_version_id, r.scored);
  }

  const totalPossible = items.reduce((a, i) => a + i.total_marks, 0);
  const students = [...byStudent.entries()];

  // Средняя доля по каждой задаче — сразу видно, какая задача провалилась у всех.
  const perItem = items.map((it) => {
    const vals = students.map(([, s]) => s.cells.get(it.item_version_id) ?? 0);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { ...it, avg, pct: it.total_marks ? avg / it.total_marks : 0 };
  });

  return (
    <>
      <AppNav user={user} />
      <main className="page page-wide" id="main">
        <Link className="back" href={`/teach/${classId}`}>
          ← {assignment.class_name}
        </Link>

        <header className="item-head">
          <h1>{assignment.title}</h1>
          <div className="bank-meta">
            <span className="chip">{nItems(items.length)}</span>
            <span className="chip">{nMarks(totalPossible)}</span>
            <span className="chip">{nStudents(students.length)}</span>
            {assignment.due_at && (
              <span className="chip">
                до{" "}
                {new Date(assignment.due_at).toLocaleString("ru-RU", {
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </header>

        {students.length === 0 ? (
          <div className="empty">
            <span className="empty-mark" aria-hidden>⌸</span>
            <strong>В классе пока нет учеников</strong>
            <span>Продиктуйте им код класса — они вступят сами.</span>
          </div>
        ) : (
          <>
            <h2 className="section-h">Журнал</h2>
            <div className="table-scroll">
              <table className="gradebook">
                <thead>
                  <tr>
                    <th className="sticky-col">Ученик</th>
                    {items.map((it, i) => (
                      <th key={it.item_version_id} title={it.title_ru}>
                        {i + 1}
                        <span>[{it.total_marks}]</span>
                      </th>
                    ))}
                    <th>Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(([id, s]) => {
                    const sum = items.reduce(
                      (a, it) => a + (s.cells.get(it.item_version_id) ?? 0),
                      0,
                    );
                    return (
                      <tr key={id}>
                        <td className="sticky-col">{s.name}</td>
                        {items.map((it) => {
                          const v = s.cells.get(it.item_version_id);
                          const tone =
                            v === null || v === undefined
                              ? "none"
                              : v === it.total_marks
                                ? "ok"
                                : v === 0
                                  ? "bad"
                                  : "partial";
                          return (
                            <td key={it.item_version_id} data-tone={tone}>
                              {v === null || v === undefined ? "—" : v}
                            </td>
                          );
                        })}
                        <td className="total">
                          {sum}/{totalPossible}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h2 className="section-h">Какая задача не пошла</h2>
            <div className="cards-plain">
              {perItem
                .slice()
                .sort((a, b) => a.pct - b.pct)
                .map((it, i) => (
                  <div className="weak-row" key={it.item_version_id} data-level={it.pct >= 0.75 ? "high" : it.pct >= 0.5 ? "mid" : "low"}>
                    <span className="weak-name">
                      {items.findIndex((x) => x.item_version_id === it.item_version_id) + 1}.{" "}
                      {it.title_ru}
                    </span>
                    <span className="weak-bar">
                      <i style={{ width: `${Math.round(it.pct * 100)}%` }} />
                    </span>
                    <span className="weak-num">{Math.round(it.pct * 100)}%</span>
                    <span className="weak-meta">
                      в среднем {it.avg.toFixed(1)} из {it.total_marks}
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
