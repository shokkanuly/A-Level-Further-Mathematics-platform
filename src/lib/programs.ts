import { query, queryOne } from "./db";
import type { Board, ItemCard } from "./queries";

/**
 * Витрина банка: программа → фильтры (SYSTEM-DESIGN §3.1, миграция 008).
 *
 * Устройство фильтра — прямое следствие того, что программа и вид задачи
 * лежат на разных осях, а концепт не знает ни про ту, ни про другую.
 * Поэтому «принадлежит программе» здесь всегда EXISTS-подзапрос, а не JOIN:
 * связь concept ↔ spec_point многие-ко-многим, и join размножил бы задачу
 * по числу закрываемых ею пунктов. Один раз это уже стоило неверных
 * счётчиков в фасетах.
 */

export type Program = {
  id: string;
  name_ru: string;
  name_en: string;
  tagline_ru: string;
  accent: string;
  position: number;
  item_count: number;
};

export type Facets = {
  kind?: string;
  unit?: string;
  difficulty?: number;
  answer?: string;
  board?: string;
};

export type FacetOption = { value: string; label: string; count: number };

export type ProgramFacets = {
  kinds: FacetOption[];
  units: FacetOption[];
  difficulties: FacetOption[];
  answers: FacetOption[];
  boards: Board[];
};

/** Понятные подписи типов ответа. Коды — машинные, в интерфейсе они не нужны. */
export const ANSWER_LABEL: Record<string, string> = {
  mcq: "Выбор варианта",
  numeric: "Число",
  matrix: "Матрица",
  symbolic: "Формула",
  complex: "Комплексное число",
  set: "Множество",
  interval: "Промежуток",
  ordered_list: "Упорядоченный список",
  structured_proof: "Доказательство",
  handwritten: "Фото решения",
};

export const DIFFICULTY_LABEL: Record<number, string> = {
  1: "Разминка",
  2: "Базовая",
  3: "Средняя",
  4: "Сложная",
  5: "Олимпиадная",
};

export async function listPrograms(): Promise<Program[]> {
  return query<Program>(`
    select p.id, p.name_ru, p.name_en, p.tagline_ru, p.accent, p.position,
           (
             select count(distinct iv.item_id)::int
             from item_version iv
             where iv.status = 'published'
               and exists (
                 select 1
                 from item_concept ic
                 join concept_spec_point csp on csp.concept_id = ic.concept_id
                 join spec_point sp on sp.id = csp.spec_point_id
                 join unit u on u.id = sp.unit_id
                 join qualification qa on qa.id = u.qualification_id
                 where ic.item_version_id = iv.id and qa.program_id = p.id
               )
           ) as item_count
    from program p
    order by p.position
  `);
}

export async function getProgram(id: string): Promise<Program | null> {
  const rows = await listPrograms();
  return rows.find((p) => p.id === id) ?? null;
}

type Built = { sql: string; params: unknown[] };

/**
 * Условие «версия принадлежит программе и проходит фильтр».
 *
 * `skip` исключает одно измерение — им считаются счётчики фасета:
 * число рядом с «Практикум» обязано отвечать на вопрос «сколько будет,
 * если я выберу практикум», а не «сколько практикумов уже выбрано».
 * Поэтому при подсчёте вида фильтр по виду снимается, а остальные остаются.
 */
function buildFilter(programId: string, f: Facets, skip?: keyof Facets): Built {
  const params: unknown[] = [programId];
  const p = (x: unknown) => `$${params.push(x)}`;
  const val = (k: keyof Facets) => (skip === k ? undefined : f[k]);

  const unit = val("unit");
  const board = val("board");
  const kind = val("kind");
  const difficulty = val("difficulty");
  const answer = val("answer");

  const reach = [
    `qa.program_id = $1`,
    unit ? `u.code = ${p(unit)}` : null,
    board ? `qa.board_id = ${p(board)}` : null,
  ]
    .filter(Boolean)
    .join(" and ");

  const outer = [
    `iv.status = 'published'`,
    `exists (
       select 1
       from item_concept ic
       join concept_spec_point csp on csp.concept_id = ic.concept_id
       join spec_point sp on sp.id = csp.spec_point_id
       join unit u on u.id = sp.unit_id
       join qualification qa on qa.id = u.qualification_id
       where ic.item_version_id = iv.id and ${reach}
     )`,
    kind ? `iv.kind = ${p(kind)}` : null,
    difficulty ? `iv.difficulty = ${p(difficulty)}` : null,
    answer
      ? `exists (select 1 from item_part ip
                 where ip.item_version_id = iv.id and ip.answer_type = ${p(answer)})`
      : null,
  ]
    .filter(Boolean)
    .join("\n      and ");

  return { sql: outer, params };
}

