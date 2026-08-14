import { queryOne } from "./db";

/**
 * Правило показа разбора (SYSTEM-DESIGN §5, §8).
 *
 * Живёт на сервере, а не в интерфейсе: пошаговый разбор рядом с полем ответа
 * обнуляет смысл домашки, и прятать его в UI бесполезно — вкладка network
 * открывается в два клика.
 *
 * Решение принимается по КОНТЕКСТУ ПОПЫТКИ, а не по роли и не по задаче.
 * Одна и та же задача бывает у ученика одновременно в домашке и в свободной
 * практике — это две разные попытки, и открытый разбор в практике не имеет
 * права разблокировать разбор в домашке.
 */

export type GateResult = { allowed: boolean; reason: string };

export async function solutionGate(attemptId: string | null): Promise<GateResult> {
  // Свободная практика без попытки: банк открыт, разбор тоже.
  if (!attemptId) return { allowed: true, reason: "PRACTICE_OPEN" };

  const attempt = await queryOne<{
    context: string;
    assignment_id: string | null;
    submitted_at: Date | null;
  }>(`select context, assignment_id, submitted_at from attempt where id = $1`, [attemptId]);

  if (!attempt) return { allowed: false, reason: "ATTEMPT_NOT_FOUND" };
  if (attempt.context === "practice") return { allowed: true, reason: "PRACTICE_OPEN" };

  // Контекст «домашка», но задание не проставлено — данные битые,
  // и по умолчанию отказ, а не разрешение.
  if (!attempt.assignment_id) return { allowed: false, reason: "ASSIGNMENT_MISSING" };

  const assignment = await queryOne<{
    due_at: Date | null;
    locked: boolean;
    past_due: boolean;
  }>(
    `select due_at,
            coalesce((settings->>'solutions_locked_until_due')::boolean, true) as locked,
            (due_at is not null and due_at < now()) as past_due
     from assignment where id = $1`,
    [attempt.assignment_id],
  );

  if (!assignment) return { allowed: false, reason: "ASSIGNMENT_NOT_FOUND" };

  // Учитель снял замок — разбор открыт сразу.
  if (!assignment.locked) return { allowed: true, reason: "ASSIGNMENT_UNLOCKED" };

  // Дедлайн прошёл — разбор открывается всем, даже несдавшим:
  // после срока разбор становится учебным материалом, а не подсказкой.
  if (assignment.past_due) return { allowed: true, reason: "PAST_DUE" };

  // Задание без дедлайна с включённым замком: открыть нечему, ждём сдачи.
  if (!assignment.due_at) {
    return attempt.submitted_at
      ? { allowed: true, reason: "SUBMITTED" }
      : { allowed: false, reason: "NOT_SUBMITTED" };
  }

  return { allowed: false, reason: "LOCKED_UNTIL_DUE" };
}
