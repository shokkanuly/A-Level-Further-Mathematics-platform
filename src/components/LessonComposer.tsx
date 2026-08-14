"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Заведение урока.
 *
 * Ссылку на видео форма НЕ разбирает — это делает сервер (src/lib/video.ts).
 * Разбирать здесь означало бы завести вторую реализацию правила «что считать
 * допустимой ссылкой», и та, что в браузере, ничего не гарантирует:
 * запрос можно послать и мимо формы.
 */

type ClassOption = { id: string; name: string };
type ProgramOption = { id: string; name_ru: string };
type ConceptOption = { slug: string; name_ru: string };

const ERROR_TEXT: Record<string, string> = {
  TITLE_TOO_SHORT: "Название слишком короткое.",
  VIDEO_UNRECOGNISED:
    "Ссылка не опознана. Поддерживаются YouTube и Vimeo — вставьте адрес страницы с роликом.",
  EMPTY_LESSON: "Нужно хотя бы одно: видео или конспект.",
  NOT_YOUR_CLASS: "Это не ваш класс.",
};

export function LessonComposer({
  classes,
  programs,
  concepts,
}: {
  classes: ClassOption[];
  programs: ProgramOption[];
  concepts: ConceptOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [conspectus, setConspectus] = useState("");
  const [classId, setClassId] = useState("");
  const [programId, setProgramId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          summary_md: summary,
          video_url: videoUrl,
          conspectus_md: conspectus,
          class_id: classId || null,
          program_id: programId || null,
          concepts: picked,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(ERROR_TEXT[data.error] ?? data.error ?? "Не получилось");
        return;
      }
      router.push(`/lessons/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="actions" style={{ marginTop: 22 }}>
        <button className="btn btn-secondary" onClick={() => setOpen(true)}>
          + Завести урок
        </button>
      </div>
    );
  }

  return (
    <div className="builder" style={{ marginTop: 22 }}>
      <label className="field">
        <span className="builder-label">Название</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Матрицы как преобразования плоскости"
        />
      </label>

      <label className="field">
        <span className="builder-label">Короткое описание</span>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="О чём урок в одну строку"
        />
      </label>

      <div className="builder-row">
        <label className="field">
          <span className="builder-label">Кому</span>
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Открытый — всем</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="builder-label">Программа</span>
          <select value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">Вне программы</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name_ru}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span className="builder-label">
          Ссылка на видео — YouTube или Vimeo, любая форма адреса
        </span>
        <input
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://youtu.be/…"
          spellCheck={false}
        />
      </label>

      <label className="field">
        <span className="builder-label">
          Конспект — абзацы пустой строкой, **жирный**, списки через «- », формулы в $…$
        </span>
        <textarea
          rows={8}
          value={conspectus}
          onChange={(e) => setConspectus(e.target.value)}
          placeholder={"Матрица преобразования — это таблица образов базисных векторов.\n\n$$\\vect{M} = \\begin{pmatrix} 0 & -1 \\\\ 1 & 0 \\end{pmatrix}$$"}
        />
      </label>

      <div className="builder-label">Темы</div>
      <div className="facet-options" style={{ marginBottom: 14 }}>
        {concepts.map((c) => (
          <button
            key={c.slug}
            type="button"
            className="facet-chip"
            data-on={picked.includes(c.slug)}
            onClick={() =>
              setPicked((p) =>
                p.includes(c.slug) ? p.filter((x) => x !== c.slug) : [...p, c.slug],
              )
            }
          >
            {c.name_ru}
          </button>
        ))}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="actions">
        <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
          Отмена
        </button>
        <button className="btn" onClick={submit} disabled={busy || title.trim().length < 3}>
          {busy ? "Сохраняю…" : "Опубликовать урок"}
        </button>
      </div>
    </div>
  );
}
