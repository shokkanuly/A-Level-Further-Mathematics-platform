import Link from "next/link";
import { AppNav } from "@/components/AppNav";

/**
 * Своя 404 вместо дефолтной страницы Next.
 * Тупиков быть не должно: с любой страницы есть путь обратно.
 */
export default function NotFound() {
  return (
    <>
      <AppNav user={null} />
      <main className="page" id="main" style={{ paddingTop: 72 }}>
        <div className="eyebrow">404</div>
        <h1>Такой страницы нет</h1>
        <p className="lede">
          Ссылка могла устареть, или задание доступно только участникам класса.
          Если вы уверены, что страница должна существовать — проверьте, что вошли
          под нужным аккаунтом.
        </p>
        <div className="hero-actions">
          <Link className="btn" href="/bank">
            В банк задач
          </Link>
          <Link className="btn btn-ghost" href="/login">
            Войти
          </Link>
        </div>
      </main>
    </>
  );
}
