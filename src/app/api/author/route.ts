import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { withTransaction, query } from "@/lib/db";
import { createItem } from "../../../../db/seed-items.mjs";
import { renderRich } from "@/lib/tex.mjs";

/**
 * POST /api/author — проверка и публикация авторской задачи (§9, миграция 008).
 *
 * Две команды, один путь в базу:
 *   action=validate  — вставить, спросить SQL, ОТКАТИТЬ;
 *   action=publish   — вставить и опубликовать через item_version_publish().
 *
 * Проверка «не сохраняя» устроена откатом, а не вторым набором правил в JS.
 * Это принципиально: item_version_problems() — единственная инстанция,
 * решающая, публикуется ли версия (ARCHITECTURE §1). Стоит завести здесь
 * «предварительную» проверку на JS — и через полгода она разойдётся с SQL,
 * причём в сторону разрешения: чинить будут ту, что мешает.
 *
 * JS ниже проверяет ровно две вещи, до которых SQL не дотягивается: что тело
 * запроса вообще разбирается и что LaTeX компилируется. Ни одна из них
 * не даёт права опубликовать — только не пустить.
 */

type PartInput = {
  path: string;
  label: string;
  text_md: string;
  answer_type?: string | null;
  marks?: number | null;
  answer_spec?: Record<string, unknown> | null;
  steps?: { code: string; marks: number; ru: string; en?: string }[];
  children?: PartInput[];
};

type Body = {
  action: "validate" | "publish";
  slug: string;
  kind: string;
  difficulty: number;
  stem_md: string;
  explanation_md?: string | null;
  concepts: string[];
  parts: PartInput[];
};

type Problem = { code: string; detail: string };

const bad = (code: string, detail: string) => ({ code, detail });

