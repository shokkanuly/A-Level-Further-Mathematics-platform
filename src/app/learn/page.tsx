import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { JoinClass } from "@/components/JoinClass";
import { requireUser } from "@/lib/session";
import { listAssignmentsForStudent } from "@/lib/classroom";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const user = await requireUser("/learn");
  const assignments = await listAssignmentsForStudent(user.id);

  const active = assignments.filter((a) => !a.is_overdue);
  const past = assignments.filter((a) => a.is_overdue);

  return (
    <>
      <AppNav user={user} />
      <main className="page" id="main">
        <div className="eyebrow">{user.display_name}</div>
        <h1>Домашка</h1>

        {assignments.length === 0 ? (
          <>
            <p className="lede">
              Заданий пока нет. Вступите в класс по коду от учителя — или решайте
              задачи свободно в <Link href="/bank">банке задач</Link>.
            </p>
            <JoinClass />
          </>
        ) : (
          <>
            <p className="lede">
              Баллы считаются по пунктам: видно не «сдано/не сдано», а на каких
              именно пунктах потеряны баллы.
            </p>

            {active.length > 0 && (
              <div className="bank stagger">
                {active.map((a) => (
                  <AssignmentCard key={a.id} a={a} />
                ))}
              </div>
            )}

            {past.length > 0 && (
              <>
                <h2 className="section-h">Прошедшие</h2>
                <div className="bank">
                  {past.map((a) => (
                    <AssignmentCard key={a.id} a={a} />
                  ))}
                </div>
              </>
            )}

            <div style={{ marginTop: 28 }}>
              <JoinClass />
            </div>
          </>
        )}
      </main>
    </>
  );
}

function AssignmentCard({
  a,
}: {
  a: Awaited<ReturnType<typeof listAssignmentsForStudent>>[number];
}) {
  const done = a.attempted_items >= a.item_count && a.item_count > 0;
  const pct = a.total_marks ? Math.round((a.scored / a.total_marks) * 100) : 0;

  return (
    <Link className="bank-card" href={`/learn/${a.id}`}>
      <div className="bank-card-top">
        <div style={{ minWidth: 0 }}>
          <div className="card-title" style={{ marginBottom: 4 }}>{a.title}</div>
          <div className="roster-sub" style={{ marginBottom: 10 }}>{a.class_name}</div>
          <div className="bank-meta">
            {/* «из 1 задача» ломает падеж, поэтому существительное вынесено
                вперёд и не согласуется с числом. */}
            <span className="chip">
              задач начато: {a.attempted_items} из {a.item_count}
            </span>
            {a.due_at && (
              <span className="chip" data-tone={a.is_overdue ? "bad" : undefined}>
                {a.is_overdue ? "дедлайн прошёл" : "до "}
                {!a.is_overdue &&
                  new Date(a.due_at).toLocaleString("ru-RU", {
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
              </span>
            )}
            {a.settings.solutions_locked_until_due === true && !a.is_overdue && (
              <span className="chip">разбор откроется после дедлайна</span>
            )}
          </div>
        </div>
        <div className="assign-score">
          <span className="chip chip-marks">
            {a.scored} / {a.total_marks}
          </span>
          {done && <span className="done-tick">все начаты</span>}
        </div>
      </div>
      <div className="score-bar" style={{ width: "100%", marginTop: 12 }}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}
