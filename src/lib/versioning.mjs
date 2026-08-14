/**
 * Создание новой версии задачи (SYSTEM-DESIGN §3.4).
 *
 * Опубликованная версия неизменяема, поэтому любая правка — включая
 * исправление ошибки в ключе — проходит через копию. Части копируются
 * с сохранением `path`: именно по нему пересчёт сопоставляет старую
 * и новую версию, а не по id, который у копии свой.
 *
 * Это же будет вызывать авторский редактор на кнопке «Править» (Stage 2).
 */

/**
 * @param {import('pg').Pool} pool
 * @param {string} sourceVersionId
 * @param {(part: {path: string, answer_spec: any, text_md: string}) => object} [mutatePart]
 *        точечная правка части: возвращает поля, которые надо переопределить
 * @returns {Promise<{versionId: string, version: number}>}
 */
export async function newVersionFrom(pool, sourceVersionId, mutatePart = () => ({})) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows: [src] } = await client.query(
      `select * from item_version where id = $1`,
      [sourceVersionId],
    );
    if (!src) throw new Error(`item_version ${sourceVersionId} не найдена`);

    const { rows: [{ next }] } = await client.query(
      `select coalesce(max(version), 0) + 1 as next from item_version where item_id = $1`,
      [src.item_id],
    );

    const { rows: [dst] } = await client.query(
      `insert into item_version
         (item_id, version, status, stem_md, difficulty, total_marks, origin,
          notation_override, created_by)
       values ($1, $2, 'draft', $3, $4, $5, $6, $7, $8)
       returning id, version`,
      [src.item_id, next, src.stem_md, src.difficulty, src.total_marks,
       src.origin, src.notation_override, src.created_by],
    );

    // Части: сначала родители, потом дети — parent_part_id должен указывать
    // на копию, а не на оригинал.
    const { rows: parts } = await client.query(
      `select * from item_part where item_version_id = $1 order by position`,
      [sourceVersionId],
    );

    /** @type {Map<string,string>} старый id → новый id */
    const idMap = new Map();
    /** @type {Map<string,string>} path → новый id */
    const byPath = new Map();

    for (const p of parts) {
      const patch = mutatePart(p) ?? {};
      const { rows: [np] } = await client.query(
        `insert into item_part
           (item_version_id, parent_part_id, label, path, position, text_md,
            answer_type, answer_spec, marks)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         returning id`,
        [
          dst.id,
          p.parent_part_id ? idMap.get(p.parent_part_id) : null,
          p.label,
          p.path,
          p.position,
          patch.text_md ?? p.text_md,
          patch.answer_type ?? p.answer_type,
          patch.answer_spec !== undefined
            ? JSON.stringify(patch.answer_spec)
            : p.answer_spec === null
              ? null
              : JSON.stringify(p.answer_spec),
          patch.marks ?? p.marks,
        ],
      );
      idMap.set(p.id, np.id);
      byPath.set(p.path, np.id);
    }

    const { rows: steps } = await client.query(
      `select * from solution_step where item_version_id = $1 order by position`,
      [sourceVersionId],
    );
    for (const s of steps) {
      const { rows: [ns] } = await client.query(
        `insert into solution_step
           (item_version_id, part_id, position, mark_code, marks_covered, media_id)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [dst.id, idMap.get(s.part_id), s.position, s.mark_code, s.marks_covered, s.media_id],
      );
      await client.query(
        `insert into solution_step_text (solution_step_id, locale, text_md)
         select $1, locale, text_md from solution_step_text where solution_step_id = $2`,
        [ns.id, s.id],
      );
    }

    await client.query(
      `insert into item_concept (item_version_id, concept_id, is_primary)
       select $1, concept_id, is_primary from item_concept where item_version_id = $2`,
      [dst.id, sourceVersionId],
    );

    await client.query("commit");
    return { versionId: dst.id, version: dst.version };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
