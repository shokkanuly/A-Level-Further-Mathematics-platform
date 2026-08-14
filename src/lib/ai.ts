import Anthropic from "@anthropic-ai/sdk";
import { query, queryOne } from "./db";

/**
 * ИИ-помощник (SYSTEM-DESIGN §14 — новое).
 *
 * ТРИ ПРАВИЛА, КОТОРЫЕ ЗДЕСЬ НЕЛЬЗЯ НАРУШАТЬ.
 *
 * 1. Без ключа приложение работает. Помощник — надстройка, а не зависимость:
 *    отсутствующий ANTHROPIC_API_KEY выключает панель, но не роняет страницу
 *    и не мешает решать задачи. Проверка одна — aiEnabled().
 *
 * 2. Модель отвечает по ДАННЫМ, а не по общему знанию математики. Учителю
 *    незачем спрашивать у языковой модели, что такое дискриминант; ему нужно
 *    знать, почему конкретный ученик теряет баллы. Поэтому в промпт уходит
 *    выжимка из part_response: коды обратной связи, точность по концептам,
 *    что именно ученик ввёл. Отсюда и запрет придумывать: если данных мало,
 *    честный ответ — «мало данных».
 *
 * 3. Имена учеников наружу не уходят. Учитель и так видит имя на экране,
 *    модели оно не нужно ни для чего. Отправлять его во внешний сервис —
 *    это передача персональных данных школьника без всякой пользы.
 */

/** Ключа нет — панели помощника показываются выключенными, и это всё. */
export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

// Клиент создаётся лениво: на импорте модуля ключа может не быть вовсе.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const MODEL = "claude-opus-5";

/**
 * max_tokens на Opus 5 ограничивает размышление И ответ вместе, а размышление
 * там включено по умолчанию. Тесный лимит обрезал бы ответ на середине,
 * поэтому запас щедрый, а расход придерживает effort.
 */
const MAX_TOKENS = 16_000;

const SHARED_RULES = `
Отвечай по-русски. Математику пиши в долларах: $x^2$ для формулы в строке
и $$…$$ для выключной. Абзацы разделяй пустой строкой, жирный — **так**,
списки — через «- ».

Не выдумывай факты о человеке, которых нет в данных. Если данных мало,
так и скажи одной фразой и предложи, что посмотреть дальше.
Не подбадривай впустую и не извиняйся — говори по делу.
`.trim();

const TUTOR_PROMPT = `
Ты — репетитор по математике на учебной платформе. Отвечаешь ученику.

${SHARED_RULES}

Как объяснять:
- начинай с идеи, а не с определения: сначала «зачем это», потом «как это»;
- разбирай именно ту ошибку, которая видна в данных, а не тему вообще;
- давай один следующий шаг, а не список из десяти советов;
- если ученик ошибся в знаке или в порядке действий, покажи это на его же
  числах, а не на абстрактном примере.

Держись в пределах 250 слов. Ученику нужно понять одну вещь, а не прочитать
главу учебника.
`.trim();

const DIAGNOSIS_PROMPT = `
Ты — методист, который помогает учителю понять, где буксует ученик.
Обращаешься к учителю, не к ученику.

${SHARED_RULES}

Данные ниже — реальные попытки: коды обратной связи проверяльщика, точность
по темам, конкретные ответы. Коды означают:
- MCQ_ROTATION_DIRECTION — перепутано направление поворота;
- MATRIX_ORDER_SWAPPED — посчитано MN вместо NM, перепутан порядок умножения;
- NUMERIC_INCORRECT — неверное число;
- MATRIX_WRONG_DIMENSIONS — не тот размер матрицы;
- EMPTY_RESPONSE — ученик не ответил вовсе.

Разбор строй так:
1. **Что происходит** — одна фраза: это пробел в понимании, техническая
   ошибка или ученик просто не работал. Это три разные болезни.
2. **На чём именно видно** — сошлись на конкретные попытки и коды.
3. **Что делать на уроке** — одно-два действия, которые займут 10 минут.

Пустые ответы и низкая точность — не одно и то же: первое означает, что
ученик не открывал, второе — что не понял. Не смешивай их.

Держись в пределах 300 слов.
`.trim();

export type AiResult =
  | { ok: true; text: string }
  | { ok: false; error: string; detail?: string };

/** Один вызов модели. Все ошибки превращаются в результат, а не в исключение. */
async function ask(system: string, userContent: string): Promise<AiResult> {
  if (!aiEnabled()) {
    return { ok: false, error: "AI_DISABLED" };
  }

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // medium — золотая середина для объяснений: выше почти не улучшает
      // текст для школьника, но заметно дороже.
      output_config: { effort: "medium" },
      system,
      messages: [{ role: "user", content: userContent }],
    });

    // На отказ классификатора content приходит пустым — читать content[0]
    // без этой проверки значит однажды упасть на ровном месте.
    if (response.stop_reason === "refusal") {
      return { ok: false, error: "REFUSED" };
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return text ? { ok: true, text } : { ok: false, error: "EMPTY" };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "BAD_KEY" };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return { ok: false, error: "NO_CONNECTION" };
    }
    return { ok: false, error: "API_ERROR", detail: (err as Error).message };
  }
}

