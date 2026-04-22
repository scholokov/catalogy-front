import { NextResponse } from "next/server";
import { buildFriendActivityPath, type FriendNotificationPayload } from "@/lib/friends/notifications";
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

type ActivityLinkRequest = {
  notificationId?: string;
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

    const body = (await request.json().catch(() => ({}))) as ActivityLinkRequest;
    const notificationId = body.notificationId?.trim();

    if (!notificationId) {
      return NextResponse.json({ error: "Missing notificationId." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: notification, error: notificationError } = await supabaseAdmin
      .from("friend_notifications")
      .select("id, recipient_user_id, actor_user_id, media_kind, event_id, payload")
      .eq("id", notificationId)
      .eq("recipient_user_id", user.id)
      .maybeSingle();

    if (notificationError) {
      return NextResponse.json(
        { error: notificationError.message || "Не вдалося завантажити notification." },
        { status: 500 },
      );
    }

    if (!notification) {
      return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }

    const payload = (notification.payload ?? {}) as FriendNotificationPayload;
    let path =
      buildFriendActivityPath({
        actorUserId: notification.actor_user_id,
        mediaKind: notification.media_kind,
        userViewId: payload.userViewId,
        itemId: payload.itemId,
      }) ?? null;

    if (!path && notification.event_id) {
      const { data: event, error: eventError } = await supabaseAdmin
        .from("friend_activity_events")
        .select("user_view_id, item_id")
        .eq("id", notification.event_id)
        .maybeSingle();

      if (eventError) {
        return NextResponse.json(
          { error: eventError.message || "Не вдалося завантажити friend activity." },
          { status: 500 },
        );
      }

      path = buildFriendActivityPath({
        actorUserId: notification.actor_user_id,
        mediaKind: notification.media_kind,
        userViewId: event?.user_view_id ?? null,
        itemId: event?.item_id ?? null,
      });
    }

    if (!path) {
      return NextResponse.json({ error: "Link is unavailable." }, { status: 404 });
    }

    return NextResponse.json({ path });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося побудувати direct link.",
      },
      { status: 500 },
    );
  }
}
