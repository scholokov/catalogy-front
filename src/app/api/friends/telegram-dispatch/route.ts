import { NextResponse } from "next/server";
import {
  computeTelegramRetryAt,
  formatTelegramNotificationText,
  sendTelegramMessage,
  type TelegramDeliveryPayload,
} from "@/lib/friends/telegram";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDisplayName } from "@/lib/users/displayName";

export const runtime = "nodejs";

type TelegramDeliveryRow = {
  id: string;
  recipient_user_id: string;
  channel: "telegram";
  status: "pending" | "processing" | "sent" | "failed" | "disabled";
  attempt_count: number;
  payload: TelegramDeliveryPayload;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authorization.slice(7).trim();
};

export async function POST(request: Request) {
  try {
    const dispatchSecret = process.env.TELEGRAM_DELIVERY_SECRET;
    if (!dispatchSecret) {
      return NextResponse.json(
        { error: "Missing TELEGRAM_DELIVERY_SECRET." },
        { status: 500 },
      );
    }

    const requestSecret =
      getBearerToken(request) ??
      request.headers.get("x-telegram-delivery-secret")?.trim() ??
      null;

    if (requestSecret !== dispatchSecret) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json(
        { error: "Missing TELEGRAM_BOT_TOKEN." },
        { status: 500 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      limit?: number;
      dryRun?: boolean;
    };
    const limit = Math.max(
      1,
      Math.min(Number.isFinite(body.limit) ? Number(body.limit) : DEFAULT_LIMIT, MAX_LIMIT),
    );
    const dryRun = Boolean(body.dryRun);
    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: deliveries, error: deliveriesError } = await supabaseAdmin
      .from("friend_notification_deliveries")
      .select("id, recipient_user_id, channel, status, attempt_count, payload")
      .eq("channel", "telegram")
      .in("status", ["pending", "failed"])
      .lte("available_at", now)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (deliveriesError) {
      return NextResponse.json(
        { error: deliveriesError.message || "Не вдалося завантажити Telegram queue." },
        { status: 500 },
      );
    }

    const rows = (deliveries ?? []) as TelegramDeliveryRow[];
    if (rows.length === 0) {
      return NextResponse.json({
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        dryRun,
      });
    }

    const actorIds = [...new Set(rows.map((row) => row.payload.actorUserId).filter(Boolean))];
    const { data: profiles } =
      actorIds.length > 0
        ? await supabaseAdmin.from("profiles").select("id, username").in("id", actorIds)
        : { data: [] as { id: string; username: string | null }[] };
    const profileMap = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile.username]),
    );

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const results: Array<{
      deliveryId: string;
      status: "sent" | "failed" | "skipped";
      reason?: string;
    }> = [];

    for (const delivery of rows) {
      const chatId = delivery.payload.telegramChatId?.trim();
      const actorId = delivery.payload.actorUserId?.trim();
      const actorName = getDisplayName(
        actorId ? profileMap.get(actorId) ?? null : null,
        actorId ?? "friend",
      );

      if (!chatId) {
        skipped += 1;
        results.push({
          deliveryId: delivery.id,
          status: "skipped",
          reason: "Missing telegram chat id.",
        });
        if (!dryRun) {
          await supabaseAdmin
            .from("friend_notification_deliveries")
            .update({
              status: "disabled",
              last_error: "Missing telegram chat id.",
              last_attempt_at: new Date().toISOString(),
            })
            .eq("id", delivery.id);
        }
        continue;
      }

      const text = formatTelegramNotificationText({
        actorName,
        payload: delivery.payload,
      });

      if (dryRun) {
        results.push({ deliveryId: delivery.id, status: "sent" });
        sent += 1;
        continue;
      }

      await supabaseAdmin
        .from("friend_notification_deliveries")
        .update({
          status: "processing",
          attempt_count: delivery.attempt_count + 1,
          last_attempt_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", delivery.id);

      try {
        const { providerMessageId } = await sendTelegramMessage({
          botToken,
          chatId,
          text,
        });

        await supabaseAdmin
          .from("friend_notification_deliveries")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            provider_message_id: providerMessageId,
            last_error: null,
          })
          .eq("id", delivery.id);

        sent += 1;
        results.push({ deliveryId: delivery.id, status: "sent" });
      } catch (error) {
        const nextAttemptCount = delivery.attempt_count + 1;
        const message =
          error instanceof Error ? error.message : "Telegram delivery failed.";

        await supabaseAdmin
          .from("friend_notification_deliveries")
          .update({
            status: "failed",
            last_error: message,
            available_at: computeTelegramRetryAt(nextAttemptCount),
          })
          .eq("id", delivery.id);

        failed += 1;
        results.push({
          deliveryId: delivery.id,
          status: "failed",
          reason: message,
        });
      }
    }

    return NextResponse.json({
      processed: rows.length,
      sent,
      failed,
      skipped,
      dryRun,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося обробити Telegram queue.",
      },
      { status: 500 },
    );
  }
}
