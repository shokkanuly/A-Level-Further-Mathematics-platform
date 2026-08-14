import Link from "next/link";
import type { FacetOption, ProgramFacets } from "@/lib/programs";

/**
 * Панель фильтров банка.
 *
 * Фильтры — ссылки, а не состояние в React. Причина не в экономии: фильтр,
 * который живёт в URL, можно прислать ученику в сообщении, открыть из
 * закладки и увидеть в истории браузера. Состояние в компоненте всё это
 * теряет, а взамен не даёт ничего — выбор здесь всё равно перезагружает список.
 *
 * Группа не рисуется, если вариант в ней один: выбор без альтернативы —
 * это не выбор, а лишняя строка на экране.
 */

export type ActiveFacets = {
  program: string;
  board?: string;
  kind?: string;
  unit?: string;
  difficulty?: string;
  answer?: string;
};

function hrefWith(active: ActiveFacets, key: keyof ActiveFacets, value?: string) {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(active)) if (v) next[k] = v;

  // Повторный клик по выбранному снимает фильтр — иначе из него нет выхода
  // без кнопки «сбросить», которую пришлось бы искать глазами.
  if (!value || next[key] === value) delete next[key];
  else next[key] = value;

  return `/bank?${new URLSearchParams(next).toString()}`;
}

function Group({
  title,
  options,
  paramKey,
  active,
}: {
  title: string;
  options: FacetOption[];
  paramKey: keyof ActiveFacets;
  active: ActiveFacets;
}) {
  if (options.length < 2) return null;
  const current = active[paramKey];

  return (
    <div className="facet-group">
      <div className="facet-title">{title}</div>
      <div className="facet-options">
        {options.map((o) => (
          <Link
            key={o.value}
            className="facet-chip"
            data-on={current === o.value}
            href={hrefWith(active, paramKey, o.value)}
          >
            {o.label}
            <span className="facet-count">{o.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function FacetBar({
  facets,
  active,
  total,
}: {
  facets: ProgramFacets;
  active: ActiveFacets;
  total: number;
}) {
  const applied = (["kind", "unit", "difficulty", "answer", "board"] as const).filter(
    (k) => active[k],
  );

  return (
    <div className="facets">
      <Group title="Вид задачи" options={facets.kinds} paramKey="kind" active={active} />
      <Group title="Модуль" options={facets.units} paramKey="unit" active={active} />
      <Group
        title="Сложность"
        options={facets.difficulties}
        paramKey="difficulty"
        active={active}
      />
      <Group title="Формат ответа" options={facets.answers} paramKey="answer" active={active} />

      {/* Комиссия — не фильтр содержания, а профиль обозначений. Показывается
          только там, где программу ведут две комиссии: у SAT её нет вовсе. */}
      {facets.boards.length > 1 && (
        <div className="facet-group">
          <div className="facet-title">Комиссия</div>
          <div className="facet-options">
            {facets.boards.map((b) => (
              <Link
                key={b.id}
                className="facet-chip"
                data-on={active.board === b.id}
                href={hrefWith(active, "board", b.id)}
              >
                {b.name}
                <span className="facet-count">{b.qualification_code}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="facet-foot">
        <span>
          Найдено: <strong>{total}</strong>
        </span>
        {applied.length > 0 && (
          <Link className="facet-reset" href={`/bank?program=${active.program}`}>
            Сбросить фильтры ({applied.length})
          </Link>
        )}
      </div>
    </div>
  );
}
