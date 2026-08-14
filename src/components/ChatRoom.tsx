"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Чат комнаты.
 *
 * Живёт на EventSource и держит КУРСОР, а не «последнее время». Курсор —
 * это seq из 010, монотонный по построению: после обрыва связи клиент
 * дочитывает ровно то, что пропустил, без дублей и без пропусков.
 * Со временем это не работает — при одинаковых метках сообщения теряются.
 *
 * EventSource переподключается сам, поэтому здесь нет ни таймеров
 * переподключения, ни экспоненциальных задержек: браузер уже умеет это лучше.
 */

type Message = {
  seq: string;
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_name: string;
  author_role: string;
};

const ROLE_LABEL: Record<string, string> = {
  teacher: "учитель",
  author: "автор",
  admin: "админ",
  reviewer: "ревьюер",
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

export function ChatRoom({
  roomId,
  roomName,
  meId,
}: {
  roomId: string;
  roomName: string;
  meId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState(false);
  const [sending, setSending] = useState(false);

  const cursorRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pinnedToBottom = useRef(true);

  /** Слияние по seq: поток и оптимистичная отправка могут прислать одно и то же. */
  const merge = (incoming: Message[]) =>
    setMessages((prev) => {
      const bySeq = new Map(prev.map((m) => [m.seq, m]));
      for (const m of incoming) bySeq.set(m.seq, m);
      return [...bySeq.values()].sort((a, b) => Number(a.seq) - Number(b.seq));
    });

  useEffect(() => {
    setMessages([]);
    cursorRef.current = null;
    let es: EventSource | null = null;
    let cancelled = false;

    (async () => {
      // Первая порция — обычным запросом: EventSource не умеет отдать
      // историю, он умеет только поток.
      const res = await fetch(`/api/chat/${roomId}`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      merge(data.messages);
      cursorRef.current = data.cursor;

      if (cancelled) return;
      es = new EventSource(
        `/api/chat/${roomId}/stream${cursorRef.current ? `?after=${cursorRef.current}` : ""}`,
      );
      es.addEventListener("ready", () => setLive(true));
      es.addEventListener("messages", (e) => {
        const payload = JSON.parse((e as MessageEvent).data);
        merge(payload.messages);
        cursorRef.current = payload.cursor;
      });
      es.addEventListener("closed", () => {
        setLive(false);
        es?.close();
      });
      es.onerror = () => setLive(false);
    })();

    return () => {
      cancelled = true;
      es?.close();
      setLive(false);
    };
  }, [roomId]);

  // Прокрутка вниз — только если пользователь и так внизу. Иначе чтение
  // старого сообщения прерывалось бы каждым новым.
  useEffect(() => {
    const el = listRef.current;
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    pinnedToBottom.current = true;
    try {
      const res = await fetch(`/api/chat/${roomId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        setDraft(body); // не теряем текст, если сервер отказал
        return;
      }
      // Своё сообщение дочитываем сразу, не дожидаясь следующего опроса
      // потока: пауза между «нажал» и «увидел» читается как поломка.
      const fresh = await fetch(`/api/chat/${roomId}?after=${cursorRef.current ?? ""}`);
      if (fresh.ok) {
        const data = await fresh.json();
        merge(data.messages);
        if (data.cursor) cursorRef.current = data.cursor;
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="chat-name">{roomName}</span>
        <span className="chat-live" data-on={live}>
          {live ? "на связи" : "переподключение…"}
        </span>
      </div>

      <div
        className="chat-log"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {messages.length === 0 ? (
          <div className="chat-empty">
            Пока пусто. Первое сообщение обычно самое полезное — спросите
            про задачу, которая не даётся.
          </div>
        ) : (
          messages.map((m) => (
            <div className="chat-msg" key={m.seq} data-mine={m.author_id === meId}>
              <div className="chat-msg-head">
                <span className="chat-author">{m.author_name}</span>
                {ROLE_LABEL[m.author_role] && (
                  <span className="chat-role">{ROLE_LABEL[m.author_role]}</span>
                )}
                <span className="chat-time">{time(m.created_at)}</span>
              </div>
              <div className="chat-body">{m.body}</div>
            </div>
          ))
        )}
      </div>

      <div className="chat-compose">
        <textarea
          rows={1}
          value={draft}
          maxLength={2000}
          placeholder="Написать сообщение…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter отправляет, Shift+Enter переносит строку.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="btn" onClick={() => void send()} disabled={!draft.trim() || sending}>
          {sending ? "…" : "Отправить"}
        </button>
      </div>
    </div>
  );
}
