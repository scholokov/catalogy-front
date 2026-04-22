"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useCollectionEntryLauncher } from "@/lib/collection/entryLauncher";
import {
  loadFriendNotifications,
  type FriendNotificationRow,
} from "@/lib/friends/notifications";
import { getDisplayName } from "@/lib/users/displayName";
import styles from "./FriendsManager.module.css";

type Profile = {
  id: string;
  username: string | null;
  views_visible_to_friends?: boolean;
  avatar_url: string | null;
};

type Contact = {
  other_user_id: string;
  status: "pending" | "accepted" | "revoked" | "blocked";
  notify_film_added: boolean;
  notify_film_viewed: boolean;
  notify_game_added: boolean;
  notify_game_viewed: boolean;
  created_at: string;
  profile?: Profile;
};

type Invite = {
  id: string;
  token: string;
  max_uses: number;
  used_count: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

type Recommendation = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  comment: string | null;
  status: "pending" | "accepted" | "dismissed" | "saved";
  created_at: string;
  items: {
    id: string;
    title: string;
    poster_url: string | null;
    type: string;
  };
  fromProfile?: Profile;
  toProfile?: Profile;
  recommenderViewDetails?: {
    rating: number | null;
    comment: string | null;
    isViewed: boolean;
    viewPercent: number;
    viewedAt: string;
  } | null;
};

type FriendNotification = FriendNotificationRow & {
  actorProfile?: Profile;
  viewDetails?: {
    userViewId: string;
    itemId: string;
    comment: string | null;
    rating: number | null;
    isViewed: boolean;
    viewPercent: number;
    viewedAt: string;
    createdAt: string;
  } | null;
};

type TabKey = "recommendations" | "contacts" | "settings";
type RecommendationTabKey = "inbox" | "updates" | "sent";
type ContactNotificationKey =
  | "notify_film_added"
  | "notify_film_viewed"
  | "notify_game_added"
  | "notify_game_viewed";

const tabLabels: Record<TabKey, string> = {
  recommendations: "Рекомендації",
  contacts: "Контакти",
  settings: "Налаштування",
};

const recommendationTabLabels: Record<RecommendationTabKey, string> = {
  inbox: "Вхідні рекомендації",
  updates: "Оновлення від друзів",
  sent: "Ваші рекомендації",
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("uk-UA");
const NICKNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;

type FriendsFeedCardTextProps = {
  title: string;
  dateText: string;
  typeLabel: string;
  byline: ReactNode;
  comment?: string | null;
  commentLabel?: string;
  children?: ReactNode;
};

function FriendsFeedCardText({
  title,
  dateText,
  typeLabel,
  byline,
  comment,
  commentLabel,
  children,
}: FriendsFeedCardTextProps) {
  return (
    <div className={styles.cardBody}>
      <div className={styles.cardHeader}>
        <h3>{title}</h3>
        <span className={styles.meta}>{dateText}</span>
      </div>
      <p className={styles.cardType}>{typeLabel}</p>
      <p className={styles.meta}>{byline}</p>
      {comment ? (
        <>
          {commentLabel ? <p className={styles.meta}>{commentLabel}</p> : null}
          <p className={styles.comment}>{comment}</p>
        </>
      ) : null}
      {children}
    </div>
  );
}

function ArchiveToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.archiveToggle}>
      <input
        type="checkbox"
        className={styles.archiveToggleInput}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.archiveToggleTrack} aria-hidden="true">
        <span className={styles.archiveToggleThumb} />
      </span>
      <span className={styles.archiveToggleLabel}>Відображати архівні</span>
    </label>
  );
}

