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
};

const STORAGE_KEY = "catalogy:display-preferences:v1";

export const getDefaultDisplayPreferences = (): DisplayPreferences => ({
  showFilmAvailability: true,
  showGameAvailability: true,
  visibleGamePlatforms: [...DEFAULT_GAME_PLATFORM_OPTIONS],
  defaultGamePlatform: null,
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
    };
  } catch {
    return getDefaultDisplayPreferences();
  }
};

export const writeDisplayPreferences = (prefs: DisplayPreferences) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
};
