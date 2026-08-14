-- 007 — учебный слой: классы и назначения (SYSTEM-DESIGN §5)
--
-- То, ради чего проект существует: тьютор выдаёт домашку и видит результат,
-- не открывая мессенджер.

create table organisation (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table class (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid references organisation (id) on delete set null,
  teacher_id       uuid not null references app_user (id) on delete restrict,
  name             text not null,
  -- Код вступления: ученик присоединяется по коду, а не по приглашению
  -- на почту. У школьников почта часто чужая или её нет вовсе.
  join_code        text not null unique,
  archived_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index class_teacher_idx on class (teacher_id);

create table enrolment (
  class_id    uuid not null references class (id) on delete cascade,
  student_id  uuid not null references app_user (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  removed_at  timestamptz,
  primary key (class_id, student_id)
);

create index enrolment_student_idx on enrolment (student_id);

create table assignment (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references class (id) on delete cascade,
  title       text not null,
  opens_at    timestamptz not null default now(),
  due_at      timestamptz,
  -- §5: настройки лежат данными, а не полями — их набор будет расти
  settings    jsonb not null default jsonb_build_object(
                'attempts_allowed', 3,
                'solutions_locked_until_due', true,
                'calculator_allowed', true,
                'shuffle_items', false
              ),
  created_by  uuid not null references app_user (id) on delete restrict,
  created_at  timestamptz not null default now()
);

create index assignment_class_idx on assignment (class_id, due_at desc);

create table assignment_item (
  assignment_id    uuid not null references assignment (id) on delete cascade,
  -- Ссылка на ВЕРСИЮ: если задачу перевыпустят, уже выданная домашка
  -- не должна поменяться под учениками на полпути.
  item_version_id  uuid not null references item_version (id) on delete restrict,
  position         int  not null,
  primary key (assignment_id, item_version_id)
);

create index assignment_item_order_idx on assignment_item (assignment_id, position);

-- Теперь у attempt.assignment_id появляется адресат.
alter table attempt
  add constraint attempt_assignment_fk
  foreign key (assignment_id) references assignment (id) on delete set null;
