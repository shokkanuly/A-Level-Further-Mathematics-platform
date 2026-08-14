// Декларативное заведение задачи.
//
// Причина существования файла: в Stage 1 задача заводилась двадцатью
// ручными INSERT'ами. Пока задача была одна, это читалось; на пятой стало
// ясно, что каждая новая задача — это шанс забыть шаг схемы оценивания
// и получить отказ публикации в самом конце.
//
// Здесь задача описывается ОДНИМ объектом, а total_marks и position
// вычисляются, а не вводятся. Инвариант «сумма по частям = total_marks»
// перестаёт быть тем, что можно нарушить руками: его больше нечем нарушить.
//
// Валидацию это НЕ дублирует. Публикацию по-прежнему разрешает только
// item_version_problems() в SQL (004, 008) — помощник просто не даёт
// совершить механическую ошибку по дороге.

/**
 * @typedef {object} SeedPart
 * @property {string}   path        стабильный ключ: 'a', 'b', 'b.i'
 * @property {string}   label       то, что видит ученик: 'a', 'i'
 * @property {string}   text        text_md части
 * @property {string|null}  [answer_type] null у контейнерных частей
 * @property {object|null}  [answer_spec]
 * @property {number|null}  [marks]
 * @property {Array}   [steps]      шаги схемы оценивания: {code, marks, en, ru}
 * @property {SeedPart[]} [children]
 */

/**
 * Заводит задачу целиком и публикует её через блокирующую валидацию.
 *
 * @param {(sql: string, params?: any[]) => Promise<any[]>} q
 * @param {object} spec
 * @param {string} spec.slug
 * @param {string} spec.kind          theory | practicum | exam | olympiad
 * @param {number} spec.difficulty    1..5
 * @param {string} spec.stem
 * @param {string} [spec.explanation] обязателен для видов с requires_explanation
 * @param {string[]} spec.concepts    первый — primary
 * @param {SeedPart[]} spec.parts
 * @param {string} spec.authorId
 * @param {Record<string, string>} conceptIds  slug → uuid
 * @param {{publish?: boolean}} [opts] publish=false оставляет версию черновиком.
 *        Нужно авторскому конвейеру: он сначала спрашивает у SQL список
 *        проблем и только потом решает, публиковать ли.
 * @returns {Promise<{id: string, versionId: string, totalMarks: number} | null>}
 *          null, если задача уже была засеяна
 */
export async function createItem(q, spec, conceptIds, opts = {}) {
  const { publish = true } = opts;
  const one = async (sql, params) => (await q(sql, params))[0];

  const existing = await one(`select id from item where slug = $1`, [spec.slug]);
  if (existing) return null;

  // ── обход дерева частей ───────────────────────────────────────────────────
  // Позиция сквозная по всей задаче, а не по уровню: item_part.position
  // задаёт порядок показа целиком, и подпункты обязаны идти сразу за родителем.
  const flat = [];
  const walk = (parts, parentPath) => {
    for (const p of parts) {
      flat.push({ ...p, parentPath: parentPath ?? null });
      if (p.children?.length) walk(p.children, p.path);
    }
  };
  walk(spec.parts, null);

  const leaves = flat.filter((p) => !p.children?.length);
  const totalMarks = leaves.reduce((sum, p) => sum + (p.marks ?? 0), 0);

  if (totalMarks <= 0) {
    throw new Error(`${spec.slug}: сумма баллов по частям = 0, публиковать нечего`);
  }

  // ── версия ────────────────────────────────────────────────────────────────
  const item = await one(`insert into item (slug) values ($1) returning id`, [spec.slug]);

  const version = await one(
    `insert into item_version
       (item_id, version, status, stem_md, difficulty, total_marks,
        origin, kind, explanation_md, created_by)
     values ($1, 1, 'draft', $2, $3, $4, 'original', $5, $6, $7)
     returning id`,
    [
      item.id,
      spec.stem,
      spec.difficulty,
      totalMarks,
      spec.kind,
      spec.explanation ?? null,
      spec.authorId,
    ],
  );

  // ── части ─────────────────────────────────────────────────────────────────
  const partIds = {};
  let position = 0;
  for (const p of flat) {
    const row = await one(
      `insert into item_part
         (item_version_id, parent_part_id, label, path, position, text_md,
          answer_type, answer_spec, marks)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning id`,
      [
        version.id,
        p.parentPath ? partIds[p.parentPath] : null,
        p.label,
        p.path,
        ++position,
        p.text,
        p.answer_type ?? null,
        p.answer_spec ? JSON.stringify(p.answer_spec) : null,
        p.marks ?? null,
      ],
    );
    partIds[p.path] = row.id;
  }

  // ── схема оценивания ──────────────────────────────────────────────────────
  let stepPosition = 0;
  for (const p of flat) {
    for (const st of p.steps ?? []) {
      const step = await one(
        `insert into solution_step
           (item_version_id, part_id, position, mark_code, marks_covered)
         values ($1,$2,$3,$4,$5) returning id`,
        [version.id, partIds[p.path], ++stepPosition, st.code, st.marks],
      );
      // Условие остаётся английским, разбор локализуется (§12).
      await q(
        `insert into solution_step_text (solution_step_id, locale, text_md)
         values ($1,'en',$2), ($1,'ru',$3)`,
        [step.id, st.en, st.ru ?? st.en],
      );
    }
  }

  // ── концепты: первый в списке — primary ───────────────────────────────────
  for (const [i, slug] of spec.concepts.entries()) {
    const conceptId = conceptIds[slug];
    if (!conceptId) throw new Error(`${spec.slug}: неизвестный концепт «${slug}»`);
    await q(
      `insert into item_concept (item_version_id, concept_id, is_primary)
       values ($1,$2,$3) on conflict do nothing`,
      [version.id, conceptId, i === 0],
    );
  }

  // ── публикация ────────────────────────────────────────────────────────────
  // Если что-то не сходится, здесь и упадём — с перечнем проблем из SQL,
  // а не с тихо опубликованной кривой задачей.
  if (publish) await q(`select item_version_publish($1, $2)`, [version.id, spec.authorId]);

  return { id: item.id, versionId: version.id, totalMarks };
}
