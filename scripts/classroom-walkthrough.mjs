// Сквозной прогон учебного цикла по HTTP: учитель → класс → домашка →
// ученик решает → учитель видит журнал.
//
// Отдельно проверяется правило, ради которого существует solution-gate:
// одна и та же задача у ученика в домашке и в свободной практике — это две
// разные попытки, и открытый разбор в практике не смеет разблокировать
// разбор в домашке.
//
// Требует поднятого приложения: npm run dev

import { withPool } from "../db/client.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SLUG = "cp1-matrix-transformations-of-the-plane";
const PASSWORD = "password123";

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

/** Минимальный клиент с собственной банкой cookie: у каждого актора своя. */
function actor(name) {
  let cookie = "";
  return {
    name,
    async fetch(path, init = {}) {
      const res = await fetch(BASE + path, {
        ...init,
        headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) },
        redirect: "manual",
      });
      const set = res.headers.getSetCookie?.() ?? [];
      for (const c of set) {
        const [pair] = c.split(";");
        if (pair.startsWith("fm_session=")) cookie = pair;
      }
      return res;
    },
    async json(path, init) {
      const res = await this.fetch(path, init);
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    login(email) {
      return this.json("/api/auth", {
        method: "POST",
        body: JSON.stringify({ action: "login", email, password: PASSWORD }),
      });
    },
  };
}

