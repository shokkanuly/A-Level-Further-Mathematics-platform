-- 001 — две независимые таксономии (SYSTEM-DESIGN §3.1)
--
-- Concept  — канонический, board-agnostic. К нему привязывается задача.
-- Board → Qualification → Unit → SpecPoint — board-specific.
-- Связь между ними — many-to-many, и только через concept_spec_point.
--
-- Фильтр «я готовлюсь к Edexcel» разрешается обратным обходом:
--   board → spec_point → concept → item. Никакого ветвления в коде.

create extension if not exists pgcrypto;

create table concept (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references concept (id) on delete restrict,
  slug        text not null unique,
  name_en     text not null,
  name_ru     text not null,
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

comment on table concept is
  'Каноническая математика. Аналитика прогресса считается по этой оси, не по юнитам комиссии.';

create index concept_parent_idx on concept (parent_id);

create table board (
  id                text primary key,          -- edexcel | cie | aqa
  name              text not null,
  -- §3.3: различия в обозначениях решаются макросами, а не копией задачи
  notation_profile  jsonb not null default '{}'::jsonb
);

create table qualification (
  id        uuid primary key default gen_random_uuid(),
  board_id  text not null references board (id) on delete restrict,
  code      text not null,                     -- 9FM0 | 9231
  name      text not null,
  unique (board_id, code)
);

create table unit (
  id                uuid primary key default gen_random_uuid(),
  qualification_id  uuid not null references qualification (id) on delete cascade,
  code              text not null,             -- CP1 | FP1 | FM1 | D1
  name              text not null,
  position          int  not null default 0,
  unique (qualification_id, code)
);

comment on table unit is
  'Отсутствие Decision Mathematics у CIE — это просто отсутствие строки здесь.';

create table spec_point (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references unit (id) on delete cascade,
  code          text not null,                 -- '2.1'
  statement     text not null,                 -- своя формулировка, не копия текста спецификации
  -- §13: спецификации комиссий меняются. Пункт версионируется,
  -- задача привязана к концепту и потому переживает смену версии.
  spec_version  text not null,
  unique (unit_id, code, spec_version)
);

create table concept_spec_point (
  concept_id     uuid not null references concept (id) on delete cascade,
  spec_point_id  uuid not null references spec_point (id) on delete cascade,
  primary key (concept_id, spec_point_id)
);

create index concept_spec_point_by_spec_idx on concept_spec_point (spec_point_id);
