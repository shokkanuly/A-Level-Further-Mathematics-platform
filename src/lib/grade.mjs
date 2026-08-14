// Грейдеры (SYSTEM-DESIGN §4.2).
//
// Единый интерфейс, одна реализация на answer_type. Модуль намеренно plain-JS
// и без единого импорта: его одинаково подключают и route handler Next.js,
// и скрипт пересчёта на голом node. Одна реализация — один результат.
//
// Частичный зачёт здесь ПОПАРТОВЫЙ, а не внутрипартовый: из финальной матрицы
// не видно метода, поэтому балл за часть выдаётся целиком или не выдаётся.
// «Ученик взял 8 из 12» набирается по частям, и видно, на каких он потерял.

/** Меняется при любом изменении логики: по нему пересчёт находит, что переигрывать. */
export const GRADER_VERSION = "1.0.0";

export const FEEDBACK = {
  CORRECT: "CORRECT",
  EMPTY: "EMPTY_RESPONSE",
  UNSUPPORTED_TYPE: "UNSUPPORTED_ANSWER_TYPE",
  MCQ_INCORRECT: "MCQ_INCORRECT",
  MATRIX_WRONG_DIMENSIONS: "MATRIX_WRONG_DIMENSIONS",
  MATRIX_UNPARSEABLE: "MATRIX_UNPARSEABLE_ENTRY",
  MATRIX_INCORRECT: "MATRIX_INCORRECT",
  NUMERIC_UNPARSEABLE: "NUMERIC_UNPARSEABLE",
  NUMERIC_INCORRECT: "NUMERIC_INCORRECT",
};

// ── точная арифметика ───────────────────────────────────────────────────────
// Матричные ответы Core Pure — целые и рациональные. Сравнивать их через
// float значит однажды не зачесть верный ответ, а ложный отказ здесь
// самый дорогой баг (§13).

function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * Приводит запись числа к канонической строке "n" или "n/d".
 * Понимает целые, десятичные и обыкновенные дроби. Иначе — null.
 * @returns {string|null}
 */
export function canonicalRational(input) {
  if (input === null || input === undefined) return null;
  const t = String(input)
    .replace(/\s+/g, "")
    .replace(/[−‒–—]/g, "-") // типографские минусы
    .replace(/,/g, ".");
  if (t === "") return null;

  let num, den;
  const frac = t.match(/^([+-]?\d+)\/([+-]?\d+)$/);
  const dec = t.match(/^([+-]?)(\d*)(?:\.(\d+))?$/);

  if (frac) {
    num = BigInt(frac[1]);
    den = BigInt(frac[2]);
  } else if (dec && (dec[2] !== "" || dec[3])) {
    const sign = dec[1] === "-" ? -1n : 1n;
    const whole = dec[2] === "" ? "0" : dec[2];
    const frn = dec[3] ?? "";
    num = sign * BigInt(whole + frn);
    den = 10n ** BigInt(frn.length);
  } else {
    return null;
  }

  if (den === 0n) return null;
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den) || 1n;
  num /= g;
  den /= g;
  return den === 1n ? String(num) : `${num}/${den}`;
}

// ── грейдеры по типам ───────────────────────────────────────────────────────

function gradeMcq(value, spec, marks) {
  const selected = Array.isArray(value?.selected) ? value.selected.map(String) : [];
  if (selected.length === 0) return { marks_awarded: 0, feedback_code: FEEDBACK.EMPTY };

  const correct = (spec.correct ?? []).map(String);
  const same =
    selected.length === correct.length && correct.every((c) => selected.includes(c));

  if (same) return { marks_awarded: marks, feedback_code: FEEDBACK.CORRECT };

  // Диагностика конкретной типовой ошибки, если автор её описал.
  const hit = (spec.common_errors ?? []).find(
    (e) =>
      Array.isArray(e.selected) &&
      e.selected.length === selected.length &&
      e.selected.map(String).every((c) => selected.includes(c)),
  );
  return {
    marks_awarded: 0,
    feedback_code: hit?.feedback_code ?? FEEDBACK.MCQ_INCORRECT,
  };
}

