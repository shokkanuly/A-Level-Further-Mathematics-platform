// Сид: четыре программы, их таксономии, демо-пользователи, банк задач
// и один класс с выданной домашкой.
//
// Формулировки пунктов спецификаций — свои. Тексты Pearson, Cambridge
// и College Board не копируются, ссылка идёт по номеру пункта (§2).
//
// Сид идемпотентен: повторный запуск не плодит дубликатов и не падает.
// Для чистого прогона — npm run db:reset.

import { withPool } from "./client.mjs";
import { hashPassword, newJoinCode } from "../src/lib/auth.mjs";
import { createItem } from "./seed-items.mjs";
import { bankItems } from "./seed-bank.mjs";

await withPool(async (pool) => {
  const q = async (sql, params) => (await pool.query(sql, params)).rows;
  const one = async (sql, params) => (await q(sql, params))[0];

  // ── комиссии и профили обозначений (§3.3) ─────────────────────────────────
  //
  // Комиссия отвечает ровно за одно: как выглядят обозначения и как
  // нумеруются пункты. Программа (008) отвечает за то, что вообще изучается.
  // Поэтому College Board и школьная программа тоже «комиссии»: у них свои
  // обозначения, и им нужна строка здесь, а не особый случай в коде.
  const board = async (id, name, profile, position) =>
    q(
      `insert into board (id, name, notation_profile, position) values ($1,$2,$3,$4)
       on conflict (id) do update
         set name = excluded.name,
             notation_profile = excluded.notation_profile,
             position = excluded.position`,
      [id, name, JSON.stringify(profile), position],
    );

  await board("edexcel", "Pearson Edexcel", { "\\vect": "\\mathbf{#1}", "\\conj": "#1^*" }, 1);
  await board("cie", "Cambridge International", { "\\vect": "\\underline{#1}", "\\conj": "\\overline{#1}" }, 2);
  // У SAT и школьной программы векторных обозначений в задачах нет,
  // поэтому профиль пуст — это не пропуск, а факт.
  await board("collegeboard", "College Board", {}, 3);
  await board("school", "Школьная программа", {}, 4);

  // ── квалификации: программа → квалификация → юнит → пункт ─────────────────
  // Помощники возвращают сразу id: строка-обёртка нужна была ровно один раз,
  // а `.id` на каждом обращении — лишний повод его забыть.
  const qual = async (boardId, programId, code, name) =>
    (
      await one(
        `insert into qualification (board_id, program_id, code, name) values ($1,$2,$3,$4)
         on conflict (board_id, code) do update
           set name = excluded.name, program_id = excluded.program_id
         returning id`,
        [boardId, programId, code, name],
      )
    ).id;

  const satQ = await qual("collegeboard", "sat", "SAT", "Digital SAT Mathematics");
  const schoolQ = await qual("school", "school", "SCHOOL", "Алгебра и геометрия, 7–11 класс");
  const mathsQ = await qual("edexcel", "alevel-maths", "9MA0", "Mathematics");
  const edexcel = await qual("edexcel", "alevel-further", "9FM0", "Further Mathematics");
  const cie = await qual("cie", "alevel-further", "9231", "Further Mathematics");

  const unit = async (qualId, code, name, position) =>
    (
      await one(
        `insert into unit (qualification_id, code, name, position) values ($1,$2,$3,$4)
         on conflict (qualification_id, code) do update set name = excluded.name
         returning id`,
        [qualId, code, name, position],
      )
    ).id;

  // SAT
  const satAlg = await unit(satQ, "ALG", "Algebra", 1);
  const satAdv = await unit(satQ, "ADV", "Advanced Math", 2);
  const satPsd = await unit(satQ, "PSD", "Problem-Solving and Data Analysis", 3);
  const satGeo = await unit(satQ, "GEO", "Geometry and Trigonometry", 4);

  // Школа
  const schAlg79 = await unit(schoolQ, "А7-9", "Алгебра, 7–9 класс", 1);
  const schGeo79 = await unit(schoolQ, "Г7-9", "Геометрия, 7–9 класс", 2);
  const schAlg1011 = await unit(schoolQ, "А10-11", "Алгебра и начала анализа, 10–11 класс", 3);
  const schOlymp = await unit(schoolQ, "ОЛ", "Олимпиадная математика", 4);

  // A-Level Mathematics
  const maP1 = await unit(mathsQ, "P1", "Pure Mathematics 1", 1);
  await unit(mathsQ, "P2", "Pure Mathematics 2", 2);
  await unit(mathsQ, "S1", "Statistics 1", 3);
  await unit(mathsQ, "M1", "Mechanics 1", 4);

  // A-Level Further Mathematics
  const cp1 = await unit(edexcel, "CP1", "Core Pure Mathematics 1", 1);
  await unit(edexcel, "CP2", "Core Pure Mathematics 2", 2);
  await unit(edexcel, "FM1", "Further Mechanics 1", 3);
  await unit(edexcel, "FS1", "Further Statistics 1", 4);
  // Decision есть только у Edexcel. У CIE это просто отсутствующая строка,
  // а не ветвление в коде.
  await unit(edexcel, "D1", "Decision Mathematics 1", 5);

  const fp1 = await unit(cie, "FP1", "Further Pure Mathematics 1", 1);
  await unit(cie, "FP2", "Further Pure Mathematics 2", 2);

  const spec = async (unitId, code, statement, version = "2017") =>
    (
      await one(
        `insert into spec_point (unit_id, code, statement, spec_version)
         values ($1,$2,$3,$4)
         on conflict (unit_id, code, spec_version) do update set statement = excluded.statement
         returning id`,
        [unitId, code, statement, version],
      )
    ).id;

  // SAT (спецификация Digital SAT, 2024)
  const s11 = await spec(satAlg, "1.1", "Линейные уравнения с одной переменной: решение и интерпретация.", "2024");
  await spec(satAlg, "1.2", "Системы двух линейных уравнений с двумя переменными.", "2024");
  const s21 = await spec(satAdv, "2.1", "Квадратичные уравнения: решение, дискриминант, вершина параболы.", "2024");
  await spec(satPsd, "3.1", "Отношения, доли и проценты в прикладных задачах.", "2024");
  await spec(satGeo, "4.1", "Треугольники и тригонометрия прямоугольного треугольника.", "2024");

  // Школа
  const k11 = await spec(schAlg79, "1.1", "Линейные уравнения и их решение равносильными преобразованиями.", "школа");
  const k12 = await spec(schAlg79, "1.2", "Квадратные уравнения; дискриминант и число корней.", "школа");
  await spec(schGeo79, "2.1", "Треугольники: признаки равенства и подобия.", "школа");
  const k31 = await spec(schAlg1011, "3.1", "Производная многочлена; касательная и точки экстремума.", "школа");
  const k41 = await spec(schOlymp, "4.1", "Арифметика остатков, инварианты и делимость.", "школа");

  // A-Level Mathematics
  const m11 = await spec(maP1, "1.1", "Дифференцирование многочленов; производная как скорость изменения.", "2017");
  const m12 = await spec(maP1, "1.2", "Стационарные точки и их характер по второй производной.", "2017");

  // A-Level Further Mathematics
  const e21 = await spec(cp1, "2.1", "Сложение, вычитание и умножение согласованных матриц; умножение на скаляр.");
  const e22 = await spec(cp1, "2.2", "Нулевая и единичная матрицы; некоммутативность произведения.");
  const e25 = await spec(cp1, "2.5", "Матрицы 2×2 как линейные преобразования плоскости; композиция преобразований.");
  const c14 = await spec(fp1, "1.4", "Умножение матриц и его свойства.");
  const c15 = await spec(fp1, "1.5", "Матрицы как преобразования плоскости; последовательные преобразования.");

  // ── концепты (board-agnostic) ─────────────────────────────────────────────
  //
  // Концепт не знает ни про программу, ни про комиссию. Одно и то же
  // «квадратное уравнение» обслуживает и школьный блок, и SAT — именно
  // поэтому оно заведено один раз.
  const ids = {};
  const concept = async (slug, en, ru, parentSlug, position) => {
    const row = await one(
      `insert into concept (slug, name_en, name_ru, parent_id, position)
       values ($1,$2,$3,$4,$5)
       on conflict (slug) do update set name_en = excluded.name_en, name_ru = excluded.name_ru
       returning id`,
      [slug, en, ru, parentSlug ? ids[parentSlug] : null, position],
    );
    ids[slug] = row.id;
    return row.id;
  };

  await concept("matrices", "Matrices", "Матрицы", null, 1);
  await concept("matrix-multiplication", "Matrix multiplication", "Умножение матриц", "matrices", 1);
  await concept("determinant", "Determinant", "Определитель", "matrices", 2);
  await concept("inverse-matrix", "Inverse matrix", "Обратная матрица", "matrices", 3);
  await concept("matrix-transformations", "Matrix transformations of the plane", "Матричные преобразования плоскости", "matrices", 4);

  await concept("complex-numbers", "Complex numbers", "Комплексные числа", null, 2);
  await concept("complex-roots", "Roots of polynomials over C", "Корни многочленов над C", "complex-numbers", 1);
  await concept("argand-diagram", "Argand diagram", "Диаграмма Аргана", "complex-numbers", 2);

  await concept("algebra", "Algebra", "Алгебра", null, 3);
  await concept("linear-equations", "Linear equations", "Линейные уравнения", "algebra", 1);
  await concept("quadratics", "Quadratic equations", "Квадратные уравнения", "algebra", 2);
  await concept("systems-of-equations", "Systems of equations", "Системы уравнений", "algebra", 3);

  await concept("calculus", "Calculus", "Математический анализ", null, 4);
  await concept("differentiation", "Differentiation", "Дифференцирование", "calculus", 1);
  await concept("integration", "Integration", "Интегрирование", "calculus", 2);

  await concept("geometry", "Geometry", "Геометрия", null, 5);
  await concept("triangles", "Triangles", "Треугольники", "geometry", 1);

  await concept("number-theory", "Number theory", "Теория чисел", null, 6);
  await concept("digital-roots", "Digital roots and modular arithmetic", "Цифровые корни и арифметика остатков", "number-theory", 1);

  // ── отображение концептов на пункты комиссий (many-to-many) ───────────────
  // Именно эта таблица делает фильтр «я готовлюсь к SAT» обратным обходом,
  // а не копией банка: linear-equations висит и на SAT 1.1, и на школьном 1.1.
  const link = async (conceptSlug, specId) =>
    q(
      `insert into concept_spec_point (concept_id, spec_point_id) values ($1,$2)
       on conflict do nothing`,
      [ids[conceptSlug], specId],
    );

  await link("matrix-multiplication", e21);
  await link("matrix-multiplication", e22);
  await link("matrix-multiplication", c14);
  await link("matrix-transformations", e25);
  await link("matrix-transformations", c15);
  await link("determinant", e21);
  await link("inverse-matrix", e21);

  await link("linear-equations", s11);
  await link("linear-equations", k11);
  await link("quadratics", s21);
  await link("quadratics", k12);
  await link("differentiation", m11);
  await link("differentiation", m12);
  await link("differentiation", k31);
  await link("digital-roots", k41);

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
             role = excluded.role,
             password_hash = coalesce(app_user.password_hash, excluded.password_hash)
       returning id`,
      [email, name, role, demoHash],
    );

  await user("admin@example.com", "Администратор", "admin");
  const author = await user("author@example.com", "Демо-автор", "author");
  const teacher = await user("teacher@example.com", "Айгерим Сериковна", "teacher");
  const student = await user("student@example.com", "Демо-ученик", "student");
  const students = [
    student,
    await user("aidana@example.com", "Айдана Нурланова", "student"),
    await user("timur@example.com", "Тимур Ахметов", "student"),
    await user("dana@example.com", "Дана Ким", "student"),
  ];

  // ── банк задач ────────────────────────────────────────────────────────────
  let created = 0;
  let versionOfCp1 = null;
  for (const item of bankItems(author.id)) {
    const result = await createItem(q, item, ids);
    if (result) created++;
    if (item.slug === "cp1-matrix-transformations-of-the-plane") {
      versionOfCp1 =
        result?.versionId ??
        (
          await one(
            `select iv.id from item_version iv
             join item i on i.id = iv.item_id
             where i.slug = $1 and iv.status = 'published'`,
            [item.slug],
          )
        )?.id;
    }
  }

  // ── класс с учениками и выданной домашкой ─────────────────────────────────
  let klass = await one(`select id, join_code from class where teacher_id = $1 limit 1`, [
    teacher.id,
  ]);
  if (!klass) {
    klass = await one(
      `insert into class (teacher_id, name, join_code) values ($1,$2,$3) returning id, join_code`,
      [teacher.id, "11А · Further Maths", newJoinCode()],
    );
  }
  for (const s of students) {
    await q(
      `insert into enrolment (class_id, student_id) values ($1,$2) on conflict do nothing`,
      [klass.id, s.id],
    );
  }

  let assignment = await one(`select id from assignment where class_id = $1 limit 1`, [klass.id]);
  if (!assignment && versionOfCp1) {
    const due = new Date(Date.now() + 7 * 86_400_000);
    assignment = await one(
      `insert into assignment (class_id, title, due_at, created_by)
       values ($1,$2,$3,$4) returning id`,
      [klass.id, "Матрицы: преобразования плоскости", due, teacher.id],
    );
    await q(
      `insert into assignment_item (assignment_id, item_version_id, position) values ($1,$2,1)`,
      [assignment.id, versionOfCp1],
    );
  }

  // ── комната класса, объявление и событие ──────────────────────────────────
  // Комната заводится вместе с классом (010): «создать при первом заходе» —
  // это гонка, которая однажды сделает две комнаты на один класс.
  await q(
    `insert into chat_room (kind, class_id, name) values ('class', $1, $2)
     on conflict (class_id) where class_id is not null do nothing`,
    [klass.id, "11А · Further Maths"],
  );

  const hasAnn = await one(`select id from announcement limit 1`);
  if (!hasAnn) {
    await q(
      `insert into announcement (scope, class_id, author_id, title, body_md, pinned)
       values ('class', $1, $2, $3, $4, true)`,
      [
        klass.id,
        teacher.id,
        "Разбор матриц в четверг",
        "Кто не понял композицию преобразований — приходите.\n\nЗаранее прорешайте пункт (d): именно там путают $\\vect{NM}$ и $\\vect{MN}$.",
      ],
    );
    await q(
      `insert into event (scope, class_id, title, description_md, starts_at, location, created_by)
       values ('class', $1, $2, $3, now() + interval '3 days', $4, $5)`,
      [
        klass.id,
        "Консультация по Core Pure 1",
        "Матрицы и комплексные числа. Приносите вопросы по домашке.",
        "Кабинет 204",
        teacher.id,
      ],
    );
  }

  // ── урок с видео и конспектом ─────────────────────────────────────────────
  const hasLesson = await one(`select id from lesson limit 1`);
  if (!hasLesson) {
    const lesson = await one(
      `insert into lesson (class_id, program_id, title, summary_md,
                           video_provider, video_id, conspectus_md,
                           position, created_by, published_at)
       values ($1,$2,$3,$4,$5,$6,$7,1,$8, now()) returning id`,
      [
        klass.id,
        "alevel-further",
        "Матрицы как преобразования плоскости",
        "Откуда берётся матрица поворота и почему порядок умножения важен.",
        "youtube",
        // Ролик 3Blue1Brown про линейные преобразования: идентификатор,
        // а не ссылка — адрес для iframe собирает src/lib/video.ts.
        "kYB8IZa5AuE",
        `Матрица преобразования — это **таблица образов базисных векторов**, и всё остальное отсюда следует.

Возьмём $\\vect{M} = \\begin{pmatrix} 0 & -1 \\\\ 1 & 0 \\end{pmatrix}$. Первый столбец — образ вектора $\\begin{pmatrix}1\\\\0\\end{pmatrix}$, второй — образ $\\begin{pmatrix}0\\\\1\\end{pmatrix}$. Проверяем: $\\begin{pmatrix}1\\\\0\\end{pmatrix} \\mapsto \\begin{pmatrix}0\\\\1\\end{pmatrix}$, $\\begin{pmatrix}0\\\\1\\end{pmatrix} \\mapsto \\begin{pmatrix}-1\\\\0\\end{pmatrix}$. Оба повернулись на $90^\\circ$ против часовой стрелки.

**Почему порядок важен.** Запись «сначала $T$, потом $S$» означает $S(T(x))$, то есть произведение $\\vect{SM}$, а не $\\vect{MS}$. Матрицы применяются к вектору справа налево — так же, как читается композиция функций.

- поворот на $\\theta$: $\\begin{pmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{pmatrix}$;
- отражение относительно $y = x$: $\\begin{pmatrix} 0 & 1 \\\\ 1 & 0 \\end{pmatrix}$;
- растяжение в $k$ раз: $k\\vect{I}$.

**Что проверять на экзамене.** Если определитель равен $-1$, преобразование меняет ориентацию — это отражение, а не поворот. Определитель $1$ и матрица не единичная — поворот.`,
        teacher.id,
      ],
    );
    await q(
      `insert into lesson_concept (lesson_id, concept_id) values ($1,$2), ($1,$3)
       on conflict do nothing`,
      [lesson.id, ids["matrix-transformations"], ids["matrix-multiplication"]],
    );
  }

  // ── итог ──────────────────────────────────────────────────────────────────
  const count = async (sql) => (await one(sql)).n;

  console.log("✓ засеяно");
  console.log("  программ:", await count(`select count(*)::int n from program`));
  console.log("  комиссий:", await count(`select count(*)::int n from board`));
  console.log("  юнитов:", await count(`select count(*)::int n from unit`));
  console.log("  пунктов спецификаций:", await count(`select count(*)::int n from spec_point`));
  console.log("  концептов:", await count(`select count(*)::int n from concept`));
  console.log(
    "  задач опубликовано:",
    await count(`select count(*)::int n from item_version where status = 'published'`),
    created ? `(заведено сейчас: ${created})` : "(все уже были)",
  );

  const byKind = await q(`
    select k.name_ru, count(iv.*)::int n
    from item_kind k
    left join item_version iv on iv.kind = k.id and iv.status = 'published'
    group by k.name_ru, k.position order by k.position
  `);
  for (const r of byKind) console.log(`    ${r.name_ru}: ${r.n}`);

  console.log("");
  console.log("  класс: 11А · Further Maths — код", klass.join_code);
  console.log("  домашка выдана, дедлайн через 7 дней, разбор закрыт до дедлайна");
  console.log("");
  console.log("  Демо-вход (пароль у всех " + DEMO_PASSWORD + "):");
  console.log("    админ    admin@example.com");
  console.log("    автор    author@example.com");
  console.log("    учитель  teacher@example.com");
  console.log("    ученик   student@example.com");
});
