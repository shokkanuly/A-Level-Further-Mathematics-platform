-- 008 — четыре программы, вид задачи и правило обязательного разбора
--
-- ПРОГРАММА — верхний блок витрины: SAT, школьная математика, A-Level Maths,
-- A-Level Further Maths. ROADMAP §1 требует, чтобы программа была данными,
-- а не кодом: пятая программа добавляется строкой, а не веткой в компоненте
-- и не новой страницей.
--
-- Программа встаёт НАД квалификацией, а не вместо комиссии. Одна программа
-- держит несколько квалификаций разных комиссий: у A-Level Further Maths это
-- Edexcel 9FM0 и CIE 9231. Комиссия по-прежнему отвечает только за
-- обозначения и нумерацию пунктов — это её единственная работа (§3.3).
--
-- ВИД ЗАДАЧИ (kind) — вторая, независимая ось. Одна программа держит и теорию,
-- и практикум, и экзаменационные задачи. Ось намеренно отдельная от концептов:
-- «умножение матриц» и «практикум» — разные вопросы к одной задаче.
--
-- Обязательность разбора зависит от вида и лежит в таблице, а не в форме
-- автора. Положи это правило в форму — и оно разойдётся между формой,
-- YAML-импортом и API, а разойдясь, тихо пропустит задачу без разбора.

