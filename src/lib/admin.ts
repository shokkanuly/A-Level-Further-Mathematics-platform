import { query, queryOne } from "./db";

/**
 * Данные админки.
 *
 * Админка отвечает на вопрос «в каком состоянии платформа», а не «как учится
 * конкретный ученик» — для второго есть кабинет и журнал класса. Поэтому
 * здесь везде агрегаты и нигде нет ответов учеников: право администратора
 * управлять ролями не обязано включать право читать чужие решения.
 */

export type Totals = {
  users: number;
  students: number;
  teachers: number;
  classes: number;
  items_published: number;
  items_draft: number;
  lessons: number;
  attempts: number;
  messages_7d: number;
  announcements: number;
};

export async function totals(): Promise<Totals> {
  const row = await queryOne<Totals>(`
    select
      (select count(*)::int from app_user)                                  as users,
      (select count(*)::int from app_user where role = 'student')           as students,
      (select count(*)::int from app_user
        where role in ('teacher','author','reviewer'))                      as teachers,
      (select count(*)::int from class where archived_at is null)           as classes,
      (select count(*)::int from item_version where status = 'published')   as items_published,
      (select count(*)::int from item_version where status = 'draft')       as items_draft,
      (select count(*)::int from lesson where published_at is not null)     as lessons,
      (select count(*)::int from attempt)                                   as attempts,
      (select count(*)::int from chat_message
        where deleted_at is null and created_at > now() - interval '7 days') as messages_7d,
      (select count(*)::int from announcement where deleted_at is null)     as announcements
  `);
  return (
    row ?? {
      users: 0, students: 0, teachers: 0, classes: 0,
      items_published: 0, items_draft: 0, lessons: 0,
      attempts: 0, messages_7d: 0, announcements: 0,
    }
  );
}

export type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
  classes: number;
  attempts: number;
};

export async function listUsers(search?: string): Promise<UserRow[]> {
  return query<UserRow>(
    `select u.id, u.email, u.display_name, u.role, u.created_at, u.last_login_at,
            (select count(*)::int from class c where c.teacher_id = u.id)
            + (select count(*)::int from enrolment e
                where e.student_id = u.id and e.removed_at is null) as classes,
            (select count(*)::int from attempt a where a.student_id = u.id) as attempts
     from app_user u
     where ($1::text is null
            or u.email ilike '%' || $1 || '%'
            or u.display_name ilike '%' || $1 || '%')
     order by u.created_at desc
     limit 100`,
    [search?.trim() || null],
  );
}

/** Банк по видам и статусам — видно, где конвейер встал. */
export async function itemPipeline() {
  return query<{ kind_name: string; status: string; n: number }>(`
    select k.name_ru as kind_name, iv.status, count(*)::int as n
    from item_version iv
    join item_kind k on k.id = iv.kind
    group by k.name_ru, k.position, iv.status
    order by k.position, iv.status
  `);
}

export async function programCoverage() {
  return query<{ name_ru: string; items: number; lessons: number }>(`
    select p.name_ru,
           (select count(distinct iv.item_id)::int
              from item_version iv
              where iv.status = 'published'
                and exists (
                  select 1 from item_concept ic
                  join concept_spec_point csp on csp.concept_id = ic.concept_id
                  join spec_point sp on sp.id = csp.spec_point_id
                  join unit u on u.id = sp.unit_id
                  join qualification qa on qa.id = u.qualification_id
                  where ic.item_version_id = iv.id and qa.program_id = p.id
                )) as items,
           (select count(*)::int from lesson l
             where l.program_id = p.id and l.published_at is not null) as lessons
    from program p
    order by p.position
  `);
}

/** Последние действия — чтобы понять, живёт ли платформа вообще. */
export async function recentActivity() {
  return query<{ kind: string; who: string; what: string; at: string }>(`
    (select 'attempt' as kind, u.display_name as who,
            coalesce(c.name_ru, i.slug) as what, a.started_at as at
     from attempt a
     join app_user u on u.id = a.student_id
     join item_version iv on iv.id = a.item_version_id
     join item i on i.id = iv.item_id
     left join item_concept ic on ic.item_version_id = iv.id and ic.is_primary
     left join concept c on c.id = ic.concept_id
     order by a.started_at desc limit 8)
    union all
    (select 'lesson', u.display_name, l.title, l.created_at
     from lesson l join app_user u on u.id = l.created_by
     order by l.created_at desc limit 5)
    union all
    (select 'message', u.display_name, left(m.body, 60), m.created_at
     from chat_message m join app_user u on u.id = m.author_id
     where m.deleted_at is null
     order by m.created_at desc limit 5)
    order by at desc
    limit 15
  `);
}

const ROLES = new Set(["student", "teacher", "author", "reviewer", "admin"]);

/**
 * Смена роли.
 *
 * Отдельная функция, а не update в обработчике, ради одного правила:
 * последнего администратора разжаловать нельзя. Без него достаточно одного
 * неверного клика, чтобы в системе не осталось никого, кто может выдавать
 * роли, — и чинить это придётся уже через psql.
 */
export async function setRole(targetId: string, role: string): Promise<string | null> {
  if (!ROLES.has(role)) return "UNKNOWN_ROLE";

  const target = await queryOne<{ role: string }>(`select role from app_user where id = $1`, [
    targetId,
  ]);
  if (!target) return "USER_NOT_FOUND";

  if (target.role === "admin" && role !== "admin") {
    const others = await queryOne<{ n: number }>(
      `select count(*)::int as n from app_user where role = 'admin' and id <> $1`,
      [targetId],
    );
    if ((others?.n ?? 0) === 0) return "LAST_ADMIN";
  }

  await query(`update app_user set role = $2 where id = $1`, [targetId, role]);
  return null;
}
