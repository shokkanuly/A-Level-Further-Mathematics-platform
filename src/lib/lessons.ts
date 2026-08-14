import { query, queryOne } from "./db";
import type { VideoRef } from "./video";

/**
 * Уроки: видео и конспект (миграция 009).
 *
 * Видимость решается здесь одним правилом и больше нигде: урок без класса
 * открыт всем, урок с классом виден только его участникам и автору.
 * Размазать это по страницам — гарантия, что одна из них однажды покажет
 * чужой конспект.
 */

export type LessonCard = {
  id: string;
  title: string;
  summary_md: string | null;
  video_provider: VideoRef["provider"] | null;
  video_id: string | null;
  has_conspectus: boolean;
  class_id: string | null;
  class_name: string | null;
  program_id: string | null;
  program_name: string | null;
  author_name: string;
  concepts: string[];
  viewed: boolean;
  created_at: string;
};

/** Урок виден: он открытый, либо это мой класс, либо я его автор. */
const VISIBLE = `(
  l.class_id is null
  or l.created_by = $1
  or exists (
    select 1 from enrolment e
    where e.class_id = l.class_id and e.student_id = $1 and e.removed_at is null
  )
  or exists (
    select 1 from class c where c.id = l.class_id and c.teacher_id = $1
  )
)`;

export async function listLessons(
  userId: string,
  filter: { programId?: string; classId?: string } = {},
): Promise<LessonCard[]> {
  return query<LessonCard>(
    `select l.id, l.title, l.summary_md, l.video_provider, l.video_id,
            coalesce(btrim(l.conspectus_md), '') <> '' as has_conspectus,
            l.class_id, c.name as class_name,
            l.program_id, p.name_ru as program_name,
            u.display_name as author_name,
            l.created_at,
            coalesce(
              array_agg(distinct co.name_ru) filter (where co.name_ru is not null),
              '{}'
            ) as concepts,
            exists (
              select 1 from lesson_view lv
              where lv.lesson_id = l.id and lv.student_id = $1
            ) as viewed
     from lesson l
     join app_user u on u.id = l.created_by
     left join class c on c.id = l.class_id
     left join program p on p.id = l.program_id
     left join lesson_concept lc on lc.lesson_id = l.id
     left join concept co on co.id = lc.concept_id
     where l.published_at is not null
       and ($2::text is null or l.program_id = $2)
       and ($3::uuid is null or l.class_id = $3)
       and ${VISIBLE}
     group by l.id, c.name, p.name_ru, u.display_name
     order by l.position, l.created_at desc`,
    [userId, filter.programId ?? null, filter.classId ?? null],
  );
}

export type LessonDetail = LessonCard & { conspectus_md: string | null };

export async function getLesson(userId: string, id: string): Promise<LessonDetail | null> {
  return queryOne<LessonDetail>(
    `select l.id, l.title, l.summary_md, l.conspectus_md,
            l.video_provider, l.video_id,
            coalesce(btrim(l.conspectus_md), '') <> '' as has_conspectus,
            l.class_id, c.name as class_name,
            l.program_id, p.name_ru as program_name,
            u.display_name as author_name, l.created_at,
            coalesce(
              array_agg(distinct co.name_ru) filter (where co.name_ru is not null),
              '{}'
            ) as concepts,
            true as viewed
     from lesson l
     join app_user u on u.id = l.created_by
     left join class c on c.id = l.class_id
     left join program p on p.id = l.program_id
     left join lesson_concept lc on lc.lesson_id = l.id
     left join concept co on co.id = lc.concept_id
     where l.id = $2 and l.published_at is not null and ${VISIBLE}
     group by l.id, c.name, p.name_ru, u.display_name`,
    [userId, id],
  );
}

/**
 * Отметка о просмотре.
 *
 * Пишется только за учеников: «учитель посмотрел свой урок» — не данные,
 * а шум, который потом придётся вычитать из каждого отчёта.
 */
export async function markViewed(lessonId: string, studentId: string, role: string) {
  if (role !== "student") return;
  await query(
    `insert into lesson_view (lesson_id, student_id) values ($1, $2)
     on conflict (lesson_id, student_id) do update
       set last_viewed_at = now(), view_count = lesson_view.view_count + 1`,
    [lessonId, studentId],
  );
}

/** Кто из класса открыл урок, а кто нет — вторая половина мониторинга. */
export async function lessonViewers(lessonId: string) {
  return query<{ display_name: string; view_count: number; last_viewed_at: string | null }>(
    `select u.display_name, coalesce(lv.view_count, 0) as view_count, lv.last_viewed_at
     from lesson l
     join enrolment e on e.class_id = l.class_id and e.removed_at is null
     join app_user u on u.id = e.student_id
     left join lesson_view lv on lv.lesson_id = l.id and lv.student_id = u.id
     where l.id = $1
     order by (lv.last_viewed_at is null), u.display_name`,
    [lessonId],
  );
}