await withPool(async (pool) => {
  const q = async (sql, params) => (await pool.query(sql, params)).rows;

  console.log("\n1. Вход");
  const teacher = actor("учитель");
  const student = actor("ученик");
  const outsider = actor("посторонний");

  check((await teacher.login("teacher@example.com")).status === 200, "учитель вошёл");
  check((await student.login("student@example.com")).status === 200, "ученик вошёл");
  check((await outsider.login("timur@example.com")).status === 200, "второй ученик вошёл");

  const bad = await teacher.json("/api/auth", {
    method: "POST",
    body: JSON.stringify({ action: "login", email: "teacher@example.com", password: "wrong" }),
  });
  check(bad.status === 401 && bad.body.error === "BAD_CREDENTIALS", "неверный пароль отклонён");

  const ghost = await outsider.json("/api/auth", {
    method: "POST",
    body: JSON.stringify({ action: "login", email: "nobody@example.com", password: "whatever" }),
  });
  check(
    ghost.body.error === "BAD_CREDENTIALS",
    "несуществующая почта отвечает тем же кодом",
    "форма входа не выдаёт список зарегистрированных",
  );

  console.log("\n2. Класс и вступление по коду");
  const created = await teacher.json("/api/classes", {
    method: "POST",
    body: JSON.stringify({ name: "Тестовый класс" }),
  });
  check(created.status === 200 && created.body.join_code, "класс создан", created.body.join_code);
  const code = created.body.join_code;

  const asStudentCreate = await student.json("/api/classes", {
    method: "POST",
    body: JSON.stringify({ name: "Не должно получиться" }),
  });
  check(asStudentCreate.status === 403, "ученик не может создать класс");

  // Код вводится как попало — должно сработать всё равно.
  const joined = await student.json("/api/classes/join", {
    method: "POST",
    body: JSON.stringify({ code: code.toLowerCase().replace("-", " ") }),
  });
  check(joined.status === 200, "ученик вступил по коду в свободном формате");

  console.log("\n3. Выдача домашки");
  const assigned = await teacher.json("/api/assignments", {
    method: "POST",
    body: JSON.stringify({
      class_id: created.body.id,
      title: "Проверочная: матрицы",
      due_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      item_slugs: [SLUG],
      settings: { solutions_locked_until_due: true },
    }),
  });
  check(assigned.status === 200, "задание выдано");
  const assignmentId = assigned.body.id;

  const hijack = await outsider.json("/api/assignments", {
    method: "POST",
    body: JSON.stringify({
      class_id: created.body.id,
      title: "Чужой класс",
      item_slugs: [SLUG],
    }),
  });
  check(hijack.status === 403, "посторонний не может выдать задание в чужой класс");

  console.log("\n4. Ученик решает домашку");
  const hw = await student.json("/api/attempts", {
    method: "POST",
    body: JSON.stringify({ slug: SLUG, assignment_id: assignmentId }),
  });
  check(hw.status === 200 && hw.body.context === "assignment", "попытка создана в контексте домашки");

  const parts = await q(
    `select p.id, p.path, p.marks, p.answer_type
     from item_part p
     join item_version iv on iv.id = p.item_version_id and iv.status = 'published'
     join item i on i.id = iv.item_id
     where i.slug = $1 and p.marks is not null order by p.position`,
    [SLUG],
  );

  const ANSWERS = {
    a: { selected: ["o1"] },
    "b.i": { rows: 2, cols: 2, cells: ["-1", "0", "0", "-1"] },
    "b.ii": { selected: ["p1"] },
    c: { rows: 2, cols: 2, cells: ["0", "1", "1", "0"] },
    d: { rows: 2, cols: 2, cells: ["-1", "0", "0", "1"] }, // MN вместо NM
  };

  let scored = 0;
  for (const p of parts) {
    const r = await student.json(`/api/attempts/${hw.body.attempt_id}/parts/${p.id}`, {
      method: "POST",
      body: JSON.stringify({ answer_type: p.answer_type, value: ANSWERS[p.path] }),
    });
    scored += r.body.marks_awarded ?? 0;
  }
  check(scored === 6, "частичный зачёт посчитан", `${scored} из 8`);

  const steal = await outsider.json(`/api/attempts/${hw.body.attempt_id}/parts/${parts[0].id}`, {
    method: "POST",
    body: JSON.stringify({ answer_type: "mcq", value: { selected: ["o1"] } }),
  });
  check(steal.status === 404, "чужая попытка не пишется и выглядит отсутствующей");

  console.log("\n5. Разбор: правило считается по контексту попытки");
  const hwSolution = await student.json(
    `/api/items/${SLUG}/solution?attempt_id=${hw.body.attempt_id}`,
  );
  check(
    hwSolution.status === 403 && hwSolution.body.error === "LOCKED_UNTIL_DUE",
    "разбор в домашке закрыт до дедлайна",
  );

  // Тот же ученик, та же задача, но свободная практика.
  const practice = await student.json("/api/attempts", {
    method: "POST",
    body: JSON.stringify({ slug: SLUG }),
  });
  const practiceSolution = await student.json(
    `/api/items/${SLUG}/solution?attempt_id=${practice.body.attempt_id}`,
  );
  check(practiceSolution.status === 200, "разбор в свободной практике открыт");

  const recheck = await student.json(
    `/api/items/${SLUG}/solution?attempt_id=${hw.body.attempt_id}`,
  );
  check(
    recheck.status === 403,
    "домашка ОСТАЛАСЬ закрытой после открытия разбора в практике",
    "это и есть то правило, ради которого гейт смотрит на попытку, а не на задачу",
  );

  console.log("\n6. Дедлайн прошёл — разбор открывается");
  await q(`update assignment set due_at = now() - interval '1 hour' where id = $1`, [assignmentId]);
  const afterDue = await student.json(
    `/api/items/${SLUG}/solution?attempt_id=${hw.body.attempt_id}`,
  );
  check(
    afterDue.status === 200 && afterDue.body.reason === "PAST_DUE",
    "после дедлайна разбор открыт",
    `${afterDue.body.steps?.length ?? 0} шагов`,
  );

  console.log("\n7. Журнал учителя");
  const gradebook = await q(
    `select u.display_name,
            (select coalesce(sum(pr.marks_awarded), 0)::int
               from attempt at join part_response pr on pr.attempt_id = at.id
               where at.assignment_id = $1 and at.student_id = u.id) as scored
     from enrolment e join app_user u on u.id = e.student_id
     where e.class_id = $2 order by u.display_name`,
    [assignmentId, created.body.id],
  );
  for (const r of gradebook) console.log(`     ${r.display_name.padEnd(22)} ${r.scored}/8`);
  check(gradebook.some((r) => r.scored === 6), "баллы ученика видны учителю");

  console.log(
    failures === 0 ? "\n✓ учебный цикл проходит целиком" : `\n✗ провалов: ${failures}`,
  );
  if (failures) process.exitCode = 1;
});
