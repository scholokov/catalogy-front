import { buildFriendActivityUrl } from "@/lib/friends/notifications";

export type TelegramDeliveryPayload = {
  notificationId?: string;
  recipientUserId?: string;
  actorUserId?: string;
  telegramChatId?: string;
  userViewId?: string;
  itemId?: string;
  title?: string;
  posterUrl?: string | null;
  rating?: number | null;
  comment?: string | null;
  isViewed?: boolean;
  viewPercent?: number | null;
  viewedAt?: string | null;
  mediaKind?: "film" | "game";
  eventType?: "added" | "viewed";
};

const DEFAULT_PRODUCTION_APP_URL = "https://www.catalogy.fans";

const normalizeAppBaseUrl = (value?: string | null) => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  if (/^https?:\/\//i.test(normalizedValue)) {
    return normalizedValue.replace(/\/+$/, "");
  }

  return `https://${normalizedValue.replace(/\/+$/, "")}`;
};

export const getCatalogyAppUrl = () => {
  const explicitUrl = normalizeAppBaseUrl(
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? null,
  );
  if (explicitUrl) {
    return explicitUrl;
  }

  const vercelUrl = normalizeAppBaseUrl(process.env.VERCEL_URL ?? null);
  if (vercelUrl) {
    return vercelUrl;
  }

  if (process.env.NODE_ENV === "production") {
    return DEFAULT_PRODUCTION_APP_URL;
  }

  return "http://localhost:3000";
};

type TelegramApiSuccess<T> = {
  ok?: boolean;
  description?: string;
  result?: T;
};

const getActionSentence = (
  mediaKind?: "film" | "game",
  eventType?: "added" | "viewed",
) => {
  if (eventType === "viewed") {
    return mediaKind === "game"
      ? "Завершив(ла) проходження гри."
      : "Завершив(ла) перегляд фільму.";
  }

  return mediaKind === "game"
    ? "Додав(ла) гру до колекції."
    : "Додав(ла) фільм до колекції.";
};

export const formatTelegramNotificationText = ({
  actorName,
  payload,
  appBaseUrl,
}: {
  actorName: string;
  payload: TelegramDeliveryPayload;
  appBaseUrl?: string | null;
}) => {
  const actionSentence = getActionSentence(payload.mediaKind, payload.eventType);
  const title = payload.title?.trim() || "Без назви";
  const rating =
    typeof payload.rating === "number" && Number.isFinite(payload.rating)
      ? payload.rating.toFixed(1)
      : null;
  const hasViewedState = typeof payload.isViewed === "boolean";
  const viewPercent =
    typeof payload.viewPercent === "number" && Number.isFinite(payload.viewPercent)
      ? Math.max(0, Math.min(100, Math.round(payload.viewPercent)))
      : payload.isViewed
        ? 100
        : 0;
  const viewedText = hasViewedState
    ? `Переглянуто: ${payload.isViewed ? "так" : "ні"} (${viewPercent}%)`
    : null;
  const viewedAtText =
    payload.isViewed && payload.viewedAt
      ? `Дата перегляду: ${new Date(payload.viewedAt).toLocaleDateString("uk-UA")}`
      : null;
  const comment = payload.comment?.trim() || null;
  const directUrl = buildFriendActivityUrl({
    actorUserId: payload.actorUserId,
    mediaKind: payload.mediaKind,
    userViewId: payload.userViewId,
    itemId: payload.itemId,
    baseUrl: appBaseUrl,
  });

  return [
    `Оновлення від друга - ${actorName}`,
    "",
    actionSentence,
    `Назва: ${title}`,
    `Від: ${actorName}`,
    rating ? `Рейтинг: ${rating}` : null,
    viewedText,
    viewedAtText,
    comment ? "Коментар:" : null,
    comment,
    directUrl ? `Відкрити: ${directUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");
};

export const computeTelegramRetryAt = (attemptCount: number) => {
  const delayMinutes = Math.min(5 * 2 ** Math.max(attemptCount - 1, 0), 60);
  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
};

export const sendTelegramMessage = async ({
  botToken,
  chatId,
  text,
}: {
  botToken: string;
  chatId: string;
  text: string;
}) => {
  const data = await callTelegramApi<{ message_id?: number | string }>(botToken, "sendMessage", {
    chat_id: chatId,
    text,
  });

  return {
    providerMessageId: data.message_id?.toString() ?? null,
  };
};

export const sendTelegramPhoto = async ({
  botToken,
  chatId,
  photoUrl,
  caption,
}: {
  botToken: string;
  chatId: string;
  photoUrl: string;
  caption: string;
}) => {
  const data = await callTelegramApi<{ message_id?: number | string }>(botToken, "sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
  });

  return {
    providerMessageId: data.message_id?.toString() ?? null,
  };
};

export const sendTelegramNotification = async ({
  botToken,
  chatId,
  text,
  photoUrl,
}: {
  botToken: string;
  chatId: string;
  text: string;
  photoUrl?: string | null;
}) => {
  const normalizedPhotoUrl = photoUrl?.trim();

  if (normalizedPhotoUrl) {
    try {
      return await sendTelegramPhoto({
        botToken,
        chatId,
        photoUrl: normalizedPhotoUrl,
        caption: text,
      });
    } catch {
      // Fall back to text-only delivery if Telegram cannot fetch the poster URL.
    }
  }

  return sendTelegramMessage({
    botToken,
    chatId,
    text,
  });
};

export type TelegramWebhookInfo = {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  ip_address?: string;
  allowed_updates?: string[];
};

const callTelegramApi = async <T>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>,
) => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

  const data = (await response.json()) as TelegramApiSuccess<T>;

  if (!response.ok || !data.ok || !data.result) {
    throw new Error(data.description || `Telegram ${method} failed.`);
  }

  return data.result;
};

export const getTelegramWebhookInfo = async (botToken: string) =>
  callTelegramApi<TelegramWebhookInfo>(botToken, "getWebhookInfo");

export const setTelegramWebhook = async ({
  botToken,
  webhookUrl,
  secretToken,
  dropPendingUpdates = false,
}: {
  botToken: string;
  webhookUrl: string;
  secretToken?: string | null;
  dropPendingUpdates?: boolean;
}) =>
  callTelegramApi<boolean>(botToken, "setWebhook", {
    url: webhookUrl,
    secret_token: secretToken ?? undefined,
    drop_pending_updates: dropPendingUpdates,
    allowed_updates: ["message"],
  });
