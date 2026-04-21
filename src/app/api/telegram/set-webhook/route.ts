import { NextResponse } from "next/server";
import { setTelegramWebhook } from "@/lib/friends/telegram";

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

type SetWebhookBody = {
  webhookUrl?: string;
  dropPendingUpdates?: boolean;
};

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? null;

    if (!botToken) {
      return NextResponse.json(
        { error: "Missing TELEGRAM_BOT_TOKEN." },
        { status: 500 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as SetWebhookBody;
    const webhookUrl = body.webhookUrl?.trim();

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "Missing webhookUrl." },
        { status: 400 },
      );
    }

    await setTelegramWebhook({
      botToken,
      webhookUrl,
      secretToken: webhookSecret,
      dropPendingUpdates: Boolean(body.dropPendingUpdates),
    });

    return NextResponse.json({
      ok: true,
      webhookUrl,
      dropPendingUpdates: Boolean(body.dropPendingUpdates),
      webhookSecretConfigured: Boolean(webhookSecret),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося виставити Telegram webhook.",
      },
      { status: 500 },
    );
  }
}
