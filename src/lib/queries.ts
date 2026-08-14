import { query, queryOne } from "./db";

/** Набор макросов KaTeX: профиль обозначений комиссии (§3.3). */
export type Macros = Record<string, string>;

export type BoardId = "edexcel" | "cie";

export type Board = {
  id: BoardId;
  name: string;
  qualification_code: string;
  notation_profile: Macros;
};

/**
 * Комиссии с кодом одной из их квалификаций.
 *
 * distinct on обязателен с миграции 008: у Edexcel теперь две квалификации
 * (9MA0 и 9FM0), и обычный join отдавал Edexcel дважды — переключатель
 * комиссий рисовал две одинаковые кнопки.
 */
// distinct on требует, чтобы order by начинался с ключа дедупликации, поэтому
// порядок показа задаётся снаружи. Иначе комиссии сортируются по id, то есть
// по алфавиту, и Cambridge встаёт перед Pearson — ровно та проблема,
// ради которой в 005 появился board.position.
export async function listBoards(): Promise<Board[]> {
  return query<Board>(`
    select * from (
      select distinct on (b.id)
             b.id, b.name, b.notation_profile, q.code as qualification_code, b.position
      from board b
      join qualification q on q.board_id = b.id
      order by b.id, q.code
    ) b
    order by b.position, b.id
  `);
}

export async function getBoard(id: string): Promise<Board | null> {
  return queryOne<Board>(
    `select distinct on (b.id) b.id, b.name, b.notation_profile, q.code as qualification_code
     from board b join qualification q on q.board_id = b.id
     where b.id = $1
     order by b.id, q.code`,
    [id],
  );
}

/**
 * Комиссии, под которыми эту задачу вообще можно открыть.
 *
 * Тот же обратный обход, что и в валидаторе банка: концепты задачи → пункты
 * спецификаций → комиссии. Показывать переключатель на все четыре комиссии
 * нельзя — у College Board нет \vect, и задача Core Pure под его профилем
 * не отрендерится.
 */
export async function boardsForItemVersion(
  versionId: string,
  programId?: string,
): Promise<Board[]> {
  return query<Board>(
    `select * from (
       select distinct on (b.id)
              b.id, b.name, b.notation_profile, q.code as qualification_code, b.position
       from item_concept ic
       join concept_spec_point csp on csp.concept_id = ic.concept_id
       join spec_point sp on sp.id = csp.spec_point_id
       join unit u on u.id = sp.unit_id
       join qualification q on q.id = u.qualification_id
       join board b on b.id = q.board_id
       where ic.item_version_id = $1
         and ($2::text is null or q.program_id = $2)
       order by b.id, q.code
     ) b
     order by b.position, b.id`,
    [versionId, programId ?? null],
  );
}

export type ItemCard = {
  slug: string;
  version_id: string;
  version: number;
  stem_md: string;
  total_marks: number;
  difficulty: number;
  /** Название primary-концепта — им и подписывается карточка. */
  title_ru: string;
  /** Slug того же концепта — по нему выбирается цвет семейства. */
  title_slug: string;
  concepts: string[];
  spec_points: string[];
  part_count: number;
};

/**
 * Тот самый обратный обход из §3.1:
 *   комиссия → её spec points → концепты → задачи.
 *
 * Задача не знает про комиссии. Она привязана к концептам, а принадлежность
 * к Edexcel или CIE выводится этим join'ом. Одна задача про умножение матриц
 * попадает в оба списка, не существуя в банке дважды.
 */
export async function listItemsForBoard(boardId: string): Promise<ItemCard[]> {
  return query<ItemCard>(
    `
    select
      i.slug,
      iv.id as version_id,
      iv.version,
      iv.stem_md,
      iv.total_marks,
      iv.difficulty,
      max(c.name_ru) filter (where ic.is_primary)      as title_ru,
      max(coalesce(parent.slug, c.slug)) filter (where ic.is_primary) as title_slug,
      array_agg(distinct c.name_ru)                    as concepts,
      array_agg(distinct u.code || ' · ' || sp.code)   as spec_points,
      (select count(*)::int from item_part p
        where p.item_version_id = iv.id and p.marks is not null) as part_count
    from item i
    join item_version      iv  on iv.item_id = i.id and iv.status = 'published'
    join item_concept      ic  on ic.item_version_id = iv.id
    join concept           c   on c.id = ic.concept_id
    left join concept      parent on parent.id = c.parent_id
    join concept_spec_point csp on csp.concept_id = c.id
    join spec_point        sp  on sp.id = csp.spec_point_id
    join unit              u   on u.id = sp.unit_id
    join qualification     q   on q.id = u.qualification_id
    where q.board_id = $1
    group by i.slug, iv.id, iv.version, iv.stem_md, iv.total_marks, iv.difficulty
    order by iv.difficulty, i.slug
    `,
    [boardId],
  );
}

export type PartRow = {
  id: string;
  parent_part_id: string | null;
  label: string;
  path: string;
  position: number;
  text_md: string;
  answer_type: string | null;
  answer_spec: Record<string, unknown> | null;
  marks: number | null;
};

export type ItemDetail = {
  item_id: string;
  slug: string;
  version_id: string;
  version: number;
  stem_md: string;
  total_marks: number;
  difficulty: number;
  title_ru: string;
  title_slug: string;
  notation_override: Macros | null;
  parts: PartRow[];
};

export async function getPublishedItem(slug: string): Promise<ItemDetail | null> {
  const head = await queryOne<Omit<ItemDetail, "parts">>(
    `select i.id as item_id, i.slug, iv.id as version_id, iv.version,
            iv.stem_md, iv.total_marks, iv.difficulty, iv.notation_override,
            (select c.name_ru from item_concept ic
              join concept c on c.id = ic.concept_id
              where ic.item_version_id = iv.id and ic.is_primary
              limit 1) as title_ru,
            (select coalesce(p.slug, c.slug) from item_concept ic
              join concept c on c.id = ic.concept_id
              left join concept p on p.id = c.parent_id
              where ic.item_version_id = iv.id and ic.is_primary
              limit 1) as title_slug
     from item i
     join item_version iv on iv.item_id = i.id and iv.status = 'published'
     where i.slug = $1`,
    [slug],
  );
  if (!head) return null;

  const parts = await query<PartRow>(
    `select id, parent_part_id, label, path, position, text_md,
            answer_type, answer_spec, marks
     from item_part
     where item_version_id = $1
     order by position`,
    [head.version_id],
  );

  return { ...head, parts };
}

/**
 * Пункты спецификации выбранной комиссии, которые закрывает эта задача.
 * Тот же обратный обход, только в одну сторону: концепты задачи → пункты
 * той комиссии, что сейчас выбрана. У CIE и Edexcel ответ будет разный.
 */
export async function getSpecPointsForItem(
  versionId: string,
  boardId: string,
): Promise<{ code: string; unit_code: string; statement: string }[]> {
  return query(
    `select distinct sp.code, u.code as unit_code, sp.statement
     from item_concept ic
     join concept_spec_point csp on csp.concept_id = ic.concept_id
     join spec_point sp on sp.id = csp.spec_point_id
     join unit u on u.id = sp.unit_id
     join qualification q on q.id = u.qualification_id
     where ic.item_version_id = $1 and q.board_id = $2
     order by u.code, sp.code`,
    [versionId, boardId],
  );
}

