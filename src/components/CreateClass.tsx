"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateClass() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const res = await fetch("/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (res.ok) {
      setName("");
      setOpen(false);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + Новый класс
      </button>
    );
  }

  return (
    <div className="inline-form">
      <input
        autoFocus
        placeholder="Например: 11А, Further Maths"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim().length > 1 && create()}
      />
      <button className="btn" disabled={busy || name.trim().length < 2} onClick={create}>
        {busy ? "Создаю…" : "Создать"}
      </button>
      <button className="btn btn-ghost" onClick={() => setOpen(false)}>
        Отмена
      </button>
    </div>
  );
}
