import { supabase } from "@/lib/supabase/client";
import {
  DEFAULT_GAME_PLATFORM_OPTIONS,
  writeDisplayPreferences,
} from "./displayPreferences";

export async function syncDisplayPreferences(userId: string) {
  try {
    const { data } = await supabase
      .from("profiles")
      .select(
        "settings_show_film_availability, settings_show_game_availability, settings_visible_game_platforms, settings_default_game_platform, settings_default_film_availability, settings_default_game_availability, settings_default_film_is_viewed, settings_default_game_is_viewed",
      )
      .eq("id", userId)
      .maybeSingle();

    if (data) {
      const profileVisiblePlatforms = Array.isArray(
        data.settings_visible_game_platforms,
      )
        ? (data.settings_visible_game_platforms.filter(Boolean) as string[])
        : [];
      const resolvedVisiblePlatforms =
        profileVisiblePlatforms.length > 0
          ? profileVisiblePlatforms
          : [...DEFAULT_GAME_PLATFORM_OPTIONS];

      writeDisplayPreferences({
        showFilmAvailability: data.settings_show_film_availability ?? true,
        showGameAvailability: data.settings_show_game_availability ?? true,
        visibleGamePlatforms: resolvedVisiblePlatforms,
        defaultGamePlatform: data.settings_default_game_platform ?? null,
        defaultFilmAvailability: data.settings_default_film_availability ?? null,
        defaultGameAvailability: data.settings_default_game_availability ?? null,
        defaultFilmIsViewed:
          typeof data.settings_default_film_is_viewed === "boolean"
            ? data.settings_default_film_is_viewed
            : null,
        defaultGameIsViewed:
          typeof data.settings_default_game_is_viewed === "boolean"
            ? data.settings_default_game_is_viewed
            : null,
      });
    }
  } catch (error) {
    console.error("[sync] failed to sync preferences", error);
  }
}
