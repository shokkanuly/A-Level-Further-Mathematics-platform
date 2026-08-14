import { query, queryOne } from "./db";

/**
 * Личный кабинет: мониторинг ученика и учителя (SYSTEM-DESIGN §6).
 *
 * Одно решение определяет здесь всё остальное: **освоенность считается
 * по концептам, а не по юнитам комиссии и не по программам**. Ученик,
 * перешедший со школьного блока на A-Level, не теряет накопленную
 * статистику — «квадратные уравнения» это одна и та же строка и там, и там.
 * Ровно ради этого концепт в 001 сделан board-agnostic.
 *
 * Второе решение: точность считается по СУММЕ БАЛЛОВ, а не по доле верных
 * задач. Задача на 8 баллов, решённая на 6, — это не «неверно», и учитель,
 * которому показали «0 из 1 задач», принимает решение по неверным данным.
 *
 * Третье решение: в статистику идёт ПОСЛЕДНЯЯ попытка на каждой версии
 * задачи, а не все подряд. Суммируя все попытки, мы отвечали бы на вопрос
 * «сколько ошибок человек сделал за свою жизнь», и ученик, прорешавший
 * задачу трижды, выглядел бы хуже того, кто не открывал её вовсе.
 * Вопрос, который нужен и ученику, и учителю, другой — «как обстоят дела
 * сейчас», и на него отвечает последняя попытка.
 */

/**
 * Последняя попытка ученика на каждой версии задачи.
 *
 * Вынесено в одно место: три запроса ниже обязаны считать по одному и тому же
 * набору, иначе сумма в карточке разойдётся с суммой в списке тем, и доверия
 * к обеим цифрам не останется.
 */
const LATEST_ATTEMPTS = `
  select distinct on (at.item_version_id) at.id, at.item_version_id
  from attempt at
  where at.student_id = $1
  order by at.item_version_id, at.started_at desc
`;

export type Mastery = {
  slug: string;
  name_ru: string;
  family_slug: string;
  earned: number;
  possible: number;
  accuracy: number;
  items_seen: number;
};

/**
 * Освоенность ученика по концептам, слабые первыми.
 *
 * Концепт берётся primary — тот, ради которого задача написана. Побочные
 * концепты в статистику не идут: задача про преобразования плоскости
 * заодно требует умножения матриц, но провал в ней говорит о первом,
 * а не о втором.
 */
export async function studentMastery(studentId: string): Promise<Mastery[]> {
  return query<Mastery>(
    `with latest as (${LATEST_ATTEMPTS})
     select c.slug,
            c.name_ru,
            coalesce(parent.slug, c.slug) as family_slug,
            sum(pr.marks_awarded)::int    as earned,
            sum(p.marks)::int             as possible,
            round(sum(pr.marks_awarded)::numeric / nullif(sum(p.marks), 0), 3)::float
                                          as accuracy,
            count(distinct latest.item_version_id)::int as items_seen
     from latest
     join part_response pr on pr.attempt_id = latest.id
     join item_part p on p.id = pr.part_id
     join item_concept ic
       on ic.item_version_id = latest.item_version_id and ic.is_primary
     join concept c on c.id = ic.concept_id
     left join concept parent on parent.id = c.parent_id
     group by c.slug, c.name_ru, coalesce(parent.slug, c.slug)
     having sum(p.marks) > 0
     order by accuracy asc, possible desc`,
    [studentId],
  );
}

export type StudentSummary = {
  attempts: number;
  items: number;
  earned: number;
  possible: number;
  accuracy: number;
  active_days: number;
};

export async function studentSummary(studentId: string): Promise<StudentSummary> {
  const row = await queryOne<StudentSummary>(
    // attempts и active_days считаются по ВСЕМ попыткам — это мера
    // проделанной работы, и здесь повторы как раз надо учитывать.
    // Баллы и точность — по последним, см. LATEST_ATTEMPTS.
    `with latest as (${LATEST_ATTEMPTS}),
     scored as (
       select coalesce(sum(pr.marks_awarded), 0)::int as earned,
              coalesce(sum(p.marks), 0)::int          as possible
       from latest
       join part_response pr on pr.attempt_id = latest.id
       join item_part p on p.id = pr.part_id
     )
     select (select count(*)::int from attempt where student_id = $1) as attempts,
            (select count(*)::int from latest)                       as items,
            scored.earned,
            scored.possible,
            round(scored.earned::numeric / nullif(scored.possible, 0), 3)::float
                                                                     as accuracy,
            (select count(distinct date_trunc('day', started_at))::int
               from attempt where student_id = $1)                   as active_days
     from scored`,
    [studentId],
  );
  return (
    row ?? { attempts: 0, items: 0, earned: 0, possible: 0, accuracy: 0, active_days: 0 }
  );
}

