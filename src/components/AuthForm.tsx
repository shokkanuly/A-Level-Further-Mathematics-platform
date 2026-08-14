"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ERRORS: Record<string, string> = {
  EMAIL_INVALID: "Проверьте адрес почты.",
  PASSWORD_TOO_SHORT: "Пароль должен быть не короче 8 символов.",
  NAME_TOO_SHORT: "Введите имя.",
  EMAIL_TAKEN: "Такая почта уже зарегистрирована. Войдите.",
  BAD_CREDENTIALS: "Неверная почта или пароль.",
};

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const router = useRouter();
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: mode,
        email: form.get("email"),
        password: form.get("password"),
        display_name: form.get("display_name"),
        role,
      }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(ERRORS[data.error] ?? data.error);
      return;
    }
    // Учитель и ученик приземляются в разные места: у них разная работа.
    router.push(next ?? (data.role === "teacher" ? "/teach" : "/learn"));
    router.refresh();
  }

  return (
    <form className="auth" onSubmit={onSubmit}>
      <h1>{mode === "login" ? "Вход" : "Регистрация"}</h1>
      <p className="lede" style={{ marginBottom: 24 }}>
        {mode === "login"
          ? "Продолжить занятия и посмотреть выданные задания."
          : "Бесплатно. Проект некоммерческий."}
      </p>

      {mode === "signup" && (
        <>
          <div className="field">
            <label htmlFor="display_name">Как вас зовут</label>
            <input id="display_name" name="display_name" required autoComplete="name" />
          </div>

          <div className="field">
            <label>Вы</label>
            <div className="role-pick">
              <button
                type="button"
                data-on={role === "student"}
                onClick={() => setRole("student")}
              >
                <strong>Ученик</strong>
                <span>решать задания</span>
              </button>
              <button
                type="button"
                data-on={role === "teacher"}
                onClick={() => setRole("teacher")}
              >
                <strong>Учитель</strong>
                <span>выдавать домашку</span>
              </button>
            </div>
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="email">Почта</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <div className="field">
        <label htmlFor="password">Пароль</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {mode === "signup" && <span className="hint">Минимум 8 символов.</span>}
      </div>

      {error && <div className="form-error">{error}</div>}

      <button className="btn" type="submit" disabled={busy} style={{ width: "100%", height: 42 }}>
        {busy ? "Минуту…" : mode === "login" ? "Войти" : "Создать аккаунт"}
      </button>

      <p className="auth-switch">
        {mode === "login" ? (
          <>
            Нет аккаунта? <Link href="/signup">Зарегистрироваться</Link>
          </>
        ) : (
          <>
            Уже есть аккаунт? <Link href="/login">Войти</Link>
          </>
        )}
      </p>
    </form>
  );
}
