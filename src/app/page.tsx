import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { getCurrentUser } from "@/lib/session";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const user = await getCurrentUser();
  // Вошедшего не держим на витрине: у него есть работа.
  if (user) redirect(user.role === "student" ? "/learn" : "/teach");

  const stats = await queryOne<{ items: number; concepts: number; marks: number }>(
    `select (select count(*)::int from item_version where status = 'published') as items,
            (select count(*)::int from concept where parent_id is not null) as concepts,
            (select coalesce(sum(total_marks), 0)::int from item_version
              where status = 'published') as marks`,
  );

  return (
    <>
      <AppNav user={null} />
      <main className="page landing" id="main">
        <div className="hero-wrap">
          <h1 className="hero">
            Further Maths <em>без перевода</em> на пальцах
          </h1>
          <p className="hero-sub">
            Задачи в формате экзаменационного билета, схема оценивания по баллам
            и пошаговые разборы на русском. Edexcel и Cambridge — раздельно,
            но из одного банка.
          </p>
          <div className="hero-actions">
            <Link className="btn" href="/signup">
              Начать бесплатно
            </Link>
            <Link className="btn btn-ghost" href="/bank">
              Посмотреть задачи
            </Link>
          </div>
        </div>

        <div className="feature-grid stagger">
          <Feature
            family="matrices"
            title="Учителю"
            body="Создать класс, выдать домашку с дедлайном, увидеть, кто сдал и на каких пунктах класс теряет баллы. Ни одного сообщения в мессенджере."
          />
          <Feature
            family="complex"
            title="Ученику"
            body="Разбор не «вот ответ», а по кодам схемы: где балл за метод, где за точность."
          />
          <Feature
            family="vectors"
            title="Частичный зачёт"
            body="На задаче в 12 баллов видно, что взято 8 — и на каких пунктах потеряно остальное."
          />
          <Feature
            family="statistics"
            title="Две комиссии, один банк"
            body="Задача привязана к математике, а не к комиссии. Один и тот же определитель обслуживает Edexcel CP1 и CIE FP1 — с разными обозначениями в условии и без дубля в банке."
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
            <b>2</b>
            <span>комиссии</span>
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
