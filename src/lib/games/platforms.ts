const GAME_PLATFORM_LABEL_ALIASES: Record<string, string> = {
  ps: "PlayStation",
  playstation: "PlayStation",
  "playstation 4": "PlayStation",
  "playstation 5": "PlayStation",
  ps4: "PlayStation",
  ps5: "PlayStation",
  "ps vr": "PlayStation VR",
  "playstation vr": "PlayStation VR",
  "ps playlink": "PlayStation PlayLink",
  playlink: "PlayStation PlayLink",
};

export const normalizeGamePlatformLabel = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return GAME_PLATFORM_LABEL_ALIASES[trimmed.toLowerCase()] ?? trimmed;
};

export const normalizeGamePlatforms = (value?: string[] | null) => {
  if (!value) return [];
  const unique = new Set<string>();
  return value
    .map((platform) => normalizeGamePlatformLabel(platform))
    .filter((platform): platform is string => Boolean(platform))
    .filter((platform) => {
      if (unique.has(platform)) return false;
      unique.add(platform);
      return true;
    });
};
