import { grade, GRADER_VERSION } from "./grade.mjs";

/**
 * Пересчёт сохранённых ответов под новую версию ключа (SYSTEM-DESIGN §4.4).
 *
 * Возможен ровно потому, что в part_response лежит сырой ответ ученика,
 * а не «верно/неверно». Ошибка в ключе находится всегда; без этого модуля
 * её цена — просьба к ученикам перерешать.
 *
 * Части старой и новой версии сопоставляются по `path`: id у копии свой,
 * а «пункт (b)(i)» остаётся тем же пунктом.
 *
 * На Stage 4 это станет задачей pg-boss. Пока — функция, которую одинаково
 * зовут и скрипт, и будущий воркер.
 */
export async function regrade(pool, { fromVersionId, toVersionId, reason }) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows: [run] } = await client.query(
      `insert into regrade_run (reason, from_version_id, to_version_id)
       values ($1, $2, $3) returning id`,
      [reason, fromVersionId, toVersionId],
    );

    const { rows: newParts } = await client.query(
      `select id, path, answer_type, answer_spec, marks
       from item_part where item_version_id = $1`,
      [toVersionId],
    );
    const byPath = new Map(newParts.map((p) => [p.path, p]));

    const { rows: responses } = await client.query(
      `select pr.id, pr.raw_response, pr.marks_awarded, pr.auto_marks_awarded,
              pr.feedback_code, pr.override_marks, p.path
       from part_response pr
       join item_part p on p.id = pr.part_id
       where p.item_version_id = $1
       order by p.position`,
      [fromVersionId],
    );

    let changed = 0;
    const entries = [];

    for (const r of responses) {
      const target = byPath.get(r.path);
      // Пункт исчез в новой версии — переигрывать не на чем, балл замораживается.
      if (!target || target.marks === null || !target.answer_type) continue;

      const result = grade(r.raw_response, {
        answer_type: target.answer_type,
        answer_spec: target.answer_spec,
        marks: target.marks,
      });

      const before = r.marks_awarded;
      // Учительское переопределение пересчёт не трогает: человек решил, машина
      // не переспорит. Эффективный балл так и останется override_marks.
      const after = r.override_marks ?? result.marks_awarded;

      await client.query(
        `update part_response
            set auto_marks_awarded     = $2,
                feedback_code          = $3,
                grader_version         = $4,
                graded_against_part_id = $5,
                graded_at              = now()
          where id = $1`,
        [r.id, result.marks_awarded, result.feedback_code, GRADER_VERSION, target.id],
      );

      if (before !== after || r.feedback_code !== result.feedback_code) {
        changed++;
        await client.query(
          `insert into regrade_entry
             (regrade_run_id, part_response_id, marks_before, marks_after,
              feedback_before, feedback_after)
           values ($1,$2,$3,$4,$5,$6)`,
          [run.id, r.id, before, after, r.feedback_code, result.feedback_code],
        );
        entries.push({
          path: r.path,
          before,
          after,
          feedback_before: r.feedback_code,
          feedback_after: result.feedback_code,
        });
      }
    }

    await client.query(
      `update regrade_run
          set finished_at = now(), responses_seen = $2, responses_changed = $3
        where id = $1`,
      [run.id, responses.length, changed],
    );

    await client.query("commit");
    return { runId: run.id, seen: responses.length, changed, entries };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
