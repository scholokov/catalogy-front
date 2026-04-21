export type TelegramDeliveryPayload = {
  notificationId?: string;
  recipientUserId?: string;
  actorUserId?: string;
  telegramChatId?: string;
  title?: string;
  mediaKind?: "film" | "game";
  eventType?: "added" | "viewed";
};

const getMediaLabel = (mediaKind?: "film" | "game") =>
  mediaKind === "game" ? "гру" : "фільм";

const getActionLabel = (
  mediaKind?: "film" | "game",
  eventType?: "added" | "viewed",
) => {
  if (eventType === "viewed") {
    return mediaKind === "game"
      ? "завершив(ла) проходження"
      : "завершив(ла) перегляд";
  }

  return "додав(ла) до колекції";
};

export const formatTelegramNotificationText = ({
  actorName,
  payload,
}: {
  actorName: string;
  payload: TelegramDeliveryPayload;
}) => {
  const mediaLabel = getMediaLabel(payload.mediaKind);
  const actionLabel = getActionLabel(payload.mediaKind, payload.eventType);
  const title = payload.title?.trim() || "Без назви";

  return [
    "Оновлення від друга",
    "",
    `${actorName} ${actionLabel} ${mediaLabel}.`,
    `Назва: ${title}`,
  ].join("\n");
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
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    },
  );

  const data = (await response.json()) as {
    ok?: boolean;
    description?: string;
    result?: { message_id?: number | string };
  };

  if (!response.ok || !data.ok) {
    throw new Error(data.description || "Telegram sendMessage failed.");
  }

  return {
    providerMessageId: data.result?.message_id?.toString() ?? null,
  };
};
