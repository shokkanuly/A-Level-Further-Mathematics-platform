// Валидация банка (SYSTEM-DESIGN §9).
//
// Тем же кодом, что и рендерит страницу, и той же функцией, что вызывается
// при публикации. Проверка, которая «похожа» на боевую, ловит не те ошибки.

import { withPool } from "../db/client.mjs";
import { renderTex, macrosFor } from "../src/lib/tex.mjs";

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log("  ✗", msg);
};

await withPool(async (pool) => {
  const q = async (sql, params) => (await pool.query(sql, params)).rows;

  // Профили обозначений проверяются не по всем комиссиям подряд, а по тем,
  // под которыми задача вообще может открыться.
  //
  // До появления программ (008) «все комиссии» и «достижимые комиссии» были
  // одним и тем же множеством. Теперь нет: \vect из Core Pure не определён
  // у College Board, и это не поломка — задача Further Maths в блоке SAT
  // не показывается никогда. Проверять её под профилем SAT значило бы
  // требовать от College Board знать про векторные обозначения A-Level.
  const boardsForVersion = async (versionId) =>
    q(
      `select distinct b.id, b.notation_profile
       from item_concept ic
       join concept_spec_point csp on csp.concept_id = ic.concept_id
       join spec_point sp on sp.id = csp.spec_point_id
       join unit u on u.id = sp.unit_id
       join qualification qa on qa.id = u.qualification_id
       join board b on b.id = qa.board_id
       where ic.item_version_id = $1`,
      [versionId],
    );

  const versions = await q(`
    select iv.id, iv.version, iv.status, iv.total_marks, i.slug
    from item_version iv join item i on i.id = iv.item_id
    where iv.status in ('published', 'retired')
    order by i.slug, iv.version
  `);

  if (versions.length === 0) {
    console.log("Банк пуст. Запустите: npm run db:seed");
    return;
  }

  for (const v of versions) {
    console.log(`\n${v.slug} v${v.version} [${v.status}]`);

    // 1. Инварианты схемы оценивания — той же функцией, что блокирует публикацию.
    const problems = await q(`select code, detail from item_version_problems($1)`, [v.id]);
    if (problems.length === 0) {
      console.log("  ✓ баллы сходятся, концепты на месте");
    } else {
      for (const p of problems) fail(`${p.code} — ${p.detail}`);
    }

    // 2. LaTeX компилируется — и под каждым достижимым профилем отдельно.
    //    Макрос, определённый только у Edexcel, обязан быть виден как поломка
    //    на CIE, а не как «у меня всё открывалось».
    const boards = await boardsForVersion(v.id);
    if (boards.length === 0) {
      // Задача есть в базе, но не привязана ни к одному пункту спецификации,
      // значит не попадёт ни в один блок витрины. Молча это оставлять нельзя:
      // ученик её никогда не увидит, а автор будет уверен, что завёл.
      fail("задача не достижима ни из одной программы: у её концептов нет пунктов спецификаций");
    }

    const texts = [
      ...(await q(`select 'stem' src, stem_md text from item_version where id = $1`, [v.id])),
      ...(await q(
        `select 'part ' || path src, text_md text from item_part where item_version_id = $1`,
        [v.id],
      )),
      ...(await q(
        `select 'mcq ' || p.path src,
                jsonb_array_elements(p.answer_spec->'options')->>'text_md' text
         from item_part p
         where p.item_version_id = $1 and p.answer_type = 'mcq'`,
        [v.id],
      )),
      ...(await q(
        `select 'step ' || p.path || ' ' || t.locale src, t.text_md text
         from solution_step s
         join item_part p on p.id = s.part_id
         join solution_step_text t on t.solution_step_id = s.id
         where s.item_version_id = $1`,
        [v.id],
      )),
    ];

    let texErrors = 0;
    for (const board of boards) {
      const macros = macrosFor(board.notation_profile);
      for (const t of texts) {
        if (!t.text) continue;
        try {
          renderTex(t.text, macros, true);
        } catch (err) {
          fail(`LaTeX не компилируется [${board.id}] в «${t.src}»: ${err.message}`);
          texErrors++;
        }
      }
    }
    if (texErrors === 0) {
      console.log(
        `  ✓ LaTeX собирается (${texts.length} фрагментов × ${boards.length} проф.: ${boards
          .map((b) => b.id)
          .join(", ")})`,
      );
    }

    // 3. Каждая оцениваемая часть имеет разбор хотя бы на одной локали.
    const noText = await q(
      `select p.path
       from item_part p
       join solution_step s on s.part_id = p.id
       left join solution_step_text t on t.solution_step_id = s.id
       where p.item_version_id = $1
       group by p.path
       having count(t.*) = 0`,
      [v.id],
    );
    for (const r of noText) fail(`часть ${r.path}: у шагов нет текста ни на одной локали`);
  }

  console.log(
    failures === 0
      ? `\n✓ банк валиден: версий проверено ${versions.length}`
      : `\n✗ проблем: ${failures}`,
  );
  if (failures) process.exitCode = 1;
});
