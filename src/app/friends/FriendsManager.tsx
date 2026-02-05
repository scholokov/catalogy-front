"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import styles from "./FriendsManager.module.css";

type Profile = {
  id: string;
  username: string | null;
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

type TabKey = "inbox" | "sent" | "contacts" | "invites";

const tabLabels: Record<TabKey, string> = {
  inbox: "Вхідні",
  sent: "Надіслані",
  contacts: "Контакти",
  invites: "Запрошення",
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("uk-UA");

export default function FriendsManager() {
  const [activeTab, setActiveTab] = useState<TabKey>("inbox");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inbox, setInbox] = useState<Recommendation[]>([]);
  const [sent, setSent] = useState<Recommendation[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const pendingCount = useMemo(
    () => inbox.filter((item) => item.status === "pending").length,
    [inbox],
  );

  const loadProfiles = async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, Profile>();
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", ids);
    const map = new Map<string, Profile>();
    (data ?? []).forEach((profile) => map.set(profile.id, profile));
    return map;
  };

  const loadAll = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Потрібна авторизація.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    const [contactsRes, invitesRes, inboxRes, sentRes] = await Promise.all([
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

    if (contactsRes.error || invitesRes.error || inboxRes.error || sentRes.error) {
      setMessage("Не вдалося завантажити дані.");
      setIsLoading(false);
      return;
    }

    const contactRows = (contactsRes.data ?? []) as Contact[];
    const inviteRows = (invitesRes.data ?? []) as Invite[];
    const inboxRows = (inboxRes.data ?? []) as Recommendation[];
    const sentRows = (sentRes.data ?? []) as Recommendation[];

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
    setInvites(inviteRows);
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
      inviteRows.length === 0 &&
      inboxRows.length === 0 &&
      sentRows.length === 0
    ) {
      setMessage("Тут поки що порожньо.");
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const inviteStatus = (invite: Invite) => {
    const now = Date.now();
    if (invite.revoked_at) return "Відкликаний";
    if (new Date(invite.expires_at).getTime() < now) return "Прострочений";
    if (invite.used_count >= invite.max_uses) return "Використаний";
    return "Активний";
  };

  const handleCreateInvite = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Потрібна авторизація.");
      return;
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error } = await supabase.from("invites").insert({
      creator_user_id: user.id,
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
      <div className={styles.tabs}>
        {(Object.keys(tabLabels) as TabKey[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tabButton} ${
              activeTab === tab ? styles.tabActive : ""
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tabLabels[tab]}
            {tab === "inbox" && pendingCount > 0 ? (
              <span className={styles.badge}>{pendingCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {message ? <p className={styles.message}>{message}</p> : null}
      {isLoading ? <p className={styles.message}>Завантаження...</p> : null}

      {activeTab === "inbox" ? (
        <div className={styles.list}>
          {inbox.map((item) => (
            <div key={item.id} className={styles.card}>
              {item.items.poster_url ? (
                <img
                  className={styles.poster}
                  src={item.items.poster_url}
                  alt={`Постер ${item.items.title}`}
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
                  {item.fromProfile?.username ?? item.from_user_id.slice(0, 8)}
                </p>
                {item.comment ? <p className={styles.comment}>{item.comment}</p> : null}
                <div className={styles.actionsRow}>
                  <button
                    type="button"
                    className="btnBase btnPrimary"
                    onClick={() => {
                      handleAddToCollection(item.items.id);
                      updateRecommendationStatus(item.id, "accepted");
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

      {activeTab === "sent" ? (
        <div className={styles.list}>
          {sent.map((item) => (
            <div key={item.id} className={styles.card}>
              {item.items.poster_url ? (
                <img
                  className={styles.poster}
                  src={item.items.poster_url}
                  alt={`Постер ${item.items.title}`}
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
                  Кому: {item.toProfile?.username ?? item.to_user_id.slice(0, 8)}
                </p>
                <p className={styles.meta}>Статус: {item.status}</p>
                {item.comment ? <p className={styles.comment}>{item.comment}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === "contacts" ? (
        <div className={styles.list}>
          {contacts.map((contact) => (
            <div key={contact.other_user_id} className={styles.rowCard}>
              <div className={styles.contactInfo}>
                {contact.profile?.avatar_url ? (
                  <img
                    className={styles.avatar}
                    src={contact.profile.avatar_url}
                    alt={contact.profile.username ?? "avatar"}
                  />
                ) : (
                  <div className={styles.avatarPlaceholder} />
                )}
                <div>
                  <p className={styles.contactName}>
                    {contact.profile?.username ??
                      contact.other_user_id.slice(0, 8)}
                  </p>
                  <p className={styles.meta}>Статус: {contact.status}</p>
                </div>
              </div>
              <button
                type="button"
                className="btnBase btnSecondary"
                onClick={() => handleRemoveContact(contact.other_user_id)}
              >
                Видалити контакт
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === "invites" ? (
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

          <div className={styles.list}>
            {invites.map((invite) => (
              <div key={invite.id} className={styles.rowCard}>
                <div>
                  <p className={styles.contactName}>{inviteStatus(invite)}</p>
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
                    disabled={Boolean(invite.revoked_at)}
                  >
                    Відкликати
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
