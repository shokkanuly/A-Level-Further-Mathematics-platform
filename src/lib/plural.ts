/**
 * Русское склонение по числу: 1 ученик, 2 ученика, 5 учеников.
 *
 * Вынесено в общее место, потому что «1 учеников» в интерфейсе для учителей
 * выглядит как недоделанный продукт, а повторять правило в каждом файле —
 * гарантия, что где-то его забудут.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const students = (n: number) => `${n} ${plural(n, "ученик", "ученика", "учеников")}`;
export const assignments = (n: number) => `${n} ${plural(n, "задание", "задания", "заданий")}`;
export const items = (n: number) => `${n} ${plural(n, "задача", "задачи", "задач")}`;
export const parts = (n: number) => `${n} ${plural(n, "пункт", "пункта", "пунктов")}`;
export const marks = (n: number) => `${n} ${plural(n, "балл", "балла", "баллов")}`;
export const steps = (n: number) => `${n} ${plural(n, "шаг", "шага", "шагов")}`;
