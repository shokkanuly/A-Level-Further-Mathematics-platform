-- 003 — попытки, ответы, пересчёт (SYSTEM-DESIGN §4.4)
--
-- Здесь живёт главное решение всей системы: хранится не «верно/неверно»,
-- а сырой ответ ученика рядом с тем, чем его проверяли.

create type user_role as enum ('student', 'teacher', 'author', 'reviewer', 'admin');

create table app_user (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  display_name  text not null,
  role          user_role not null default 'student',
  created_at    timestamptz not null default now()
);

create table attempt (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references app_user (id) on delete cascade,
  -- ссылка на конкретную ВЕРСИЮ: «почему у ученика 3 балла, если сейчас 5»
  item_version_id  uuid not null references item_version (id) on delete restrict,
  context          text not null default 'practice'
                     check (context in ('practice', 'assignment', 'test')),
  -- заполняется со Stage 3, когда появятся классы и назначения
  assignment_id    uuid,
  started_at       timestamptz not null default now(),
  submitted_at     timestamptz
);

create index attempt_student_idx on attempt (student_id, started_at desc);
create index attempt_version_idx on attempt (item_version_id);

create table part_response (
  id                      uuid primary key default gen_random_uuid(),
  attempt_id              uuid not null references attempt (id) on delete cascade,
  -- часть, которую ученик реально видел (принадлежит версии из attempt)
  part_id                 uuid not null references item_part (id) on delete restrict,

  -- Ровно то, что ввёл ученик. Без нормализации, без интерпретации.
  -- Всё остальное в этой таблице производно и может быть пересчитано.
  raw_response            jsonb not null,

  -- машинный балл и учительское переопределение хранятся раздельно (§5),
  -- эффективный балл выводится, а не дублируется
  auto_marks_awarded      int not null check (auto_marks_awarded >= 0),
  override_marks          int check (override_marks >= 0),
  override_by             uuid references app_user (id),
  override_at             timestamptz,
  marks_awarded           int generated always as
                            (coalesce(override_marks, auto_marks_awarded)) stored,

  -- машинный код, не текст: формулировку можно переписать и перевести,
  -- не пересчитывая ни одной попытки (§4.2)
  feedback_code           text not null,

  grader_version          text not null,
  -- Чем именно проверяли. Обычно = part_id; после пересчёта указывает
  -- на часть новой версии, тогда как part_id остаётся тем, что видел ученик.
  graded_against_part_id  uuid not null references item_part (id) on delete restrict,
  graded_at               timestamptz not null default now(),

  unique (attempt_id, part_id)
);

create index part_response_part_idx on part_response (part_id);
create index part_response_graded_against_idx on part_response (graded_against_part_id);

-- §4.4: пересчёт оставляет след в журнале.
create table regrade_run (
  id                uuid primary key default gen_random_uuid(),
  reason            text not null,
  from_version_id   uuid not null references item_version (id) on delete restrict,
  to_version_id     uuid not null references item_version (id) on delete restrict,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  responses_seen    int not null default 0,
  responses_changed int not null default 0
);

create table regrade_entry (
  id                uuid primary key default gen_random_uuid(),
  regrade_run_id    uuid not null references regrade_run (id) on delete cascade,
  part_response_id  uuid not null references part_response (id) on delete cascade,
  marks_before      int  not null,
  marks_after       int  not null,
  feedback_before   text not null,
  feedback_after    text not null,
  created_at        timestamptz not null default now()
);

create index regrade_entry_run_idx on regrade_entry (regrade_run_id);
