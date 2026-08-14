// Сид Stage 1: две комиссии, дерево концептов, один демо-ученик
// и одна задача Core Pure 1, доведённая до status = published.
//
// Формулировки пунктов спецификации — свои. Тексты Pearson и Cambridge
// не копируются, ссылка идёт по номеру пункта (§2).

import { withPool } from "./client.mjs";
import { hashPassword, newJoinCode } from "../src/lib/auth.mjs";

const R = String.raw;

await withPool(async (pool) => {
  const q = async (sql, params) => (await pool.query(sql, params)).rows;
  const one = async (sql, params) => (await q(sql, params))[0];

  // ── комиссии и профили обозначений (§3.3) ─────────────────────────────────
  await q(
    `insert into board (id, name, notation_profile, position) values
       ($1,$2,$3,1), ($4,$5,$6,2)
     on conflict (id) do update
       set name = excluded.name,
           notation_profile = excluded.notation_profile,
           position = excluded.position`,
    [
      "edexcel",
      "Pearson Edexcel",
      JSON.stringify({ "\\vect": "\\mathbf{#1}", "\\conj": "#1^*" }),
      "cie",
      "Cambridge International",
      JSON.stringify({ "\\vect": "\\underline{#1}", "\\conj": "\\overline{#1}" }),
    ],
  );

  const qual = async (board, code, name) =>
    one(
      `insert into qualification (board_id, code, name) values ($1,$2,$3)
       on conflict (board_id, code) do update set name = excluded.name
       returning id`,
      [board, code, name],
    );

  const edexcel = await qual("edexcel", "9FM0", "Further Mathematics");
  const cie = await qual("cie", "9231", "Further Mathematics");

  const unit = async (qualId, code, name, position) =>
    one(
      `insert into unit (qualification_id, code, name, position) values ($1,$2,$3,$4)
       on conflict (qualification_id, code) do update set name = excluded.name
       returning id`,
      [qualId, code, name, position],
    );

  const cp1 = await unit(edexcel.id, "CP1", "Core Pure Mathematics 1", 1);
  await unit(edexcel.id, "CP2", "Core Pure Mathematics 2", 2);
  await unit(edexcel.id, "FM1", "Further Mechanics 1", 3);
  await unit(edexcel.id, "FS1", "Further Statistics 1", 4);
  // Decision есть только у Edexcel. У CIE это просто отсутствующая строка,
  // а не ветвление в коде.
  await unit(edexcel.id, "D1", "Decision Mathematics 1", 5);

  const fp1 = await unit(cie.id, "FP1", "Further Pure Mathematics 1", 1);
  await unit(cie.id, "FP2", "Further Pure Mathematics 2", 2);

  const spec = async (unitId, code, statement) =>
    one(
      `insert into spec_point (unit_id, code, statement, spec_version)
       values ($1,$2,$3,'2017')
       on conflict (unit_id, code, spec_version) do update set statement = excluded.statement
       returning id`,
      [unitId, code, statement],
    );

  const e21 = await spec(cp1.id, "2.1", "Сложение, вычитание и умножение согласованных матриц; умножение на скаляр.");
  const e22 = await spec(cp1.id, "2.2", "Нулевая и единичная матрицы; некоммутативность произведения.");
  const e25 = await spec(cp1.id, "2.5", "Матрицы 2×2 как линейные преобразования плоскости; композиция преобразований.");
  const c14 = await spec(fp1.id, "1.4", "Умножение матриц и его свойства.");
  const c15 = await spec(fp1.id, "1.5", "Матрицы как преобразования плоскости; последовательные преобразования.");

  // ── концепты (board-agnostic) ─────────────────────────────────────────────
  const concept = async (slug, en, ru, parentId, position) =>
    one(
      `insert into concept (slug, name_en, name_ru, parent_id, position)
       values ($1,$2,$3,$4,$5)
       on conflict (slug) do update set name_en = excluded.name_en, name_ru = excluded.name_ru
       returning id`,
      [slug, en, ru, parentId, position],
    );

  const matrices = await concept("matrices", "Matrices", "Матрицы", null, 1);
  const mMul = await concept("matrix-multiplication", "Matrix multiplication", "Умножение матриц", matrices.id, 1);
  const mDet = await concept("determinant", "Determinant", "Определитель", matrices.id, 2);
  const mInv = await concept("inverse-matrix", "Inverse matrix", "Обратная матрица", matrices.id, 3);
  const mTrans = await concept("matrix-transformations", "Matrix transformations of the plane", "Матричные преобразования плоскости", matrices.id, 4);

  const complex = await concept("complex-numbers", "Complex numbers", "Комплексные числа", null, 2);
  await concept("complex-roots", "Roots of polynomials over C", "Корни многочленов над C", complex.id, 1);
  await concept("argand-diagram", "Argand diagram", "Диаграмма Аргана", complex.id, 2);

  // ── отображение концептов на пункты комиссий (many-to-many) ───────────────
  // Один концепт обслуживает обе комиссии. Именно эта таблица делает
  // фильтр «я готовлюсь к Edexcel» обратным обходом, а не копией банка.
  const link = async (conceptId, specId) =>
    q(
      `insert into concept_spec_point (concept_id, spec_point_id) values ($1,$2)
       on conflict do nothing`,
      [conceptId, specId],
    );

  await link(mMul.id, e21.id);
  await link(mMul.id, e22.id);
  await link(mMul.id, c14.id);
  await link(mTrans.id, e25.id);
  await link(mTrans.id, c15.id);
  await link(mDet.id, e21.id);
  await link(mInv.id, e21.id);

  // ── пользователи ──────────────────────────────────────────────────────────
  // Демо-аккаунты с одним паролем: это сид для разработки, не продакшен.
  const DEMO_PASSWORD = "password123";
  const demoHash = await hashPassword(DEMO_PASSWORD);

  const user = async (email, name, role) =>
    one(
      `insert into app_user (email, display_name, role, password_hash)
       values ($1,$2,$3,$4)
       on conflict (email) do update
         set display_name = excluded.display_name,
             password_hash = coalesce(app_user.password_hash, excluded.password_hash)
       returning id`,
      [email, name, role, demoHash],
    );

  const author = await user("author@example.com", "Демо-автор", "author");
  const teacher = await user("teacher@example.com", "Айгерим Сериковна", "teacher");
  const student = await user("student@example.com", "Демо-ученик", "student");
  const students = [
    student,
    await user("aidana@example.com", "Айдана Нурланова", "student"),
    await user("timur@example.com", "Тимур Ахметов", "student"),
    await user("dana@example.com", "Дана Ким", "student"),
  ];

  // ── задача ────────────────────────────────────────────────────────────────
  const slug = "cp1-matrix-transformations-of-the-plane";
  const existing = await one(`select id from item where slug = $1`, [slug]);
  if (existing) {
    console.log("✓ задача уже засеяна:", slug);
    console.log("  (для чистого прогона: npm run db:reset)");
    return;
  }

  const item = await one(`insert into item (slug) values ($1) returning id`, [slug]);

  const version = await one(
    `insert into item_version
       (item_id, version, status, stem_md, difficulty, total_marks, origin, created_by)
     values ($1, 1, 'draft', $2, 2, 8, 'original', $3)
     returning id`,
    [
      item.id,
      // Условие — на английском: это язык экзамена (§12).
      // \vect — макрос комиссии, а не жирный шрифт руками (§3.3).
      R`A transformation $T$ of the plane is represented by the matrix
$$\vect{M} = \begin{pmatrix} 0 & -1 \\ 1 & 0 \end{pmatrix}.$$`,
      author.id,
    ],
  );

  const addPart = async (p) =>
    one(
      `insert into item_part
         (item_version_id, parent_part_id, label, path, position, text_md,
          answer_type, answer_spec, marks)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning id`,
      [
        version.id,
        p.parent ?? null,
        p.label,
        p.path,
        p.position,
        p.text,
        p.answer_type ?? null,
        p.answer_spec ? JSON.stringify(p.answer_spec) : null,
        p.marks ?? null,
      ],
    );

  const pa = await addPart({
    label: "a",
    path: "a",
    position: 1,
    text: R`Describe fully the transformation $T$.`,
    answer_type: "mcq",
    marks: 2,
    answer_spec: {
      options: [
        { id: "o1", text_md: R`Rotation through $90^\circ$ anticlockwise about the origin` },
        { id: "o2", text_md: R`Rotation through $90^\circ$ clockwise about the origin` },
        { id: "o3", text_md: R`Reflection in the line $y = x$` },
        { id: "o4", text_md: R`Enlargement with scale factor $-1$, centre the origin` },
      ],
      correct: ["o1"],
      common_errors: [{ selected: ["o2"], feedback_code: "MCQ_ROTATION_DIRECTION" }],
    },
  });

  // Контейнерная часть: своих баллов и типа ответа не имеет.
  const pb = await addPart({
    label: "b",
    path: "b",
    position: 2,
    text: R`The transformation $T$ is applied twice.`,
  });

  const pbi = await addPart({
    parent: pb.id,
    label: "i",
    path: "b.i",
    position: 3,
    text: R`Find $\vect{M}^2$.`,
    answer_type: "matrix",
    marks: 2,
    answer_spec: { rows: 2, cols: 2, cells: ["-1", "0", "0", "-1"], mode: "exact" },
  });

  const pbii = await addPart({
    parent: pb.id,
    label: "ii",
    path: "b.ii",
    position: 4,
    text: R`Describe fully the single transformation represented by $\vect{M}^2$.`,
    answer_type: "mcq",
    marks: 1,
    answer_spec: {
      options: [
        { id: "p1", text_md: R`Rotation through $180^\circ$ about the origin` },
        { id: "p2", text_md: R`Reflection in the $x$-axis` },
        { id: "p3", text_md: R`Rotation through $360^\circ$ about the origin` },
        { id: "p4", text_md: R`Enlargement with scale factor $2$, centre the origin` },
      ],
      correct: ["p1"],
    },
  });

  const pc = await addPart({
    label: "c",
    path: "c",
    position: 5,
    text: R`The matrix $\vect{N}$ represents a reflection in the line $y = x$. Write down $\vect{N}$.`,
    answer_type: "matrix",
    marks: 1,
    answer_spec: { rows: 2, cols: 2, cells: ["0", "1", "1", "0"], mode: "exact" },
  });

  const pd = await addPart({
    label: "d",
    path: "d",
    position: 6,
    text: R`Find the single matrix that represents $T$ followed by the reflection represented by $\vect{N}$, and hence describe that single transformation.`,
    answer_type: "matrix",
    marks: 2,
    answer_spec: {
      rows: 2,
      cols: 2,
      cells: ["1", "0", "0", "-1"],
      mode: "exact",
      // Классическая ошибка: посчитать MN вместо NM. Не «неверно»,
      // а именованный диагноз — ради этого feedback_code и существует.
      common_errors: [
        { cells: ["-1", "0", "0", "1"], feedback_code: "MATRIX_ORDER_SWAPPED" },
      ],
    },
  });

  // ── схема оценивания ──────────────────────────────────────────────────────
  let position = 0;
  const addStep = async (partId, markCode, marks, en, ru) => {
    const step = await one(
      `insert into solution_step
         (item_version_id, part_id, position, mark_code, marks_covered)
       values ($1,$2,$3,$4,$5) returning id`,
      [version.id, partId, ++position, markCode, marks],
    );
    await q(
      `insert into solution_step_text (solution_step_id, locale, text_md)
       values ($1,'en',$2), ($1,'ru',$3)`,
      [step.id, en, ru],
    );
  };

  await addStep(
    pa.id, "M1", 1,
    R`Consider the images of the base vectors: $\begin{pmatrix}1\\0\end{pmatrix} \mapsto \begin{pmatrix}0\\1\end{pmatrix}$ and $\begin{pmatrix}0\\1\end{pmatrix} \mapsto \begin{pmatrix}-1\\0\end{pmatrix}$.`,
    R`Смотрим на образы базисных векторов: $\begin{pmatrix}1\\0\end{pmatrix} \mapsto \begin{pmatrix}0\\1\end{pmatrix}$ и $\begin{pmatrix}0\\1\end{pmatrix} \mapsto \begin{pmatrix}-1\\0\end{pmatrix}$.`,
  );
  await addStep(
    pa.id, "A1", 1,
    R`Rotation through $90^\circ$ anticlockwise about the origin.`,
    R`Поворот на $90^\circ$ против часовой стрелки вокруг начала координат.`,
  );
  await addStep(
    pbi.id, "M1", 1,
    R`$\vect{M}^2 = \begin{pmatrix}0&-1\\1&0\end{pmatrix}\begin{pmatrix}0&-1\\1&0\end{pmatrix}$`,
    R`$\vect{M}^2 = \begin{pmatrix}0&-1\\1&0\end{pmatrix}\begin{pmatrix}0&-1\\1&0\end{pmatrix}$`,
  );
  await addStep(
    pbi.id, "A1", 1,
    R`$= \begin{pmatrix}-1&0\\0&-1\end{pmatrix}$`,
    R`$= \begin{pmatrix}-1&0\\0&-1\end{pmatrix}$`,
  );
  await addStep(
    pbii.id, "A1", 1,
    R`Rotation through $180^\circ$ about the origin.`,
    R`Поворот на $180^\circ$ вокруг начала координат.`,
  );
  await addStep(
    pc.id, "B1", 1,
    R`$\vect{N} = \begin{pmatrix}0&1\\1&0\end{pmatrix}$`,
    R`$\vect{N} = \begin{pmatrix}0&1\\1&0\end{pmatrix}$`,
  );
  await addStep(
    pd.id, "M1", 1,
    R`Order matters. «$T$ followed by $\vect{N}$» is the product $\vect{NM}$, not $\vect{MN}$.`,
    R`Порядок важен. «Сначала $T$, потом $\vect{N}$» — это произведение $\vect{NM}$, а не $\vect{MN}$.`,
  );
  await addStep(
    pd.id, "A1", 1,
    R`$\vect{NM} = \begin{pmatrix}1&0\\0&-1\end{pmatrix}$, a reflection in the $x$-axis.`,
    R`$\vect{NM} = \begin{pmatrix}1&0\\0&-1\end{pmatrix}$ — отражение относительно оси $x$.`,
  );

  // ── привязка к концептам ──────────────────────────────────────────────────
  await q(
    `insert into item_concept (item_version_id, concept_id, is_primary)
     values ($1,$2,true), ($1,$3,false)`,
    [version.id, mTrans.id, mMul.id],
  );

  // ── публикация через блокирующую валидацию ────────────────────────────────
  await q(`select item_version_publish($1, $2)`, [version.id, author.id]);

  // ── класс с учениками и выданной домашкой ─────────────────────────────────
  const klass = await one(
    `insert into class (teacher_id, name, join_code) values ($1,$2,$3) returning id, join_code`,
    [teacher.id, "11А · Further Maths", newJoinCode()],
  );
  for (const s of students) {
    await q(
      `insert into enrolment (class_id, student_id) values ($1,$2) on conflict do nothing`,
      [klass.id, s.id],
    );
  }

  const due = new Date(Date.now() + 7 * 86_400_000);
  const assignment = await one(
    `insert into assignment (class_id, title, due_at, created_by)
     values ($1,$2,$3,$4) returning id`,
    [klass.id, "Матрицы: преобразования плоскости", due, teacher.id],
  );
  await q(
    `insert into assignment_item (assignment_id, item_version_id, position) values ($1,$2,1)`,
    [assignment.id, version.id],
  );

  console.log("✓ засеяно");
  console.log("  комиссии: edexcel (9FM0), cie (9231)");
  console.log("  концептов:", (await one(`select count(*)::int n from concept`)).n);
  console.log("  пунктов спецификаций:", (await one(`select count(*)::int n from spec_point`)).n);
  console.log("  задача:", slug, "— опубликована, 8 баллов, 5 оцениваемых частей");
  console.log("");
  console.log("  класс:", "11А · Further Maths", "— код", klass.join_code);
  console.log("  домашка выдана, дедлайн через 7 дней, разбор закрыт до дедлайна");
  console.log("");
  console.log("  Демо-вход (пароль у всех " + DEMO_PASSWORD + "):");
  console.log("    учитель  teacher@example.com");
  console.log("    ученик   student@example.com");
});
