export const DEFAULT_GAME_PLATFORM_OPTIONS = [
  "PS",
  "Steam",
  "PC",
  "Android",
  "iOS",
  "Xbox",
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

const STORAGE_KEY = "catalogy:display-preferences:v1";

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
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultDisplayPreferences();
    const parsed = JSON.parse(raw) as Partial<DisplayPreferences>;
    const visible = (parsed.visibleGamePlatforms ?? []).filter((platform) =>
      (DEFAULT_GAME_PLATFORM_OPTIONS as readonly string[]).includes(platform),
    );
    const defaultPlatform =
      parsed.defaultGamePlatform &&
      (DEFAULT_GAME_PLATFORM_OPTIONS as readonly string[]).includes(
        parsed.defaultGamePlatform,
      )
        ? parsed.defaultGamePlatform
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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
};
