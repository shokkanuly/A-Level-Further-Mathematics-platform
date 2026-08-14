import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { LessonComposer } from "@/components/LessonComposer";
import { requireUser } from "@/lib/session";
import { listLessons } from "@/lib/lessons";
import { listClassesForTeacher } from "@/lib/classroom";
import { listPrograms } from "@/lib/programs";
import { query } from "@/lib/db";
import { PROVIDER_NAME } from "@/lib/video";

export const dynamic = "force-dynamic";

export const metadata = { title: "Уроки" };

export default async function LessonsPage() {
  const user = await requireUser("/lessons");
  const canCreate = ["teacher", "author", "admin"].includes(user.role);

  const [lessons, classes, programs, concepts] = await Promise.all([
    listLessons(user.id),
    canCreate ? listClassesForTeacher(user.id) : Promise.resolve([]),
    listPrograms(),
    canCreate
      ? query<{ slug: string; name_ru: string }>(
          `select slug, name_ru from concept order by position, name_ru`,
        )
      : Promise.resolve([]),
  ]);

  return (
    <>
      <AppNav user={user} />
      <main className="page" id="main">
        <div className="eyebrow">Видео и конспекты</div>
        <h1>Уроки</h1>
        <p className="lede">
          Разбор темы целиком: видео и конспект рядом. Задачи проверяют, урок
          объясняет — это разные вещи, поэтому и разделы разные.
        </p>

        {canCreate && (
          <LessonComposer classes={classes} programs={programs} concepts={concepts} />
        )}

        {lessons.length === 0 ? (
          <div className="empty" style={{ marginTop: 26 }}>
            <span className="empty-mark" aria-hidden>
              ∅
            </span>
            <strong>Уроков пока нет</strong>
            <span>
              {canCreate
                ? "Заведите первый: ссылка на видео и конспект в разметке."
                : "Учитель ещё не выложил ни одного урока."}
            </span>
          </div>
        ) : (
          <div className="lessons stagger">
            {lessons.map((l) => (
              <Link key={l.id} className="lesson-card" href={`/lessons/${l.id}`}>
                <div className="lesson-top">
                  {l.video_provider ? (
                    <span className="chip" data-tone="accent">
                      {PROVIDER_NAME[l.video_provider]}
                    </span>
                  ) : (
                    <span className="chip">конспект</span>
                  )}
                  {l.class_name ? (
                    <span className="chip">{l.class_name}</span>
                  ) : (
                    <span className="chip" data-tone="ok">
                      открытый
                    </span>
                  )}
                  {l.viewed && <span className="lesson-seen" title="Вы это открывали">✓</span>}
                </div>

                <div className="lesson-title">{l.title}</div>
                {l.summary_md && <div className="lesson-summary">{l.summary_md}</div>}

                <div className="bank-meta">
                  {l.program_name && <span className="chip chip-spec">{l.program_name}</span>}
                  {l.concepts.slice(0, 3).map((c) => (
                    <span key={c} className="chip chip-concept">
                      {c}
                    </span>
                  ))}
                  {l.has_conspectus && l.video_provider && (
                    <span className="chip">видео + конспект</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
