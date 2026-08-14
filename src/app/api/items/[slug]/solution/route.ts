import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { solutionGate } from "@/lib/solution-gate";
import { getBoard } from "@/lib/queries";
import { renderTex, renderRich, macrosFor } from "@/lib/tex.mjs";

/**
 * GET /api/items/{slug}/solution?locale=ru&board=edexcel&attempt_id=…
 *
 * attempt_id — не украшение. Без него сервер не знает контекст и не может
 * применить solutions_locked_until_due: одна и та же задача бывает
 * одновременно и в домашке, и в свободной практике (§5, §8).
 *
 * Разбор отдаётся отдельным запросом и никогда не приезжает вместе с условием.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") ?? "ru";
  const attemptId = url.searchParams.get("attempt_id");
  const boardId = url.searchParams.get("board") ?? "edexcel";

  const gate = await solutionGate(attemptId);
  if (!gate.allowed) {
    return NextResponse.json({ error: gate.reason }, { status: 403 });
  }

  const version = await queryOne<{
    id: string;
    explanation_md: string | null;
    kind: string;
    kind_name: string;
  }>(
    `select iv.id, iv.explanation_md, iv.kind, k.name_ru as kind_name
     from item i
     join item_version iv on iv.item_id = i.id and iv.status = 'published'
     join item_kind k on k.id = iv.kind
     where i.slug = $1`,
    [slug],
  );
  if (!version) return NextResponse.json({ error: "ITEM_NOT_FOUND" }, { status: 404 });

  // Текст берётся на запрошенной локали, с откатом на английский:
  // условие всегда en, разбор локализуется (§12).
  const steps = await query<{
    path: string;
    mark_code: string;
    marks_covered: number;
    text_md: string;
    locale: string;
  }>(
    `select p.path, s.mark_code, s.marks_covered,
            coalesce(t.text_md, en.text_md)   as text_md,
            coalesce(t.locale, 'en')          as locale
     from solution_step s
     join item_part p on p.id = s.part_id
     left join solution_step_text t  on t.solution_step_id = s.id and t.locale = $2
     left join solution_step_text en on en.solution_step_id = s.id and en.locale = 'en'
     where s.item_version_id = $1
     order by s.position`,
    [version.id, locale],
  );

  // KaTeX считается здесь, а не в браузере: макросы обозначений живут
  // на комиссии, и клиенту незачем знать про профили вообще.
  const board = await getBoard(boardId);
  const macros = macrosFor(board?.notation_profile);

  return NextResponse.json({
    slug,
    locale,
    reason: gate.reason,
    kind: version.kind,
    kind_name: version.kind_name,
    // Разбор целиком (008) едет тем же ответом и через тот же гейт, что схема
    // оценивания. Отдавать его раньше нельзя ровно по той же причине:
    // в практикуме разбор — это и есть решение, а не комментарий к нему.
    explanation_html: version.explanation_md
      ? renderRich(version.explanation_md, macros)
      : null,
    steps: steps.map((s) => ({
      path: s.path,
      mark_code: s.mark_code,
      marks_covered: s.marks_covered,
      locale: s.locale,
      text_html: renderTex(s.text_md, macros),
    })),
  });
}
