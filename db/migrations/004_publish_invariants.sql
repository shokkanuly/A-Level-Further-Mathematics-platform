-- 004 — блокирующая валидация публикации (SYSTEM-DESIGN §3.2, §9)
--
-- Схема оценивания не может недобирать или перебирать баллы.
-- Правило живёт в базе, а не в форме автора: импорт из YAML, ручной ввод
-- и любой будущий путь обязаны пройти через одну и ту же проверку.

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

  -- ровно один primary-концепт
  select 'PRIMARY_CONCEPT_COUNT',
         'primary-концептов должно быть ровно 1, найдено ' || count(*)::text
  from item_concept ic
  where ic.item_version_id = p_version_id and ic.is_primary
  having count(*) <> 1;
$$;

comment on function item_version_problems(uuid) is
  'Пустой результат = версию можно публиковать. Проверка LaTeX делается в приложении.';


create or replace function item_version_publish(p_version_id uuid, p_reviewed_by uuid default null)
returns void
language plpgsql
as $$
declare
  v_problems text;
  v_item_id  uuid;
begin
  select string_agg(code || ': ' || detail, E'\n')
    into v_problems
    from item_version_problems(p_version_id);

  if v_problems is not null then
    raise exception E'Публикация отклонена:\n%', v_problems
      using errcode = 'check_violation';
  end if;

  select item_id into v_item_id from item_version where id = p_version_id;
  if v_item_id is null then
    raise exception 'item_version % не найдена', p_version_id;
  end if;

  -- предыдущая опубликованная уходит в retired, но остаётся читаемой:
  -- на неё ссылаются попытки учеников
  update item_version
     set status = 'retired', retired_at = now()
   where item_id = v_item_id and status = 'published' and id <> p_version_id;

  update item_version
     set status = 'published',
         published_at = now(),
         reviewed_by = coalesce(p_reviewed_by, reviewed_by)
   where id = p_version_id;
end;
$$;


-- Опубликованная версия неизменяема (§3.4). Правка = новая версия.
--
-- Триггер намеренно не ставится на solution_step_text: перевод и переформулировку
-- разбора можно править всегда — текст не участвует в подсчёте баллов.
create or replace function item_version_freeze()
returns trigger
language plpgsql
as $$
declare
  v_version_id uuid;
  v_status     item_status;
begin
  v_version_id := case when tg_op = 'DELETE'
                       then old.item_version_id
                       else new.item_version_id end;

  select status into v_status from item_version where id = v_version_id;

  if v_status in ('published', 'retired') then
    raise exception
      'Версия задачи опубликована и неизменяема — создайте новую версию (таблица %, версия %)',
      tg_table_name, v_version_id
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger item_part_freeze
  before insert or update or delete on item_part
  for each row execute function item_version_freeze();

create trigger solution_step_freeze
  before insert or update or delete on solution_step
  for each row execute function item_version_freeze();

create trigger item_concept_freeze
  before insert or update or delete on item_concept
  for each row execute function item_version_freeze();
