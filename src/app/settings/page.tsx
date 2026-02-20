"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function SettingsPage() {
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

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "settings_show_film_availability, settings_show_game_availability, settings_visible_game_platforms, settings_default_game_platform, settings_default_film_availability, settings_default_game_availability, settings_default_film_is_viewed, settings_default_game_is_viewed",
        )
        .eq("id", user.id)
        .maybeSingle();

      if (isCancelled) return;
      if (error) {
        setMessage("Не вдалося завантажити налаштування.");
        setIsLoading(false);
        return;
      }

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
    <CatalogLayout title="Налаштування">
      <div className={styles.content}>
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
          <p className={styles.sectionText}>Наявні платформи</p>
          <div className={styles.platformsColumn}>
            {DEFAULT_GAME_PLATFORM_OPTIONS.map((platform) => (
              <label key={platform} className={styles.checkboxRow}>
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
          <label className={styles.field}>
            Значення за замовчанням
            <select
              className={styles.select}
              value={defaultGamePlatform ?? ""}
              onChange={(event) =>
                setDefaultGamePlatform(event.target.value || null)
              }
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
              onChange={(event) =>
                setDefaultGameAvailability(event.target.value || null)
              }
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
                  event.target.value === ""
                    ? null
                    : event.target.value === "viewed",
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

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Фільми</h2>
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
              onChange={(event) =>
                setDefaultFilmAvailability(event.target.value || null)
              }
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
                  event.target.value === ""
                    ? null
                    : event.target.value === "viewed",
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
