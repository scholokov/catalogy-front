"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
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
};

type TabKey = "recommendations" | "contacts" | "settings";
type RecommendationTabKey = "inbox" | "archive" | "sent";

const tabLabels: Record<TabKey, string> = {
  recommendations: "Рекомендації",
  contacts: "Контакти",
  settings: "Налаштування",
};

const recommendationTabLabels: Record<RecommendationTabKey, string> = {
  inbox: "Вхідні",
  archive: "Архів",
  sent: "Ваші",
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("uk-UA");
const NICKNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;

export default function FriendsManager() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("recommendations");
  const [activeRecommendationTab, setActiveRecommendationTab] =
    useState<RecommendationTabKey>("inbox");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inbox, setInbox] = useState<Recommendation[]>([]);
  const [sent, setSent] = useState<Recommendation[]>([]);
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
  const [currentUserViewsVisible, setCurrentUserViewsVisible] = useState(false);
  const [postNicknameAction, setPostNicknameAction] = useState<"createInvite" | null>(
    null,
  );

  const pendingCount = useMemo(
    () => inbox.filter((item) => item.status === "pending").length,
    [inbox],
  );
  const inboxItems = useMemo(
    () => inbox.filter((item) => item.status === "pending" || item.status === "saved"),
    [inbox],
  );
  const archiveItems = useMemo(
    () => inbox.filter((item) => item.status === "accepted" || item.status === "dismissed"),
    [inbox],
  );

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

    const [profileRes, contactsRes, invitesRes, inboxRes, sentRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("username, views_visible_to_friends")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("contacts")
        .select("other_user_id, status, created_at")
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
    ]);

    if (
      profileRes.error ||
      contactsRes.error ||
      invitesRes.error ||
      inboxRes.error ||
      sentRes.error
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

    const profileIds = new Set<string>();
    contactRows.forEach((contact) => profileIds.add(contact.other_user_id));
    inboxRows.forEach((item) => profileIds.add(item.from_user_id));
    sentRows.forEach((item) => profileIds.add(item.to_user_id));

    const profileMap = await loadProfiles([...profileIds]);

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
      })),
    );
    setSent(
      sentRows.map((item) => ({
        ...item,
        toProfile: profileMap.get(item.to_user_id),
      })),
    );

    if (
      contactRows.length === 0 &&
      activeInviteRows.length === 0 &&
      inboxRows.length === 0 &&
      sentRows.length === 0
    ) {
      setMessage("Тут поки що порожньо.");
    }

    setIsLoading(false);
  }, [loadProfiles]);

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

  const updateRecommendationStatus = async (
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
  };

  const handleAddToCollection = async (itemId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Потрібна авторизація.");
      return;
    }

    const { data: existing } = await supabase
      .from("user_views")
      .select("id")
      .eq("user_id", user.id)
      .eq("item_id", itemId)
      .maybeSingle();

    if (existing?.id) {
      setMessage("Вже у твоїй колекції.");
      return;
    }

    const { error } = await supabase.from("user_views").insert({
      user_id: user.id,
      item_id: itemId,
      is_viewed: false,
      view_percent: 0,
      rating: null,
    });

    if (error) {
      setMessage("Не вдалося додати у колекцію.");
      return;
    }

    setMessage("Додано до колекції.");
  };

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
              {tab === "recommendations" && pendingCount > 0 ? (
                <span className={styles.badge}>{pendingCount}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {message ? <p className={styles.message}>{message}</p> : null}
      {isLoading ? <p className={styles.message}>Завантаження...</p> : null}

      {activeTab === "recommendations" ? (
        <div className={styles.recommendationsBlock}>
          <div className={styles.subTabs}>
            {(Object.keys(recommendationTabLabels) as RecommendationTabKey[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`${styles.subTabButton} ${
                  activeRecommendationTab === tab ? styles.subTabActive : ""
                }`}
                onClick={() => setActiveRecommendationTab(tab)}
              >
                {recommendationTabLabels[tab]}
                {tab === "inbox" && pendingCount > 0 ? (
                  <span className={styles.badge}>{pendingCount}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className={styles.recommendationContent}>
            {activeRecommendationTab === "inbox" ? (
              <div className={styles.list}>
                {inboxItems.map((item) => (
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
                        Рекомендує:{" "}
                        {getDisplayName(item.fromProfile?.username, item.from_user_id)}
                      </p>
                      {item.comment ? <p className={styles.comment}>{item.comment}</p> : null}
                      {item.status === "saved" ? (
                        <p className={styles.meta}>Статус: Прочитано (відкладено)</p>
                      ) : null}
                      <div className={styles.actionsRow}>
                        <button
                          type="button"
                          className="btnBase btnPrimary"
                          onClick={async () => {
                            await handleAddToCollection(item.items.id);
                            await updateRecommendationStatus(item.id, "accepted");
                          }}
                        >
                          Додати до колекції
                        </button>
                        <button
                          type="button"
                          className="btnBase btnSecondary"
                          onClick={() => updateRecommendationStatus(item.id, "saved")}
                        >
                          Відкласти
                        </button>
                        <button
                          type="button"
                          className="btnBase btnSecondary"
                          onClick={() => updateRecommendationStatus(item.id, "dismissed")}
                        >
                          Не цікаво
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {activeRecommendationTab === "archive" ? (
              <div className={styles.list}>
                {archiveItems.map((item) => (
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
                        Рекомендує:{" "}
                        {getDisplayName(item.fromProfile?.username, item.from_user_id)}
                      </p>
                      <p className={styles.meta}>
                        Статус: {item.status === "accepted" ? "Додано до колекції" : "Не цікаво"}
                      </p>
                      {item.comment ? <p className={styles.comment}>{item.comment}</p> : null}
                    </div>
                  </div>
                ))}
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
