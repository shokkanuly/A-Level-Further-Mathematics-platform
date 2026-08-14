import Link from "next/link";
import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { BoardSwitch } from "@/components/BoardSwitch";
import { AnswerSheet, type ClientPart } from "@/components/AnswerSheet";
import { getPublishedItem, getSpecPointsForItem, listBoards } from "@/lib/queries";
import { getCurrentUser, assertEnrolledInAssignment } from "@/lib/session";
import { getAssignment } from "@/lib/classroom";
import { renderTex, macrosFor } from "@/lib/tex.mjs";
import { conceptStyle } from "@/lib/concept-color";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ board?: string; assignment?: string }>;
}) {
  const { slug } = await params;
  const { board: boardParam, assignment: assignmentParam } = await searchParams;

  const [user, boards] = await Promise.all([getCurrentUser(), listBoards()]);
  const board = boards.find((b) => b.id === boardParam) ?? boards[0];
  const item = await getPublishedItem(slug);
  if (!item) notFound();

  // Контекст домашки подтверждается на сервере: параметр в адресной строке
  // сам по себе ничего не даёт.
  let assignment = null;
  if (assignmentParam && user) {
    if (await assertEnrolledInAssignment(user.id, assignmentParam)) {
      assignment = await getAssignment(assignmentParam);
    }
  }

  const specPoints = await getSpecPointsForItem(item.version_id, board.id);
  const macros = macrosFor(board.notation_profile, item.notation_override);

  // Ключи ответов на клиент не уезжают.
  // Из answer_spec наружу отдаётся только то, что нужно нарисовать поле ввода:
  // варианты для mcq, размерность для matrix. Ни correct, ни cells, ни
  // common_errors — иначе весь ключ лежит во вкладке network.
  const parts: ClientPart[] = item.parts.map((p) => {
    const spec = (p.answer_spec ?? {}) as Record<string, unknown>;
    const base: ClientPart = {
      id: p.id,
      path: p.path,
      label: p.label,
      nested: p.parent_part_id !== null,
      text_html: renderTex(p.text_md, macros),
      marks: p.marks,
      answer_type: p.answer_type,
    };

    if (p.answer_type === "mcq") {
      const options = (spec.options ?? []) as { id: string; text_md: string }[];
      base.options = options.map((o) => ({
        id: o.id,
        html: renderTex(o.text_md, macros),
      }));
    }
    if (p.answer_type === "matrix") {
      base.rows = Number(spec.rows ?? 2);
      base.cols = Number(spec.cols ?? 2);
    }
    return base;
  });

  const backHref = assignment ? `/learn/${assignment.id}` : `/bank?board=${board.id}`;
  const backLabel = assignment ? assignment.title : "Банк задач";

  return (
    <>
      <AppNav user={user} />

      <main className="page" id="main" style={conceptStyle(item.title_slug)}>
        <Link className="back" href={backHref}>
          ← {backLabel}
        </Link>

        <header className="item-head">
          <div className="board-head">
            <h1>{item.title_ru}</h1>
            {!assignment && (
              <BoardSwitch
                boards={boards}
                current={board.id}
                hrefFor={(id) => `/item/${slug}?board=${id}`}
              />
            )}
          </div>
          <div className="bank-meta">
            <span className="chip chip-concept">{item.title_ru}</span>
            {specPoints.map((sp) => (
              <span key={`${sp.unit_code}-${sp.code}`} className="chip chip-spec" title={sp.statement}>
                {sp.unit_code} · {sp.code}
              </span>
            ))}
            <span className="chip">{board.name}</span>
            <span className="chip">версия {item.version}</span>
            {assignment && <span className="chip" data-tone="accent">домашка · {assignment.class_name}</span>}
          </div>
        </header>

        {!user && (
          <div className="locked" style={{ marginTop: 0, marginBottom: 20 }}>
            <strong style={{ fontWeight: 500, color: "var(--fg)" }}>Режим просмотра</strong>
            <span>
              <Link href={`/login?next=/item/${slug}`}>Войдите</Link>, чтобы отвечать
              и сохранять результат.
            </span>
          </div>
        )}

        <AnswerSheet
          slug={slug}
          totalMarks={item.total_marks}
          stemHtml={renderTex(item.stem_md, macros)}
          parts={parts}
          locale="ru"
          assignmentId={assignment?.id ?? null}
          canAnswer={user !== null}
        />

        <div className="note">
          Условие на английском — это язык экзамена. Обозначение{" "}
          <code>\vect&#123;M&#125;</code> в исходнике одно, а рендерится по профилю
          комиссии: жирным для Edexcel, подчёркиванием для Cambridge. Справа
          от каждого шага разбора — код схемы оценивания: <code>M1</code> балл за
          метод, <code>A1</code> за точность, <code>B1</code> независимый балл.
        </div>
      </main>
    </>
  );
}