export default function FriendsManager() {
  const router = useRouter();
  const { openCreateOwnEntry } = useCollectionEntryLauncher();
  const [activeTab, setActiveTab] = useState<TabKey>("recommendations");
  const [activeRecommendationTab, setActiveRecommendationTab] =
    useState<RecommendationTabKey>("inbox");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inbox, setInbox] = useState<Recommendation[]>([]);
  const [sent, setSent] = useState<Recommendation[]>([]);
  const [notifications, setNotifications] = useState<FriendNotification[]>([]);
  const [ownCollectionItemIds, setOwnCollectionItemIds] = useState<Set<string>>(new Set());
  const [showArchivedInboxItems, setShowArchivedInboxItems] = useState(false);
  const [showArchivedNotifications, setShowArchivedNotifications] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [isNicknamePromptDismissed, setIsNicknamePromptDismissed] = useState(false);
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [nicknameValue, setNicknameValue] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [updatingContactSettingKey, setUpdatingContactSettingKey] = useState<string | null>(null);
  const [currentUserViewsVisible, setCurrentUserViewsVisible] = useState(false);
  const [postNicknameAction, setPostNicknameAction] = useState<"createInvite" | null>(
    null,
  );

  const pendingCount = useMemo(
    () => inbox.filter((item) => item.status === "pending").length,
    [inbox],
  );
  const inboxItems = useMemo(() => inbox, [inbox]);
  const visibleInboxItems = useMemo(
    () =>
      showArchivedInboxItems
        ? inboxItems
        : inboxItems.filter((item) => item.status === "pending"),
    [inboxItems, showArchivedInboxItems],
  );
  const unreadNotificationCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications],
  );
  const visibleNotifications = useMemo(
    () =>
      showArchivedNotifications
        ? notifications
        : notifications.filter((item) => !item.is_read),
    [notifications, showArchivedNotifications],
  );
  const friendsBadgeCount = pendingCount + unreadNotificationCount;

  const loadProfiles = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, Profile>();
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, views_visible_to_friends")
      .in("id", ids);
    const map = new Map<string, Profile>();
    (data ?? []).forEach((profile) => map.set(profile.id, profile));
    return map;
  }, []);

  const loadNotificationViewDetails = useCallback(
    async (notificationRows: FriendNotificationRow[]) => {
      const userViewIds = notificationRows
        .map((item) => item.payload.userViewId?.trim() ?? "")
        .filter(Boolean);
      const actorIds = [...new Set(notificationRows.map((item) => item.actor_user_id))];
      const itemIds = [
        ...new Set(notificationRows.map((item) => item.payload.itemId?.trim() ?? "").filter(Boolean)),
      ];

      const detailsByViewId = new Map<
        string,
        FriendNotification["viewDetails"] extends infer T ? Exclude<T, null | undefined> : never
      >();
      const detailsByActorItem = new Map<
        string,
        FriendNotification["viewDetails"] extends infer T ? Exclude<T, null | undefined> : never
      >();

      const toDetail = (row: {
        id: string;
        user_id: string;
        item_id: string;
        comment: string | null;
        rating: number | null;
        is_viewed: boolean;
        view_percent: number;
        viewed_at: string;
        created_at: string;
      }) => ({
        userViewId: row.id,
        itemId: row.item_id,
        comment: row.comment,
        rating: row.rating,
        isViewed: row.is_viewed,
        viewPercent: row.view_percent,
        viewedAt: row.viewed_at,
        createdAt: row.created_at,
      });

      if (userViewIds.length > 0) {
        const { data } = await supabase
          .from("user_views")
          .select("id, user_id, item_id, comment, rating, is_viewed, view_percent, viewed_at, created_at")
          .in("id", userViewIds);

        (data ?? []).forEach((row) => {
          const detail = toDetail(row);
          detailsByViewId.set(row.id, detail);
          detailsByActorItem.set(`${row.user_id}:${row.item_id}`, detail);
        });
      }

      if (actorIds.length > 0 && itemIds.length > 0) {
        const { data } = await supabase
          .from("user_views")
          .select("id, user_id, item_id, comment, rating, is_viewed, view_percent, viewed_at, created_at")
          .in("user_id", actorIds)
          .in("item_id", itemIds);

        (data ?? []).forEach((row) => {
          const detail = toDetail(row);
          if (!detailsByViewId.has(row.id)) {
            detailsByViewId.set(row.id, detail);
          }
          const actorItemKey = `${row.user_id}:${row.item_id}`;
          if (!detailsByActorItem.has(actorItemKey)) {
            detailsByActorItem.set(actorItemKey, detail);
          }
        });
      }

      return { detailsByViewId, detailsByActorItem };
    },
    [],
  );

  const loadRecommendationViewDetails = useCallback(async (recommendationRows: Recommendation[]) => {
    const actorIds = [...new Set(recommendationRows.map((item) => item.from_user_id))];
    const itemIds = [...new Set(recommendationRows.map((item) => item.items.id).filter(Boolean))];
    const detailsByActorItem = new Map<
      string,
      NonNullable<Recommendation["recommenderViewDetails"]>
    >();

    if (actorIds.length === 0 || itemIds.length === 0) {
      return detailsByActorItem;
    }

    const { data } = await supabase
      .from("user_views")
      .select("user_id, item_id, rating, comment, is_viewed, view_percent, viewed_at")
      .in("user_id", actorIds)
      .in("item_id", itemIds);

    (data ?? []).forEach((row) => {
      detailsByActorItem.set(`${row.user_id}:${row.item_id}`, {
        rating: row.rating,
        comment: row.comment,
        isViewed: row.is_viewed,
        viewPercent: row.view_percent,
        viewedAt: row.viewed_at,
      });
    });

    return detailsByActorItem;
  }, []);

  const loadAll = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Потрібна авторизація.");
      return;
    }
    setCurrentUserId(user.id);

    setIsLoading(true);
    setMessage("");

    const [profileRes, contactsRes, invitesRes, inboxRes, sentRes, notificationsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("username, views_visible_to_friends")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("contacts")
        .select(
          "other_user_id, status, created_at, notify_film_added, notify_film_viewed, notify_game_added, notify_game_viewed",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("invites")
        .select("id, token, max_uses, used_count, expires_at, revoked_at, created_at")
        .eq("creator_user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("recommendations")
        .select(
          "id, from_user_id, to_user_id, comment, status, created_at, items:items (id, title, poster_url, type)",
        )
        .eq("to_user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("recommendations")
        .select(
          "id, from_user_id, to_user_id, comment, status, created_at, items:items (id, title, poster_url, type)",
        )
        .eq("from_user_id", user.id)
        .order("created_at", { ascending: false }),
      loadFriendNotifications(supabase, user.id),
    ]);

    if (
      profileRes.error ||
      contactsRes.error ||
      invitesRes.error ||
      inboxRes.error ||
      sentRes.error ||
      notificationsRes.error
    ) {
      setMessage("Не вдалося завантажити дані.");
      setIsLoading(false);
      return;
    }
    setCurrentUsername(profileRes.data?.username ?? null);
    setCurrentUserViewsVisible(Boolean(profileRes.data?.views_visible_to_friends));
    if (profileRes.data?.username) {
      setNicknameValue(profileRes.data.username);
      setIsNicknamePromptDismissed(false);
    } else {
      setActiveTab("settings");
    }

    const contactRows = (contactsRes.data ?? []) as Contact[];
    const inviteRows = (invitesRes.data ?? []) as Invite[];
    const nowTs = Date.now();
    const staleInviteIds = inviteRows
      .filter(
        (invite) =>
          Boolean(invite.revoked_at) ||
          invite.used_count >= invite.max_uses ||
          new Date(invite.expires_at).getTime() <= nowTs,
      )
      .map((invite) => invite.id);
    const activeInviteRows = inviteRows.filter(
      (invite) => !staleInviteIds.includes(invite.id),
    );

    if (staleInviteIds.length > 0) {
      await supabase
        .from("invites")
        .delete()
        .eq("creator_user_id", user.id)
        .in("id", staleInviteIds);
    }
    const inboxRows = (inboxRes.data ?? []) as unknown as Recommendation[];
    const sentRows = (sentRes.data ?? []) as unknown as Recommendation[];
    const notificationRows = (notificationsRes.data ?? []) as FriendNotificationRow[];
    const { detailsByViewId, detailsByActorItem } =
      await loadNotificationViewDetails(notificationRows);
    const recommendationViewDetailsByActorItem =
      await loadRecommendationViewDetails(inboxRows);
    const relevantOwnItemIds = [
      ...new Set(
        [
          ...inboxRows.map((item) => item.items.id),
          ...notificationRows
            .map((item) => item.payload.itemId?.trim() ?? "")
            .filter(Boolean),
        ].filter(Boolean),
      ),
    ];

    const profileIds = new Set<string>();
    contactRows.forEach((contact) => profileIds.add(contact.other_user_id));
    inboxRows.forEach((item) => profileIds.add(item.from_user_id));
    sentRows.forEach((item) => profileIds.add(item.to_user_id));
    notificationRows.forEach((item) => profileIds.add(item.actor_user_id));

    const profileMap = await loadProfiles([...profileIds]);
    const ownCollectionItemIdsNext = new Set<string>();
    if (relevantOwnItemIds.length > 0) {
      const { data: ownViews } = await supabase
        .from("user_views")
        .select("item_id")
        .eq("user_id", user.id)
        .in("item_id", relevantOwnItemIds);
      (ownViews ?? []).forEach((row) => {
        if (row.item_id) {
          ownCollectionItemIdsNext.add(row.item_id);
        }
      });
    }

    setContacts(
      contactRows.map((contact) => ({
        ...contact,
        profile: profileMap.get(contact.other_user_id),
      })),
    );
    setInvites(activeInviteRows);
    setInbox(
      inboxRows.map((item) => ({
        ...item,
        fromProfile: profileMap.get(item.from_user_id),
        recommenderViewDetails:
          recommendationViewDetailsByActorItem.get(
            `${item.from_user_id}:${item.items.id}`,
          ) ?? null,
      })),
    );
    setSent(
      sentRows.map((item) => ({
        ...item,
        toProfile: profileMap.get(item.to_user_id),
      })),
    );
    setOwnCollectionItemIds(ownCollectionItemIdsNext);
    setNotifications(
      notificationRows.map((item) => ({
        ...item,
        actorProfile: profileMap.get(item.actor_user_id),
        viewDetails:
          (item.payload.userViewId
            ? detailsByViewId.get(item.payload.userViewId)
            : undefined) ??
          (item.payload.itemId
            ? detailsByActorItem.get(`${item.actor_user_id}:${item.payload.itemId}`)
            : undefined) ??
          null,
      })),
    );

    if (
      contactRows.length === 0 &&
      activeInviteRows.length === 0 &&
      inboxRows.length === 0 &&
      sentRows.length === 0 &&
      notificationRows.length === 0
    ) {
      setMessage("Тут поки що порожньо.");
    }

    setIsLoading(false);
  }, [loadNotificationViewDetails, loadProfiles, loadRecommendationViewDetails]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, [loadAll]);

  const validateNickname = (value: string) => {
    if (!NICKNAME_PATTERN.test(value)) {
      return "3-24 символи: літери, цифри, _, -";
    }
    return "";
  };

  const openNicknameModal = (nextAction: "createInvite" | null) => {
    setPostNicknameAction(nextAction);
    setNicknameError("");
    setNicknameValue((prev) => prev || "");
    setIsNicknameModalOpen(true);
  };

  const saveNickname = async (continueAction = false) => {
    if (!currentUserId) {
      setNicknameError("Потрібна авторизація.");
      return false;
    }
    const normalized = nicknameValue.trim();
    const validationError = validateNickname(normalized);
    if (validationError) {
      setNicknameError(validationError);
      return false;
    }
    setIsSavingNickname(true);
    setNicknameError("");
    const { error } = await supabase
      .from("profiles")
      .update({ username: normalized })
      .eq("id", currentUserId);
    setIsSavingNickname(false);
    if (error) {
      if (error.code === "23505") {
        setNicknameError("Нікнейм зайнятий.");
      } else {
        setNicknameError("Не вдалося зберегти.");
      }
      return false;
    }
    setCurrentUsername(normalized);
    setIsNicknamePromptDismissed(false);
    setIsNicknameModalOpen(false);
    setMessage("Нікнейм збережено.");

    if (continueAction && postNicknameAction === "createInvite") {
      setPostNicknameAction(null);
      await createInvite(currentUserId);
    } else {
      setPostNicknameAction(null);
    }
    return true;
  };

  const createInvite = async (userId: string) => {
    if (!userId) {
      setMessage("Потрібна авторизація.");
      return;
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error } = await supabase.from("invites").insert({
      creator_user_id: userId,
      token,
      max_uses: 1,
      expires_at: expiresAt,
    });

    if (error) {
      setMessage("Не вдалося створити інвайт.");
      return;
    }

    await loadAll();
  };

  const handleCreateInvite = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Потрібна авторизація.");
      return;
    }
    setCurrentUserId(user.id);
    if (!currentUsername?.trim()) {
      openNicknameModal("createInvite");
      return;
    }
    await createInvite(user.id);
  };

  const handleToggleLibraryVisibility = async (nextValue: boolean) => {
    if (!currentUserId) {
      setMessage("Потрібна авторизація.");
      return;
    }
    setIsUpdatingVisibility(true);
    const { error } = await supabase
      .from("profiles")
      .update({ views_visible_to_friends: nextValue })
      .eq("id", currentUserId);
    setIsUpdatingVisibility(false);
    if (error) {
      setMessage("Не вдалося оновити налаштування доступу.");
      return;
    }
    setCurrentUserViewsVisible(nextValue);
    setMessage("Налаштування доступу оновлено.");
  };

  const handleCopyInvite = async (invite: Invite) => {
    const link = `${window.location.origin}/invites/${invite.token}`;
    await navigator.clipboard.writeText(link);
    setMessage("Інвайт скопійовано.");
  };

  const handleRevokeInvite = async (inviteId: string) => {
    const { error } = await supabase
      .from("invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", inviteId);

    if (error) {
      setMessage("Не вдалося відкликати інвайт.");
      return;
    }

    await loadAll();
  };

  const handleRemoveContact = async (otherUserId: string) => {
    const { error } = await supabase.rpc("remove_contact", {
      other_user: otherUserId,
    });
    if (error) {
      setMessage("Не вдалося видалити контакт.");
      return;
    }
    await loadAll();
  };

  const updateRecommendationStatus = useCallback(
    async (
      recommendationId: string,
      status: Recommendation["status"],
    ) => {
      const { error } = await supabase
        .from("recommendations")
        .update({ status })
        .eq("id", recommendationId);
      if (error) {
        setMessage("Не вдалося оновити рекомендацію.");
        return;
      }
      await loadAll();
      window.dispatchEvent(new CustomEvent("friends:pending-count-refresh"));
    },
    [loadAll],
  );

  const setNotificationsArchived = useCallback(
    async (
      notificationIds: string[],
      archived: boolean,
      options?: { silent?: boolean },
    ) => {
      if (notificationIds.length === 0) {
        return true;
      }
      const archivedAt = archived ? new Date().toISOString() : null;
      const { error } = await supabase
        .from("friend_notifications")
        .update({ is_read: archived, read_at: archivedAt })
        .in("id", notificationIds);
      if (error) {
        if (!options?.silent) {
          setMessage(
            archived
              ? "Не вдалося перемістити оновлення в архів."
              : "Не вдалося повернути оновлення з архіву.",
          );
        }
        return false;
      }
      setNotifications((prev) =>
        prev.map((item) =>
          notificationIds.includes(item.id)
            ? { ...item, is_read: archived, read_at: archivedAt }
            : item,
        ),
      );
      window.dispatchEvent(new CustomEvent("friends:activity-count-refresh"));
      return true;
    },
    [],
  );

  const handleArchiveNotification = async (notificationId: string) => {
    await setNotificationsArchived([notificationId], true);
  };

  const handleRestoreNotification = async (notificationId: string) => {
    await setNotificationsArchived([notificationId], false);
  };

  const handleArchiveAllNotifications = async () => {
    const unreadIds = notifications.filter((item) => !item.is_read).map((item) => item.id);
    await setNotificationsArchived(unreadIds, true);
  };

  const handleToggleContactNotification = async (
    otherUserId: string,
    key: ContactNotificationKey,
    nextValue: boolean,
  ) => {
    setUpdatingContactSettingKey(`${otherUserId}:${key}`);
    const { error } = await supabase
      .from("contacts")
      .update({ [key]: nextValue })
      .eq("user_id", currentUserId)
      .eq("other_user_id", otherUserId);
    setUpdatingContactSettingKey(null);
    if (error) {
      setMessage("Не вдалося оновити налаштування сповіщень.");
      return;
    }
    setContacts((prev) =>
      prev.map((contact) =>
        contact.other_user_id === otherUserId ? { ...contact, [key]: nextValue } : contact,
      ),
    );
    setMessage("Налаштування сповіщень оновлено.");
  };

  const handleOpenRecommendationAddFlow = useCallback((item: Recommendation) => {
    openCreateOwnEntry({
      mediaKind: item.items.type === "game" ? "game" : "film",
      itemId: item.items.id,
      onCompleted: async () => {
        await updateRecommendationStatus(item.id, "accepted");
      },
    });
  }, [openCreateOwnEntry, updateRecommendationStatus]);

  const handleArchiveAllRecommendations = async () => {
    const pendingIds = inbox.filter((item) => item.status === "pending").map((item) => item.id);
    if (pendingIds.length === 0) {
      return;
    }

    const { error } = await supabase
      .from("recommendations")
      .update({ status: "saved" })
      .in("id", pendingIds);

    if (error) {
      setMessage("Не вдалося перемістити рекомендації в архів.");
      return;
    }

    await loadAll();
    window.dispatchEvent(new CustomEvent("friends:pending-count-refresh"));
  };

  const handleOpenRecommendationFriendCollection = useCallback(
    (item: Recommendation) => {
      router.push(
        `/friends/${item.from_user_id}/${item.items.type === "game" ? "games" : "films"}`,
      );
    },
    [router],
  );

  const handleOpenFriendCollection = useCallback((item: FriendNotification) => {
    router.push(
      `/friends/${item.actor_user_id}/${item.media_kind === "film" ? "films" : "games"}`,
    );
  }, [router]);

  const handleOpenOwnAddFlow = useCallback((item: FriendNotification) => {
    const itemId = item.viewDetails?.itemId ?? item.payload.itemId?.trim();
    if (!itemId) {
      setMessage("Не вдалося підготувати форму додавання.");
      return;
    }

    openCreateOwnEntry({
      mediaKind: item.media_kind,
      itemId,
      onCompleted: async () => {
        await setNotificationsArchived([item.id], true, { silent: true });
      },
    });
  }, [openCreateOwnEntry, setNotificationsArchived]);

  const getNotificationText = (notification: FriendNotification) => {
    return notification.event_type === "viewed"
      ? notification.media_kind === "film"
        ? "Завершив(ла) перегляд фільму"
        : "Завершив(ла) проходження гри"
      : notification.media_kind === "film"
        ? "Додав(ла) фільм до колекції"
        : "Додав(ла) гру до колекції";
  };

  const getNotificationDisplayDate = (notification: FriendNotification) =>
    notification.payload.occurredAt ??
    notification.viewDetails?.viewedAt ??
    notification.created_at;

  const getNotificationDisplayRating = (notification: FriendNotification) =>
    typeof notification.payload.rating === "number"
      ? notification.payload.rating
      : notification.viewDetails?.rating ?? null;

  const getNotificationDisplayComment = (notification: FriendNotification) =>
    notification.viewDetails?.comment?.trim() || null;

  const isArchivedRecommendation = useCallback(
    (item: Recommendation) => item.status !== "pending",
    [],
  );

  const isOwnCollectionItem = useCallback(
    (itemId?: string | null) => Boolean(itemId && ownCollectionItemIds.has(itemId)),
    [ownCollectionItemIds],
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.topRow}>
        <div className={styles.tabs}>
          {(Object.keys(tabLabels) as TabKey[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`${styles.tabButton} ${
                activeTab === tab ? styles.tabActive : ""
              }`}
              onClick={() => {
                if (!currentUsername?.trim() && tab !== "settings") {
                  setActiveTab("settings");
                  setMessage("Спочатку задайте нікнейм у налаштуваннях.");
                  return;
                }
                setActiveTab(tab);
              }}
            >
              {tabLabels[tab]}
              {tab === "recommendations" && friendsBadgeCount > 0 ? (
                <span className={styles.badge}>{friendsBadgeCount}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {message ? <p className={styles.message}>{message}</p> : null}
      {isLoading ? <p className={styles.message}>Завантаження...</p> : null}

      {activeTab === "recommendations" ? (
        <div className={styles.recommendationsBlock}>
          <div className={styles.recommendationsHeader}>
            <div className={styles.subTabs}>
              {(Object.keys(recommendationTabLabels) as RecommendationTabKey[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`${styles.subTabButton} ${
                    activeRecommendationTab === tab ? styles.subTabActive : ""
                  }`}
                  onClick={() => {
                    setActiveRecommendationTab(tab);
                  }}
                >
                  {recommendationTabLabels[tab]}
                  {tab === "inbox" && pendingCount > 0 ? (
                    <span className={styles.badge}>{pendingCount}</span>
                  ) : null}
                  {tab === "updates" && unreadNotificationCount > 0 ? (
                    <span className={styles.badge}>{unreadNotificationCount}</span>
                  ) : null}
                </button>
              ))}
            </div>
            {activeRecommendationTab === "inbox" ? (
              <div className={styles.inlineActions}>
                <ArchiveToggle
                  checked={showArchivedInboxItems}
                  onChange={setShowArchivedInboxItems}
                />
                {pendingCount > 0 ? (
                  <button
                    type="button"
                    className="btnBase btnSecondary"
                    onClick={() => void handleArchiveAllRecommendations()}
                  >
                    Перемістити всі в архів
                  </button>
                ) : null}
              </div>
            ) : null}
            {activeRecommendationTab === "updates" ? (
              <div className={styles.inlineActions}>
                <ArchiveToggle
                  checked={showArchivedNotifications}
                  onChange={setShowArchivedNotifications}
                />
                {unreadNotificationCount > 0 ? (
                  <button
                    type="button"
                    className="btnBase btnSecondary"
                    onClick={() => void handleArchiveAllNotifications()}
                  >
                    Перемістити всі в архів
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className={styles.recommendationContent}>
            {activeRecommendationTab === "inbox" ? (
              <div className={styles.list}>
                {visibleInboxItems.map((item) => (
                  <div
                    key={item.id}
                    className={`${styles.card} ${item.status === "pending" ? styles.cardUnread : ""}`}
                  >
                    {(() => {
                      const isOwnItemAdded = isOwnCollectionItem(item.items.id);

                      return (
                        <>
                    {item.items.poster_url ? (
                      <Image
                        className={styles.poster}
                        src={item.items.poster_url}
                        alt={`Постер ${item.items.title}`}
                        width={96}
                        height={140}
                        unoptimized
                      />
                    ) : (
                      <div className={styles.posterPlaceholder}>No image</div>
                    )}
                    <FriendsFeedCardText
                      title={item.items.title}
                      dateText={formatDate(item.created_at)}
                      typeLabel="Рекомендація друга"
                      byline={`Від: ${getDisplayName(item.fromProfile?.username, item.from_user_id)}`}
                      comment={null}
                    >
                      {typeof item.recommenderViewDetails?.rating === "number" ? (
                        <p className={styles.meta}>
                          Рейтинг: {item.recommenderViewDetails.rating.toFixed(1)}
                        </p>
                      ) : null}
                      {item.recommenderViewDetails ? (
                        <p className={styles.meta}>
                          Переглянуто: {item.recommenderViewDetails.isViewed ? "так" : "ні"} (
                          {item.recommenderViewDetails.viewPercent}%)
                        </p>
                      ) : null}
                      {item.recommenderViewDetails?.isViewed &&
                      item.recommenderViewDetails.viewedAt ? (
                        <p className={styles.meta}>
                          Дата перегляду: {formatDate(item.recommenderViewDetails.viewedAt)}
                        </p>
                      ) : null}
                      {item.recommenderViewDetails?.comment?.trim() ? (
                        <>
                          <p className={styles.meta}>Коментар:</p>
                          <p className={styles.comment}>
                            {item.recommenderViewDetails.comment.trim()}
                          </p>
                        </>
                      ) : null}
                      {item.comment?.trim() ? (
                        <>
                          <p className={styles.meta}>Повідомлення:</p>
                          <p className={styles.comment}>{item.comment.trim()}</p>
                        </>
                      ) : null}
                      {item.status === "accepted" ? (
                        <p className={styles.meta}>Додано до твоєї колекції</p>
                      ) : isArchivedRecommendation(item) ? (
                        <p className={styles.meta}>В архіві</p>
                      ) : null}
                      <div className={styles.actionsRow}>
                        <button
                          type="button"
                          className={`btnBase ${isOwnItemAdded ? "btnSecondary" : "btnPrimary"}`}
                          onClick={() => handleOpenRecommendationAddFlow(item)}
                        >
                          {isOwnItemAdded ? "Редагувати" : "Додати собі у колекцію"}
                        </button>
                        <button
                          type="button"
                          className="btnBase btnSecondary"
                          onClick={() => handleOpenRecommendationFriendCollection(item)}
                        >
                          Відкрити колекцію друга
                        </button>
                        {item.status === "pending" ? (
                          <button
                            type="button"
                            className="btnBase btnSecondary"
                            onClick={() => updateRecommendationStatus(item.id, "saved")}
                          >
                            Перемістити в архів
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btnBase btnSecondary"
                            onClick={() => updateRecommendationStatus(item.id, "pending")}
                          >
                            Повернути з архіву
                          </button>
                        )}
                      </div>
                    </FriendsFeedCardText>
                        </>
                      );
                    })()}
                  </div>
                ))}
                {visibleInboxItems.length === 0 ? (
                  <p className={styles.message}>
                    {inboxItems.length > 0
                      ? "Активних вхідних рекомендацій немає. Увімкни `Відображати архівні`, щоб побачити архівні та вже додані."
                      : "Вхідних рекомендацій поки немає."}
                  </p>
                ) : null}
              </div>
            ) : null}

            {activeRecommendationTab === "updates" ? (
              <div className={styles.list}>
                {visibleNotifications.map((item) => (
                  <div
                    key={item.id}
                    className={`${styles.card} ${!item.is_read ? styles.cardUnread : ""}`}
                  >
                    {item.payload.posterUrl ? (
                      <Image
                        className={styles.poster}
                        src={item.payload.posterUrl}
                        alt={`Постер ${item.payload.title ?? "твору"}`}
                        width={96}
                        height={140}
                        unoptimized
                      />
                    ) : (
                      <div className={styles.posterPlaceholder}>No image</div>
                    )}
                    {(() => {
                      const rating = getNotificationDisplayRating(item);
                      const comment = getNotificationDisplayComment(item);
                      const ownItemId = item.viewDetails?.itemId ?? item.payload.itemId ?? null;
                      const isOwnItemAdded = isOwnCollectionItem(ownItemId);

                      return (
                        <FriendsFeedCardText
                          title={item.payload.title ?? "Без назви"}
                          dateText={formatDate(getNotificationDisplayDate(item))}
                          typeLabel={getNotificationText(item)}
                          byline={`Від: ${getDisplayName(item.actorProfile?.username, item.actor_user_id)}`}
                          comment={null}
                        >
                          {typeof rating === "number" ? (
                            <p className={styles.meta}>Рейтинг: {rating.toFixed(1)}</p>
                          ) : null}
                          {item.viewDetails ? (
                            <p className={styles.meta}>
                              Переглянуто: {item.viewDetails.isViewed ? "так" : "ні"} (
                              {item.viewDetails.viewPercent}%)
                            </p>
                          ) : null}
                          {item.viewDetails?.isViewed && item.viewDetails.viewedAt ? (
                            <p className={styles.meta}>
                              Дата перегляду: {formatDate(item.viewDetails.viewedAt)}
                            </p>
                          ) : null}
                          {comment ? (
                            <>
                              <p className={styles.meta}>Коментар:</p>
                              <p className={styles.comment}>{comment}</p>
                            </>
                          ) : null}
                          <div className={styles.actionsRow}>
                            {ownItemId ? (
                              <button
                                type="button"
                                className={`btnBase ${isOwnItemAdded ? "btnSecondary" : "btnPrimary"}`}
                                onClick={() => handleOpenOwnAddFlow(item)}
                              >
                                {isOwnItemAdded ? "Редагувати" : "Додати собі у колекцію"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btnBase btnSecondary"
                              onClick={() => handleOpenFriendCollection(item)}
                            >
                              Відкрити колекцію друга
                            </button>
                            {!item.is_read ? (
                              <button
                                type="button"
                                className="btnBase btnSecondary"
                                onClick={() => void handleArchiveNotification(item.id)}
                              >
                                Перемістити в архів
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btnBase btnSecondary"
                                onClick={() => void handleRestoreNotification(item.id)}
                              >
                                Повернути з архіву
                              </button>
                            )}
                          </div>
                        </FriendsFeedCardText>
                      );
                    })()}
                  </div>
                ))}
                {visibleNotifications.length === 0 ? (
                  <p className={styles.message}>
                    {notifications.length > 0
                      ? "Активних оновлень від друзів немає. Увімкни `Відображати архівні`, щоб побачити архівні."
                      : "Оновлень від друзів поки немає. Увімкни потрібні типи сповіщень у вкладці \"Контакти\"."}
                  </p>
                ) : null}
              </div>
            ) : null}

            {activeRecommendationTab === "sent" ? (
              <div className={styles.list}>
                {sent.map((item) => (
                  <div key={item.id} className={styles.card}>
                    {item.items.poster_url ? (
                      <Image
                        className={styles.poster}
                        src={item.items.poster_url}
                        alt={`Постер ${item.items.title}`}
                        width={96}
                        height={140}
                        unoptimized
                      />
                    ) : (
                      <div className={styles.posterPlaceholder}>No image</div>
                    )}
                    <div className={styles.cardBody}>
                      <div className={styles.cardHeader}>
                        <h3>{item.items.title}</h3>
                        <span className={styles.meta}>{formatDate(item.created_at)}</span>
                      </div>
                      <p className={styles.meta}>
                        Кому: {getDisplayName(item.toProfile?.username, item.to_user_id)}
                      </p>
                      <p className={styles.meta}>Статус: {item.status}</p>
                      {item.comment ? <p className={styles.comment}>{item.comment}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === "contacts" ? (
        <div className={styles.invites}>
          <div className={styles.inviteForm}>
            <button
              type="button"
              className="btnBase btnPrimary"
              onClick={handleCreateInvite}
            >
              Створити інвайт
            </button>
          </div>

          {invites.length > 0 ? (
            <div className={styles.list}>
              {invites.map((invite) => (
                <div key={invite.id} className={styles.rowCard}>
                  <div>
                    <p className={styles.contactName}>Активне запрошення</p>
                    <p className={styles.meta}>
                      Використано: {invite.used_count}/{invite.max_uses}
                    </p>
                    <p className={styles.meta}>
                      Діє до: {formatDate(invite.expires_at)}
                    </p>
                  </div>
                  <div className={styles.actionsRow}>
                    <button
                      type="button"
                      className="btnBase btnSecondary"
                      onClick={() => handleCopyInvite(invite)}
                    >
                      Скопіювати
                    </button>
                    <button
                      type="button"
                      className="btnBase btnSecondary"
                      onClick={() => handleRevokeInvite(invite.id)}
                    >
                      Відкликати
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className={styles.list}>
            {contacts.map((contact) => (
              <div key={contact.other_user_id} className={styles.rowCard}>
                <div className={styles.contactInfo}>
                  {contact.profile?.avatar_url ? (
                    <Image
                      className={styles.avatar}
                      src={contact.profile.avatar_url}
                      alt={contact.profile.username ?? "avatar"}
                      width={28}
                      height={28}
                      unoptimized
                    />
                  ) : (
                    <div className={styles.avatarPlaceholder} />
                  )}
                  <div>
                    <p className={styles.contactName}>
                      {getDisplayName(contact.profile?.username, contact.other_user_id)}
                    </p>
                    <p className={styles.meta}>Статус: {contact.status}</p>
                    {!contact.profile?.views_visible_to_friends ? (
                      <p className={styles.meta}>Друг закрив доступ до бібліотеки.</p>
                    ) : null}
                  </div>
                </div>
                <div className={styles.contactActions}>
                  <button
                    type="button"
                    className="btnBase btnSecondary"
                    onClick={() => router.push(`/friends/${contact.other_user_id}/films`)}
                    disabled={!contact.profile?.views_visible_to_friends}
                  >
                    Фільми
                  </button>
                  <button
                    type="button"
                    className="btnBase btnSecondary"
                    onClick={() => router.push(`/friends/${contact.other_user_id}/games`)}
                    disabled={!contact.profile?.views_visible_to_friends}
                  >
                    Ігри
                  </button>
                  <button
                    type="button"
                    className="btnBase btnSecondary"
                    onClick={() => handleRemoveContact(contact.other_user_id)}
                  >
                    Видалити контакт
                  </button>
                </div>
                <div className={styles.preferenceGrid}>
                  <label className={styles.preferenceItem}>
                    <input
                      className={styles.visibilityCheckbox}
                      type="checkbox"
                      checked={contact.notify_film_added}
                      onChange={(event) =>
                        void handleToggleContactNotification(
                          contact.other_user_id,
                          "notify_film_added",
                          event.target.checked,
                        )
                      }
                      disabled={updatingContactSettingKey === `${contact.other_user_id}:notify_film_added`}
                    />
                    Фільми: додано
                  </label>
                  <label className={styles.preferenceItem}>
                    <input
                      className={styles.visibilityCheckbox}
                      type="checkbox"
                      checked={contact.notify_film_viewed}
                      onChange={(event) =>
                        void handleToggleContactNotification(
                          contact.other_user_id,
                          "notify_film_viewed",
                          event.target.checked,
                        )
                      }
                      disabled={updatingContactSettingKey === `${contact.other_user_id}:notify_film_viewed`}
                    />
                    Фільми: переглянуто
                  </label>
                  <label className={styles.preferenceItem}>
                    <input
                      className={styles.visibilityCheckbox}
                      type="checkbox"
                      checked={contact.notify_game_added}
                      onChange={(event) =>
                        void handleToggleContactNotification(
                          contact.other_user_id,
                          "notify_game_added",
                          event.target.checked,
                        )
                      }
                      disabled={updatingContactSettingKey === `${contact.other_user_id}:notify_game_added`}
                    />
                    Ігри: додано
                  </label>
                  <label className={styles.preferenceItem}>
                    <input
                      className={styles.visibilityCheckbox}
                      type="checkbox"
                      checked={contact.notify_game_viewed}
                      onChange={(event) =>
                        void handleToggleContactNotification(
                          contact.other_user_id,
                          "notify_game_viewed",
                          event.target.checked,
                        )
                      }
                      disabled={updatingContactSettingKey === `${contact.other_user_id}:notify_game_viewed`}
                    />
                    Ігри: пройдено
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <div className={styles.list}>
          <div className={styles.nicknamePrompt}>
            <p className={styles.nicknamePromptText}>
              {currentUsername?.trim()
                ? `Поточний нікнейм: ${currentUsername}`
                : "Додайте нікнейм, щоб друзі бачили вас по імені."}
            </p>
            <div className={styles.actionsRow}>
              <button
                type="button"
                className="btnBase btnPrimary"
                onClick={() => openNicknameModal(null)}
              >
                {currentUsername?.trim() ? "Змінити нікнейм" : "Задати нікнейм"}
              </button>
              {!currentUsername?.trim() && !isNicknamePromptDismissed ? (
                <button
                  type="button"
                  className="btnBase btnSecondary"
                  onClick={() => setIsNicknamePromptDismissed(true)}
                >
                  Пізніше
                </button>
              ) : null}
            </div>
          </div>

          <div className={styles.visibilityCard}>
            <label className={styles.visibilityLabel}>
              <input
                className={styles.visibilityCheckbox}
                type="checkbox"
                checked={currentUserViewsVisible}
                onChange={(event) => void handleToggleLibraryVisibility(event.target.checked)}
                disabled={isUpdatingVisibility}
              />
              Дозволити друзям переглядати мою бібліотеку
            </label>
          </div>
        </div>
      ) : null}

      {isNicknameModalOpen ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!isSavingNickname) {
              setIsNicknameModalOpen(false);
              setPostNicknameAction(null);
            }
          }}
        >
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.modalTitle}>Задайте нікнейм</h3>
            <p className={styles.meta}>3-24 символи: літери, цифри, _, -</p>
            <label className={styles.modalField}>
              Нікнейм
              <input
                className={styles.modalInput}
                value={nicknameValue}
                maxLength={24}
                onChange={(event) => setNicknameValue(event.target.value)}
                disabled={isSavingNickname}
                autoFocus
              />
            </label>
            {nicknameError ? <p className={styles.errorText}>{nicknameError}</p> : null}
            <div className={styles.actionsRow}>
              <button
                type="button"
                className="btnBase btnSecondary"
                onClick={() => {
                  setIsNicknameModalOpen(false);
                  setPostNicknameAction(null);
                }}
                disabled={isSavingNickname}
              >
                Скасувати
              </button>
              <button
                type="button"
                className="btnBase btnPrimary"
                onClick={() => void saveNickname(Boolean(postNicknameAction))}
                disabled={isSavingNickname}
              >
                {isSavingNickname
                  ? "Збереження..."
                  : postNicknameAction
                    ? "Зберегти і продовжити"
                    : "Зберегти"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
