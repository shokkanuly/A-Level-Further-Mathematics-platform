import Link from "next/link";
import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { requireUser } from "@/lib/session";
import { getLesson, markViewed, lessonViewers } from "@/lib/lessons";
import { renderRich, DEFAULT_MACROS } from "@/lib/tex.mjs";
import { embedUrl, watchUrl, PROVIDER_NAME } from "@/lib/video";

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/lessons/${id}`);

  // getLesson сам решает видимость: чужой классный урок не найдётся,
  // а не «найдётся и не покажется».
  const lesson = await getLesson(user.id, id);
  if (!lesson) notFound();

  await markViewed(lesson.id, user.id, user.role);

  const isTeacher = ["teacher", "author", "admin"].includes(user.role);
  const viewers = isTeacher && lesson.class_id ? await lessonViewers(lesson.id) : [];

  const video =
    lesson.video_provider && lesson.video_id
      ? { provider: lesson.video_provider, id: lesson.video_id }
      : null;

  return (
    <>
      <AppNav user={user} />
      <main className="page" id="main">
        <Link className="back" href="/lessons">
          ← Уроки
        </Link>

        <div className="eyebrow">
          {lesson.program_name ?? "Урок"}
          {lesson.class_name ? ` · ${lesson.class_name}` : " · открытый"}
        </div>
        <h1>{lesson.title}</h1>
        {lesson.summary_md && <p className="lede">{lesson.summary_md}</p>}

        <div className="bank-meta" style={{ marginBottom: 22 }}>
          {lesson.concepts.map((c) => (
            <span key={c} className="chip chip-concept">
              {c}
            </span>
          ))}
          <span className="chip">{lesson.author_name}</span>
        </div>

        {video && (
          <>
            <div className="video-frame">
              <iframe
                src={embedUrl(video)}
                title={lesson.title}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
                // Песочница: ролик проигрывается, но не получает доступа
                // ни к нашим кукам, ни к навигации вкладки.
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <div className="video-foot">
              <span>{PROVIDER_NAME[video.provider]}</span>
              <a href={watchUrl(video)} target="_blank" rel="noopener noreferrer nofollow">
                Открыть на площадке
              </a>
            </div>
          </>
        )}

        {lesson.conspectus_md && (
          <>
            <h2 className="section-h">Конспект</h2>
            <div
              className="conspectus"
              dangerouslySetInnerHTML={{ __html: renderRich(lesson.conspectus_md, DEFAULT_MACROS) }}
            />
          </>
        )}

        {/* Вторая половина мониторинга: не только баллы, но и «кто вообще
            открывал». Урок, который не открыли, объясняет провал лучше,
            чем любая аналитика по баллам. */}
        {viewers.length > 0 && (
          <>
            <h2 className="section-h">
              Кто открывал
              <span className="chip">
                {viewers.filter((v) => v.view_count > 0).length} из {viewers.length}
              </span>
            </h2>
            <div className="cards-plain">
              {viewers.map((v) => (
                <div key={v.display_name} className="roster-row">
                  <div>
                    <strong>{v.display_name}</strong>
                    <div className="roster-sub">
                      {v.last_viewed_at
                        ? `${v.view_count} раз · ${new Date(v.last_viewed_at).toLocaleDateString("ru-RU")}`
                        : "не открывал"}
                    </div>
                  </div>
                  <span className="chip" data-tone={v.view_count > 0 ? "ok" : "bad"}>
                    {v.view_count > 0 ? "смотрел" : "нет"}
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
