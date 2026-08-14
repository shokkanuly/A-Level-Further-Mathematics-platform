// Сквозной прогон Stage 1 по HTTP — тем же контрактом, что дёргает интерфейс.
//
// Требует поднятого приложения: npm run dev

import { withPool } from "../db/client.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SLUG = "cp1-matrix-transformations-of-the-plane";

const M = (cells) => ({ rows: 2, cols: 2, cells });

// Смесь верного и неверного: частичный зачёт должен быть виден, а не выведен.
const ANSWERS = {
  "a":    { type: "mcq",    value: { selected: ["o2"] },        note: "перепутано направление поворота" },
  "b.i":  { type: "matrix", value: M(["-1", "0", "0", "-1"]),   note: "верно" },
  "b.ii": { type: "mcq",    value: { selected: ["p1"] },        note: "верно" },
  "c":    { type: "matrix", value: M(["0", "1", "1", "0"]),     note: "верно" },
  "d":    { type: "matrix", value: M(["-1", "0", "0", "1"]),    note: "посчитано MN вместо NM" },
};

/** Попытки авторизованные (§10): сначала вход, дальше с cookie. */
let cookie = "";
async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) },
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    if (pair.startsWith("fm_session=")) cookie = pair;
  }
  return res;
}

await withPool(async (pool) => {
  const login = await api("/api/auth", {
    method: "POST",
    body: JSON.stringify({
      action: "login",
      email: "student@example.com",
      password: "password123",
    }),
  });
  if (!login.ok) throw new Error(`вход не удался → ${login.status}. Запустите npm run db:seed`);

  const parts = (
    await pool.query(
      `select p.id, p.path, p.marks
       from item_part p
       join item_version iv on iv.id = p.item_version_id and iv.status = 'published'
       join item i on i.id = iv.item_id
       where i.slug = $1 and p.marks is not null
       order by p.position`,
      [SLUG],
    )
  ).rows;

  if (parts.length === 0) throw new Error("Задача не найдена. npm run db:seed");

  const attemptRes = await api("/api/attempts", {
    method: "POST",
    body: JSON.stringify({ slug: SLUG }),
  });
  if (!attemptRes.ok) throw new Error(`POST /api/attempts → ${attemptRes.status}`);
  const { attempt_id } = await attemptRes.json();
  console.log("attempt:", attempt_id, "\n");

  let scored = 0;
  let possible = 0;
  for (const p of parts) {
    const a = ANSWERS[p.path];
    const res = await api(`/api/attempts/${attempt_id}/parts/${p.id}`, {
      method: "POST",
      body: JSON.stringify({
        answer_type: a.type,
        value: a.value,
        client_version: "walkthrough",
      }),
    });
    const data = await res.json();
    scored += data.marks_awarded;
    possible += p.marks;
    const mark = data.marks_awarded === p.marks ? "✓" : "·";
    console.log(
      `  ${mark} (${p.path})`.padEnd(12),
      `${data.marks_awarded}/${p.marks}`.padEnd(6),
      data.feedback_code.padEnd(24),
      a.note,
    );
  }
  console.log(`\n  итог: ${scored}/${possible}`);

  // Разбор: в свободной практике открыт, в назначении решает сервер.
  const sol = await api(
    `/api/items/${SLUG}/solution?locale=ru&board=edexcel&attempt_id=${attempt_id}`,
  );
  const solData = await sol.json();
  console.log(
    `\n  GET solution → ${sol.status} ${solData.reason ?? solData.error}, шагов: ${solData.steps?.length ?? 0}`,
  );

  // Ключи не должны уезжать на клиент вместе с условием: id вариантов нужны
  // для отправки ответа и приезжать обязаны, а вот какой из них верный —
  // и содержимое матричных ключей — нет.
  const page = await api(`/item/${SLUG}?board=edexcel`).then((r) => r.text());
  const keys = (
    await pool.query(
      `select p.path, p.answer_spec
       from item_part p
       join item_version iv on iv.id = p.item_version_id and iv.status = 'published'
       join item i on i.id = iv.item_id
       where i.slug = $1 and p.answer_spec is not null`,
      [SLUG],
    )
  ).rows;

  const leaks = [];
  if (page.includes('"correct"')) leaks.push("поле correct");
  if (page.includes('"common_errors"')) leaks.push("поле common_errors");
  for (const k of keys) {
    const spec = k.answer_spec;
    if (spec.correct) {
      // сам факт наличия id варианта — не утечка; утечка — если он помечен верным
      const marked = JSON.stringify(spec.correct);
      if (page.includes(marked)) leaks.push(`(${k.path}): отмеченный верным ${marked}`);
    }
    if (spec.cells) {
      const cells = JSON.stringify(spec.cells);
      if (page.includes(cells)) leaks.push(`(${k.path}): ключ матрицы ${cells}`);
    }
    for (const e of spec.common_errors ?? []) {
      const blob = JSON.stringify(e);
      if (page.includes(blob)) leaks.push(`(${k.path}): описание типовой ошибки`);
    }
  }

  console.log(
    leaks.length === 0
      ? `  ✓ ключей ответов в HTML нет (проверено частей: ${keys.length})`
      : `  ✗ УТЕЧКА КЛЮЧА: ${leaks.join("; ")}`,
  );
  if (leaks.length) process.exitCode = 1;
});
