"use client";

import { useMemo, useState } from "react";

/**
 * Форма автора (§9, ARCHITECTURE §1).
 *
 * Форма НЕ решает, можно ли публиковать. Она умеет только собрать структуру
 * и показать заранее то, что всё равно скажет SQL. Список проблем на экране
 * приходит с сервера из item_version_problems() — здесь нет ни одной копии
 * правила публикации, и добавлять её нельзя: разойдясь, копия разрешит то,
 * что база запретит, и наоборот.
 *
 * Единственное, что форма делает сама, — не даёт ввести заведомую чушь
 * (баллы буквами) и считает сумму баллов, чтобы автор видел расхождение
 * до отправки, а не после.
 */

export type ConceptOption = { slug: string; name_ru: string; parent_name: string | null };
export type KindOption = {
  id: string;
  name_ru: string;
  description_ru: string;
  requires_explanation: boolean;
};

type Step = { code: string; marks: number; ru: string };
type Part = {
  key: string;
  path: string;
  label: string;
  text_md: string;
  answer_type: string;
  marks: number;
  options: { id: string; text_md: string }[];
  correct: string[];
  numeric_value: string;
  tolerance: string;
  steps: Step[];
};

type Problem = { code: string; detail: string };

const MARK_CODES = ["M1", "A1", "B1", "dM1", "dA1", "ft", "cso", "cao", "E1"];

let seq = 0;
const newKey = () => `p${++seq}`;

const emptyPart = (path: string): Part => ({
  key: newKey(),
  path,
  label: path,
  text_md: "",
  answer_type: "numeric",
  marks: 1,
  options: [
    { id: "o1", text_md: "" },
    { id: "o2", text_md: "" },
  ],
  correct: ["o1"],
  numeric_value: "",
  tolerance: "0",
  steps: [{ code: "B1", marks: 1, ru: "" }],
});

