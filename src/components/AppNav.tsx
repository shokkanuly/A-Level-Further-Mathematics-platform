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

type IconName = "home" | "book" | "practice" | "calendar" | "chat" | "class" | "author" | "admin" | "logout" | "bell" | "search";

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-7h6v7" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5v16M8 7h8M8 11h7" /></>,
    practice: <><circle cx="12" cy="12" r="8.5" /><path d="m9 12 2 2 4-4M12 3.5V2M12 22v-1.5M3.5 12H2M22 12h-1.5" /></>,
    calendar: <><rect x="3" y="4.5" width="18" height="17" rx="3" /><path d="M7 2.5v4M17 2.5v4M3 9h18M8 13h3M8 17h6" /></>,
    chat: <><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.6 8.6 0 0 1-3-.55L4 20l1.5-4A7.2 7.2 0 0 1 4.5 12 7.5 7.5 0 0 1 12 4.5a7.5 7.5 0 0 1 8 7Z" /><path d="M8 11h8M8 14h5" /></>,
    class: <><path d="M4 20V9l8-4 8 4v11" /><path d="M2.5 20h19M8 20v-5h8v5M8 10h.01M12 10h.01M16 10h.01" /></>,
    author: <><path d="M4 20h16M6 17.5 17.5 6a2.1 2.1 0 0 1 3 3L9 20H4z" /><path d="m15 8 3 3" /></>,
    admin: <><path d="M12 3 20 6v5c0 4.6-3.2 8.2-8 10-4.8-1.8-8-5.4-8-10V6z" /><path d="m9 12 2 2 4-4" /></>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 5 5" /></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

/** Шапка приложения: разделы зависят от роли, выход — POST, а не ссылка. */
export function AppNav({ user }: { user: NavUser }) {
  const path = usePathname();
  const router = useRouter();

  const links =
    user?.role === "student"
      ? [
          { href: "/cabinet", label: "Главная", icon: "home" as IconName },
          { href: "/lessons", label: "Уроки", icon: "book" as IconName },
          { href: "/bank", label: "Практика", icon: "practice" as IconName },
          { href: "/learn", label: "Домашка", icon: "calendar" as IconName },
          { href: "/events", label: "События", icon: "chat" as IconName },
        ]
      : user
        ? [
            { href: "/cabinet", label: "Главная", icon: "home" as IconName },
            { href: "/teach", label: "Классы", icon: "class" as IconName },
            { href: "/bank", label: "Банк задач", icon: "practice" as IconName },
            { href: "/author", label: "Своя задача", icon: "author" as IconName },
            { href: "/lessons", label: "Уроки", icon: "book" as IconName },
            { href: "/events", label: "События", icon: "chat" as IconName },
            ...(user.role === "admin" ? [{ href: "/admin", label: "Админка", icon: "admin" as IconName }] : []),
          ]
        : [{ href: "/bank", label: "Банк задач", icon: "practice" as IconName }];

  const activeLabel = links.find((l) => path.startsWith(`${l.href}`))?.label ?? (user ? "Главная" : "Математика");

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
    <nav className={user ? "app-nav" : "app-nav app-nav-guest"} aria-label="Основная навигация">
      <div className="app-sidebar">
        <Link className="app-brand" href={user?.role === "student" ? "/cabinet" : "/"}>
          <span className="app-brand-mark" aria-hidden>ƒ</span>
          <span><b>Further</b><small>MATHEMATICS ACADEMY</small></span>
        </Link>

        <div className="app-nav-caption">Навигация</div>
        <div className="app-nav-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} data-on={path === l.href || path.startsWith(`${l.href}/`)} aria-current={path === l.href || path.startsWith(`${l.href}/`) ? "page" : undefined}>
              <NavIcon name={l.icon} />
              <span>{l.label}</span>
            </Link>
          ))}
        </div>

        {user && (
          <div className="app-sidebar-bottom">
            <Link href="/privacy"><span className="app-help-mark">?</span><span>Помощь</span></Link>
            <button onClick={logout}><NavIcon name="logout" /><span>Выйти</span></button>
          </div>
        )}
      </div>

      <div className="app-topbar">
        <div className="app-breadcrumb">
          <span>Further Mathematics Academy</span>
          <strong>{activeLabel}</strong>
        </div>
        <div className="app-top-actions">
          {user && <button className="app-icon-btn" aria-label="Поиск"><NavIcon name="search" /></button>}
          {user && <button className="app-icon-btn" aria-label="Уведомления"><NavIcon name="bell" /><i /></button>}
          {user ? (
            <div className="app-profile">
              <span className="app-profile-avatar" aria-hidden>{user.display_name.slice(0, 1)}</span>
              <span><b>{user.display_name}</b><small>{ROLE_LABEL[user.role] ?? user.role}</small></span>
            </div>
          ) : (
            <div className="app-guest-actions">
              <Link className="btn btn-ghost btn-sm" href="/login">Войти</Link>
              <Link className="btn btn-sm" href="/signup">Регистрация</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
