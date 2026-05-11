export type PosterMenuActionItem = {
  label: string;
  href: string;
};

export type PosterMenuAction = {
  label: string;
  items: PosterMenuActionItem[];
};

const FILM_SERVICE_ACTION_LABEL = "Де подивитись";
const GAME_SERVICE_ACTION_LABEL = "Де подивитись";

const normalizeSearchTitle = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const buildSearchUrl = (baseUrl: string, paramName: string, title: string) => {
  const params = new URLSearchParams([[paramName, title]]);
  return `${baseUrl}?${params.toString()}`;
};

const buildNetflixSearchUrl = (title: string) => buildSearchUrl("https://www.netflix.com/search", "q", title);

const buildMegogoSearchUrl = (title: string) =>
  buildSearchUrl("https://megogo.net/ua/search-extended", "q", title);

const buildUakinoSearchUrl = (title: string) =>
  `https://uakino.best/index.php?do=search&subaction=search&story=${encodeURIComponent(title)}`;

const buildSteamSearchUrl = (title: string) =>
  buildSearchUrl("https://store.steampowered.com/search/", "term", title);

const buildPlayStationStoreSearchUrl = (title: string) =>
  `https://store.playstation.com/en-us/search/${encodeURIComponent(title)}`;

export const buildFilmServiceMenuAction = (
  originalTitle?: string | null,
  fallbackTitle?: string | null,
): PosterMenuAction | undefined => {
  const title = normalizeSearchTitle(originalTitle, fallbackTitle);

  if (!title) {
    return undefined;
  }

  return {
    label: FILM_SERVICE_ACTION_LABEL,
    items: [
      { label: "MEGOGO", href: buildMegogoSearchUrl(title) },
      { label: "Netflix", href: buildNetflixSearchUrl(title) },
      { label: "UAKino", href: buildUakinoSearchUrl(title) },
    ],
  };
};

export const buildGameServiceMenuAction = (
  originalTitle?: string | null,
  fallbackTitle?: string | null,
): PosterMenuAction | undefined => {
  const title = normalizeSearchTitle(originalTitle, fallbackTitle);

  if (!title) {
    return undefined;
  }

  return {
    label: GAME_SERVICE_ACTION_LABEL,
    items: [
      { label: "PlayStation Store", href: buildPlayStationStoreSearchUrl(title) },
      { label: "Steam", href: buildSteamSearchUrl(title) },
    ],
  };
};
