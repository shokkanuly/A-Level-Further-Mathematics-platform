"use client";

import { useRef, useState } from "react";
// Из грейдера сюда приезжают только тексты: код ошибки приходит с сервера,
// формулировка живёт в справочнике и переписывается без пересчёта попыток (§4.2).
import { FEEDBACK_TEXT_RU } from "@/lib/grade.mjs";
import { steps as nSteps } from "@/lib/plural";
import { markKind } from "@/lib/concept-color";

export type ClientPart = {
  id: string;
  path: string;
  label: string;
  nested: boolean;
  text_html: string;
  marks: number | null;
  answer_type: string | null;
  options?: { id: string; html: string }[];
  rows?: number;
  cols?: number;
};

type Verdict = { marks_awarded: number; part_marks: number; feedback_code: string };
type Step = {
  path: string;
  mark_code: string;
  marks_covered: number;
  text_html: string;
  locale: string;
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const feedbackText = (code: string): string =>
  (FEEDBACK_TEXT_RU as Record<string, string>)[code] ?? code;

export function AnswerSheet({
  slug,
  parts,
  totalMarks,
  stemHtml,
  locale,
  assignmentId = null,
  canAnswer = true,
}: {
  slug: string;
  parts: ClientPart[];
  totalMarks: number;
  stemHtml: string;
  locale: string;
  /** Задан — попытка создаётся в контексте домашки, и разбор решает сервер. */
  assignmentId?: string | null;
  canAnswer?: boolean;
}) {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [stepsError, setStepsError] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const answerable = parts.filter((p) => p.answer_type);
  const scored = Object.values(verdicts).reduce((a, v) => a + v.marks_awarded, 0);

  /** Попытка создаётся лениво — при первом отправленном ответе, не при открытии. */
  async function ensureAttempt(): Promise<string> {
    if (attemptId) return attemptId;
    const res = await fetch("/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, assignment_id: assignmentId }),
    });
    const data = await res.json();
    setAttemptId(data.attempt_id);
    return data.attempt_id;
  }

  async function submit(part: ClientPart) {
    if (!part.answer_type) return;
    setBusy(part.id);
    try {
      const id = await ensureAttempt();
      const res = await fetch(`/api/attempts/${id}/parts/${part.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Полиморфный конверт из §8: оболочка одна, форма value зависит от типа.
        body: JSON.stringify({
          answer_type: part.answer_type,
          value: values[part.id] ?? null,
          client_version: "stage1",
        }),
      });
      const data = await res.json();
      setVerdicts((v) => ({
        ...v,
        [part.id]: res.ok
          ? {
              marks_awarded: data.marks_awarded,
              part_marks: data.part_marks,
              feedback_code: data.feedback_code,
            }
          : {
              marks_awarded: 0,
              part_marks: part.marks ?? 0,
              feedback_code: data.error ?? "ERROR",
            },
      }));
    } finally {
      setBusy(null);
    }
  }

  async function loadSolution() {
    setStepsError(null);
    const params = new URLSearchParams({ locale });
    if (attemptId) params.set("attempt_id", attemptId);
    params.set("board", new URLSearchParams(window.location.search).get("board") ?? "edexcel");

    const res = await fetch(`/api/items/${slug}/solution?${params}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStepsError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    setSteps((await res.json()).steps);
  }

  const chipState = (part: ClientPart) => {
    const v = verdicts[part.id];
    if (!v) return "todo";
    if (v.marks_awarded === v.part_marks) return "ok";
    if (v.marks_awarded > 0) return "partial";
    return "bad";
  };

  return (
    <>
      {/* навигатор по пунктам: видно, где потеряны баллы, не пролистывая лист */}
      <div className="navigator">
        {answerable.map((p) => (
          <button
            key={p.id}
            className="nav-chip"
            data-state={chipState(p)}
            onClick={() =>
              cardRefs.current[p.id]?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            aria-label={`Пункт ${p.path}`}
          >
            {p.path}
          </button>
        ))}
        <div className="navigator-score">
          <div className="score-bar">
            <i style={{ width: `${(scored / totalMarks) * 100}%` }} />
          </div>
          <span className="score-num">
            {scored} / {totalMarks}
          </span>
        </div>
      </div>

      <div className="stem-card" dangerouslySetInnerHTML={{ __html: stemHtml }} />

      {parts.map((part) => {
        const isContainer = !part.answer_type;
        const v = verdicts[part.id];
        const verdictState = !v ? undefined : v.marks_awarded === v.part_marks ? "ok" : "bad";

        return (
          <div
            key={part.id}
            className="part-card"
            data-container={isContainer}
            data-nested={part.nested}
            ref={(el) => {
              cardRefs.current[part.id] = el;
            }}
          >
            <div className="part-head">
              <span className="part-badge">{part.path}</span>
              <div className="part-text" dangerouslySetInnerHTML={{ __html: part.text_html }} />
              {part.marks !== null && <span className="part-marks">[{part.marks}]</span>}
            </div>

            {part.answer_type === "mcq" && (
              <div className="options" role="radiogroup">
                {part.options?.map((o, i) => {
                  const selected =
                    (values[part.id] as { selected?: string[] })?.selected?.[0] === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className="option"
                      data-selected={selected}
                      // Верным подсвечивается только выбранный вариант: сервер
                      // не сообщает, какой из остальных правильный, и это не
                      // недоделка — иначе ключ утекает первым же кликом.
                      data-verdict={selected ? verdictState : undefined}
                      disabled={busy === part.id}
                      onClick={() =>
                        setValues((s) => ({ ...s, [part.id]: { selected: [o.id] } }))
                      }
                    >
                      <span className="option-letter">{LETTERS[i]}</span>
                      <span
                        className="option-body"
                        dangerouslySetInnerHTML={{ __html: o.html }}
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {part.answer_type === "matrix" && (
              <MatrixInput
                rows={part.rows ?? 2}
                cols={part.cols ?? 2}
                value={values[part.id] as MatrixValue | undefined}
                verdict={verdictState}
                onChange={(val) => setValues((s) => ({ ...s, [part.id]: val }))}
              />
            )}

            {part.answer_type && (
              <div className="actions">
                <button
                  className="btn btn-sm"
                  disabled={!canAnswer || busy === part.id || values[part.id] === undefined}
                  onClick={() => submit(part)}
                  title={canAnswer ? undefined : "Войдите, чтобы отвечать"}
                >
                  {busy === part.id ? "Проверяю…" : v ? "Проверить снова" : "Ответить"}
                </button>
                {v && (
                  <div className="verdict" data-ok={v.marks_awarded === v.part_marks}>
                    <span className="verdict-score">
                      {v.marks_awarded} / {v.part_marks}
                    </span>
                    <span className="verdict-msg">{feedbackText(v.feedback_code)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="actions" style={{ marginTop: 20 }}>
        <button className="btn btn-ghost" onClick={loadSolution}>
          {steps ? "Обновить разбор" : "Показать разбор"}
        </button>
        {attemptId && (
          <span className="score-num" style={{ marginLeft: "auto" }}>
            попытка {attemptId.slice(0, 8)}
          </span>
        )}
      </div>

      {stepsError && (
        <div className="locked">
          <strong style={{ fontWeight: 500, color: "var(--fg)" }}>Разбор закрыт</strong>
          <span>
            {stepsError} — решение принимает сервер, а не интерфейс.
          </span>
        </div>
      )}

      {steps && (
        <div className="solution">
          <div className="solution-head">
            <span className="solution-title">Схема оценивания</span>
            <span className="solution-sub">
              {nSteps(steps.length)} · {locale}
            </span>
          </div>
          <div className="solution-body">
            {steps.map((s, i) => (
              <div className="step" key={i}>
                <span className="step-path">{s.path}</span>
                <div className="step-text" dangerouslySetInnerHTML={{ __html: s.text_html }} />
                {/* Цвет кода несёт смысл: метод, точность и независимый балл —
                    разные вещи, и схема читается быстрее, когда это видно. */}
                <span className="step-code" data-kind={markKind(s.mark_code)}>
                  {s.mark_code}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

type MatrixValue = { rows: number; cols: number; cells: string[] };

function MatrixInput({
  rows,
  cols,
  value,
  verdict,
  onChange,
}: {
  rows: number;
  cols: number;
  value?: MatrixValue;
  verdict?: "ok" | "bad";
  onChange: (v: MatrixValue) => void;
}) {
  const cells = value?.cells ?? Array(rows * cols).fill("");

  return (
    <div className="matrix" data-verdict={verdict}>
      <span className="matrix-bracket" data-side="left" aria-hidden />
      <div className="matrix-cells" style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}>
        {cells.map((c, i) => (
          <input
            key={i}
            inputMode="text"
            autoComplete="off"
            value={c}
            aria-label={`строка ${Math.floor(i / cols) + 1}, столбец ${(i % cols) + 1}`}
            onChange={(e) => {
              const next = [...cells];
              next[i] = e.target.value;
              onChange({ rows, cols, cells: next });
            }}
          />
        ))}
      </div>
      <span className="matrix-bracket" data-side="right" aria-hidden />
    </div>
  );
}