export async function listItemsForProgram(
  programId: string,
  f: Facets,
): Promise<(ItemCard & { kind: string; kind_name: string })[]> {
  const { sql, params } = buildFilter(programId, f);

  return query(
    `
    with matched as (
      select iv.id from item_version iv where ${sql}
    )
    select
      i.slug,
      iv.id as version_id,
      iv.version,
      iv.stem_md,
      iv.total_marks,
      iv.difficulty,
      iv.kind,
      k.name_ru as kind_name,
      max(c.name_ru) filter (where ic.is_primary)                     as title_ru,
      max(coalesce(parent.slug, c.slug)) filter (where ic.is_primary) as title_slug,
      array_agg(distinct c.name_ru)                                   as concepts,
      coalesce(
        array_agg(distinct u.code || ' · ' || sp.code)
          filter (where qa.program_id = $1),
        '{}'
      )                                                               as spec_points,
      (select count(*)::int from item_part p
        where p.item_version_id = iv.id and p.marks is not null)       as part_count
    from matched
    join item_version iv on iv.id = matched.id
    join item i on i.id = iv.item_id
    join item_kind k on k.id = iv.kind
    join item_concept ic on ic.item_version_id = iv.id
    join concept c on c.id = ic.concept_id
    left join concept parent on parent.id = c.parent_id
    left join concept_spec_point csp on csp.concept_id = c.id
    left join spec_point sp on sp.id = csp.spec_point_id
    left join unit u on u.id = sp.unit_id
    left join qualification qa on qa.id = u.qualification_id
    group by i.slug, iv.id, iv.version, iv.stem_md, iv.total_marks,
             iv.difficulty, iv.kind, k.name_ru
    order by iv.difficulty, i.slug
    `,
    params,
  );
}

export async function countItemsForProgram(programId: string, f: Facets): Promise<number> {
  const { sql, params } = buildFilter(programId, f);
  const row = await queryOne<{ n: number }>(
    `select count(*)::int as n from item_version iv where ${sql}`,
    params,
  );
  return row?.n ?? 0;
}

/**
 * Опции фильтров с числом попаданий. Опция с нулём не показывается вовсе:
 * фильтр, который гарантированно даёт пустой экран, — это ловушка, а не выбор.
 */
export async function facetsForProgram(
  programId: string,
  f: Facets,
): Promise<ProgramFacets> {
  const kindF = buildFilter(programId, f, "kind");
  const unitF = buildFilter(programId, f, "unit");
  const diffF = buildFilter(programId, f, "difficulty");
  const ansF = buildFilter(programId, f, "answer");

  const [kinds, units, difficulties, answers, boards] = await Promise.all([
    query<FacetOption>(
      `select iv.kind as value, k.name_ru as label, count(*)::int as count
       from item_version iv
       join item_kind k on k.id = iv.kind
       where ${kindF.sql}
       group by iv.kind, k.name_ru, k.position
       order by k.position`,
      kindF.params,
    ),

    // Юнит — «модуль» в терминах витрины. Считается по достижимости,
    // поэтому distinct: одна задача закрывает несколько пунктов одного юнита.
    query<FacetOption>(
      `select u.code as value, u.code || ' · ' || u.name as label,
              count(distinct iv.id)::int as count
       from item_version iv
       join item_concept ic on ic.item_version_id = iv.id
       join concept_spec_point csp on csp.concept_id = ic.concept_id
       join spec_point sp on sp.id = csp.spec_point_id
       join unit u on u.id = sp.unit_id
       join qualification qa on qa.id = u.qualification_id
       where qa.program_id = $1 and ${unitF.sql}
       group by u.code, u.name, u.position
       order by u.position, u.code`,
      unitF.params,
    ),

    query<FacetOption>(
      `select iv.difficulty::text as value, iv.difficulty::text as label,
              count(*)::int as count
       from item_version iv
       where ${diffF.sql}
       group by iv.difficulty
       order by iv.difficulty`,
      diffF.params,
    ),

    query<FacetOption>(
      `select ip.answer_type as value, ip.answer_type as label,
              count(distinct iv.id)::int as count
       from item_version iv
       join item_part ip on ip.item_version_id = iv.id
       where ip.answer_type is not null and ${ansF.sql}
       group by ip.answer_type
       order by count(distinct iv.id) desc, ip.answer_type`,
      ansF.params,
    ),

    // Комиссии этой программы. У SAT она одна — переключатель не рисуется.
    query<Board>(
      `select distinct b.id, b.name, b.notation_profile, qa.code as qualification_code,
              b.position
       from board b
       join qualification qa on qa.board_id = b.id
       where qa.program_id = $1
       order by b.position`,
      [programId],
    ),
  ]);

  return {
    kinds,
    units,
    difficulties: difficulties.map((d) => ({
      ...d,
      label: DIFFICULTY_LABEL[Number(d.value)] ?? d.value,
    })),
    answers: answers.map((a) => ({ ...a, label: ANSWER_LABEL[a.value] ?? a.value })),
    boards,
  };
}
