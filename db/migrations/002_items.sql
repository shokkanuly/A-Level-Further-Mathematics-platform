-- 002 — задача как версионируемый документ (SYSTEM-DESIGN §3.2, §3.4)
--
-- Разделение item / item_version — это то, что делает §3.4 исполнимым.
-- `item` — стабильная идентичность (slug, ссылки, SEO).
-- `item_version` — неизменяемый документ. Правка = новая строка, старая → retired.
--
-- Части принадлежат ВЕРСИИ, а не задаче. Это закрывает дыру, при которой
-- attempt ссылается на item_version, а part_response — на голый part_id:
-- part_id теперь сам по себе несёт версию.

create type item_status as enum ('draft', 'in_review', 'published', 'retired');

create table item (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

create table item_version (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references item (id) on delete cascade,
  version       int  not null check (version > 0),
  status        item_status not null default 'draft',

  stem_md       text not null,
  difficulty    int  not null check (difficulty between 1 and 5),
  -- §3.2: вычисляется из частей, не вводится руками.
  -- Здесь хранится ради дешёвого чтения; равенство сумме проверяется при публикации.
  total_marks   int  not null check (total_marks > 0),
  origin        text not null default 'original'
                  check (origin in ('original', 'adapted_from_spec')),
  -- переопределение профиля обозначений на уровне задачи; обычно null → берётся с комиссии
  notation_override jsonb,

  created_by    uuid,
  reviewed_by   uuid,
  published_at  timestamptz,
  retired_at    timestamptz,
  created_at    timestamptz not null default now(),

  unique (item_id, version)
);

-- Опубликованная версия у задачи ровно одна.
create unique index item_version_one_published_idx
  on item_version (item_id)
  where status = 'published';

create table item_part (
  id              uuid primary key default gen_random_uuid(),
  item_version_id uuid not null references item_version (id) on delete cascade,
  parent_part_id  uuid references item_part (id) on delete cascade,

  label           text not null,        -- 'a' | 'b' | 'i' | 'ii'
  -- Человекочитаемый стабильный ключ внутри задачи: 'a', 'b', 'b.i', 'b.ii'.
  -- Именно по нему пересчёт сопоставляет части старой и новой версии.
  path            text not null,
  position        int  not null,

  text_md         text not null,
  -- null у контейнерных частей (у (b) есть (b)(i) и (b)(ii), своих баллов нет)
  answer_type     text,
  answer_spec     jsonb,
  marks           int check (marks is null or marks > 0),

  unique (item_version_id, path)
);

create index item_part_version_idx on item_part (item_version_id, position);
create index item_part_parent_idx  on item_part (parent_part_id);

-- §3.2: SolutionStep и есть mark scheme.
-- Привязка — по part_id, а не по строковому лейблу: с подпунктами (a)(i)
-- строка неоднозначна, а инвариант «шаги покрывают ровно все баллы»
-- требует честного join'а к частям.
create table solution_step (
  id              uuid primary key default gen_random_uuid(),
  item_version_id uuid not null references item_version (id) on delete cascade,
  part_id         uuid not null references item_part (id) on delete cascade,
  position        int  not null,
  mark_code       text not null
                    check (mark_code in ('M1','A1','B1','dM1','dA1','ft','cso','cao','E1')),
  -- сколько баллов покрывает шаг; сумма по части обязана равняться part.marks
  marks_covered   int  not null check (marks_covered >= 0),
  media_id        uuid,

  unique (item_version_id, position)
);

create index solution_step_part_idx on solution_step (part_id, position);

-- Текст шага отделён от самого шага: локаль не должна размножать баллы.
-- Условие задачи остаётся на английском (§12), разбор локализуется.
create table solution_step_text (
  solution_step_id uuid not null references solution_step (id) on delete cascade,
  locale           text not null check (locale in ('ru', 'kk', 'en')),
  text_md          text not null,
  primary key (solution_step_id, locale)
);

create table item_concept (
  item_version_id uuid not null references item_version (id) on delete cascade,
  concept_id      uuid not null references concept (id) on delete restrict,
  is_primary      boolean not null default false,
  primary key (item_version_id, concept_id)
);

create index item_concept_by_concept_idx on item_concept (concept_id);
