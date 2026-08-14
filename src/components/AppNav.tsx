"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export type NavUser = { display_name: string; role: string } | null;

/** Роль подписывается по-русски: раньше «админ» показывался как «учитель». */
const ROLE_LABEL: Record<string, string> = {
  student: "ученик",
  teacher: "учитель",
  author: "автор",
  reviewer: "ревьюер",
  admin: "админ",
};

/** Шапка приложения: разделы зависят от роли, выход — POST, а не ссылка. */
export function AppNav({ user }: { user: NavUser }) {
  const path = usePathname();
  const router = useRouter();

  const links =
    user?.role === "student"
      ? [
          { href: "/cabinet", label: "Кабинет" },
          { href: "/learn", label: "Домашка" },
          { href: "/bank", label: "Практика" },
          { href: "/lessons", label: "Уроки" },
          { href: "/events", label: "События" },
        ]
      : user
        ? [
            { href: "/cabinet", label: "Кабинет" },
            { href: "/teach", label: "Классы" },
            { href: "/bank", label: "Банк" },
            { href: "/author", label: "Своя задача" },
            { href: "/lessons", label: "Уроки" },
            { href: "/events", label: "События" },
            ...(user.role === "admin" ? [{ href: "/admin", label: "Админка" }] : []),
          ]
        : [{ href: "/bank", label: "Банк задач" }];

  async function logout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="nav">
      <Link className="nav-brand" href={user?.role === "student" ? "/learn" : "/"}>
        <span className="nav-mark" aria-hidden>
          fm
        </span>
        Further Mathematics
      </Link>

      <div className="nav-links">
        {links.map((l) => (
          <Link key={l.href} href={l.href} data-on={path.startsWith(l.href)}>
            {l.label}
          </Link>
        ))}
      </div>

      <div className="nav-right">
        {user ? (
          <>
            <span className="nav-user">
              {user.display_name}
              <span>{ROLE_LABEL[user.role] ?? user.role}</span>
            </span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              Выйти
            </button>
          </>
        ) : (
          <>
            <Link className="btn btn-ghost btn-sm" href="/login">
              Войти
            </Link>
            <Link className="btn btn-sm" href="/signup">
              Регистрация
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
