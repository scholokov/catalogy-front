"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import { supabase } from "@/lib/supabase/client";
import {
  DEFAULT_GAME_PLATFORM_OPTIONS,
  writeDisplayPreferences,
} from "@/lib/settings/displayPreferences";
import styles from "./SettingsPage.module.css";

const AVAILABILITY_OPTIONS = [
  "В колекції",
  "Тимчасовий доступ",
  "У друзів",
  "Відсутній",
];

type TelegramLinkTokenRow = {
  id: string;
  token: string;
  expires_at: string;
  telegram_username?: string | null;
  telegram_first_name?: string | null;
  telegram_chat_id?: string | null;
};

export default function SettingsPage() {
  const telegramBotUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";
  const [activeTab, setActiveTab] = useState<"films" | "games" | "telegram">("films");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showFilmAvailability, setShowFilmAvailability] = useState(true);
  const [showGameAvailability, setShowGameAvailability] = useState(true);
  const [visibleGamePlatforms, setVisibleGamePlatforms] = useState<string[]>(
    [...DEFAULT_GAME_PLATFORM_OPTIONS],
  );
  const [defaultGamePlatform, setDefaultGamePlatform] = useState<string | null>(null);
  const [defaultFilmAvailability, setDefaultFilmAvailability] = useState<string | null>(
    null,
  );
  const [defaultGameAvailability, setDefaultGameAvailability] = useState<string | null>(
    null,
  );
  const [defaultFilmIsViewed, setDefaultFilmIsViewed] = useState<boolean | null>(null);
  const [defaultGameIsViewed, setDefaultGameIsViewed] = useState<boolean | null>(null);
  const [telegramNotificationsEnabled, setTelegramNotificationsEnabled] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramLinkToken, setTelegramLinkToken] = useState<string | null>(null);
  const [telegramLinkExpiresAt, setTelegramLinkExpiresAt] = useState<string | null>(null);
  const [telegramLinkedUsername, setTelegramLinkedUsername] = useState<string | null>(null);
  const [telegramLinkedFirstName, setTelegramLinkedFirstName] = useState<string | null>(null);
  const [isGeneratingTelegramLink, setIsGeneratingTelegramLink] = useState(false);
  const [isRefreshingTelegramState, setIsRefreshingTelegramState] = useState(false);
  const [isUnlinkingTelegram, setIsUnlinkingTelegram] = useState(false);
  const [isWaitingForTelegramConnect, setIsWaitingForTelegramConnect] = useState(false);
  const [isPlatformsOpen, setIsPlatformsOpen] = useState(false);
  const platformsRef = useRef<HTMLDivElement | null>(null);

  const loadTelegramState = useCallback(async (userId: string) => {
    const [profileRes, tokenRes, linkedRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("telegram_notifications_enabled, telegram_chat_id")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("telegram_link_tokens")
        .select("id, token, expires_at")
        .eq("user_id", userId)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("telegram_link_tokens")
        .select("id, token, expires_at, telegram_username, telegram_first_name, telegram_chat_id")
        .eq("user_id", userId)
        .not("used_at", "is", null)
        .order("used_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileRes.error) {
      throw profileRes.error;
    }
    if (tokenRes.error) {
      throw tokenRes.error;
    }
    if (linkedRes.error) {
      throw linkedRes.error;
    }

    setTelegramNotificationsEnabled(profileRes.data?.telegram_notifications_enabled ?? false);
    setTelegramChatId(profileRes.data?.telegram_chat_id ?? "");
    setTelegramLinkToken(tokenRes.data?.token ?? null);
    setTelegramLinkExpiresAt(tokenRes.data?.expires_at ?? null);
    setTelegramLinkedUsername(linkedRes.data?.telegram_username ?? null);
    setTelegramLinkedFirstName(linkedRes.data?.telegram_first_name ?? null);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!isCancelled) {
          setIsLoading(false);
          setMessage("Потрібна авторизація.");
        }
        return;
      }

      const [profileRes, tokenRes, linkedRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "settings_show_film_availability, settings_show_game_availability, settings_visible_game_platforms, settings_default_game_platform, settings_default_film_availability, settings_default_game_availability, settings_default_film_is_viewed, settings_default_game_is_viewed, telegram_notifications_enabled, telegram_chat_id",
          )
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("telegram_link_tokens")
          .select("id, token, expires_at")
          .eq("user_id", user.id)
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("telegram_link_tokens")
          .select("id, token, expires_at, telegram_username, telegram_first_name, telegram_chat_id")
          .eq("user_id", user.id)
          .not("used_at", "is", null)
          .order("used_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (isCancelled) return;
      if (profileRes.error || tokenRes.error || linkedRes.error) {
        setMessage("Не вдалося завантажити налаштування.");
        setIsLoading(false);
        return;
      }

      const data = profileRes.data;
      const activeToken = tokenRes.data as TelegramLinkTokenRow | null;

      const profileVisiblePlatforms = Array.isArray(data?.settings_visible_game_platforms)
        ? (data.settings_visible_game_platforms.filter(Boolean) as string[])
        : [];
      const resolvedVisiblePlatforms =
        profileVisiblePlatforms.length > 0
          ? profileVisiblePlatforms
          : [...DEFAULT_GAME_PLATFORM_OPTIONS];

      setShowFilmAvailability(data?.settings_show_film_availability ?? true);
      setShowGameAvailability(data?.settings_show_game_availability ?? true);
      setVisibleGamePlatforms(resolvedVisiblePlatforms);
      setDefaultGamePlatform(data?.settings_default_game_platform ?? null);
      setDefaultFilmAvailability(data?.settings_default_film_availability ?? null);
      setDefaultGameAvailability(data?.settings_default_game_availability ?? null);
      setDefaultFilmIsViewed(
        typeof data?.settings_default_film_is_viewed === "boolean"
          ? data.settings_default_film_is_viewed
          : null,
      );
      setDefaultGameIsViewed(
        typeof data?.settings_default_game_is_viewed === "boolean"
          ? data.settings_default_game_is_viewed
          : null,
      );
      setTelegramNotificationsEnabled(data?.telegram_notifications_enabled ?? false);
      setTelegramChatId(data?.telegram_chat_id ?? "");
      setTelegramLinkToken(activeToken?.token ?? null);
      setTelegramLinkExpiresAt(activeToken?.expires_at ?? null);
      setTelegramLinkedUsername(linkedRes.data?.telegram_username ?? null);
      setTelegramLinkedFirstName(linkedRes.data?.telegram_first_name ?? null);
      writeDisplayPreferences({
        showFilmAvailability: data?.settings_show_film_availability ?? true,
        showGameAvailability: data?.settings_show_game_availability ?? true,
        visibleGamePlatforms: resolvedVisiblePlatforms,
        defaultGamePlatform: data?.settings_default_game_platform ?? null,
        defaultFilmAvailability: data?.settings_default_film_availability ?? null,
        defaultGameAvailability: data?.settings_default_game_availability ?? null,
        defaultFilmIsViewed:
          typeof data?.settings_default_film_is_viewed === "boolean"
            ? data.settings_default_film_is_viewed
            : null,
        defaultGameIsViewed:
          typeof data?.settings_default_game_is_viewed === "boolean"
            ? data.settings_default_game_is_viewed
            : null,
      });
      setIsLoading(false);
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  const visiblePlatformSet = useMemo(
    () => new Set(visibleGamePlatforms),
    [visibleGamePlatforms],
  );
  const selectedPlatformsLabel =
    visibleGamePlatforms.length > 0
      ? visibleGamePlatforms.join(", ")
      : "Оберіть платформи";
  const telegramBotDeepLink =
    telegramBotUsername && telegramLinkToken
      ? `https://t.me/${telegramBotUsername}?start=${telegramLinkToken}`
      : null;

  useEffect(() => {
    if (!isPlatformsOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        platformsRef.current &&
        !platformsRef.current.contains(event.target as Node)
      ) {
        setIsPlatformsOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [isPlatformsOpen]);

  useEffect(() => {
    if (
      !isWaitingForTelegramConnect ||
      activeTab !== "telegram" ||
      !telegramLinkToken ||
      Boolean(telegramChatId.trim())
    ) {
      return;
    }

    let isCancelled = false;
    let attempts = 0;
    const maxAttempts = 20;

    const poll = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || isCancelled) {
        return;
      }

      try {
        await loadTelegramState(user.id);
      } catch {
        return;
      }

      if (isCancelled) {
        return;
      }

      attempts += 1;
      if (attempts >= maxAttempts) {
        setIsWaitingForTelegramConnect(false);
        setMessage("Не вдалося підтвердити Telegram автоматично. Спробуй ще раз.");
      }
    };

    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    activeTab,
    isWaitingForTelegramConnect,
    loadTelegramState,
    telegramChatId,
    telegramLinkToken,
  ]);

  useEffect(() => {
    if (telegramChatId.trim()) {
      setIsWaitingForTelegramConnect(false);
    }
  }, [telegramChatId]);

  const togglePlatform = (platform: string) => {
    setVisibleGamePlatforms((prev) => {
      const next = prev.includes(platform)
        ? prev.filter((value) => value !== platform)
        : [...prev, platform];
      if (!next.includes(defaultGamePlatform ?? "")) {
        setDefaultGamePlatform(null);
      }
      return next;
    });
  };

  const handleGenerateTelegramLink = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Потрібна авторизація.");
      return;
    }

    setIsGeneratingTelegramLink(true);
    setMessage("");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const token = crypto.randomUUID().replaceAll("-", "");

    const { error: cleanupError } = await supabase
      .from("telegram_link_tokens")
      .delete()
      .eq("user_id", user.id)
      .is("used_at", null);

    if (cleanupError) {
      setIsGeneratingTelegramLink(false);
      setMessage("Не вдалося підготувати Telegram-підключення.");
      return;
    }

    const { error } = await supabase.from("telegram_link_tokens").insert({
      user_id: user.id,
      token,
      expires_at: expiresAt,
    });

    setIsGeneratingTelegramLink(false);
    if (error) {
      setMessage("Не вдалося створити код підключення.");
      return;
    }

    setTelegramLinkToken(token);
    setTelegramLinkExpiresAt(expiresAt);
    setTelegramLinkedUsername(null);
    setTelegramLinkedFirstName(null);

    const botDeepLink = telegramBotUsername
      ? `https://t.me/${telegramBotUsername}?start=${token}`
      : null;

    if (botDeepLink) {
      setIsWaitingForTelegramConnect(true);
      setMessage("Відкрили Telegram. Підтвердь прив’язку в боті, ми автооновимо статус.");
      window.open(botDeepLink, "_blank", "noopener,noreferrer");
      return;
    }

    setMessage("Відкрий бота і підтвердь прив’язку.");
  };

  const handleRefreshTelegramState = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Потрібна авторизація.");
      return;
    }
    setIsRefreshingTelegramState(true);
    try {
      await loadTelegramState(user.id);
      setMessage("Telegram-статус оновлено.");
    } catch {
      setMessage("Не вдалося оновити Telegram-статус.");
    } finally {
      setIsRefreshingTelegramState(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Потрібна авторизація.");
      return;
    }

    setIsUnlinkingTelegram(true);
    setMessage("");
    const [profileRes, tokenCleanupRes] = await Promise.all([
      supabase
        .from("profiles")
        .update({
          telegram_chat_id: null,
          telegram_notifications_enabled: false,
        })
        .eq("id", user.id),
      supabase
        .from("telegram_link_tokens")
        .delete()
        .eq("user_id", user.id)
        .is("used_at", null),
    ]);
    setIsUnlinkingTelegram(false);

    if (profileRes.error || tokenCleanupRes.error) {
      setMessage("Не вдалося відв’язати Telegram.");
      return;
    }

    setTelegramNotificationsEnabled(false);
    setTelegramChatId("");
    setTelegramLinkToken(null);
    setTelegramLinkExpiresAt(null);
    setTelegramLinkedUsername(null);
    setTelegramLinkedFirstName(null);
    setIsWaitingForTelegramConnect(false);
    setMessage("Telegram відв’язано.");
  };

  const save = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Потрібна авторизація.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    const normalizedTelegramChatId = telegramChatId.trim();
    const payload = {
      settings_show_film_availability: showFilmAvailability,
      settings_show_game_availability: showGameAvailability,
      settings_visible_game_platforms:
        visibleGamePlatforms.length > 0
          ? visibleGamePlatforms
          : [...DEFAULT_GAME_PLATFORM_OPTIONS],
      settings_default_game_platform:
        defaultGamePlatform && visibleGamePlatforms.includes(defaultGamePlatform)
          ? defaultGamePlatform
          : null,
      settings_default_film_availability:
        defaultFilmAvailability &&
        AVAILABILITY_OPTIONS.includes(defaultFilmAvailability)
          ? defaultFilmAvailability
          : null,
      settings_default_game_availability:
        defaultGameAvailability &&
        AVAILABILITY_OPTIONS.includes(defaultGameAvailability)
          ? defaultGameAvailability
          : null,
      settings_default_film_is_viewed: defaultFilmIsViewed,
      settings_default_game_is_viewed: defaultGameIsViewed,
      telegram_notifications_enabled:
        telegramNotificationsEnabled && normalizedTelegramChatId.length > 0,
      telegram_chat_id: normalizedTelegramChatId || null,
    };

    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", user.id);

    setIsSaving(false);
    if (error) {
      setMessage("Не вдалося зберегти налаштування.");
      return;
    }
    writeDisplayPreferences({
      showFilmAvailability,
      showGameAvailability,
      visibleGamePlatforms:
        visibleGamePlatforms.length > 0
          ? visibleGamePlatforms
          : [...DEFAULT_GAME_PLATFORM_OPTIONS],
      defaultGamePlatform:
        defaultGamePlatform && visibleGamePlatforms.includes(defaultGamePlatform)
          ? defaultGamePlatform
          : null,
      defaultFilmAvailability:
        defaultFilmAvailability && AVAILABILITY_OPTIONS.includes(defaultFilmAvailability)
          ? defaultFilmAvailability
          : null,
      defaultGameAvailability:
        defaultGameAvailability && AVAILABILITY_OPTIONS.includes(defaultGameAvailability)
          ? defaultGameAvailability
          : null,
      defaultFilmIsViewed,
      defaultGameIsViewed,
    });
    setMessage("Налаштування збережено.");
  };

  return (
    <CatalogLayout title="Налаштування" showBrandLogo>
      <div className={styles.content}>
        <div className={styles.tabSwitch}>
          <button
            type="button"
            className={`${styles.tabButton} ${
              activeTab === "films" ? styles.tabButtonActive : ""
            }`}
            onClick={() => setActiveTab("films")}
          >
            Кіно
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${
              activeTab === "games" ? styles.tabButtonActive : ""
            }`}
            onClick={() => setActiveTab("games")}
          >
            Ігри
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${
              activeTab === "telegram" ? styles.tabButtonActive : ""
            }`}
            onClick={() => setActiveTab("telegram")}
          >
            Telegram
          </button>
        </div>

        {activeTab === "films" ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Кіно</h2>
            <label className={styles.checkboxRow}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={showFilmAvailability}
                onChange={(event) => setShowFilmAvailability(event.target.checked)}
                disabled={isLoading || isSaving}
              />
              Відображати &quot;Наявність&quot;
            </label>
            <label className={styles.field}>
              Наявність за замовчанням
              <select
                className={styles.select}
                value={defaultFilmAvailability ?? ""}
                onChange={(event) => setDefaultFilmAvailability(event.target.value || null)}
                disabled={isLoading || isSaving}
              >
                <option value="">-</option>
                {AVAILABILITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Переглянуто за замовчанням
              <select
                className={styles.select}
                value={
                  defaultFilmIsViewed === null ? "" : defaultFilmIsViewed ? "viewed" : "planned"
                }
                onChange={(event) =>
                  setDefaultFilmIsViewed(
                    event.target.value === "" ? null : event.target.value === "viewed",
                  )
                }
                disabled={isLoading || isSaving}
              >
                <option value="">-</option>
                <option value="viewed">Переглянуто</option>
                <option value="planned">Заплановано</option>
              </select>
            </label>
          </section>
        ) : activeTab === "games" ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Ігри</h2>
            <label className={styles.checkboxRow}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={showGameAvailability}
                onChange={(event) => setShowGameAvailability(event.target.checked)}
                disabled={isLoading || isSaving}
              />
              Відображати &quot;Наявність&quot;
            </label>
            <div className={`${styles.field} ${styles.platformsField}`} ref={platformsRef}>
              Наявні платформи
              <button
                type="button"
                className={styles.multiSelectTrigger}
                onClick={() => setIsPlatformsOpen((prev) => !prev)}
                disabled={isLoading || isSaving}
              >
                <span className={styles.multiSelectText}>{selectedPlatformsLabel}</span>
                <span className={styles.multiSelectChevron}>▾</span>
              </button>
              {isPlatformsOpen ? (
                <div className={styles.multiSelectMenu}>
                  {DEFAULT_GAME_PLATFORM_OPTIONS.map((platform) => (
                    <label key={platform} className={styles.multiSelectOption}>
                      <input
                        className={styles.checkbox}
                        type="checkbox"
                        checked={visiblePlatformSet.has(platform)}
                        onChange={() => togglePlatform(platform)}
                        disabled={isLoading || isSaving}
                      />
                      {platform}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            <label className={styles.field}>
              Значення за замовчанням
              <select
                className={styles.select}
                value={defaultGamePlatform ?? ""}
                onChange={(event) => setDefaultGamePlatform(event.target.value || null)}
                disabled={isLoading || isSaving}
              >
                <option value="">-</option>
                {DEFAULT_GAME_PLATFORM_OPTIONS.filter((platform) =>
                  visibleGamePlatforms.includes(platform),
                ).map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Наявність за замовчанням
              <select
                className={styles.select}
                value={defaultGameAvailability ?? ""}
                onChange={(event) => setDefaultGameAvailability(event.target.value || null)}
                disabled={isLoading || isSaving}
              >
                <option value="">-</option>
                {AVAILABILITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Переглянуто за замовчанням
              <select
                className={styles.select}
                value={
                  defaultGameIsViewed === null ? "" : defaultGameIsViewed ? "viewed" : "planned"
                }
                onChange={(event) =>
                  setDefaultGameIsViewed(
                    event.target.value === "" ? null : event.target.value === "viewed",
                  )
                }
                disabled={isLoading || isSaving}
              >
                <option value="">-</option>
                <option value="viewed">Переглянуто</option>
                <option value="planned">Заплановано</option>
              </select>
            </label>
          </section>
        ) : (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Telegram</h2>
            <div className={styles.statusCard}>
              <p className={styles.sectionText}>
                Підключи Telegram, підтвердь `Start` у боті, і ми автоматично оновимо статус.
              </p>
            </div>
            {telegramChatId.trim() ? (
              <div className={styles.statusCard}>
                <p className={styles.statusLine}>
                  Прив’язаний акаунт:{" "}
                  <strong>
                    {telegramLinkedUsername
                      ? `@${telegramLinkedUsername}`
                      : telegramLinkedFirstName || "Telegram user"}
                  </strong>
                </p>
                <p className={styles.sectionText}>Chat ID: {telegramChatId}</p>
              </div>
            ) : null}
            <div className={styles.telegramActionsRow}>
              <div className={styles.actionsInline}>
                <button
                  type="button"
                  className="btnBase btnPrimary"
                  onClick={() => void handleGenerateTelegramLink()}
                  disabled={isLoading || isSaving || isGeneratingTelegramLink}
                >
                  {isGeneratingTelegramLink
                    ? "Підготовка..."
                    : telegramChatId.trim()
                      ? "Перепідключити Telegram"
                      : "Підключити Telegram"}
                </button>
                {telegramChatId.trim() ? (
                  <button
                    type="button"
                    className="btnBase btnSecondary"
                    onClick={() => void handleUnlinkTelegram()}
                    disabled={isLoading || isSaving || isUnlinkingTelegram}
                  >
                    {isUnlinkingTelegram ? "Відв’язування..." : "Відв’язати Telegram"}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="btnBase btnSecondary"
                onClick={() => void handleRefreshTelegramState()}
                disabled={isLoading || isSaving || isRefreshingTelegramState}
              >
                {isRefreshingTelegramState ? "Оновлення..." : "Оновити статус"}
              </button>
            </div>
            {isWaitingForTelegramConnect ? (
              <div className={styles.statusCard}>
                <p className={styles.statusLine}>Очікуємо підтвердження в Telegram</p>
                <p className={styles.sectionText}>
                  Після натискання `Start` у боті сторінка автоматично оновить статус.
                </p>
                <p className={styles.sectionText}>
                  Час дії поточного payload:{" "}
                  {telegramLinkExpiresAt
                    ? new Date(telegramLinkExpiresAt).toLocaleString("uk-UA")
                    : "невідомо"}
                </p>
                {telegramBotDeepLink ? (
                  <a
                    className="btnBase btnSecondary"
                    href={telegramBotDeepLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Відкрити бота ще раз
                  </a>
                ) : null}
              </div>
            ) : null}
            <label className={styles.checkboxRow}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={telegramNotificationsEnabled}
                onChange={(event) => setTelegramNotificationsEnabled(event.target.checked)}
                disabled={isLoading || isSaving || !telegramChatId.trim()}
              />
              Увімкнути Telegram-сповіщення
            </label>
            <div className={styles.statusCard}>
              <p className={styles.statusLine}>
                Статус каналу:{" "}
                <strong>
                  {telegramNotificationsEnabled && telegramChatId.trim()
                    ? "готовий до відправки"
                    : "не налаштовано"}
                </strong>
              </p>
            </div>
          </section>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className="btnBase btnPrimary"
            onClick={save}
            disabled={isLoading || isSaving}
          >
            {isSaving ? "Збереження..." : "Зберегти"}
          </button>
        </div>
        {message ? <p className={styles.message}>{message}</p> : null}
      </div>
    </CatalogLayout>
  );
}
