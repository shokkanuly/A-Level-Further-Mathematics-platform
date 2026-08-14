"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Смена роли прямо в таблице.
 *
 * Отказ показывается на месте, а не всплывающим окном: причина отказа
 * («последний администратор») относится к конкретной строке, и оторванное
 * от неё сообщение заставляет гадать, к кому именно.
 */

const ROLES = [
  { id: "student", label: "ученик" },
  { id: "teacher", label: "учитель" },
  { id: "author", label: "автор" },
  { id: "reviewer", label: "ревьюер" },
  { id: "admin", label: "админ" },
];

const ERROR_TEXT: Record<string, string> = {
  LAST_ADMIN: "Это последний администратор",
  SELF_DEMOTE: "Себя менять нельзя",
  USER_NOT_FOUND: "Пользователь не найден",
  UNKNOWN_ROLE: "Неизвестная роль",
  FORBIDDEN: "Недостаточно прав",
};

export function RoleEditor({
  userId,
  role,
  isSelf,
}: {
  userId: string;
  role: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_role", user_id: userId, role: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setValue(previous); // откатываем показанное значение к реальному
        setError(ERROR_TEXT[data.error] ?? data.error ?? "Не вышло");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (isSelf) {
    return (
      <span className="chip" title="Свою роль менять нельзя">
        {ROLES.find((r) => r.id === role)?.label ?? role}
      </span>
    );
  }

  return (
    <span className="role-cell">
      <select
        value={value}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
        aria-label="Роль"
      >
        {ROLES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      {error && <span className="role-error">{error}</span>}
    </span>
  );
}
