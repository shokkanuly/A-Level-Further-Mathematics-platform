import { AppNav } from "@/components/AppNav";
import { ItemAuthor, type ConceptOption, type KindOption } from "@/components/ItemAuthor";
import { requireTeacher } from "@/lib/session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Своя задача" };

export default async function AuthorPage() {
  const user = await requireTeacher("/author");

  const [concepts, kinds] = await Promise.all([
    query<ConceptOption>(`
      select c.slug, c.name_ru, p.name_ru as parent_name
      from concept c
      left join concept p on p.id = c.parent_id
      order by coalesce(p.position, c.position), p.name_ru nulls first, c.position
    `),
    query<KindOption>(
      `select id, name_ru, description_ru, requires_explanation
       from item_kind order by position`,
    ),
  ]);

  return (
    <>
      <AppNav user={user} />
      <main className="page" id="main">
        <div className="eyebrow">Авторский конвейер</div>
        <h1>Своя задача</h1>
        <p className="lede">
          Задача уходит в тот же банк и через ту же проверку, что и остальные.
          Публикацию разрешает база, а не эта форма: если баллы не сойдутся,
          вы увидите, в каком именно пункте.
        </p>

        <ItemAuthor concepts={concepts} kinds={kinds} />
      </main>
    </>
  );
}
