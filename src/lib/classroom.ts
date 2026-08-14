import { query, queryOne } from "./db";

export type ClassRow = {
  id: string;
  name: string;
  join_code: string;
  student_count: number;
  assignment_count: number;
  created_at: string;
};

export async function listClassesForTeacher(teacherId: string): Promise<ClassRow[]> {
  return query<ClassRow>(
    `select c.id, c.name, c.join_code, c.created_at,
            (select count(*)::int from enrolment e
              where e.class_id = c.id and e.removed_at is null) as student_count,
            (select count(*)::int from assignment a where a.class_id = c.id) as assignment_count
     from class c
     where c.teacher_id = $1 and c.archived_at is null
     order by c.created_at desc`,
    [teacherId],
  );
}

export async function getClass(classId: string) {
  return queryOne<{ id: string; name: string; join_code: string; teacher_id: string }>(
    `select id, name, join_code, teacher_id from class where id = $1`,
    [classId],
  );
}

export async function listStudents(classId: string) {
  return query<{ id: string; display_name: string; email: string; joined_at: string }>(
    `select u.id, u.display_name, u.email, e.joined_at
     from enrolment e
     join app_user u on u.id = e.student_id
     where e.class_id = $1 and e.removed_at is null
     order by u.display_name`,
    [classId],
  );
}

export type AssignmentRow = {
  id: string;
  title: string;
  due_at: string | null;
  opens_at: string;
  item_count: number;
  total_marks: number;
  settings: Record<string, unknown>;
};

export async function listAssignments(classId: string): Promise<AssignmentRow[]> {
  return query<AssignmentRow>(
    `select a.id, a.title, a.due_at, a.opens_at, a.settings,
            count(ai.item_version_id)::int as item_count,
            coalesce(sum(iv.total_marks), 0)::int as total_marks
     from assignment a
     left join assignment_item ai on ai.assignment_id = a.id
     left join item_version iv on iv.id = ai.item_version_id
     where a.class_id = $1
     group by a.id
     order by coalesce(a.due_at, a.opens_at) desc`,
    [classId],
  );
}

/**
 * Домашка ученика: что выдано, что сдано, сколько набрано.
 *
 * Баллы считаются по part_response, а не по флагу «сдано»: частичный зачёт
 * первичен, и ученик должен видеть 6 из 8, а не «не сдано».
 */
export type StudentAssignment = AssignmentRow & {
  class_name: string;
  attempted_items: number;
  scored: number;
  is_overdue: boolean;
};

export async function listAssignmentsForStudent(studentId: string): Promise<StudentAssignment[]> {
  return query<StudentAssignment>(
    `select a.id, a.title, a.due_at, a.opens_at, a.settings,
            c.name as class_name,
            count(distinct ai.item_version_id)::int as item_count,
            coalesce(sum(distinct iv.total_marks), 0)::int as total_marks,
            (select count(distinct at.item_version_id)::int
               from attempt at where at.assignment_id = a.id and at.student_id = $1)
              as attempted_items,
            (select coalesce(sum(pr.marks_awarded), 0)::int
               from attempt at
               join part_response pr on pr.attempt_id = at.id
               where at.assignment_id = a.id and at.student_id = $1)
              as scored,
            (a.due_at is not null and a.due_at < now()) as is_overdue
     from assignment a
     join class c on c.id = a.class_id
     join enrolment e on e.class_id = c.id and e.student_id = $1 and e.removed_at is null
     left join assignment_item ai on ai.assignment_id = a.id
     left join item_version iv on iv.id = ai.item_version_id
     where a.opens_at <= now()
     group by a.id, c.name
     order by (a.due_at is null), a.due_at asc`,
    [studentId],
  );
}

export async function getAssignment(assignmentId: string) {
  return queryOne<{
    id: string;
    class_id: string;
    title: string;
    due_at: string | null;
    settings: Record<string, unknown>;
    class_name: string;
    teacher_id: string;
  }>(
    `select a.id, a.class_id, a.title, a.due_at, a.settings,
            c.name as class_name, c.teacher_id
     from assignment a join class c on c.id = a.class_id
     where a.id = $1`,
    [assignmentId],
  );
}

export async function listAssignmentItems(assignmentId: string) {
  return query<{
    item_version_id: string;
    slug: string;
    title_ru: string;
    total_marks: number;
    position: number;
  }>(
    `select ai.item_version_id, i.slug, iv.total_marks, ai.position,
            (select c.name_ru from item_concept ic
              join concept c on c.id = ic.concept_id
              where ic.item_version_id = iv.id and ic.is_primary limit 1) as title_ru
     from assignment_item ai
     join item_version iv on iv.id = ai.item_version_id
     join item i on i.id = iv.item_id
     where ai.assignment_id = $1
     order by ai.position`,
    [assignmentId],
  );
}

/**
 * Результаты класса по заданию: строка на ученика, столбец на задачу.
 *
 * §6: учитель смотрит не на галочки, а на баллы — и дальше на темы.
 */
export async function assignmentResults(assignmentId: string) {
  return query<{
    student_id: string;
    display_name: string;
    item_version_id: string;
    scored: number | null;
    possible: number;
    submitted_at: string | null;
  }>(
    `select u.id as student_id, u.display_name,
            ai.item_version_id,
            iv.total_marks as possible,
            (select sum(pr.marks_awarded)::int
               from attempt at2
               join part_response pr on pr.attempt_id = at2.id
               where at2.assignment_id = $1
                 and at2.student_id = u.id
                 and at2.item_version_id = ai.item_version_id) as scored,
            (select max(at3.submitted_at)
               from attempt at3
               where at3.assignment_id = $1
                 and at3.student_id = u.id
                 and at3.item_version_id = ai.item_version_id) as submitted_at
     from assignment a
     join enrolment e on e.class_id = a.class_id and e.removed_at is null
     join app_user u on u.id = e.student_id
     cross join lateral (
       select ai.item_version_id, ai.position
       from assignment_item ai where ai.assignment_id = a.id
     ) ai
     join item_version iv on iv.id = ai.item_version_id
     where a.id = $1
     order by u.display_name, ai.position`,
    [assignmentId],
  );
}

/**
 * Слабые темы класса — по концептам, а не по юнитам комиссии (§3.1, §6).
 * Ученик, сменивший комиссию, не теряет накопленную статистику.
 */
export async function classWeakConcepts(classId: string) {
  return query<{
    concept: string;
    scored: number;
    possible: number;
    accuracy: number;
    students: number;
  }>(
    `select c.name_ru as concept,
            sum(pr.marks_awarded)::int as scored,
            sum(p.marks)::int as possible,
            round(sum(pr.marks_awarded)::numeric / nullif(sum(p.marks), 0), 3)::float as accuracy,
            count(distinct at.student_id)::int as students
     from attempt at
     join assignment a on a.id = at.assignment_id and a.class_id = $1
     join part_response pr on pr.attempt_id = at.id
     join item_part p on p.id = pr.part_id
     join item_concept ic on ic.item_version_id = at.item_version_id and ic.is_primary
     join concept c on c.id = ic.concept_id
     group by c.name_ru
     having sum(p.marks) > 0
     order by accuracy asc`,
    [classId],
  );
}