export type RecentAttempt = {
  attempt_id: string;
  slug: string;
  title_ru: string;
  title_slug: string;
  kind_name: string;
  context: string;
  earned: number;
  possible: number;
  started_at: string;
};

export async function studentRecent(studentId: string, limit = 8): Promise<RecentAttempt[]> {
  return query<RecentAttempt>(
    `select at.id as attempt_id, i.slug, at.context, at.started_at,
            iv.total_marks as possible,
            k.name_ru as kind_name,
            coalesce((select sum(pr.marks_awarded)::int
                        from part_response pr where pr.attempt_id = at.id), 0) as earned,
            (select c.name_ru from item_concept ic
               join concept c on c.id = ic.concept_id
               where ic.item_version_id = iv.id and ic.is_primary limit 1) as title_ru,
            (select coalesce(pc.slug, c.slug) from item_concept ic
               join concept c on c.id = ic.concept_id
               left join concept pc on pc.id = c.parent_id
               where ic.item_version_id = iv.id and ic.is_primary limit 1) as title_slug
     from attempt at
     join item_version iv on iv.id = at.item_version_id
     join item i on i.id = iv.item_id
     join item_kind k on k.id = iv.kind
     where at.student_id = $1
     order by at.started_at desc
     limit $2`,
    [studentId, limit],
  );
}

export async function studentClasses(studentId: string) {
  return query<{ id: string; name: string; teacher_name: string; students: number }>(
    `select c.id, c.name, u.display_name as teacher_name,
            (select count(*)::int from enrolment e2
              where e2.class_id = c.id and e2.removed_at is null) as students
     from enrolment e
     join class c on c.id = e.class_id
     join app_user u on u.id = c.teacher_id
     where e.student_id = $1 and e.removed_at is null and c.archived_at is null
     order by c.name`,
    [studentId],
  );
}

// ── учитель ────────────────────────────────────────────────────────────────

export type TeacherSummary = {
  classes: number;
  students: number;
  assignments: number;
  authored: number;
};

export async function teacherSummary(teacherId: string): Promise<TeacherSummary> {
  const row = await queryOne<TeacherSummary>(
    `select
       (select count(*)::int from class c
         where c.teacher_id = $1 and c.archived_at is null) as classes,
       (select count(distinct e.student_id)::int
          from enrolment e join class c on c.id = e.class_id
          where c.teacher_id = $1 and e.removed_at is null) as students,
       (select count(*)::int from assignment a join class c on c.id = a.class_id
         where c.teacher_id = $1) as assignments,
       (select count(*)::int from item_version iv
         where iv.created_by = $1) as authored`,
    [teacherId],
  );
  return row ?? { classes: 0, students: 0, assignments: 0, authored: 0 };
}

export type StudentAtRisk = {
  student_id: string;
  display_name: string;
  class_id: string;
  class_name: string;
  earned: number;
  possible: number;
  accuracy: number | null;
  missed: number;
  weakest: string | null;
};

/**
 * Ученики, к которым стоит подойти.
 *
 * Два разных повода в одной таблице, и их нельзя смешивать в один балл:
 *  • низкая точность — решает, но ошибается;
 *  • `missed` — не притронулся к заданию, срок которого прошёл.
 * Второе не является «нулевой точностью»: у такого ученика точность вообще
 * не определена, и подменять её нулём значит спутать «не понял»
 * с «не открывал». Поэтому accuracy здесь nullable.
 */
