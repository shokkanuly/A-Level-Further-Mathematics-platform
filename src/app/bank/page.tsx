import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { FacetBar } from "@/components/FacetBar";
import { getCurrentUser } from "@/lib/session";
import {
  listPrograms,
  getProgram,
  facetsForProgram,
  listItemsForProgram,
  countItemsForProgram,
  type Facets,
} from "@/lib/programs";
import { renderTex, macrosFor } from "@/lib/tex.mjs";
import { parts as nParts, plural } from "@/lib/plural";
import { conceptStyle } from "@/lib/concept-color";

export const dynamic = "force-dynamic";

export const metadata = { title: "Банк задач" };

type Search = {
  program?: string;
  board?: string;
  kind?: string;
  unit?: string;
  difficulty?: string;
  answer?: string;
};

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const [user, programs] = await Promise.all([getCurrentUser(), listPrograms()]);

  // ── витрина: четыре блока ───────────────────────────────────────────────
  // Программа не выбрана — показываем блоки, а не «все задачи вперемешку».
  // Задача из SAT и задача из Further Maths стоят рядом только по недоразумению.
  if (!sp.program) {
    return (
      <>
        <AppNav user={user} />
        <main className="page" id="main">
          <div className="eyebrow">Четыре программы</div>
          <h1>Банк задач</h1>
          <p className="lede">
            Выберите программу. Внутри — фильтры по виду задачи, модулю,
            сложности и формату ответа.
          </p>

          <div className="programs stagger">
            {programs.map((p) => (
              <Link
                key={p.id}
                className="program-card"
                href={`/bank?program=${p.id}`}
                style={{
                  ["--accent" as string]: `var(--c-${p.accent})`,
                  ["--accent-soft" as string]: `var(--c-${p.accent}-soft)`,
                }}
              >
                <div className="program-card-head">
                  <span className="program-mark" aria-hidden />
                  <span className="program-count">
                    {p.item_count}
                    <span>{plural(p.item_count, "задача", "задачи", "задач")}</span>
                  </span>
                </div>
                <div className="program-name">{p.name_ru}</div>
                <div className="program-tagline">{p.tagline_ru}</div>
                <span className="program-go">
                  Открыть <span aria-hidden>→</span>
                </span>
              </Link>
            ))}
          </div>

          <div className="note">
            Одна задача может стоять сразу в нескольких программах и{" "}
            <strong>существует в банке в одном экземпляре</strong>. Линейное
            уравнение видно и в SAT, и в школьном блоке — под разными номерами
            пунктов, потому что список собирается обратным обходом: программа →
            пункты спецификации → концепты → задачи.
          </div>
        </main>
      </>
    );
  }

  // ── выбранная программа ─────────────────────────────────────────────────
  const program = await getProgram(sp.program);
  if (!program) {
    return (
      <>
        <AppNav user={user} />
        <main className="page" id="main">
          <Link className="back" href="/bank">
            ← Все программы
          </Link>
          <div className="empty">
            <span className="empty-mark" aria-hidden>
              ∅
            </span>
            <strong>Такой программы нет</strong>
            <span>Возможно, ссылка устарела.</span>
          </div>
        </main>
      </>
    );
  }

  const filters: Facets = {
    kind: sp.kind,
    unit: sp.unit,
    difficulty: sp.difficulty ? Number(sp.difficulty) : undefined,
    answer: sp.answer,
    board: sp.board,
  };

  const [facets, items, total] = await Promise.all([
    facetsForProgram(program.id, filters),
    listItemsForProgram(program.id, filters),
    countItemsForProgram(program.id, filters),
  ]);

  // Профиль обозначений: выбранная комиссия, иначе первая у программы.
  // Без него \vect из Core Pure отрендерится как ошибка, а не жирной M.
  const board = facets.boards.find((b) => b.id === sp.board) ?? facets.boards[0];
  const macros = macrosFor(board?.notation_profile ?? {});

  const accent = {
    ["--accent" as string]: `var(--c-${program.accent})`,
    ["--accent-soft" as string]: `var(--c-${program.accent}-soft)`,
  };

  return (
    <>
      <AppNav user={user} />
      <main className="page" id="main" style={accent}>
        <Link className="back" href="/bank">
          ← Все программы
        </Link>

        <div className="program-head">
          <div>
            <div className="eyebrow">
              {program.name_en}
              {board ? ` · ${board.name}` : ""}
            </div>
            <h1>{program.name_ru}</h1>
            <p className="lede">{program.tagline_ru}</p>
          </div>
        </div>

        <FacetBar
          facets={facets}
          total={total}
          active={{
            program: program.id,
            board: sp.board,
            kind: sp.kind,
            unit: sp.unit,
            difficulty: sp.difficulty,
            answer: sp.answer,
          }}
        />

        {items.length === 0 ? (
          <div className="empty">
            <span className="empty-mark" aria-hidden>
              ∅
            </span>
            <strong>Под эти фильтры ничего не подходит</strong>
            <span>Снимите один из фильтров — счётчики рядом покажут, где есть задачи.</span>
          </div>
        ) : (
          <div className="bank stagger">
            {items.map((it) => (
              <Link
                key={it.slug}
                className="bank-card"
                href={`/item/${it.slug}?program=${program.id}${board ? `&board=${board.id}` : ""}`}
                style={conceptStyle(it.title_slug)}
              >
                <div className="bank-card-top">
                  <div style={{ minWidth: 0 }}>
                    <div className="card-title">{it.title_ru}</div>
                    <div
                      className="bank-card-stem"
                      dangerouslySetInnerHTML={{
                        __html: renderTex(it.stem_md.replace(/\$\$/g, "$"), macros),
                      }}
                    />
                  </div>
                  <span className="chip chip-marks">{it.total_marks}</span>
                </div>

                <div className="bank-meta">
                  <span className="chip chip-kind" data-kind={it.kind}>
                    {it.kind_name}
                  </span>
                  <span className="chip chip-concept">{it.title_ru}</span>
                  {it.spec_points.map((s) => (
                    <span key={s} className="chip chip-spec">
                      {s}
                    </span>
                  ))}
                  <span className="chip">{nParts(it.part_count)}</span>
                  <span className="chip">
                    <span className="difficulty" aria-label={`сложность ${it.difficulty} из 5`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <i key={n} data-on={n <= it.difficulty} />
                      ))}
                    </span>
                    сложность
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
