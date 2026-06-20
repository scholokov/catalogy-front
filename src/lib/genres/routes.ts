export type GenreMediaKind = "film" | "game";
export type GenreSource = "tmdb" | "rawg" | "igdb";

export type GenreRouteTarget = {
  mediaKind: GenreMediaKind;
  source: GenreSource;
  sourceGenreId: string;
};

export const buildGenreHref = ({
  mediaKind,
  source,
  sourceGenreId,
}: GenreRouteTarget) => {
  if (mediaKind === "film") {
    return `/genres/${sourceGenreId}`;
  }

  return `/genres/game-${source}-${sourceGenreId}`;
};

export const buildFilmGenreViewHref = ({
  sourceGenreId,
  viewId,
  navigationToken,
}: {
  sourceGenreId: string;
  viewId: string;
  navigationToken?: string;
}) => {
  const href = `${buildGenreHref({
    mediaKind: "film",
    source: "tmdb",
    sourceGenreId,
  })}/view/${viewId}`;
  return navigationToken ? `${href}?nav=${encodeURIComponent(navigationToken)}` : href;
};

export const buildGameGenreViewHref = ({
  source,
  sourceGenreId,
  viewId,
  navigationToken,
}: {
  source: GenreSource;
  sourceGenreId: string;
  viewId: string;
  navigationToken?: string;
}) => {
  const href = `${buildGenreHref({ mediaKind: "game", source, sourceGenreId })}/view/${viewId}`;
  return navigationToken ? `${href}?nav=${encodeURIComponent(navigationToken)}` : href;
};

export const parseGenreRouteId = (genreId: string): GenreRouteTarget => {
  if (!genreId.startsWith("game-")) {
    return {
      mediaKind: "film",
      source: "tmdb",
      sourceGenreId: genreId,
    };
  }

  const [, source, ...rest] = genreId.split("-");
  const sourceGenreId = rest.join("-").trim();

  if ((source === "rawg" || source === "igdb") && sourceGenreId) {
    return {
      mediaKind: "game",
      source,
      sourceGenreId,
    };
  }

  return {
    mediaKind: "game",
    source: "rawg",
    sourceGenreId: genreId.replace(/^game-/, ""),
  };
};
