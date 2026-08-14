import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { CreateClass } from "@/components/CreateClass";
import { requireTeacher } from "@/lib/session";
import { listClassesForTeacher } from "@/lib/classroom";
import { students as nStudents, assignments as nAssignments } from "@/lib/plural";

export const dynamic = "force-dynamic";

export default async function TeachPage() {
  const user = await requireTeacher("/teach");
  const classes = await listClassesForTeacher(user.id);

  return (
    <>
      <AppNav user={user} />
      <main className="page" id="main">
        <div className="eyebrow">Учитель</div>
        <h1>Мои классы</h1>
        <p className="lede">
          Класс — это группа учеников и лента выданных заданий. Ученики вступают
          по коду, приглашения на почту не нужны.
        </p>

        <CreateClass />

        {classes.length === 0 ? (
          <div className="empty" style={{ marginTop: 16 }}>
            <span className="empty-mark" aria-hidden>⌘</span>
            <strong>Пока ни одного класса</strong>
            <span>Создайте первый — это займёт секунду.</span>
          </div>
        ) : (
          <div className="bank stagger" style={{ marginTop: 16 }}>
            {classes.map((c) => (
              <Link key={c.id} className="bank-card" href={`/teach/${c.id}`}>
                <div className="bank-card-top">
                  <div style={{ minWidth: 0 }}>
                    <div className="card-title">{c.name}</div>
                    <div className="bank-meta">
                      <span className="chip">{nStudents(c.student_count)}</span>
                      <span className="chip">{nAssignments(c.assignment_count)}</span>
                    </div>
                  </div>
                  <span className="join-code" title="Код вступления">
                    {c.join_code}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
