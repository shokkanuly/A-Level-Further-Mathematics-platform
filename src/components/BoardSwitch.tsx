import Link from "next/link";
import type { Board } from "@/lib/queries";

/** Фильтр «я готовлюсь к Edexcel / CIE» (SYSTEM-DESIGN §3.1). */
export function BoardSwitch({
  boards,
  current,
  hrefFor,
}: {
  boards: Board[];
  current: string;
  hrefFor: (boardId: string) => string;
}) {
  return (
    <div className="segmented" role="group" aria-label="Экзаменационная комиссия">
      {boards.map((b) => (
        <Link
          key={b.id}
          href={hrefFor(b.id)}
          data-on={b.id === current}
          aria-current={b.id === current ? "true" : undefined}
        >
          {b.name.split(" ")[0]}
          <span>{b.qualification_code}</span>
        </Link>
      ))}
    </div>
  );
}