// ── сбор данных ────────────────────────────────────────────────────────────

/**
 * Что ученик сделал с конкретной задачей. Без этого помощник объясняет тему
 * вообще, а объяснять надо промах.
 */
async function attemptDigest(studentId: string, slug: string): Promise<string> {
  const rows = await query<{
    path: string;
    marks: number;
    awarded: number;
    feedback_code: string;
    raw_response: unknown;
    text_md: string;
  }>(
    `select p.path, p.marks, pr.marks_awarded as awarded, pr.feedback_code,
            pr.raw_response, p.text_md
     from attempt at
     join item_version iv on iv.id = at.item_version_id
     join item i on i.id = iv.item_id
     join part_response pr on pr.attempt_id = at.id
     join item_part p on p.id = pr.part_id
     where at.student_id = $1 and i.slug = $2
     order by at.started_at desc, p.position
     limit 12`,
    [studentId, slug],
  );

  if (rows.length === 0) return "Ученик ещё не отвечал на эту задачу.";

  return rows
    .map(
      (r) =>
        `- пункт (${r.path}): ${r.awarded} из ${r.marks} б, код «${r.feedback_code}», ` +
        `ввёл: ${JSON.stringify(r.raw_response)}`,
    )
    .join("\n");
}

async function itemDigest(slug: string): Promise<string> {
  const item = await queryOne<{
    stem_md: string;
    kind_name: string;
    concept: string;
  }>(
    `select iv.stem_md, k.name_ru as kind_name,
            (select c.name_ru from item_concept ic
              join concept c on c.id = ic.concept_id
              where ic.item_version_id = iv.id and ic.is_primary limit 1) as concept
     from item i
     join item_version iv on iv.item_id = i.id and iv.status = 'published'
     join item_kind k on k.id = iv.kind
     where i.slug = $1`,
    [slug],
  );
  if (!item) return "";
  return `Тема: ${item.concept}. Вид: ${item.kind_name}.\nУсловие:\n${item.stem_md}`;
}

/** Освоенность по темам — тот же расчёт, что в кабинете. */
async function masteryDigest(studentId: string): Promise<string> {
  const rows = await query<{ name_ru: string; earned: number; possible: number }>(
    `with latest as (
       select distinct on (at.item_version_id) at.id, at.item_version_id
       from attempt at where at.student_id = $1
       order by at.item_version_id, at.started_at desc
     )
     select c.name_ru, sum(pr.marks_awarded)::int earned, sum(p.marks)::int possible
     from latest
     join part_response pr on pr.attempt_id = latest.id
     join item_part p on p.id = pr.part_id
     join item_concept ic on ic.item_version_id = latest.item_version_id and ic.is_primary
     join concept c on c.id = ic.concept_id
     group by c.name_ru having sum(p.marks) > 0
     order by sum(pr.marks_awarded)::numeric / sum(p.marks) asc`,
    [studentId],
  );
  if (rows.length === 0) return "Решённых задач пока нет.";
  return rows
    .map((r) => `- ${r.name_ru}: ${r.earned} из ${r.possible} б`)
    .join("\n");
}

// ── публичные операции ─────────────────────────────────────────────────────

/** Ученик спрашивает по конкретной задаче. */
export async function explainForStudent(
  studentId: string,
  slug: string,
  question: string,
): Promise<AiResult> {
  const [item, attempts] = await Promise.all([
    itemDigest(slug),
    attemptDigest(studentId, slug),
  ]);

  return ask(
    TUTOR_PROMPT,
    `${item}

Что ученик уже ответил:
${attempts}

Вопрос ученика: ${question || "Объясни, где я ошибся и как решать такие задачи."}`,
  );
}

/**
 * Учитель спрашивает про ученика.
 *
 * Имя не передаётся — только цифры. Модель отвечает про «ученика»,
 * а кто это, учитель и так видит на экране.
 */
export async function diagnoseForTeacher(
  studentId: string,
  question: string,
): Promise<AiResult> {
  const mastery = await masteryDigest(studentId);

  const codes = await query<{ feedback_code: string; n: number }>(
    `select pr.feedback_code, count(*)::int as n
     from attempt at
     join part_response pr on pr.attempt_id = at.id
     where at.student_id = $1
     group by pr.feedback_code order by n desc limit 10`,
    [studentId],
  );

  const missed = await queryOne<{ n: number }>(
    `select count(*)::int as n
     from assignment a
     join enrolment e on e.class_id = a.class_id and e.student_id = $1
       and e.removed_at is null
     where a.due_at is not null and a.due_at < now()
       and not exists (
         select 1 from attempt at
         where at.assignment_id = a.id and at.student_id = $1
       )`,
    [studentId],
  );

  return ask(
    DIAGNOSIS_PROMPT,
    `Точность по темам (последняя попытка на каждой задаче):
${mastery}

Коды обратной связи по всем попыткам:
${codes.map((c) => `- ${c.feedback_code}: ${c.n}`).join("\n") || "— нет данных"}

Заданий с прошедшим сроком, к которым не притронулся: ${missed?.n ?? 0}

Вопрос учителя: ${question || "Почему этот ученик теряет баллы и что делать?"}`,
  );
}
