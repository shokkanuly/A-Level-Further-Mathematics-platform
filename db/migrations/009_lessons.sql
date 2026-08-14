-- 009 — уроки: видео и конспект
--
-- Урок и задача — разные вещи, и объединять их в одну таблицу «материал»
-- не надо: у задачи есть баллы, версии и попытки, у урока — ничего из этого.
-- Общее у них ровно одно — привязка к концептам, и она вынесена отдельной
-- таблицей, как у задач.
--
-- ВИДЕО ХРАНИТСЯ НЕ ССЫЛКОЙ. В базе лежат провайдер и идентификатор ролика,
-- а адрес для iframe собирается кодом. Причина в том, что произвольный URL
-- из формы, подставленный в src="…", — это чужой скрипт в нашем origin.
-- Разобрав ссылку один раз при сохранении, мы получаем гарантию: в iframe
-- уедет youtube.com/embed/<id> и ничего другого, чем бы ни было в поле.

create table lesson (
  id           uuid primary key default gen_random_uuid(),

  -- null = открытый урок, виден всем. Иначе — только классу.
  class_id     uuid references class (id) on delete cascade,
  -- null = урок вне программы (общая методика, разбор олимпиады)
  program_id   text references program (id) on delete set null,

  title        text not null,
  summary_md   text,

  video_provider text check (video_provider in ('youtube', 'vimeo')),
  video_id       text,
  -- Оба поля либо заполнены, либо пусты: половина видео не бывает.
  constraint lesson_video_pair check (
    (video_provider is null and video_id is null)
    or (video_provider is not null and video_id is not null)
  ),

  conspectus_md text,

  position     int not null default 0,
  created_by   uuid not null references app_user (id) on delete restrict,
  published_at timestamptz,
  created_at   timestamptz not null default now(),

  -- Урок без видео и без конспекта — пустая карточка в списке.
  constraint lesson_has_content check (
    video_id is not null or coalesce(btrim(conspectus_md), '') <> ''
  )
);

comment on column lesson.video_id is
  'Идентификатор ролика, не ссылка. Адрес для iframe собирается кодом — см. src/lib/video.ts.';

create index lesson_class_idx on lesson (class_id, position);
create index lesson_program_idx on lesson (program_id, position);

create table lesson_concept (
  lesson_id  uuid not null references lesson (id) on delete cascade,
  concept_id uuid not null references concept (id) on delete restrict,
  primary key (lesson_id, concept_id)
);

create index lesson_concept_by_concept_idx on lesson_concept (concept_id);

-- Просмотры: без них «мониторинг учеников» упирается в одни только баллы,
-- а урок, который никто не открыл, объясняет провал лучше любой аналитики.
create table lesson_view (
  lesson_id       uuid not null references lesson (id) on delete cascade,
  student_id      uuid not null references app_user (id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at  timestamptz not null default now(),
  view_count      int not null default 1,
  primary key (lesson_id, student_id)
);

create index lesson_view_student_idx on lesson_view (student_id, last_viewed_at desc);
