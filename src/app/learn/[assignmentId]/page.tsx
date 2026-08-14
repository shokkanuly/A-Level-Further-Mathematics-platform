import Link from "next/link";
import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { requireUser, assertEnrolledInAssignment } from "@/lib/session";
import { getAssignment, listAssignmentItems } from "@/lib/classroom";
import { query } from "@/lib/db";
import { parts as nParts } from "@/lib/plural";

export const dynamic = "force-dynamic";

export default async function StudentAssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const user = await requireUser(`/learn/${assignmentId}`);

  // Не состоит в классе — задания не существует. Наличие чужих заданий
  // наружу не подтверждается.
  if (!(await assertEnrolledInAssignment(user.id, assignmentId))) notFound();

  const assignment = await getAssignment(assignmentId);
  if (!assignment) notFound();

  const items = await listAssignmentItems(assignmentId);

  const progress = await query<{
    item_version_id: string;
    scored: number;
    parts_done: number;
  }>(
    `select at.item_version_id,
            coalesce(sum(pr.marks_awarded), 0)::int as scored,
            count(pr.id)::int as parts_done
     from attempt at
     left join part_response pr on pr.attempt_id = at.id
     where at.assignment_id = $1 and at.student_id = $2
     group by at.item_version_id`,
    [assignmentId, user.id],
  );
  const byVersion = new Map(progress.map((p) => [p.item_version_id, p]));

  const pastDue = assignment.due_at ? new Date(assignment.due_at) < new Date() : false;
  const locked = assignment.settings.solutions_locked_until_due !== false && !pastDue;

  const scored = progress.reduce((a, p) => a + p.scored, 0);
  const total = items.reduce((a, i) => a + i.total_marks, 0);

  return (
    <>
      <AppNav user={user} />
      <main className="page" id="main">
        <Link className="back" href="/learn">
          ← Домашка
        </Link>

        <header className="item-head">
          <div className="eyebrow">{assignment.class_name}</div>
          <h1>{assignment.title}</h1>
          <div className="bank-meta">
            <span className="chip chip-marks">
              {scored} / {total}
            </span>
            {assignment.due_at && (
              <span className="chip" data-tone={pastDue ? "bad" : undefined}>
                {pastDue ? "дедлайн прошёл" : "срок до "}
                {!pastDue &&
                  new Date(assignment.due_at).toLocaleString("ru-RU", {
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
              </span>
            )}
            <span className="chip">
              {locked ? "разбор закрыт до дедлайна" : "разбор открыт"}
            </span>
          </div>
        </header>

        <div className="bank stagger">
          {items.map((it, i) => {
            const p = byVersion.get(it.item_version_id);
            const pct = it.total_marks ? ((p?.scored ?? 0) / it.total_marks) * 100 : 0;
            return (
              <Link
                key={it.item_version_id}
                className="bank-card"
                href={`/item/${it.slug}?assignment=${assignmentId}`}
              >
                <div className="bank-card-top">
                  <div style={{ minWidth: 0, display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <span className="part-badge" style={{ marginTop: 2 }}>
                      {i + 1}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="card-title" style={{ marginBottom: 4 }}>{it.title_ru}</div>
                      <div className="roster-sub">
                        {p ? `${nParts(p.parts_done)} отвечено` : "ещё не начато"}
                      </div>
                    </div>
                  </div>
                  <span className="chip chip-marks">
                    {p?.scored ?? 0} / {it.total_marks}
                  </span>
                </div>
                <div className="score-bar" style={{ width: "100%", marginTop: 12 }}>
                  <i style={{ width: `${pct}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
