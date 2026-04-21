import { NextResponse } from "next/server";
import { getTelegramWebhookInfo } from "@/lib/friends/telegram";

export const runtime = "nodejs";

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authorization.slice(7).trim();
};

const isAuthorized = (request: Request) => {
  const expectedSecret =
    process.env.TELEGRAM_ADMIN_SECRET ?? process.env.TELEGRAM_DELIVERY_SECRET ?? null;
  if (!expectedSecret) {
    throw new Error("Missing Telegram admin secret.");
  }

  return getBearerToken(request) === expectedSecret;
};

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? null;
    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null;

    if (!botToken) {
      return NextResponse.json(
        { error: "Missing TELEGRAM_BOT_TOKEN." },
        { status: 500 },
      );
    }

    const info = await getTelegramWebhookInfo(botToken);

    return NextResponse.json({
      ok: true,
      botUsername,
      webhookSecretConfigured: Boolean(webhookSecret),
      info,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося отримати Telegram webhook info.",
      },
      { status: 500 },
    );
  }
}
