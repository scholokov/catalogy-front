import type { SupabaseClient } from "@supabase/supabase-js";

export type FriendNotificationPayload = {
  itemId?: string;
  userViewId?: string;
  title?: string;
  posterUrl?: string | null;
  rating?: number | null;
  mediaKind?: "film" | "game";
  eventType?: "added" | "viewed";
  occurredAt?: string;
};

export const buildFriendActivityPath = ({
  actorUserId,
  mediaKind,
  userViewId,
  itemId,
}: {
  actorUserId?: string | null;
  mediaKind?: "film" | "game" | null;
  userViewId?: string | null;
  itemId?: string | null;
}) => {
  const normalizedActorUserId = actorUserId?.trim();
  const normalizedUserViewId = userViewId?.trim();
  const normalizedItemId = itemId?.trim();

  if (!normalizedActorUserId || (!normalizedUserViewId && !normalizedItemId) || !mediaKind) {
    return null;
  }

  const librarySegment = mediaKind === "game" ? "games" : "films";
  const params = new URLSearchParams(
    normalizedUserViewId
      ? {
          view: normalizedUserViewId,
        }
      : {
          item: normalizedItemId ?? "",
        },
  );

  return `/friends/${normalizedActorUserId}/${librarySegment}?${params.toString()}`;
};

export const buildFriendActivityUrl = ({
  actorUserId,
  mediaKind,
  userViewId,
  itemId,
  baseUrl,
}: {
  actorUserId?: string | null;
  mediaKind?: "film" | "game" | null;
  userViewId?: string | null;
  itemId?: string | null;
  baseUrl?: string | null;
}) => {
  const path = buildFriendActivityPath({
    actorUserId,
    mediaKind,
    userViewId,
    itemId,
  });

  if (!path) {
    return null;
  }

  const normalizedBaseUrl = baseUrl?.trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) {
    return path;
  }

  return `${normalizedBaseUrl}${path}`;
};

export const buildFriendCollectionEntryPath = ({
  mediaKind,
  itemId,
}: {
  mediaKind?: "film" | "game" | null;
  itemId?: string | null;
}) => {
  const normalizedItemId = itemId?.trim();

  if (!normalizedItemId || !mediaKind) {
    return null;
  }

  const params = new URLSearchParams({
    addItem: normalizedItemId,
    addMediaKind: mediaKind,
  });

  return `/friends?${params.toString()}`;
};

export const buildFriendCollectionEntryUrl = ({
  mediaKind,
  itemId,
  baseUrl,
}: {
  mediaKind?: "film" | "game" | null;
  itemId?: string | null;
  baseUrl?: string | null;
}) => {
  const path = buildFriendCollectionEntryPath({
    mediaKind,
    itemId,
  });

  if (!path) {
    return null;
  }

  const normalizedBaseUrl = baseUrl?.trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) {
    return path;
  }

  return `${normalizedBaseUrl}${path}`;
};

export type FriendNotificationRow = {
  id: string;
  recipient_user_id: string;
  actor_user_id: string;
  event_id: string;
  media_kind: "film" | "game";
  event_type: "added" | "viewed";
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  payload: FriendNotificationPayload;
};

export const FRIEND_NOTIFICATION_SELECT =
  "id, recipient_user_id, actor_user_id, event_id, media_kind, event_type, is_read, read_at, created_at, payload";

export const loadFriendNotifications = async (
  supabase: SupabaseClient,
  userId: string,
) => {
  return supabase
    .from("friend_notifications")
    .select(FRIEND_NOTIFICATION_SELECT)
    .eq("recipient_user_id", userId)
    .order("created_at", { ascending: false });
};

export const markFriendNotificationsRead = async (
  supabase: SupabaseClient,
  notificationIds: string[],
  readAt = new Date().toISOString(),
) => {
  if (notificationIds.length === 0) {
    return { readAt, error: null };
  }

  const { error } = await supabase
    .from("friend_notifications")
    .update({ is_read: true, read_at: readAt })
    .in("id", notificationIds);

  return { readAt, error };
};

export const loadFriendsBadgeCount = async (
  supabase: SupabaseClient,
  userId: string,
) => {
  const [{ count: recommendationCount }, { count: notificationCount }] = await Promise.all([
    supabase
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .eq("to_user_id", userId)
      .eq("status", "pending"),
    supabase
      .from("friend_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", userId)
      .eq("is_read", false),
  ]);

  return (recommendationCount ?? 0) + (notificationCount ?? 0);
};
