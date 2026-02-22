type IgdbCredentials = {
  clientId: string;
  clientSecret: string;
};

type IgdbTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type IgdbGame = {
  id?: number;
  name?: string;
  total_rating?: number;
  first_release_date?: number;
  summary?: string;
  cover?: { url?: string };
  genres?: Array<{ name?: string }>;
};

type IgdbSearchRow = {
  game?: number | null;
};

type IgdbMappedGame = {
  id: string;
  title: string;
  rating: number | null;
  ratingSource: "igdb";
  released: string;
  poster: string;
  genres: string;
};

type IgdbMappedGameDetail = {
  title: string;
  rating: number | null;
  source: "igdb";
  released: string;
  poster: string;
  description: string;
};

let cachedToken: { value: string; expiresAtMs: number } | null = null;

const getCredentials = (): IgdbCredentials | null => {
  const clientId =
    process.env.IGDB_CLIENT_ID ??
    process.env.TWITCH_CLIENT_ID ??
    process.env.NEXT_PUBLIC_IGDB_CLIENT_ID ??
    null;
  const clientSecret =
    process.env.IGDB_CLIENT_SECRET ?? process.env.TWITCH_CLIENT_SECRET ?? null;

  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
};

const toReleasedDate = (unixSeconds?: number) => {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) return "";
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
};

const toIgdbScaleRating = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.round(value * 10) / 10;
  return Math.max(0, Math.min(100, normalized));
};

const normalizeCoverUrl = (url?: string) => {
  if (!url) return "";
  const withProtocol = url.startsWith("//") ? `https:${url}` : url;
  return withProtocol
    .replace("/t_thumb/", "/t_1080p/")
    .replace("/t_cover_small/", "/t_1080p/")
    .replace("/t_cover_big/", "/t_1080p/")
    .replace("/t_720p/", "/t_1080p/");
};

const escapeQuery = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");

const getAccessToken = async (credentials: IgdbCredentials) => {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now) {
    return cachedToken.value;
  }

  const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
  tokenUrl.searchParams.set("client_id", credentials.clientId);
  tokenUrl.searchParams.set("client_secret", credentials.clientSecret);
  tokenUrl.searchParams.set("grant_type", "client_credentials");

  const tokenResponse = await fetch(tokenUrl.toString(), {
    method: "POST",
    cache: "no-store",
  });
  if (!tokenResponse.ok) {
    throw new Error(`IGDB token request failed with status ${tokenResponse.status}.`);
  }

  const tokenData = (await tokenResponse.json()) as IgdbTokenResponse;
  if (!tokenData.access_token) {
    throw new Error("IGDB token response is missing access_token.");
  }

  const ttlSeconds =
    typeof tokenData.expires_in === "number" && Number.isFinite(tokenData.expires_in)
      ? tokenData.expires_in
      : 3600;
  cachedToken = {
    value: tokenData.access_token,
    expiresAtMs: now + Math.max(60, ttlSeconds - 60) * 1000,
  };
  return tokenData.access_token;
};

const requestIgdb = async <T>(endpoint: string, queryBody: string): Promise<T[]> => {
  const credentials = getCredentials();
  if (!credentials) {
    throw new Error("Missing IGDB credentials.");
  }
  const token = await getAccessToken(credentials);

  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": credentials.clientId,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "text/plain",
    },
    body: queryBody,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`IGDB request failed with status ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("IGDB returned non-JSON response.");
  }
  return (await response.json()) as T[];
};

const mapIgdbGames = (rows: IgdbGame[]): IgdbMappedGame[] =>
  rows
    .filter((row): row is IgdbGame & { id: number; name: string } => Boolean(row.id && row.name))
    .map((row) => ({
      id: String(row.id),
      title: row.name ?? "",
      rating: toIgdbScaleRating(row.total_rating),
      ratingSource: "igdb" as const,
      released: toReleasedDate(row.first_release_date),
      poster: normalizeCoverUrl(row.cover?.url),
      genres: (row.genres ?? []).map((genre) => genre.name).filter(Boolean).join(", "),
    }));

export const searchGamesInIgdb = async (query: string): Promise<IgdbMappedGame[]> => {
  const bodyByGames = `
search "${escapeQuery(query)}";
fields id,name,total_rating,first_release_date,cover.url,genres.name,category,version_parent;
limit 20;
`;
  const rowsByGames = await requestIgdb<IgdbGame>("games", bodyByGames);
  const mappedByGames = mapIgdbGames(rowsByGames);
  if (mappedByGames.length > 0) {
    return mappedByGames;
  }

  const bodyBySearch = `
search "${escapeQuery(query)}";
fields game;
where game != null;
limit 20;
`;
  const searchRows = await requestIgdb<IgdbSearchRow>("search", bodyBySearch);
  const gameIds = Array.from(
    new Set(
      searchRows
        .map((row) => row.game)
        .filter((id): id is number => typeof id === "number" && Number.isFinite(id)),
    ),
  );
  if (gameIds.length === 0) {
    return [];
  }

  const bodyByIds = `
fields id,name,total_rating,first_release_date,cover.url,genres.name,category,version_parent;
where id = (${gameIds.join(",")});
limit 20;
`;
  const rowsByIds = await requestIgdb<IgdbGame>("games", bodyByIds);
  return mapIgdbGames(rowsByIds);
};

export const getIgdbGameDetails = async (
  gameId: string,
): Promise<IgdbMappedGameDetail | null> => {
  const numericId = Number.parseInt(gameId, 10);
  if (!Number.isFinite(numericId)) return null;

  const body = `
fields id,name,total_rating,first_release_date,cover.url,genres.name,summary;
where id = ${numericId};
limit 1;
`;
  const rows = await requestIgdb<IgdbGame>("games", body);
  const row = rows[0];
  if (!row) return null;

  return {
    title: row.name ?? "",
    rating: toIgdbScaleRating(row.total_rating),
    source: "igdb" as const,
    released: toReleasedDate(row.first_release_date),
    poster: normalizeCoverUrl(row.cover?.url),
    description: row.summary ?? "",
  };
};
