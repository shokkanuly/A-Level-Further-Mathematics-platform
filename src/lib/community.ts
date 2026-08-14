import { query, queryOne } from "./db";

/**
 * События, объявления и чат (миграция 010).
 *
 * Видимость везде решается одним и тем же способом: «глобальное — всем,
 * классное — участникам класса и его учителю». Правило вынесено в константу
 * ниже и подставляется во все запросы, потому что четыре его копии
 * разойдутся, а разойдясь — покажут чужому классу его переписку.
 */

/** $1 — id пользователя. Работает для announcement, event и chat_room. */
const MINE = `(
  x.class_id is null
  or exists (
    select 1 from enrolment e
    where e.class_id = x.class_id and e.student_id = $1 and e.removed_at is null
  )
  or exists (select 1 from class c where c.id = x.class_id and c.teacher_id = $1)
)`;

export type Announcement = {
  id: string;
  scope: "global" | "class";
  class_id: string | null;
  class_name: string | null;
  title: string;
  body_md: string;
  pinned: boolean;
  author_name: string;
  author_role: string;
  created_at: string;
};

export async function listAnnouncements(userId: string, limit = 20): Promise<Announcement[]> {
  return query<Announcement>(
    `select x.id, x.scope, x.class_id, c.name as class_name,
            x.title, x.body_md, x.pinned, x.created_at,
            u.display_name as author_name, u.role as author_role
     from announcement x
     join app_user u on u.id = x.author_id
     left join class c on c.id = x.class_id
     where x.deleted_at is null and ${MINE}
     order by x.pinned desc, x.created_at desc
     limit $2`,
    [userId, limit],
  );
}

export type EventRow = {
  id: string;
  scope: "global" | "class";
  class_id: string | null;
  class_name: string | null;
  title: string;
  description_md: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  url: string | null;
  author_name: string;
  is_past: boolean;
};

export async function listEvents(userId: string, includePast = false): Promise<EventRow[]> {
  return query<EventRow>(
    `select x.id, x.scope, x.class_id, c.name as class_name,
            x.title, x.description_md, x.starts_at, x.ends_at, x.location, x.url,
            u.display_name as author_name,
            (coalesce(x.ends_at, x.starts_at) < now()) as is_past
     from event x
     join app_user u on u.id = x.created_by
     left join class c on c.id = x.class_id
     where x.cancelled_at is null
       and ($2 or coalesce(x.ends_at, x.starts_at) >= now())
       and ${MINE}
     order by x.starts_at asc
     limit 40`,
    [userId, includePast],
  );
}

export type Room = {
  id: string;
  kind: "global" | "class";
  class_id: string | null;
  name: string;
  last_at: string | null;
  unread_hint: number;
};

export async function listRooms(userId: string): Promise<Room[]> {
  return query<Room>(
    `select x.id, x.kind, x.class_id, x.name,
            (select max(m.created_at) from chat_message m
              where m.room_id = x.id and m.deleted_at is null) as last_at,
            (select count(*)::int from chat_message m
              where m.room_id = x.id and m.deleted_at is null
                and m.created_at > now() - interval '24 hours') as unread_hint
     from chat_room x
     where ${MINE}
     order by (x.kind = 'global') desc, x.name`,
    [userId],
  );
}

/** Доступ к комнате — тот же вопрос, что и видимость, но с ответом да/нет. */
export async function canUseRoom(userId: string, roomId: string): Promise<Room | null> {
  return queryOne<Room>(
    `select x.id, x.kind, x.class_id, x.name, null::timestamptz as last_at, 0 as unread_hint
     from chat_room x
     where x.id = $2 and ${MINE}`,
    [userId, roomId],
  );
}

export type Message = {
  seq: string;
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_name: string;
  author_role: string;
};

/**
 * Сообщения после курсора.
 *
 * `after` — это seq, а не время: при одинаковых created_at выборка по времени
 * теряет сообщения, а seq монотонен по построению (010).
 */
export async function listMessages(
  roomId: string,
  { after, limit = 60 }: { after?: string; limit?: number } = {},
): Promise<Message[]> {
  if (after) {
    return query<Message>(
      `select m.seq::text, m.id, m.body, m.created_at,
              m.author_id, u.display_name as author_name, u.role as author_role
       from chat_message m
       join app_user u on u.id = m.author_id
       where m.room_id = $1 and m.deleted_at is null and m.seq > $2::bigint
       order by m.seq asc
       limit $3`,
      [roomId, after, limit],
    );
  }

  // Первая загрузка: последние N, но отданные в прямом порядке — иначе
  // клиенту пришлось бы разворачивать массив, и однажды он этого не сделает.
  return query<Message>(
    `select * from (
       select m.seq::text, m.id, m.body, m.created_at,
              m.author_id, u.display_name as author_name, u.role as author_role
       from chat_message m
       join app_user u on u.id = m.author_id
       where m.room_id = $1 and m.deleted_at is null
       order by m.seq desc
       limit $2
     ) t order by t.seq asc`,
    [roomId, limit],
  );
}

export async function postMessage(roomId: string, authorId: string, body: string) {
  return queryOne<{ seq: string; id: string }>(
    `insert into chat_message (room_id, author_id, body)
     values ($1, $2, $3) returning seq::text, id`,
    [roomId, authorId, body],
  );
}

/**
 * Комната класса. Создаётся вместе с классом, а не при первом заходе:
 * «создать, если нет» в обработчике — это гонка на двух одновременных
 * запросах, а уникальный индекс из 010 превратит её в ошибку 500.
 */
export async function ensureClassRoom(classId: string, className: string) {
  await query(
    `insert into chat_room (kind, class_id, name) values ('class', $1, $2)
     on conflict (class_id) where class_id is not null do nothing`,
    [classId, className],
  );
}
