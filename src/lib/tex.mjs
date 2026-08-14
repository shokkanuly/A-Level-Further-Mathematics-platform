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
 * @param {string} src
 * @param {Record<string,string>} [macros]
 * @param {boolean} [throwOnError] true в валидаторе банка, false в рендере
 * @returns {string}
 */
export function renderTex(src, macros = {}, throwOnError = false) {
  let out = "";
  let cursor = 0;
  MATH.lastIndex = 0;

  let m;
  while ((m = MATH.exec(src)) !== null) {
    out += escapeHtml(src.slice(cursor, m.index)).replace(/\n/g, "<br>");
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

  out += escapeHtml(src.slice(cursor)).replace(/\n/g, "<br>");
  return out;
}

/**
 * Профиль комиссии → макросы KaTeX. Автор пишет \vect{a} ровно один раз (§3.3).
 * @param {Record<string,string>|null|undefined} boardProfile
 * @param {Record<string,string>|null} [itemOverride]
 * @returns {Record<string,string>}
 */
export function macrosFor(boardProfile, itemOverride) {
  return { ...(boardProfile ?? {}), ...(itemOverride ?? {}) };
}
