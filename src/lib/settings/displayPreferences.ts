import {
  normalizeGamePlatformLabel,
  normalizeGamePlatforms,
} from "@/lib/games/platforms";

export const DEFAULT_GAME_PLATFORM_OPTIONS = [
  "PlayStation",
  "PlayStation VR",
  "PlayStation PlayLink",
  "Steam",
  "Nintendo",
  "PC",
  "Xbox",
  "Android",
  "iOS",
  "Other",
] as const;

export type DisplayPreferences = {
  showFilmAvailability: boolean;
  showGameAvailability: boolean;
  visibleGamePlatforms: string[];
  defaultGamePlatform: string | null;
  defaultFilmAvailability: string | null;
  defaultGameAvailability: string | null;
  defaultFilmIsViewed: boolean | null;
  defaultGameIsViewed: boolean | null;
};

export const DISPLAY_PREFERENCES_STORAGE_KEY = "catalogy:display-preferences:v1";

export const getDefaultDisplayPreferences = (): DisplayPreferences => ({
  showFilmAvailability: true,
  showGameAvailability: true,
  visibleGamePlatforms: [...DEFAULT_GAME_PLATFORM_OPTIONS],
  defaultGamePlatform: null,
  defaultFilmAvailability: null,
  defaultGameAvailability: null,
  defaultFilmIsViewed: null,
  defaultGameIsViewed: null,
});

export const readDisplayPreferences = (): DisplayPreferences => {
  if (typeof window === "undefined") {
    return getDefaultDisplayPreferences();
  }
  try {
    const raw = window.localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEY);
    if (!raw) return getDefaultDisplayPreferences();
    const parsed = JSON.parse(raw) as Partial<DisplayPreferences>;
    const platformOptions = DEFAULT_GAME_PLATFORM_OPTIONS as readonly string[];
    const visible = normalizeGamePlatforms(parsed.visibleGamePlatforms).filter((platform) =>
      platformOptions.includes(platform),
    );
    const normalizedDefaultPlatform = normalizeGamePlatformLabel(parsed.defaultGamePlatform);
    const defaultPlatform =
      normalizedDefaultPlatform && platformOptions.includes(normalizedDefaultPlatform)
        ? normalizedDefaultPlatform
        : null;
    return {
      showFilmAvailability: parsed.showFilmAvailability ?? true,
      showGameAvailability: parsed.showGameAvailability ?? true,
      visibleGamePlatforms:
        visible.length > 0 ? visible : [...DEFAULT_GAME_PLATFORM_OPTIONS],
      defaultGamePlatform:
        defaultPlatform && visible.includes(defaultPlatform)
          ? defaultPlatform
          : null,
      defaultFilmAvailability: parsed.defaultFilmAvailability ?? null,
      defaultGameAvailability: parsed.defaultGameAvailability ?? null,
      defaultFilmIsViewed:
        typeof parsed.defaultFilmIsViewed === "boolean"
          ? parsed.defaultFilmIsViewed
          : null,
      defaultGameIsViewed:
        typeof parsed.defaultGameIsViewed === "boolean"
          ? parsed.defaultGameIsViewed
          : null,
    };
  } catch {
    return getDefaultDisplayPreferences();
  }
};

export const writeDisplayPreferences = (prefs: DisplayPreferences) => {
  if (typeof window === "undefined") return;
  const normalizedPrefs: DisplayPreferences = {
    ...prefs,
    visibleGamePlatforms: normalizeGamePlatforms(prefs.visibleGamePlatforms).filter((platform) =>
      (DEFAULT_GAME_PLATFORM_OPTIONS as readonly string[]).includes(platform),
    ),
    defaultGamePlatform: normalizeGamePlatformLabel(prefs.defaultGamePlatform),
  };
  // console.log("[prefs] write", prefs);
  window.localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizedPrefs));
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: DISPLAY_PREFERENCES_STORAGE_KEY,
      newValue: JSON.stringify(normalizedPrefs),
    }),
  );
};
