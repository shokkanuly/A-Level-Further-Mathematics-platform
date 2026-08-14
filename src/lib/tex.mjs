import katex from "katex";

/**
 * Рендер условия и разборов (SYSTEM-DESIGN §11).
 *
 * Математика уезжает в HTML на сервере, а не собирается в браузере: версия
 * задачи неизменяема, значит кэшируется по ключу item_id + version, а публичные
 * страницы тем — это SEO-канал и обязаны отдаваться готовыми.
 *
 * Модуль plain-JS по той же причине, что и грейдер: его импортирует и Next,
 * и скрипт валидации банка. Проверять LaTeX тем же кодом, что и рендерит,
 * а не похожим — иначе «у автора собралось, на странице сломалось».
 *
 * Разметка — намеренно узкое подмножество: только $…$ и $$…$$. Полноценный
 * markdown приезжает вместе с авторским редактором.
 */

const escapeHtml = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const MATH = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

/**
 * Обход строки с разделением на «текст» и «формула».
 *
 * Вынесен отдельно, потому что оформление текстовых кусков различается:
 * в условии задачи перенос строки — это <br>, а в разборе абзацы и списки
 * разбираются блочно уровнем выше. Математика в обоих случаях одна и та же,
 * и второй реализации у неё быть не должно.
 *
 * @param {string} src
 * @param {Record<string,string>} macros
 * @param {boolean} throwOnError
 * @param {(text: string) => string} onText  что делать с экранированным текстом
 */
function walk(src, macros, throwOnError, onText) {
  let out = "";
  let cursor = 0;
  MATH.lastIndex = 0;

  let m;
  while ((m = MATH.exec(src)) !== null) {
    out += onText(escapeHtml(src.slice(cursor, m.index)));
    const displayMode = m[1] !== undefined;
    const tex = displayMode ? m[1] : m[2];
    out += katex.renderToString(tex, {
      displayMode,
      throwOnError,
      strict: false,
      // KaTeX дописывает в объект макросов результаты \gdef — отдаём копию,
      // иначе профиль комиссии начнёт мутировать между запросами.
      macros: { ...macros },
    });
    cursor = m.index + m[0].length;
  }

  out += onText(escapeHtml(src.slice(cursor)));
  return out;
}

/**
 * @param {string} src
 * @param {Record<string,string>} [macros]
 * @param {boolean} [throwOnError] true в валидаторе банка, false в рендере
 * @returns {string}
 */
export function renderTex(src, macros = {}, throwOnError = false) {
  return walk(src, macros, throwOnError, (t) => t.replace(/\n/g, "<br>"));
}

// Инлайновая разметка разбора. Применяется только к УЖЕ экранированному
// тексту между формулами — внутрь вывода KaTeX не попадает никогда,
// иначе звёздочка из \ast однажды превратилась бы в <em>.
const inlineMarkup = (t) =>
  t
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(«—])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

/**
 * Разбор задачи: связный текст с абзацами, списками и формулами (008).
 *
 * Намеренно не полный markdown, а ровно то, чем пишут разбор: абзац,
 * жирный, курсив, маркированный список. Заголовки и таблицы сюда не
 * приезжают — разбор на пять экранов с оглавлением означает, что задачу
 * надо было разбить на несколько.
 *
 * @param {string} src
 * @param {Record<string,string>} [macros]
 * @param {boolean} [throwOnError]
 * @returns {string}
 */
export function renderRich(src, macros = {}, throwOnError = false) {
  if (!src) return "";

  // Блоки разделяются пустой строкой. Формулы $$…$$ на отдельных строках
  // при этом не рвутся: внутри них пустых строк не бывает.
  return src
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const isList = lines.every((l) => /^\s*[-•]\s+/.test(l));

      if (isList) {
        const items = lines
          .map((l) => l.replace(/^\s*[-•]\s+/, ""))
          .map((l) => `<li>${walk(l, macros, throwOnError, inlineMarkup)}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }

      // Одиночный перенос внутри абзаца — это перенос в ИСХОДНИКЕ, а не
      // в тексте: автор просто уложился в 80 колонок. Поэтому он склеивается
      // пробелом, а не превращается в <br>, как в условии задачи, где перенос
      // ставят намеренно. Абзац отбивается пустой строкой.
      return `<p>${walk(block, macros, throwOnError, (t) =>
        inlineMarkup(t).replace(/\n/g, " "),
      )}</p>`;
    })
    .join("");
}

/**
 * Профиль по умолчанию — для текстов ВНЕ контекста комиссии: объявлений,
 * конспектов, описаний событий.
 *
 * У них нет и не может быть комиссии: объявление адресовано классу, а класс
 * не привязан к Edexcel. Но учитель, который весь день пишет \vect в задачах,
 * напишет его и в объявлении — и без этого набора получит красную ошибку
 * KaTeX вместо формулы.
 *
 * Значения совпадают с профилем Edexcel: это самая распространённая запись,
 * и там, где комиссия известна, её профиль всё равно перекрывает этот.
 */
export const DEFAULT_MACROS = {
  "\\vect": "\\mathbf{#1}",
  "\\conj": "#1^*",
};

/**
 * Профиль комиссии → макросы KaTeX. Автор пишет \vect{a} ровно один раз (§3.3).
 * @param {Record<string,string>|null|undefined} boardProfile
 * @param {Record<string,string>|null} [itemOverride]
 * @returns {Record<string,string>}
 */
export function macrosFor(boardProfile, itemOverride) {
  return { ...(boardProfile ?? {}), ...(itemOverride ?? {}) };
}
