/**
 * Разбор ссылки на видео (миграция 009).
 *
 * Учитель вставляет любую ссылку — со списком воспроизведения, с меткой
 * времени, из мобильного приложения. Мы достаём из неё ТОЛЬКО провайдера
 * и идентификатор ролика и дальше работаем с ними.
 *
 * Это не удобство, а граница безопасности. Подставить пользовательскую
 * строку в `<iframe src={…}>` — значит разрешить любому, кто может завести
 * урок, выполнить свой скрипт (`javascript:`, `data:`) в нашем origin.
 * Разобрав ссылку один раз, мы получаем гарантию на всё время жизни урока:
 * в iframe уедет адрес, собранный НАМИ из идентификатора, прошедшего
 * проверку регулярным выражением.
 *
 * Поэтому здесь нет ветки «не распознали — оставим как есть».
 */

export type VideoRef = { provider: "youtube" | "vimeo"; id: string };

// YouTube: ровно 11 символов из безопасного алфавита. Vimeo: только цифры.
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

/**
 * @returns null, если ссылка не опознана. Вызывающий обязан показать ошибку,
 *          а не подставить исходную строку.
 */
export function parseVideoUrl(input: string): VideoRef | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // Голый идентификатор — учитель мог скопировать только его.
  if (YOUTUBE_ID.test(raw)) return { provider: "youtube", id: raw };

  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  // Протокол проверяется явно: URL успешно разбирает и javascript:, и data:.
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && YOUTUBE_ID.test(v)) return { provider: "youtube", id: v };
    // /embed/ID и /shorts/ID и /live/ID
    const i = segments.findIndex((s) => ["embed", "shorts", "live", "v"].includes(s));
    const candidate = i >= 0 ? segments[i + 1] : undefined;
    if (candidate && YOUTUBE_ID.test(candidate)) return { provider: "youtube", id: candidate };
    return null;
  }

  if (host === "youtu.be") {
    const candidate = segments[0];
    return candidate && YOUTUBE_ID.test(candidate)
      ? { provider: "youtube", id: candidate }
      : null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    // Последний числовой сегмент: /video/123, /123, /channels/x/123
    const candidate = [...segments].reverse().find((s) => VIMEO_ID.test(s));
    return candidate ? { provider: "vimeo", id: candidate } : null;
  }

  return null;
}

/** Адрес для iframe. Собирается нами, а не берётся из базы. */
export function embedUrl(v: VideoRef): string {
  return v.provider === "youtube"
    ? // nocookie: у школьника не должно появляться рекламного профиля
      // из-за того, что учитель приложил к уроку видео.
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}?rel=0`
    : `https://player.vimeo.com/video/${encodeURIComponent(v.id)}`;
}

/** Ссылка «смотреть на площадке» — для тех, у кого iframe заблокирован. */
export function watchUrl(v: VideoRef): string {
  return v.provider === "youtube"
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`
    : `https://vimeo.com/${encodeURIComponent(v.id)}`;
}

export const PROVIDER_NAME: Record<VideoRef["provider"], string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
};
