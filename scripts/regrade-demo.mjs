// Демонстрация того, ради чего в part_response лежит сырой ответ.
//
// Сценарий полностью реалистичный: автор при вводе ключа посчитал BA вместо AB.
// Ученик ответил верно и получил ноль. Ошибка нашлась через неделю.
//
// Без сохранённого сырого ответа единственный выход — просить перерешать.
// С ним — правка ключа создаёт версию 2, фоновая задача переигрывает
// сохранённые ответы и оставляет след в журнале.

import { withPool } from "../db/client.mjs";
import { newVersionFrom } from "../src/lib/versioning.mjs";
import { regrade } from "../src/lib/regrade.mjs";
import { grade, GRADER_VERSION } from "../src/lib/grade.mjs";

const R = String.raw;
const SLUG = "demo-regrade-key-fix";

const AB_CORRECT = ["7", "2", "3", "1"]; // верный ответ на AB
const BA_WRONG_KEY = ["1", "2", "3", "7"]; // то, что автор занёс в ключ по ошибке

await withPool(async (pool) => {
  const q = async (sql, params) => (await pool.query(sql, params)).rows;
  const one = async (sql, params) => (await q(sql, params))[0];

  await q(`delete from item where slug = $1`, [SLUG]);

  const author = await one(`select id from app_user where role = 'author' limit 1`);
  const student = await one(`select id from app_user where email = 'student@example.com'`);
  const concept = await one(`select id from concept where slug = 'matrix-multiplication'`);
  if (!author || !student || !concept) throw new Error("Сначала: npm run db:seed");

  // ── версия 1, с ошибкой в ключе ───────────────────────────────────────────
  const item = await one(`insert into item (slug) values ($1) returning id`, [SLUG]);
  const v1 = await one(
    `insert into item_version
       (item_id, version, stem_md, difficulty, total_marks, created_by)
     values ($1, 1, $2, 1, 2, $3) returning id`,
    [
      item.id,
      R`$\vect{A} = \begin{pmatrix} 1 & 2 \\ 0 & 1 \end{pmatrix}$ and $\vect{B} = \begin{pmatrix} 1 & 0 \\ 3 & 1 \end{pmatrix}$.`,
      author.id,
    ],
  );
  const part1 = await one(
    `insert into item_part
       (item_version_id, label, path, position, text_md, answer_type, answer_spec, marks)
     values ($1,'a','a',1,$2,'matrix',$3,2) returning id`,
    [v1.id, R`Find $\vect{AB}$.`, JSON.stringify({ rows: 2, cols: 2, cells: BA_WRONG_KEY, mode: "exact" })],
  );
  const step1 = await one(
    `insert into solution_step (item_version_id, part_id, position, mark_code, marks_covered)
     values ($1,$2,1,'M1',1) returning id`,
    [v1.id, part1.id],
  );
  const step2 = await one(
    `insert into solution_step (item_version_id, part_id, position, mark_code, marks_covered)
     values ($1,$2,2,'A1',1) returning id`,
    [v1.id, part1.id],
  );
  await q(
    `insert into solution_step_text (solution_step_id, locale, text_md) values
       ($1,'ru',$2), ($1,'en',$3), ($4,'ru',$5), ($4,'en',$6)`,
    [
      step1.id,
      R`Строка на столбец: $\vect{AB} = \begin{pmatrix} 1 & 2 \\ 0 & 1 \end{pmatrix}\begin{pmatrix} 1 & 0 \\ 3 & 1 \end{pmatrix}$`,
      R`Row by column: $\vect{AB} = \begin{pmatrix} 1 & 2 \\ 0 & 1 \end{pmatrix}\begin{pmatrix} 1 & 0 \\ 3 & 1 \end{pmatrix}$`,
      step2.id,
      R`$= \begin{pmatrix} 7 & 2 \\ 3 & 1 \end{pmatrix}$`,
      R`$= \begin{pmatrix} 7 & 2 \\ 3 & 1 \end{pmatrix}$`,
    ],
  );
  await q(
    `insert into item_concept (item_version_id, concept_id, is_primary) values ($1,$2,true)`,
    [v1.id, concept.id],
  );
  await q(`select item_version_publish($1, $2)`, [v1.id, author.id]);

  // ── ученик отвечает верно и получает ноль ─────────────────────────────────
  const attempt = await one(
    `insert into attempt (student_id, item_version_id, context)
     values ($1,$2,'practice') returning id`,
    [student.id, v1.id],
  );
  const rawResponse = { rows: 2, cols: 2, cells: AB_CORRECT };
  const partRow = await one(
    `select answer_type, answer_spec, marks from item_part where id = $1`,
    [part1.id],
  );
  const first = grade(rawResponse, partRow);
  await q(
    `insert into part_response
       (attempt_id, part_id, raw_response, auto_marks_awarded, feedback_code,
        grader_version, graded_against_part_id)
     values ($1,$2,$3,$4,$5,$6,$2)`,
    [attempt.id, part1.id, JSON.stringify(rawResponse), first.marks_awarded,
     first.feedback_code, GRADER_VERSION],
  );

  console.log("Версия 1 — в ключе стоит BA вместо AB");
  console.log(`  ученик ответил   [${AB_CORRECT.join(" ")}]  (это верный AB)`);
  console.log(`  в ключе лежало   [${BA_WRONG_KEY.join(" ")}]  (это BA)`);
  console.log(`  выставлено       ${first.marks_awarded}/2  ${first.feedback_code}\n`);

  // ── автор находит ошибку: версия 2 с исправленным ключом ──────────────────
  const v2 = await newVersionFrom(pool, v1.id, (p) =>
    p.path === "a"
      ? { answer_spec: { rows: 2, cols: 2, cells: AB_CORRECT, mode: "exact" } }
      : {},
  );
  await q(`select item_version_publish($1, $2)`, [v2.versionId, author.id]);
  console.log(`Версия ${v2.version} опубликована, ключ исправлен, версия 1 → retired`);

  // ── пересчёт ──────────────────────────────────────────────────────────────
  const run = await regrade(pool, {
    fromVersionId: v1.id,
    toVersionId: v2.versionId,
    reason: "Ошибка в ключе: в answer_spec части (a) стояло BA вместо AB",
  });

  console.log(`\nПересчёт: просмотрено ${run.seen}, изменено ${run.changed}`);
  for (const e of run.entries) {
    console.log(
      `  (${e.path})  ${e.before} → ${e.after} баллов   ${e.feedback_before} → ${e.feedback_after}`,
    );
  }

  // ── что осталось в базе ───────────────────────────────────────────────────
  const after = await one(
    `select pr.raw_response, pr.marks_awarded, pr.feedback_code,
            src.path as answered_path, srcv.version as seen_version,
            keyv.version as graded_against_version
     from part_response pr
     join item_part src   on src.id = pr.part_id
     join item_version srcv on srcv.id = src.item_version_id
     join item_part keyp  on keyp.id = pr.graded_against_part_id
     join item_version keyv on keyv.id = keyp.item_version_id
     where pr.attempt_id = $1`,
    [attempt.id],
  );

  console.log("\nСостояние ответа после пересчёта:");
  console.log("  сырой ответ ученика   ", JSON.stringify(after.raw_response.cells));
  console.log("  балл                  ", after.marks_awarded + "/2", after.feedback_code);
  console.log("  ученик видел версию   ", after.seen_version);
  console.log("  проверено ключом верс.", after.graded_against_version);
  console.log(
    "\nОтвет ученика не тронут. Изменился балл и то, чем его проверяли —",
    "\nи то, и другое записано, поэтому на вопрос «почему стало 2» есть ответ.",
  );
});
