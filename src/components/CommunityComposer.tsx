"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Форма объявления или события — свёрнута по умолчанию.
 *
 * Развёрнутая форма наверху ленты сообщает «здесь принято писать», а лента
 * объявлений живёт наоборот: читают её каждый день, пишут раз в неделю.
 * Поэтому кнопка, а не поля.
 */

type ClassOption = { id: string; name: string };

const ERROR_TEXT: Record<string, string> = {
  TITLE_REQUIRED: "Нужен заголовок.",
  BODY_REQUIRED: "Нужен текст объявления.",
  START_REQUIRED: "Нужны дата и время начала.",
  START_INVALID: "Дата не распознана.",
  CLASS_REQUIRED: "Выберите класс.",
  NOT_YOUR_CLASS: "Это не ваш класс.",
  GLOBAL_IS_ADMIN_ONLY: "Объявление всем может дать только администратор.",
  URL_INVALID: "Ссылка не разобралась.",
  URL_SCHEME: "Ссылка должна начинаться с http:// или https://",
};

export function CommunityComposer({
  classes,
  isAdmin,
}: {
  classes: ClassOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"announcement" | "event" | null>(null);
  const [scope, setScope] = useState<"class" | "global">(isAdmin ? "global" : "class");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pinned, setPinned] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle("");
    setText("");
    setStartsAt("");
    setLocation("");
    setUrl("");
    setPinned(false);
    setError(null);
    setOpen(null);
  };

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/community", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: open,
          scope,
          class_id: scope === "class" ? classId : null,
          title,
          body_md: text,
          description_md: text,
          pinned,
          starts_at: startsAt || null,
          location,
          url,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(ERROR_TEXT[data.error] ?? data.error ?? "Не получилось");
        return;
      }
      reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="actions" style={{ marginTop: 22 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen("announcement")}>
          + Объявление
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen("event")}>
          + Событие
        </button>
      </div>
    );
  }

  const noClasses = scope === "class" && classes.length === 0;

  return (
    <div className="builder" style={{ marginTop: 22 }}>
      <div className="builder-row">
        <label className="field" style={{ flex: 2 }}>
          <span className="builder-label">
            {open === "announcement" ? "Объявление" : "Событие"}
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={open === "announcement" ? "Заголовок" : "Название события"}
          />
        </label>

        <label className="field" style={{ maxWidth: 210 }}>
          <span className="builder-label">Кому</span>
          <select
            value={scope === "global" ? "global" : classId}
            onChange={(e) => {
              if (e.target.value === "global") setScope("global");
              else {
                setScope("class");
                setClassId(e.target.value);
              }
            }}
          >
            {isAdmin && <option value="global">Всем</option>}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {open === "event" && (
        <div className="builder-row">
          <label className="field">
            <span className="builder-label">Начало</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="builder-label">Место</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Кабинет 204 или «онлайн»"
            />
          </label>
          <label className="field">
            <span className="builder-label">Ссылка</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
        </div>
      )}

      <label className="field">
        <span className="builder-label">
          Текст — абзацы пустой строкой, **жирный**, формулы в $…$
        </span>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      </label>

      {open === "announcement" && (
        <label className="check" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Закрепить наверху
        </label>
      )}

      {noClasses && (
        <div className="form-error">
          У вас нет классов — объявление адресовать некому.
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      <div className="actions">
        <button className="btn btn-ghost" onClick={reset} disabled={busy}>
          Отмена
        </button>
        <button className="btn" onClick={submit} disabled={busy || noClasses}>
          {busy ? "Публикую…" : "Опубликовать"}
        </button>
      </div>
    </div>
  );
}
