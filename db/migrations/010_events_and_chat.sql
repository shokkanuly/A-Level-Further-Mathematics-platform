-- 010 — события, объявления и чат
--
-- ROADMAP говорил «не строить форум и мессенджер на сайте», и это по-прежнему
-- верно про форум. Здесь другое: чат ПРИВЯЗАН К КЛАССУ и живёт рядом
-- с домашкой. Смысл не в общении как таковом, а в том, чтобы вопрос по задаче
-- задавался там, где видно задачу, а не в мессенджере, где у учителя
-- нет ни истории, ни контекста.
--
-- Отсюда же граница: комнат ровно столько, сколько классов, плюс одна общая.
-- Создавать произвольные комнаты нельзя — так это и становится форумом.

-- ── объявления ──────────────────────────────────────────────────────────────

create table announcement (
  id         uuid primary key default gen_random_uuid(),
  -- global видят все, class — только участники класса
  scope      text not null check (scope in ('global', 'class')),
  class_id   uuid references class (id) on delete cascade,
  author_id  uuid not null references app_user (id) on delete restrict,

  title      text not null,
  body_md    text not null,
  pinned     boolean not null default false,

  created_at timestamptz not null default now(),
  deleted_at timestamptz,

  -- Область и адресат обязаны совпадать: объявление класса без класса
  -- либо не покажется никому, либо покажется всем. Оба исхода плохие.
  constraint announcement_scope_target check (
    (scope = 'global' and class_id is null)
    or (scope = 'class' and class_id is not null)
  )
);

create index announcement_feed_idx
  on announcement (scope, class_id, pinned desc, created_at desc)
  where deleted_at is null;

-- ── события ─────────────────────────────────────────────────────────────────

create table event (
  id             uuid primary key default gen_random_uuid(),
  scope          text not null check (scope in ('global', 'class')),
  class_id       uuid references class (id) on delete cascade,

  title          text not null,
  description_md text,
  starts_at      timestamptz not null,
  ends_at        timestamptz,
  location       text,
  -- Ссылка на встречу. Показывается как ссылка, не как iframe.
  url            text,

  created_by     uuid not null references app_user (id) on delete restrict,
  created_at     timestamptz not null default now(),
  cancelled_at   timestamptz,

  constraint event_scope_target check (
    (scope = 'global' and class_id is null)
    or (scope = 'class' and class_id is not null)
  ),
  constraint event_time_order check (ends_at is null or ends_at >= starts_at)
);

create index event_upcoming_idx on event (starts_at) where cancelled_at is null;

-- ── чат ─────────────────────────────────────────────────────────────────────

create table chat_room (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('global', 'class')),
  class_id   uuid references class (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),

  constraint chat_room_scope_target check (
    (kind = 'global' and class_id is null)
    or (kind = 'class' and class_id is not null)
  )
);

-- У класса ровно одна комната, и общая ровно одна. Это и есть та граница,
-- за которой чат превращается в форум.
create unique index chat_room_one_per_class_idx on chat_room (class_id)
  where class_id is not null;
create unique index chat_room_single_global_idx on chat_room ((kind))
  where kind = 'global';

create table chat_message (
  -- Курсор для дочитывания: чтение идёт «всё, что больше seq», и это должен
  -- быть монотонный ключ. uuid здесь не годится — он не упорядочен,
  -- а created_at не уникален и при равных метках терял бы сообщения.
  seq        bigint generated always as identity primary key,
  id         uuid not null default gen_random_uuid() unique,

  room_id    uuid not null references chat_room (id) on delete cascade,
  author_id  uuid not null references app_user (id) on delete cascade,
  body       text not null check (btrim(body) <> '' and length(body) <= 2000),

  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index chat_message_room_seq_idx on chat_message (room_id, seq);

-- Общая комната создаётся здесь, а не кодом при первом заходе: «создать,
-- если нет» в обработчике запроса — это гонка, которая однажды сделает
-- две общие комнаты.
insert into chat_room (kind, class_id, name)
values ('global', null, 'Общий чат');
