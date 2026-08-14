"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ERRORS: Record<string, string> = {
  CODE_INVALID: "Код состоит из 6 знаков — проверьте.",
  CLASS_NOT_FOUND: "Класса с таким кодом нет.",
  OWN_CLASS: "Это ваш собственный класс.",
};

export function JoinClass() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/classes/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(ERRORS[data.error] ?? data.error);
      return;
    }
    setCode("");
    router.refresh();
  }

  return (
    <div className="join-box">
      <div>
        <strong>Вступить в класс</strong>
        <span>Код даёт учитель — 6 знаков, например XKQ-4M7.</span>
      </div>
      <div className="inline-form">
        <input
          className="code-input"
          placeholder="XKQ-4M7"
          value={code}
          maxLength={8}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && join()}
        />
        <button className="btn" disabled={busy || code.length < 6} onClick={join}>
          {busy ? "…" : "Вступить"}
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
