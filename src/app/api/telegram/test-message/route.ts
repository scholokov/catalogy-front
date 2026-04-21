import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/friends/telegram";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authorization.slice(7).trim();
};

export async function POST(request: Request) {
  try {
    const accessToken = getBearerToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseServer.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json(
        { error: "Missing TELEGRAM_BOT_TOKEN." },
        { status: 500 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("telegram_chat_id, telegram_notifications_enabled")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message || "Не вдалося завантажити Telegram-профіль." },
        { status: 500 },
      );
    }

    if (!profile?.telegram_chat_id?.trim()) {
      return NextResponse.json(
        { error: "Спочатку прив’яжи Telegram." },
        { status: 400 },
      );
    }

    await sendTelegramMessage({
      botToken,
      chatId: profile.telegram_chat_id.trim(),
      text: [
        "Тестове повідомлення Catalogy",
        "",
        "Telegram-канал підключено коректно.",
        `Час: ${new Date().toLocaleString("uk-UA")}`,
      ].join("\n"),
    });

    return NextResponse.json({
      ok: true,
      enabled: Boolean(profile.telegram_notifications_enabled),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося надіслати тестове Telegram-повідомлення.",
      },
      { status: 500 },
    );
  }
}
