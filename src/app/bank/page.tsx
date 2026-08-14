import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { BoardSwitch } from "@/components/BoardSwitch";
import { getCurrentUser } from "@/lib/session";
import { listBoards, listItemsForBoard } from "@/lib/queries";
import { renderTex, macrosFor } from "@/lib/tex.mjs";
import { parts as nParts } from "@/lib/plural";
import { conceptStyle } from "@/lib/concept-color";

export const dynamic = "force-dynamic";

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string }>;
}) {
  const { board: boardParam } = await searchParams;
  const [user, boards] = await Promise.all([getCurrentUser(), listBoards()]);
  const board = boards.find((b) => b.id === boardParam) ?? boards[0];
  const items = await listItemsForBoard(board.id);
  const macros = macrosFor(board.notation_profile);

  return (
    <>
      <AppNav user={user} />
      <main className="page" id="main">
        <div className="board-head">
          <div>
            <div className="eyebrow">
              {board.name} · {board.qualification_code}
            </div>
            <h1>Банк задач</h1>
          </div>
          <BoardSwitch boards={boards} current={board.id} hrefFor={(id) => `/bank?board=${id}`} />
        </div>

        <p className="lede">
          Задачи в формате экзаменационного билета: пункты с нарастанием сложности,
          баллы по схеме оценивания, пошаговый разбор на русском.
        </p>

        {items.length === 0 ? (
          <div className="empty">
            <span className="empty-mark" aria-hidden>
              ∅
            </span>
            <strong>Для этой комиссии пока ничего не заведено</strong>
            <span>Переключите комиссию наверху или загляните позже.</span>
          </div>
        ) : (
          <div className="bank stagger">
            {items.map((it) => (
              <Link
                key={it.slug}
                className="bank-card"
                href={`/item/${it.slug}?board=${board.id}`}
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
                  <span className="chip chip-concept">{it.title_ru}</span>
                  {it.spec_points.map((sp) => (
                    <span key={sp} className="chip chip-spec">
                      {sp}
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

        <div className="note">
          Переключите комиссию. Та же самая задача появится под другими номерами
          пунктов и с другими обозначениями в условии — <strong>в банке она
          существует в одном экземпляре</strong>. Список собирается обратным обходом:
          комиссия → её пункты спецификации → концепты → задачи.
        </div>
      </main>
    </>
  );
}