/** Проблемы, которые SQL увидеть не может: он не парсит JSON и не считает LaTeX. */
function preflight(body: Body): Problem[] {
  const problems: Problem[] = [];

  if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(body.slug ?? "")) {
    problems.push(
      bad("SLUG_INVALID", "адрес: латиница в нижнем регистре, цифры и дефис, от 3 символов"),
    );
  }
  if (!body.stem_md?.trim()) problems.push(bad("STEM_EMPTY", "условие задачи пустое"));
  if (!(body.difficulty >= 1 && body.difficulty <= 5)) {
    problems.push(bad("DIFFICULTY_RANGE", "сложность вне диапазона 1–5"));
  }
  if (!body.concepts?.length) {
    problems.push(bad("NO_CONCEPT", "не выбрано ни одной темы"));
  }

  const seen = new Set<string>();
  const walk = (parts: PartInput[]) => {
    for (const p of parts ?? []) {
      if (!p.path?.trim()) problems.push(bad("PART_PATH_EMPTY", "у части пустой путь"));
      if (seen.has(p.path)) {
        problems.push(bad("PART_PATH_DUPLICATE", `путь части «${p.path}» встречается дважды`));
      }
      seen.add(p.path);
      if (!p.text_md?.trim()) {
        problems.push(bad("PART_TEXT_EMPTY", `часть ${p.path}: пустой текст`));
      }
      if (p.children?.length) walk(p.children);
    }
  };
  walk(body.parts);

  if (!body.parts?.length) problems.push(bad("NO_PARTS", "у задачи нет ни одной части"));

  // LaTeX. Собираем тем же кодом, что рендерит страницу, — проверка, которая
  // «похожа» на боевую, ловит не те ошибки.
  const texts: [string, string][] = [["условие", body.stem_md ?? ""]];
  if (body.explanation_md) texts.push(["разбор", body.explanation_md]);
  const collect = (parts: PartInput[]) => {
    for (const p of parts ?? []) {
      texts.push([`часть ${p.path}`, p.text_md ?? ""]);
      for (const s of p.steps ?? []) texts.push([`шаг ${p.path}`, s.ru ?? ""]);
      const opts = (p.answer_spec?.options ?? []) as { text_md?: string }[];
      for (const o of opts) texts.push([`вариант ${p.path}`, o.text_md ?? ""]);
      if (p.children?.length) collect(p.children);
    }
  };
  collect(body.parts);

  for (const [where, src] of texts) {
    if (!src) continue;
    try {
      renderRich(src, {}, true);
    } catch (err) {
      problems.push(
        bad("LATEX_BROKEN", `${where}: ${(err as Error).message.split("\n")[0]}`),
      );
    }
  }

  return problems;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!["teacher", "author", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const early = preflight(body);
  if (early.length > 0) {
    return NextResponse.json({ ok: false, problems: early, stage: "preflight" });
  }

  const taken = await query(`select 1 from item where slug = $1`, [body.slug]);
  if (taken.length > 0) {
    return NextResponse.json({
      ok: false,
      stage: "preflight",
      problems: [bad("SLUG_TAKEN", `адрес «${body.slug}» уже занят другой задачей`)],
    });
  }

  const conceptRows = await query<{ slug: string; id: string }>(
    `select slug, id from concept where slug = any($1)`,
    [body.concepts],
  );
  const conceptIds = Object.fromEntries(conceptRows.map((c) => [c.slug, c.id]));

  const publishing = body.action === "publish";

  /**
   * Проблемы возвращаются исключением, а не значением, потому что откатить
   * транзакцию можно только так.
   *
   * Откат здесь обязателен, и это не «чистота ради чистоты»: item.slug
   * уникален. Оставь мы черновик после неудачной публикации — вторая попытка
   * с тем же адресом упёрлась бы в SLUG_TAKEN, и автор, исправивший баллы,
   * получил бы отказ по совершенно постороннему поводу.
   */
  class Rejected extends Error {
    constructor(readonly problems: Problem[]) {
      super("REJECTED");
    }
  }

  try {
    const result = await withTransaction(
      async (q) => {
        const created = await createItem(
          q,
          {
            slug: body.slug,
            kind: body.kind,
            difficulty: body.difficulty,
            stem: body.stem_md,
            explanation: body.explanation_md || undefined,
            concepts: body.concepts,
            parts: body.parts.map(toSeedPart),
            authorId: user.id,
          },
          conceptIds,
          { publish: false },
        );
        if (!created) throw new Rejected([bad("SLUG_TAKEN", "адрес уже занят")]);

        const problems = (await q(`select code, detail from item_version_problems($1)`, [
          created.versionId,
        ])) as unknown as Problem[];

        if (problems.length > 0) throw new Rejected(problems);

        if (publishing) {
          await q(`select item_version_publish($1, $2)`, [created.versionId, user.id]);
        }

        return { slug: body.slug, totalMarks: created.totalMarks };
      },
      // Проверка не оставляет следов вовсе: вставили, спросили SQL, откатили.
      { rollback: !publishing },
    );

    return NextResponse.json({
      ok: true,
      published: publishing,
      problems: [],
      slug: result.slug,
      total_marks: result.totalMarks,
    });
  } catch (err) {
    if (err instanceof Rejected) {
      return NextResponse.json({ ok: false, stage: "sql", problems: err.problems });
    }
    // Исключение из самой базы (например, нарушенный триггер заморозки):
    // текст у него человекочитаемый и уже объясняет, что не так.
    const message = (err as Error).message.replace(/^Публикация отклонена:\n?/, "");
    return NextResponse.json({
      ok: false,
      stage: "sql",
      problems: [bad("REJECTED", message)],
    });
  }
}

/** Форма шлёт то, что удобно рисовать; createItem ждёт то, что удобно писать в базу. */
type SeedPart = {
  path: string;
  label: string;
  text: string;
  answer_type: string | null;
  answer_spec: Record<string, unknown> | null;
  marks: number | null;
  steps: { code: string; marks: number; en: string; ru: string }[];
  children?: SeedPart[];
};

function toSeedPart(p: PartInput): SeedPart {
  return {
    path: p.path,
    label: p.label || (p.path.split(".").pop() as string),
    text: p.text_md,
    answer_type: p.children?.length ? null : p.answer_type || null,
    answer_spec: p.children?.length ? null : p.answer_spec || null,
    marks: p.children?.length ? null : (p.marks ?? null),
    steps: (p.steps ?? []).map((s) => ({
      code: s.code,
      marks: s.marks,
      en: s.en || s.ru,
      ru: s.ru,
    })),
    children: p.children?.map(toSeedPart),
  };
}
