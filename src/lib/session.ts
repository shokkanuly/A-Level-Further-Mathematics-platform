import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query, queryOne } from "./db";
import { SESSION_COOKIE, hashToken } from "./auth.mjs";

export type Role = "student" | "teacher" | "author" | "reviewer" | "admin";

export type CurrentUser = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
};

/**
 * Текущий пользователь или null (SYSTEM-DESIGN §10).
 *
 * Правила доступа собраны здесь и в guard-функциях ниже, а не размазаны
 * по обработчикам — иначе один забытый обработчик отдаёт чужие попытки.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  return queryOne<CurrentUser>(
    `select u.id, u.email, u.display_name, u.role
     from session s
     join app_user u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
}

/** Для страниц, куда без входа нельзя. */
export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

export async function requireTeacher(next?: string): Promise<CurrentUser> {
  const user = await requireUser(next);
  if (!["teacher", "author", "admin"].includes(user.role)) redirect("/learn");
  return user;
}

/** Учитель видит только свои классы. Проверка отдельной функцией, не условием в JSX. */
export async function assertOwnsClass(userId: string, classId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from class where id = $1 and teacher_id = $2`,
    [classId, userId],
  );
  return row !== null;
}

/** Ученик видит задание, только если состоит в классе, которому оно выдано. */
export async function assertEnrolledInAssignment(
  userId: string,
  assignmentId: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select a.id from assignment a
     join enrolment e on e.class_id = a.class_id
     where a.id = $1 and e.student_id = $2 and e.removed_at is null`,
    [assignmentId, userId],
  );
  return row !== null;
}

export async function destroySession(token: string) {
  await query(`delete from session where token_hash = $1`, [hashToken(token)]);
}
