"use client";

import { useEffect, useMemo, useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import { supabase } from "@/lib/supabase/client";
import {
  DEFAULT_GAME_PLATFORM_OPTIONS,
  writeDisplayPreferences,
} from "@/lib/settings/displayPreferences";
import styles from "./SettingsPage.module.css";

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
          "settings_show_film_availability, settings_show_game_availability, settings_visible_game_platforms, settings_default_game_platform",
        )
        .eq("id", user.id)
        .maybeSingle();

      if (isCancelled) return;
      if (error) {
        setMessage("Не вдалося завантажити налаштування.");
        setIsLoading(false);
        return;
      }

      setShowFilmAvailability(data?.settings_show_film_availability ?? true);
      setShowGameAvailability(data?.settings_show_game_availability ?? true);
      setVisibleGamePlatforms(
        (data?.settings_visible_game_platforms?.filter(Boolean) as string[] | undefined)
          ?.length
          ? (data.settings_visible_game_platforms as string[])
          : [...DEFAULT_GAME_PLATFORM_OPTIONS],
      );
      setDefaultGamePlatform(data?.settings_default_game_platform ?? null);
      writeDisplayPreferences({
        showFilmAvailability: data?.settings_show_film_availability ?? true,
        showGameAvailability: data?.settings_show_game_availability ?? true,
        visibleGamePlatforms:
          (data?.settings_visible_game_platforms?.filter(Boolean) as string[] | undefined)
            ?.length
            ? (data.settings_visible_game_platforms as string[])
            : [...DEFAULT_GAME_PLATFORM_OPTIONS],
        defaultGamePlatform: data?.settings_default_game_platform ?? null,
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
