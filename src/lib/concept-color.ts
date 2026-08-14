/**
 * Цвет семейства концептов.
 *
 * Смысл не в украшении: один и тот же концепт окрашен одинаково в банке,
 * в журнале учителя и в разборе. Ученик узнаёт «матрицы» по бирюзовому
 * раньше, чем прочитает подпись.
 *
 * Ключ — slug концепта или его родителя, поэтому подтемы наследуют цвет
 * семейства автоматически: matrix-multiplication бирюзовый, потому что
 * бирюзовые matrices.
 */

const FAMILY: Record<string, string> = {
  matrices: "matrices",
  "complex-numbers": "complex",
  vectors: "vectors",
  calculus: "calculus",
  "further-calculus": "calculus",
  series: "series",
  proof: "proof",
  induction: "proof",
  mechanics: "mechanics",
  statistics: "statistics",
  decision: "decision",
  algorithms: "decision",
  hyperbolic: "calculus",
  polar: "calculus",
  "differential-equations": "calculus",
};

const ORDER = [
  "matrices",
  "complex",
  "vectors",
  "calculus",
  "series",
  "proof",
  "mechanics",
  "statistics",
  "decision",
];

/**
 * @param slug slug концепта; подтемы вида `matrix-multiplication` находят
 *             семью по префиксу, незнакомое — по устойчивому хешу, чтобы
 *             новый концепт всё равно получил свой цвет, а не серый.
 */
export function conceptFamily(slug: string | null | undefined): string {
  if (!slug) return "matrices";
  if (FAMILY[slug]) return FAMILY[slug];

  for (const key of Object.keys(FAMILY)) {
    if (slug.startsWith(key) || key.startsWith(slug.split("-")[0])) return FAMILY[key];
  }

  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return ORDER[hash % ORDER.length];
}

/** Готовые CSS-переменные для инлайнового style — их читают .chip-concept и .bank-card. */
export function conceptStyle(slug: string | null | undefined): React.CSSProperties {
  const family = conceptFamily(slug);
  return {
    ["--concept" as string]: `var(--c-${family})`,
    ["--concept-soft" as string]: `var(--c-${family}-soft)`,
  };
}

/** M1/dM1 — метод, A1/dA1/cao/cso — точность, B1/E1 — независимый балл. */
export function markKind(code: string): "method" | "accuracy" | "independent" {
  if (/^d?M\d/.test(code)) return "method";
  if (/^(B\d|E\d)/.test(code)) return "independent";
  return "accuracy";
}
