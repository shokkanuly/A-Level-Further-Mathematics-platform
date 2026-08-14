import Link from "next/link";

/**
 * Подвал с обязательным: дисклеймер по товарным знакам и правовые ссылки.
 *
 * Edexcel, Pearson и Cambridge — чужие марки. Готовиться к их экзаменам
 * и называть их по имени можно, создавать впечатление одобрения — нет.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="disclaimer">
          Некоммерческий проект. Задачи оригинальные, написаны по опубликованным
          спецификациям; официальные экзаменационные материалы не публикуются.
          Pearson Edexcel и Cambridge International — товарные знаки своих
          владельцев, проект с ними не связан.
        </p>
        <nav aria-label="Правовая информация">
          <Link href="/bank">Банк задач</Link>
          <Link href="/privacy">Конфиденциальность</Link>
          <Link href="/terms">Условия</Link>
        </nav>
      </div>
    </footer>
  );
}
