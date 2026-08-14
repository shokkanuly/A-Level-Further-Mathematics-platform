"use client";

import { useState } from "react";

/**
 * Панель помощника.
 *
 * Выключенное состояние — полноценное состояние, а не заглушка на скорую руку:
 * без ключа панель объясняет, чего не хватает, и не притворяется, что вот-вот
 * заработает. Кнопка при этом не активна, поэтому запрос, обречённый на отказ,
 * просто не уходит.
 */

const ERROR_TEXT: Record<string, string> = {
  AI_DISABLED: "Помощник выключен: не задан ключ ANTHROPIC_API_KEY.",
  BAD_KEY: "Ключ не принят. Проверьте ANTHROPIC_API_KEY.",
  RATE_LIMITED: "Слишком много запросов подряд. Попробуйте через минуту.",
  NO_CONNECTION: "Не удалось связаться с сервисом. Проверьте сеть.",
  REFUSED: "Помощник отказался отвечать на этот запрос.",
  EMPTY: "Пустой ответ — попробуйте переформулировать вопрос.",
  FORBIDDEN: "Недостаточно прав.",
  NOT_YOUR_STUDENT: "Этот ученик не состоит в ваших классах.",
  API_ERROR: "Сервис ответил ошибкой.",
};

type Mode =
  | { kind: "explain"; slug: string }
  | { kind: "diagnose"; studentId: string; studentName: string };

export function AiPanel({ mode, enabled }: { mode: Mode; enabled: boolean }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isTutor = mode.kind === "explain";

  async function send() {
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isTutor
            ? { action: "explain", slug: mode.slug, question }
            : { action: "diagnose", student_id: mode.studentId, question },
        ),
      });
      const data = await res.json();
      if (data.ok) setAnswer(data.text);
      else setError(ERROR_TEXT[data.error] ?? data.error ?? "Не получилось");
    } catch {
      setError("Запрос не дошёл. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai" data-off={!enabled}>
      <div className="ai-head">
        <span className="ai-mark" aria-hidden>
          AI
        </span>
        <div>
          <div className="ai-title">
            {isTutor ? "Спросить помощника" : `Разбор: ${mode.studentName}`}
          </div>
          <div className="ai-sub">
            {isTutor
              ? "Смотрит на ваши ответы по этой задаче, а не на тему вообще"
              : "Считает по попыткам ученика. Имя ученика наружу не передаётся"}
          </div>
        </div>
      </div>

      {!enabled ? (
        <div className="ai-off">
          Помощник выключен: не задан <code>ANTHROPIC_API_KEY</code>. Всё
          остальное работает как обычно — задачи, домашка и журнал помощника
          не требуют.
        </div>
      ) : (
        <>
          <textarea
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              isTutor
                ? "Например: почему в пункте (d) не тот порядок умножения?"
                : "Например: это пробел в теме или ученик просто не работал?"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
          />

          <div className="actions">
            <button className="btn btn-sm" onClick={() => void send()} disabled={busy}>
              {busy ? "Думаю…" : isTutor ? "Спросить" : "Разобрать"}
            </button>
            <span className="ai-hint">
              {isTutor
                ? "Можно без вопроса — разберёт последнюю попытку"
                : "Можно без вопроса — даст общий разбор"}
            </span>
          </div>

          {error && <div className="form-error">{error}</div>}

          {answer && (
            <div className="ai-answer">
              {/* Ответ модели рендерится как текст, а не как HTML: это внешнее
                  содержимое, и пропускать его через dangerouslySetInnerHTML
                  значило бы доверять ему разметку. Формулы остаются
                  в исходном виде — читаемо и безопасно. */}
              {answer.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