function gradeMatrix(value, spec, marks) {
  const rows = Number(value?.rows);
  const cols = Number(value?.cols);
  const cells = Array.isArray(value?.cells) ? value.cells : [];

  if (cells.length === 0 || cells.every((c) => String(c ?? "").trim() === "")) {
    return { marks_awarded: 0, feedback_code: FEEDBACK.EMPTY };
  }
  if (rows !== spec.rows || cols !== spec.cols || cells.length !== rows * cols) {
    return { marks_awarded: 0, feedback_code: FEEDBACK.MATRIX_WRONG_DIMENSIONS };
  }

  const given = cells.map(canonicalRational);
  if (given.some((c) => c === null)) {
    return { marks_awarded: 0, feedback_code: FEEDBACK.MATRIX_UNPARSEABLE };
  }

  const expected = spec.cells.map(canonicalRational);
  if (given.every((c, i) => c === expected[i])) {
    return { marks_awarded: marks, feedback_code: FEEDBACK.CORRECT };
  }

  // Типовые ошибки: например, MN вместо NM — перепутанный порядок умножения.
  for (const e of spec.common_errors ?? []) {
    if (!Array.isArray(e.cells) || e.cells.length !== given.length) continue;
    const alt = e.cells.map(canonicalRational);
    if (given.every((c, i) => c === alt[i])) {
      return { marks_awarded: 0, feedback_code: e.feedback_code };
    }
  }

  return { marks_awarded: 0, feedback_code: FEEDBACK.MATRIX_INCORRECT };
}

function gradeNumeric(value, spec, marks) {
  const raw = String(value?.text ?? "").trim();
  if (raw === "") return { marks_awarded: 0, feedback_code: FEEDBACK.EMPTY };

  const got = Number(raw.replace(",", "."));
  if (!Number.isFinite(got)) {
    return { marks_awarded: 0, feedback_code: FEEDBACK.NUMERIC_UNPARSEABLE };
  }
  const want = Number(spec.value);
  const tol = spec.tolerance ?? 0;
  const ok =
    spec.tolerance_type === "relative"
      ? Math.abs(got - want) <= Math.abs(want) * tol
      : Math.abs(got - want) <= tol;

  return ok
    ? { marks_awarded: marks, feedback_code: FEEDBACK.CORRECT }
    : { marks_awarded: 0, feedback_code: FEEDBACK.NUMERIC_INCORRECT };
}

/** Типы, которые уходят в CAS или в очередь учителя — Stage 4 и Stage 9. */
const DEFERRED = new Set([
  "symbolic",
  "complex",
  "set",
  "interval",
  "ordered_list",
  "structured_proof",
  "handwritten",
]);

/**
 * @param {any}    value  сырой ответ ученика (jsonb-совместимый)
 * @param {{answer_type: string, answer_spec: any, marks: number}} part
 * @returns {{marks_awarded: number, feedback_code: string, grader_version: string,
 *            per_criterion: null}}
 */
export function grade(value, part) {
  const { answer_type: type, answer_spec: spec, marks } = part;

  let result;
  switch (type) {
    case "mcq":
      result = gradeMcq(value, spec, marks);
      break;
    case "matrix":
      result = gradeMatrix(value, spec, marks);
      break;
    case "numeric":
      result = gradeNumeric(value, spec, marks);
      break;
    default:
      // Явный отказ вместо тихого нуля: неподдержанный тип обязан быть видимым.
      result = {
        marks_awarded: 0,
        feedback_code: DEFERRED.has(type)
          ? FEEDBACK.UNSUPPORTED_TYPE
          : FEEDBACK.UNSUPPORTED_TYPE,
      };
  }

  return { ...result, per_criterion: null, grader_version: GRADER_VERSION };
}

/** Тексты живут отдельно от кодов — переписать формулировку можно без пересчёта. */
export const FEEDBACK_TEXT_RU = {
  CORRECT: "Верно.",
  EMPTY_RESPONSE: "Ответ не заполнен.",
  UNSUPPORTED_ANSWER_TYPE: "Этот тип ответа пока проверяет человек.",
  MCQ_INCORRECT: "Неверный вариант.",
  MATRIX_WRONG_DIMENSIONS: "Не тот размер матрицы.",
  MATRIX_UNPARSEABLE_ENTRY: "Одна из ячеек не распознана как число.",
  MATRIX_INCORRECT: "Матрица неверна.",
  NUMERIC_UNPARSEABLE: "Ответ не распознан как число.",
  NUMERIC_INCORRECT: "Неверное значение.",
  MATRIX_ORDER_SWAPPED:
    "Это произведение MN. Порядок важен: «T, затем N» — это NM.",
  MCQ_ROTATION_DIRECTION:
    "Направление поворота обратное: проверьте образ вектора (1, 0).",
};