export function ItemAuthor({
  concepts,
  kinds,
}: {
  concepts: ConceptOption[];
  kinds: KindOption[];
}) {
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState(kinds[0]?.id ?? "exam");
  const [difficulty, setDifficulty] = useState(2);
  const [stem, setStem] = useState("");
  const [explanation, setExplanation] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [parts, setParts] = useState<Part[]>([emptyPart("a")]);

  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [busy, setBusy] = useState<"validate" | "publish" | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const kindInfo = kinds.find((k) => k.id === kind);
  const needsExplanation = kindInfo?.requires_explanation ?? false;

  const totalMarks = parts.reduce((s, p) => s + (Number(p.marks) || 0), 0);
  const schemeSum = parts.map((p) => p.steps.reduce((s, st) => s + (Number(st.marks) || 0), 0));

  const conceptGroups = useMemo(() => {
    const map = new Map<string, ConceptOption[]>();
    for (const c of concepts) {
      const key = c.parent_name ?? "Разделы";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()];
  }, [concepts]);

  const patch = (key: string, next: Partial<Part>) =>
    setParts((ps) => ps.map((p) => (p.key === key ? { ...p, ...next } : p)));

  function buildPayload(action: "validate" | "publish") {
    return {
      action,
      slug: slug.trim(),
      kind,
      difficulty,
      stem_md: stem,
      explanation_md: explanation.trim() || null,
      // Первый выбранный — primary: именно он подписывает карточку в банке.
      concepts: picked,
      parts: parts.map((p) => ({
        path: p.path.trim(),
        label: p.label.trim() || p.path.trim(),
        text_md: p.text_md,
        answer_type: p.answer_type,
        marks: Number(p.marks) || 0,
        answer_spec:
          p.answer_type === "mcq"
            ? {
                options: p.options.filter((o) => o.text_md.trim()),
                correct: p.correct,
              }
            : p.answer_type === "numeric"
              ? {
                  value: Number(p.numeric_value),
                  tolerance: Number(p.tolerance) || 0,
                }
              : { value: p.numeric_value },
        steps: p.steps
          .filter((s) => s.ru.trim())
          .map((s) => ({ code: s.code, marks: Number(s.marks) || 0, ru: s.ru })),
      })),
    };
  }

  async function send(action: "validate" | "publish") {
    setBusy(action);
    setDone(null);
    try {
      const res = await fetch("/api/author", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildPayload(action)),
      });
      const data = await res.json();
      setProblems(data.problems ?? []);
      if (data.ok && action === "publish") setDone(data.slug);
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div className="empty" style={{ marginTop: 24 }}>
        <span className="empty-mark" aria-hidden>
          ✓
        </span>
        <strong>Задача опубликована</strong>
        <span>
          Она уже в банке — <a href={`/item/${done}`}>открыть</a>. Проверку прошла
          та же функция, что проверяет весь остальной банк.
        </span>
        <button
          className="btn btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => {
            setDone(null);
            setProblems(null);
            setSlug("");
            setStem("");
            setExplanation("");
            setPicked([]);
            setParts([emptyPart("a")]);
          }}
        >
          Завести ещё одну
        </button>
      </div>
    );
  }

  return (
    <div className="author">
      {/* ── шапка ───────────────────────────────────────────────────────── */}
      <div className="builder">
        <div className="builder-row">
          <label className="field" style={{ flex: 2 }}>
            <span className="builder-label">Адрес задачи</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="cp1-matrix-inverse"
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span className="builder-label">Сложность</span>
            <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="builder-label" style={{ marginTop: 4 }}>
          Вид задачи
        </div>
        <div className="kind-pick">
          {kinds.map((k) => (
            <button
              key={k.id}
              type="button"
              className="kind-option"
              data-on={kind === k.id}
              onClick={() => setKind(k.id)}
            >
              <span className="kind-name">
                {k.name_ru}
                {k.requires_explanation && <span className="kind-req">разбор обязателен</span>}
              </span>
              <span className="kind-desc">{k.description_ru}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── условие ─────────────────────────────────────────────────────── */}
      <h2 className="section-h">Условие</h2>
      <div className="builder">
        <label className="field">
          <span className="builder-label">
            Текст задачи — на английском, это язык экзамена. Формулы в $…$ и $$…$$
          </span>
          <textarea
            rows={4}
            value={stem}
            onChange={(e) => setStem(e.target.value)}
            placeholder={"The matrix $\\vect{M}$ is given by\n$$\\vect{M} = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}.$$"}
          />
        </label>

        <div className="builder-label">Темы — первая выбранная станет главной</div>
        <div className="concept-pick">
          {conceptGroups.map(([group, list]) => (
            <div key={group} className="concept-group">
              <div className="concept-group-name">{group}</div>
              <div className="facet-options">
                {list.map((c) => {
                  const i = picked.indexOf(c.slug);
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      className="facet-chip"
                      data-on={i >= 0}
                      onClick={() =>
                        setPicked((p) =>
                          p.includes(c.slug) ? p.filter((x) => x !== c.slug) : [...p, c.slug],
                        )
                      }
                    >
                      {c.name_ru}
                      {i === 0 && <span className="facet-count">главная</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── части ───────────────────────────────────────────────────────── */}
      <h2 className="section-h">
        Части <span className="chip">{totalMarks} б всего</span>
      </h2>

      {parts.map((p, idx) => {
        const covered = schemeSum[idx];
        const mismatch = covered !== Number(p.marks);
        return (
          <div className="builder" key={p.key}>
            <div className="builder-row">
              <label className="field" style={{ maxWidth: 110 }}>
                <span className="builder-label">Пункт</span>
                <input value={p.path} onChange={(e) => patch(p.key, { path: e.target.value, label: e.target.value })} />
              </label>
              <label className="field" style={{ maxWidth: 150 }}>
                <span className="builder-label">Тип ответа</span>
                <select
                  value={p.answer_type}
                  onChange={(e) => patch(p.key, { answer_type: e.target.value })}
                >
                  <option value="numeric">Число</option>
                  <option value="mcq">Выбор варианта</option>
                </select>
              </label>
              <label className="field" style={{ maxWidth: 110 }}>
                <span className="builder-label">Баллы</span>
                <input
                  type="number"
                  min={1}
                  value={p.marks}
                  onChange={(e) => patch(p.key, { marks: Number(e.target.value) })}
                />
              </label>
              {parts.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setParts((ps) => ps.filter((x) => x.key !== p.key))}
                >
                  Убрать
                </button>
              )}
            </div>

            <label className="field">
              <span className="builder-label">Вопрос пункта</span>
              <textarea
                rows={2}
                value={p.text_md}
                onChange={(e) => patch(p.key, { text_md: e.target.value })}
                placeholder="Find $\det \vect{M}$."
              />
            </label>

            {p.answer_type === "numeric" ? (
              <div className="builder-row">
                <label className="field">
                  <span className="builder-label">Верный ответ</span>
                  <input
                    value={p.numeric_value}
                    onChange={(e) => patch(p.key, { numeric_value: e.target.value })}
                    placeholder="-2"
                  />
                </label>
                <label className="field">
                  <span className="builder-label">Допуск</span>
                  <input
                    value={p.tolerance}
                    onChange={(e) => patch(p.key, { tolerance: e.target.value })}
                    placeholder="0"
                  />
                </label>
              </div>
            ) : (
              <div>
                <div className="builder-label">Варианты — отметьте верный</div>
                {p.options.map((o, oi) => (
                  <div className="option-edit" key={o.id}>
                    <button
                      type="button"
                      className="option-letter"
                      data-on={p.correct.includes(o.id)}
                      onClick={() => patch(p.key, { correct: [o.id] })}
                      aria-label="Отметить верным"
                    >
                      {String.fromCharCode(65 + oi)}
                    </button>
                    <input
                      value={o.text_md}
                      onChange={(e) =>
                        patch(p.key, {
                          options: p.options.map((x) =>
                            x.id === o.id ? { ...x, text_md: e.target.value } : x,
                          ),
                        })
                      }
                      placeholder="Вариант ответа"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    patch(p.key, {
                      options: [
                        ...p.options,
                        { id: `o${p.options.length + 1}`, text_md: "" },
                      ],
                    })
                  }
                >
                  + вариант
                </button>
              </div>
            )}

            {/* ── схема оценивания ──────────────────────────────────────── */}
            <div className="builder-label" style={{ marginTop: 14 }}>
              Схема оценивания — сумма шагов обязана равняться баллам пункта
              <span className="scheme-sum" data-bad={mismatch}>
                {covered} / {p.marks}
              </span>
            </div>

            {p.steps.map((s, si) => (
              <div className="builder-row" key={si}>
                <label className="field" style={{ maxWidth: 100 }}>
                  <select
                    value={s.code}
                    onChange={(e) =>
                      patch(p.key, {
                        steps: p.steps.map((x, i) =>
                          i === si ? { ...x, code: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    {MARK_CODES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" style={{ maxWidth: 80 }}>
                  <input
                    type="number"
                    min={0}
                    value={s.marks}
                    onChange={(e) =>
                      patch(p.key, {
                        steps: p.steps.map((x, i) =>
                          i === si ? { ...x, marks: Number(e.target.value) } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <input
                    value={s.ru}
                    onChange={(e) =>
                      patch(p.key, {
                        steps: p.steps.map((x, i) =>
                          i === si ? { ...x, ru: e.target.value } : x,
                        ),
                      })
                    }
                    placeholder="Шаг решения на русском"
                  />
                </label>
                {p.steps.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      patch(p.key, { steps: p.steps.filter((_, i) => i !== si) })
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => patch(p.key, { steps: [...p.steps, { code: "A1", marks: 1, ru: "" }] })}
            >
              + шаг
            </button>
          </div>
        );
      })}

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() =>
          setParts((ps) => [
            ...ps,
            emptyPart(String.fromCharCode(97 + ps.length)),
          ])
        }
      >
        + пункт
      </button>

      {/* ── разбор ──────────────────────────────────────────────────────── */}
      <h2 className="section-h">
        Разбор
        {needsExplanation && (
          <span className="chip" data-tone="bad">
            обязателен для вида «{kindInfo?.name_ru}»
          </span>
        )}
      </h2>
      <div className="builder">
        <label className="field">
          <span className="builder-label">
            {needsExplanation
              ? "Без разбора задачу этого вида база не опубликует — правило живёт в SQL, а не в этой форме"
              : "Не обязателен для этого вида: его работу выполняет схема оценивания"}
          </span>
          <textarea
            rows={7}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder={
              "Абзацы разделяются пустой строкой.\n\n**Жирный**, *курсив*, списки через «- ».\nФормулы — те же $…$ и $$…$$."
            }
          />
        </label>
      </div>

      {/* ── проблемы и отправка ─────────────────────────────────────────── */}
      {problems !== null && problems.length > 0 && (
        <div className="problems">
          <div className="problems-head">
            Публиковать нельзя — {problems.length}{" "}
            {problems.length === 1 ? "проблема" : "проблем"}
          </div>
          {problems.map((p, i) => (
            <div className="problem" key={i}>
              <code>{p.code}</code>
              <span>{p.detail}</span>
            </div>
          ))}
        </div>
      )}

      {problems !== null && problems.length === 0 && (
        <div className="problems" data-ok="true">
          <div className="problems-head">Проверка пройдена — задачу можно публиковать</div>
        </div>
      )}

      <div className="actions" style={{ marginTop: 18 }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => send("validate")}
          disabled={busy !== null}
        >
          {busy === "validate" ? "Проверяю…" : "Проверить"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => send("publish")}
          disabled={busy !== null}
        >
          {busy === "publish" ? "Публикую…" : "Опубликовать"}
        </button>
      </div>
    </div>
  );
}