export async function studentsAtRisk(teacherId: string): Promise<StudentAtRisk[]> {
  return query<StudentAtRisk>(
    `with roster as (
       select c.id as class_id, c.name as class_name, u.id as student_id, u.display_name
       from class c
       join enrolment e on e.class_id = c.id and e.removed_at is null
       join app_user u on u.id = e.student_id
       where c.teacher_id = $1 and c.archived_at is null
     ),
     -- Последняя попытка на каждой задаче каждого задания: пересдача не
     -- должна тянуть ученика вниз тем, что первая попытка была слабее.
     latest as (
       select distinct on (at.student_id, at.assignment_id, at.item_version_id)
              at.id, at.student_id, a.class_id
       from attempt at
       join assignment a on a.id = at.assignment_id
       join roster r on r.student_id = at.student_id and r.class_id = a.class_id
       order by at.student_id, at.assignment_id, at.item_version_id, at.started_at desc
     ),
     scored as (
       select l.student_id, l.class_id,
              sum(pr.marks_awarded)::int as earned,
              sum(p.marks)::int          as possible
       from latest l
       join part_response pr on pr.attempt_id = l.id
       join item_part p on p.id = pr.part_id
       group by l.student_id, l.class_id
     ),
     missed as (
       select r.student_id, r.class_id, count(*)::int as missed
       from roster r
       join assignment a on a.class_id = r.class_id
       where a.due_at is not null and a.due_at < now()
         and not exists (
           select 1 from attempt at
           where at.assignment_id = a.id and at.student_id = r.student_id
         )
       group by r.student_id, r.class_id
     ),
     weakest as (
       select distinct on (l.student_id)
              l.student_id, c.name_ru as weakest
       from latest l
       join attempt at on at.id = l.id
       join part_response pr on pr.attempt_id = l.id
       join item_part p on p.id = pr.part_id
       join item_concept ic on ic.item_version_id = at.item_version_id and ic.is_primary
       join concept c on c.id = ic.concept_id
       group by l.student_id, c.name_ru
       having sum(p.marks) > 0
       order by l.student_id,
                sum(pr.marks_awarded)::numeric / nullif(sum(p.marks), 0) asc
     )
     select r.student_id, r.display_name, r.class_id, r.class_name,
            coalesce(s.earned, 0)   as earned,
            coalesce(s.possible, 0) as possible,
            round(s.earned::numeric / nullif(s.possible, 0), 3)::float as accuracy,
            coalesce(m.missed, 0)   as missed,
            w.weakest
     from roster r
     left join scored s on s.student_id = r.student_id and s.class_id = r.class_id
     left join missed m on m.student_id = r.student_id and m.class_id = r.class_id
     left join weakest w on w.student_id = r.student_id
     where coalesce(m.missed, 0) > 0
        or (s.possible > 0 and s.earned::numeric / s.possible < 0.6)
     order by coalesce(m.missed, 0) desc,
              (s.earned::numeric / nullif(s.possible, 0)) asc nulls last`,
    [teacherId],
  );
}

/** Слабые темы по всем классам учителя сразу, а не по одному. */
export async function teacherWeakConcepts(teacherId: string): Promise<Mastery[]> {
  return query<Mastery>(
    // items_seen здесь — число УЧЕНИКОВ, задевших тему: учителю важно,
    // сколько человек за цифрой, а не сколько задач.
    `with latest as (
       select distinct on (at.student_id, at.assignment_id, at.item_version_id)
              at.id, at.student_id, at.item_version_id
       from attempt at
       join assignment a on a.id = at.assignment_id
       join class cl on cl.id = a.class_id
       where cl.teacher_id = $1 and cl.archived_at is null
       order by at.student_id, at.assignment_id, at.item_version_id, at.started_at desc
     )
     select c.slug, c.name_ru,
            coalesce(parent.slug, c.slug) as family_slug,
            sum(pr.marks_awarded)::int    as earned,
            sum(p.marks)::int             as possible,
            round(sum(pr.marks_awarded)::numeric / nullif(sum(p.marks), 0), 3)::float
                                          as accuracy,
            count(distinct l.student_id)::int as items_seen
     from latest l
     join part_response pr on pr.attempt_id = l.id
     join item_part p on p.id = pr.part_id
     join item_concept ic on ic.item_version_id = l.item_version_id and ic.is_primary
     join concept c on c.id = ic.concept_id
     left join concept parent on parent.id = c.parent_id
     group by c.slug, c.name_ru, coalesce(parent.slug, c.slug)
     having sum(p.marks) > 0
     order by accuracy asc`,
    [teacherId],
  );
}
