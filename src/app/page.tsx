import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { getCurrentUser } from "@/lib/session";
import { queryOne } from "@/lib/db";
import { listPrograms } from "@/lib/programs";
import { plural } from "@/lib/plural";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const user = await getCurrentUser();
  // Вошедшего не держим на витрине: у него есть работа.
  if (user) redirect(user.role === "student" ? "/learn" : "/teach");

  const [stats, programs] = await Promise.all([
    queryOne<{ items: number; concepts: number; marks: number; lessons: number }>(
      `select (select count(*)::int from item_version where status = 'published') as items,
              (select count(*)::int from concept where parent_id is not null) as concepts,
              (select coalesce(sum(total_marks), 0)::int from item_version
                where status = 'published') as marks,
              (select count(*)::int from lesson where published_at is not null) as lessons`,
    ),
    listPrograms(),
  ]);

  return (
    <>
      <AppNav user={null} />
      <main className="page landing" id="main">
        <div className="hero-wrap">
          <h1 className="hero">
            Математика <em>без перевода</em> на пальцах
          </h1>
          <p className="hero-sub">
            Четыре программы в одном банке: SAT, школьная математика, A-Level
            и Further Maths. Задачи в формате экзаменационного билета, схема
            оценивания по баллам и пошаговые разборы на русском.
          </p>

          <div className="hero-badges">
            <span className="hero-badge" style={{ ["--dot" as string]: "var(--c-matrices)" }}>
              <i /> Домашка с дедлайном
            </span>
            <span className="hero-badge" style={{ ["--dot" as string]: "var(--c-complex)" }}>
              <i /> Уроки: видео и конспект
            </span>
            <span className="hero-badge" style={{ ["--dot" as string]: "var(--c-statistics)" }}>
              <i /> Личный кабинет и мониторинг
            </span>
            <span className="hero-badge" style={{ ["--dot" as string]: "var(--c-vectors)" }}>
              <i /> Чат класса и объявления
            </span>
          </div>

          <div className="hero-actions">
            <Link className="btn" href="/signup">
              Начать бесплатно
            </Link>
            <Link className="btn btn-ghost" href="/bank">
              Посмотреть задачи
            </Link>
          </div>
        </div>

        {/* Четыре блока прямо на витрине: это первое, что человек должен
            понять про платформу — что здесь не одна программа. */}
        <div className="landing-programs stagger">
          {programs.map((p) => (
            <Link
              key={p.id}
              className="landing-program"
              href={`/bank?program=${p.id}`}
              style={{ ["--accent" as string]: `var(--c-${p.accent})` }}
            >
              <span className="landing-program-name">{p.name_ru}</span>
              <span className="landing-program-count">
                {p.item_count} {plural(p.item_count, "задача", "задачи", "задач")}
              </span>
            </Link>
          ))}
        </div>

        <div className="feature-grid stagger">
          <Feature
            family="matrices"
            title="Учителю"
            body="Создать класс, выдать домашку с дедлайном, увидеть, кто сдал и на каких пунктах класс теряет баллы. Кабинет сам показывает, к кому подойти."
          />
          <Feature
            family="complex"
            title="Ученику"
            body="Разбор не «вот ответ», а по кодам схемы: где балл за метод, где за точность. Плюс слабые темы — по баллам, а не по числу задач."
          />
          <Feature
            family="vectors"
            title="Своя задача"
            body="Учитель заводит задачу сам: условие, пункты, схема оценивания, разбор. У теории и практикума разбор обязателен — это правило проверяет база, а не форма."
          />
          <Feature
            family="statistics"
            title="Один банк на все программы"
            body="Задача привязана к математике, а не к программе. Линейное уравнение видно и в SAT, и в школьном блоке — под разными номерами пунктов и без дубля в банке."
          />
        </div>

        <div className="stat-row">
          <div className="stat">
            <b>{stats?.items ?? 0}</b>
            <span>опубликованных задач</span>
          </div>
          <div className="stat">
            <b>{stats?.marks ?? 0}</b>
            <span>баллов в схемах оценивания</span>
          </div>
          <div className="stat">
            <b>{stats?.concepts ?? 0}</b>
            <span>концептов в таксономии</span>
          </div>
          <div className="stat">
            <b>{programs.length}</b>
            <span>{plural(programs.length, "программа", "программы", "программ")}</span>
          </div>
        </div>
      </main>
    </>
  );
}

function Feature({
  title,
  body,
  family,
}: {
  title: string;
  body: string;
  family: string;
}) {
  return (
    <article className="feature" style={{ ["--concept" as string]: `var(--c-${family})` }}>
      <span className="feature-glow" aria-hidden />
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}
