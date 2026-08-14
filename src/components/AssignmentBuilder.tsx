"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ItemCard } from "@/lib/queries";
import { parts as nParts, items as nItems, marks as nMarks } from "@/lib/plural";

/**
 * Сборка набора и выдача классу.
 *
 * §5: solutions_locked_until_due включён по умолчанию. Пошаговый разбор рядом
 * с полем ответа делает домашку бессмысленной, поэтому «открыть сразу» —
 * осознанное действие учителя, а не значение по умолчанию.
 */
export function AssignmentBuilder({ classId, bank }: { classId: string; bank: ItemCard[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [lockSolutions, setLockSolutions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalMarks = bank
    .filter((b) => picked.includes(b.slug))
    .reduce((a, b) => a + b.total_marks, 0);

  function toggle(slug: string) {
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));
  }

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        class_id: classId,
        title,
        due_at: due ? new Date(due).toISOString() : null,
        item_slugs: picked,
        settings: { solutions_locked_until_due: lockSolutions },
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Не получилось");
      return;
    }
    setTitle("");
    setDue("");
    setPicked([]);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)} style={{ marginBottom: 8 }}>
        + Выдать домашку
      </button>
    );
  }

  return (
    <div className="builder">
      <div className="builder-row">
        <div className="field" style={{ flex: 2, marginBottom: 0 }}>
          <label htmlFor="a-title">Название</label>
          <input
            id="a-title"
            autoFocus
            placeholder="Домашка на неделю: матрицы"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="a-due">Дедлайн</label>
          <input
            id="a-due"
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={lockSolutions}
          onChange={(e) => setLockSolutions(e.target.checked)}
        />
        <span>
          Закрыть разбор до дедлайна
          <em>Проверяется на сервере, а не в интерфейсе.</em>
        </span>
      </label>

      <div className="builder-label">Задачи из банка</div>
      {bank.length === 0 ? (
        <div className="empty">В банке пока пусто.</div>
      ) : (
        <div className="pick-list">
          {bank.map((b) => (
            <button
              key={b.slug}
              type="button"
              className="pick-row"
              data-on={picked.includes(b.slug)}
              onClick={() => toggle(b.slug)}
            >
              <span className="pick-box" aria-hidden>
                {picked.includes(b.slug) ? "✓" : ""}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="pick-title">{b.title_ru}</span>
                <span className="pick-meta">
                  {b.spec_points.join(" · ")} · {nParts(b.part_count)}
                </span>
              </span>
              <span className="chip chip-marks">{b.total_marks}</span>
            </button>
          ))}
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="actions">
        <button
          className="btn"
          disabled={busy || title.trim().length < 2 || picked.length === 0}
          onClick={create}
        >
          {busy ? "Выдаю…" : `Выдать классу · ${nItems(picked.length)}, ${nMarks(totalMarks)}`}
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
    </div>
  );
}
