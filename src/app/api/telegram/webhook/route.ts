import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type TelegramWebhookUpdate = {
  message?: {
    text?: string;
    chat?: {
      id?: number | string;
    };
    from?: {
      username?: string;
      first_name?: string;
    };
  };
};

const extractStartToken = (text?: string) => {
  const normalized = text?.trim();
  if (!normalized?.startsWith("/start")) {
    return null;
  }
  const [, token] = normalized.split(/\s+/, 2);
  return token?.trim() || null;
};

const replyTelegramMessage = async ({
  botToken,
  chatId,
  text,
}: {
  botToken: string;
  chatId: string;
  text: string;
}) => {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
};

export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const requestSecret =
      request.headers.get("x-telegram-bot-api-secret-token")?.trim() ?? null;

    if (webhookSecret && requestSecret !== webhookSecret) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json(
        { error: "Missing TELEGRAM_BOT_TOKEN." },
        { status: 500 },
      );
    }

    const payload = (await request.json()) as TelegramWebhookUpdate;
    const text = payload.message?.text?.trim();
    const startToken = extractStartToken(text);
    const chatId = payload.message?.chat?.id?.toString() ?? null;

    if (!startToken || !chatId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: tokenRow, error: tokenError } = await supabaseAdmin
      .from("telegram_link_tokens")
      .select("id, user_id, token, expires_at, used_at")
      .eq("token", startToken)
      .maybeSingle();

    if (tokenError) {
      return NextResponse.json(
        { error: tokenError.message || "Failed to load telegram link token." },
        { status: 500 },
      );
    }

    if (!tokenRow) {
      await replyTelegramMessage({
        botToken,
        chatId,
        text: "Код прив’язки не знайдено або він уже неактивний.",
      });
      return NextResponse.json({ ok: true, linked: false, reason: "token_not_found" });
    }

    if (tokenRow.used_at || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      await replyTelegramMessage({
        botToken,
        chatId,
        text: "Цей код прив’язки вже використано або він протермінований.",
      });
      return NextResponse.json({ ok: true, linked: false, reason: "token_expired" });
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        telegram_chat_id: chatId,
        telegram_notifications_enabled: true,
      })
      .eq("id", tokenRow.user_id);

    if (profileError) {
      await replyTelegramMessage({
        botToken,
        chatId,
        text:
          profileError.code === "23505"
            ? "Цей Telegram уже прив’язаний до іншого акаунта."
            : "Не вдалося завершити прив’язку Telegram.",
      });
      return NextResponse.json(
        { error: profileError.message || "Failed to update profile." },
        { status: profileError.code === "23505" ? 409 : 500 },
      );
    }

    const { error: tokenUpdateError } = await supabaseAdmin
      .from("telegram_link_tokens")
      .update({
        used_at: now,
        telegram_chat_id: chatId,
        telegram_username: payload.message?.from?.username ?? null,
        telegram_first_name: payload.message?.from?.first_name ?? null,
      })
      .eq("id", tokenRow.id);

    if (tokenUpdateError) {
      return NextResponse.json(
        { error: tokenUpdateError.message || "Failed to update telegram link token." },
        { status: 500 },
      );
    }

    await replyTelegramMessage({
      botToken,
      chatId,
      text: "Telegram успішно прив’язано. Сповіщення увімкнено.",
    });

    return NextResponse.json({ ok: true, linked: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося обробити Telegram webhook.",
      },
      { status: 500 },
    );
  }
}