create table program (
  id          text primary key,          -- sat | school | alevel-maths | alevel-further
  name_ru     text not null,
  name_en     text not null,
  tagline_ru  text not null,
  -- Имя семейства цветов из globals.css. Цвет блока — данные, чтобы
  -- вёрстка не хранила свою копию соответствия «программа → цвет».
  accent      text not null default 'brass',
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

comment on table program is
  'Верхний блок витрины. Добавление программы не требует миграции — только строки.';

insert into program (id, name_ru, name_en, tagline_ru, accent, position) values
  ('sat', 'SAT Math', 'SAT Math',
   'Digital SAT: Algebra, Advanced Math, Problem-Solving, Geometry.',
   'series', 1),
  ('school', 'Школьная математика', 'School mathematics',
   'Алгебра и геометрия 7–11 класса. База, без которой остальные три блока не берутся.',
   'proof', 2),
  ('alevel-maths', 'A-Level Mathematics', 'A-Level Mathematics',
   'Pure, Statistics и Mechanics основного курса.',
   'vectors', 3),
  ('alevel-further', 'A-Level Further Mathematics', 'A-Level Further Mathematics',
   'Core Pure, Further Mechanics, Further Statistics, Decision. Edexcel и Cambridge раздельно.',
   'matrices', 4);

alter table qualification
  add column program_id text references program (id) on delete restrict;

-- Всё, что уже лежит в базе, засеяно под Further Maths.
update qualification set program_id = 'alevel-further' where program_id is null;

alter table qualification alter column program_id set not null;

create index qualification_program_idx on qualification (program_id);


-- ── вид задачи ──────────────────────────────────────────────────────────────

create table item_kind (
  id                    text primary key,  -- theory | practicum | exam | olympiad
  name_ru               text not null,
  description_ru        text not null,
  -- Ради этого столбца таблица и существует вместо enum: «где обязателен
  -- разбор» — продуктовое решение, оно меняется чаще, чем схема.
  requires_explanation  boolean not null default false,
  position              int not null default 0
);

comment on column item_kind.requires_explanation is
  'Единственный источник правды о том, где разбор обязателен. Проверяется в item_version_problems().';

insert into item_kind (id, name_ru, description_ru, requires_explanation, position) values
  ('theory', 'Теория',
   'Проверка определения, формулировки или условия применимости. Разбор обязателен: без него задача проверяет память, а не понимание.',
   true, 1),
  ('practicum', 'Практикум',
   'Отработка одного приёма по шагам. Разбор обязателен: смысл практикума в том, чтобы увидеть метод целиком.',
   true, 2),
  ('exam', 'Экзаменационная',
   'Задача в формате билета. Разбор не обязателен — его работу выполняет схема оценивания по баллам.',
   false, 3),
  ('olympiad', 'Олимпиадная',
   'Нестандартная задача. Разбор не обязателен: идею часто нельзя разложить в шаги, не убив её.',
   false, 4);

alter table item_version
  add column kind text not null default 'exam' references item_kind (id) on delete restrict,
  -- Разбор задачи целиком, в отличие от solution_step — схемы по баллам.
  -- Текст, а не баллы, поэтому править его у опубликованной версии можно:
  -- та же логика, по которой из-под триггера заморозки выведен
  -- solution_step_text.
  add column explanation_md text;

create index item_version_kind_idx on item_version (kind);


-- ── правило: вид требует разбора ────────────────────────────────────────────
--
-- Пересобираем валидатор целиком: воспроизводим 004 слово в слово и дописываем
-- одну ветку. Дублирование здесь дешевле, чем композиция из двух функций —
-- схема должна читаться из одного файла сверху вниз (§13).

create or replace function item_version_problems(p_version_id uuid)
returns table (code text, detail text)
language sql
stable
as $$
  -- лист без баллов / типа ответа / ключа
  select 'LEAF_PART_INCOMPLETE',
         'часть ' || p.path || ': лист обязан иметь marks, answer_type и answer_spec'
  from item_part p
  where p.item_version_id = p_version_id
    and not exists (select 1 from item_part c where c.parent_part_id = p.id)
    and (p.marks is null or p.answer_type is null or p.answer_spec is null)

  union all

  -- контейнер с собственными баллами
  select 'CONTAINER_PART_HAS_MARKS',
         'часть ' || p.path || ': у части с подпунктами не должно быть своих marks/answer_type'
  from item_part p
  where p.item_version_id = p_version_id
    and exists (select 1 from item_part c where c.parent_part_id = p.id)
    and (p.marks is not null or p.answer_type is not null)

  union all

  -- сумма баллов по листьям ≠ заявленной
  select 'TOTAL_MARKS_MISMATCH',
         'сумма по частям = ' || coalesce(s.leaf_sum, 0) || ', в total_marks = ' || v.total_marks
  from item_version v
  left join (
    select p.item_version_id, sum(p.marks) as leaf_sum
    from item_part p
    where not exists (select 1 from item_part c where c.parent_part_id = p.id)
    group by p.item_version_id
  ) s on s.item_version_id = v.id
  where v.id = p_version_id
    and coalesce(s.leaf_sum, 0) <> v.total_marks

  union all

  -- схема оценивания не покрывает часть ровно
  select 'MARK_SCHEME_COVERAGE',
         'часть ' || p.path || ': marks = ' || p.marks
           || ', шаги покрывают ' || coalesce(st.covered, 0)
  from item_part p
  left join (
    select part_id, sum(marks_covered) as covered
    from solution_step group by part_id
  ) st on st.part_id = p.id
  where p.item_version_id = p_version_id
    and p.marks is not null
    and coalesce(st.covered, 0) <> p.marks

  union all

  -- задача не привязана ни к одному концепту
  select 'NO_CONCEPT', 'задача не привязана ни к одному концепту'
  where not exists (
    select 1 from item_concept ic where ic.item_version_id = p_version_id
  )

  union all

  -- НОВОЕ В 008: вид задачи требует разбора, а разбора нет.
  select 'EXPLANATION_REQUIRED',
         'вид «' || k.name_ru || '» требует разбора, а explanation_md пуст'
  from item_version v
  join item_kind k on k.id = v.kind
  where v.id = p_version_id
    and k.requires_explanation
    and coalesce(btrim(v.explanation_md), '') = ''

  union all

  -- ровно один primary-концепт
  select 'PRIMARY_CONCEPT_COUNT',
         'primary-концептов должно быть ровно 1, найдено ' || count(*)::text
  from item_concept ic
  where ic.item_version_id = p_version_id and ic.is_primary
  having count(*) <> 1;
$$;

comment on function item_version_problems(uuid) is
  'Пустой результат = версию можно публиковать. Проверка LaTeX делается в приложении.';


-- Вид опубликованной версии менять нельзя.
--
-- Без этого правило об обязательном разборе обходится в два движения:
-- опубликовать как «экзаменационную» и переключить на «практикум» — проверка
-- на публикации к тому моменту уже прошла и второй раз не запускается.
create or replace function item_version_kind_freeze()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('published', 'retired') and new.kind is distinct from old.kind then
    raise exception
      'Вид опубликованной задачи менять нельзя (% → %) — создайте новую версию',
      old.kind, new.kind
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger item_version_kind_freeze
  before update on item_version
  for each row execute function item_version_kind_freeze();
