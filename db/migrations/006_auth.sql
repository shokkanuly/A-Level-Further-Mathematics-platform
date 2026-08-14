-- 006 — аутентификация (SYSTEM-DESIGN §10)
--
-- Пароли хешируются scrypt из node:crypto: отдельной зависимости под это
-- не берём, а bcrypt тянет нативную сборку, которой на Vercel быть не должно.
--
-- Токен сессии в базе лежит только в виде хеша. Утечка дампа не должна
-- давать возможность войти под чужим аккаунтом.

alter table app_user
  add column password_hash text,
  add column last_login_at timestamptz;

create table session (
  -- sha256 от токена; сам токен видит только браузер владельца
  token_hash  text primary key,
  user_id     uuid not null references app_user (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  user_agent  text
);

create index session_user_idx on session (user_id);
create index session_expiry_idx on session (expires_at);
