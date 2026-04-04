import { NextResponse } from "next/server";

type TmdbMovie = {
  id: number;
  media_type: "movie" | "tv" | "person";
  title: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  genre_ids?: number[];
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string | null;
  vote_average?: number | null;
};

type TmdbCredits = {
  cast?: {
    id: number;
    name: string;
    original_name?: string;
    character?: string | null;
    order?: number | null;
    profile_path?: string | null;
    known_for_department?: string;
  }[];
  crew?: {
    id: number;
    name: string;
    original_name?: string;
    job: string;
    department?: string | null;
    profile_path?: string | null;
    known_for_department?: string;
  }[];
};

type TmdbGenreList = {
  genres?: Array<{ id: number; name: string }>;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json(
      { results: [], error: "Missing query." },
      { status: 400 },
    );
  }

  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;

  if (!token && !apiKey) {
    return NextResponse.json(
      { results: [], error: "Missing TMDB credentials." },
      { status: 500 },
    );
  }

  const searchUrl = new URL("https://api.themoviedb.org/3/search/multi");
  searchUrl.searchParams.set("query", query);
  searchUrl.searchParams.set("include_adult", "false");
  searchUrl.searchParams.set("language", "uk-UA");
  searchUrl.searchParams.set("region", "UA");
  if (apiKey) {
    searchUrl.searchParams.set("api_key", apiKey);
  }

  const response = await fetch(searchUrl.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const data = (await response.json()) as
    | { results?: TmdbMovie[] }
    | { status_message?: string };

  if (!response.ok) {
    return NextResponse.json(
      {
        results: [],
        error:
          "status_message" in data && data.status_message
            ? data.status_message
            : "TMDB error.",
      },
      { status: response.status },
    );
  }

  const fetchCredits = async (id: number, mediaType: "movie" | "tv") => {
    const creditsUrl = new URL(
      `https://api.themoviedb.org/3/${mediaType}/${id}/credits`,
    );
    creditsUrl.searchParams.set("language", "uk-UA");
    if (apiKey) {
      creditsUrl.searchParams.set("api_key", apiKey);
    }

    try {
      const creditsResponse = await fetch(creditsUrl.toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!creditsResponse.ok) {
        return { director: "", actors: "" };
      }
      const credits = (await creditsResponse.json()) as TmdbCredits;
      const directorJobs =
        mediaType === "tv"
          ? ["Series Director", "Director", "Creator"]
          : ["Director"];
      const directorCredits = (credits.crew ?? [])
        .filter((member) => directorJobs.includes(member.job))
        .slice(0, 3);
      const writerJobs =
        mediaType === "tv"
          ? ["Writer", "Screenplay", "Teleplay", "Story Editor", "Series Composition"]
          : ["Writer", "Screenplay"];
      const writerCredits = (credits.crew ?? [])
        .filter((member) => writerJobs.includes(member.job))
        .slice(0, 4);
      const producerJobs =
        mediaType === "tv"
          ? ["Producer", "Executive Producer", "Co-Producer", "Series Producer"]
          : ["Producer", "Executive Producer", "Co-Producer"];
      const producerCredits = (credits.crew ?? [])
        .filter((member) => producerJobs.includes(member.job))
        .slice(0, 4);
      const actorCredits = (credits.cast ?? []).slice(0, 12);
      const director = directorCredits[0]?.name ?? "";
      const actors = actorCredits
        .slice(0, 5)
        .map((member) => member.name)
        .join(", ");
      const people = [
        ...directorCredits.map((member, index) => ({
          tmdbPersonId: String(member.id),
          name: member.name,
          originalName: member.original_name ?? member.name,
          roleKind: "director" as const,
          creditGroup: "crew" as const,
          department: member.department ?? member.known_for_department ?? "",
          job: member.job ?? "",
          characterName: "",
          creditOrder: index,
          isPrimary: index === 0,
          profileUrl: member.profile_path
            ? `https://image.tmdb.org/t/p/w500${member.profile_path}`
            : "",
        })),
        ...writerCredits.map((member, index) => ({
          tmdbPersonId: String(member.id),
          name: member.name,
          originalName: member.original_name ?? member.name,
          roleKind: "writer" as const,
          creditGroup: "crew" as const,
          department: member.department ?? member.known_for_department ?? "",
          job: member.job ?? "",
          characterName: "",
          creditOrder: index,
          isPrimary: index === 0,
          profileUrl: member.profile_path
            ? `https://image.tmdb.org/t/p/w500${member.profile_path}`
            : "",
        })),
        ...producerCredits.map((member, index) => ({
          tmdbPersonId: String(member.id),
          name: member.name,
          originalName: member.original_name ?? member.name,
          roleKind: "producer" as const,
          creditGroup: "crew" as const,
          department: member.department ?? member.known_for_department ?? "",
          job: member.job ?? "",
          characterName: "",
          creditOrder: index,
          isPrimary: index === 0,
          profileUrl: member.profile_path
            ? `https://image.tmdb.org/t/p/w500${member.profile_path}`
            : "",
        })),
        ...actorCredits.map((member, index) => ({
          tmdbPersonId: String(member.id),
          name: member.name,
          originalName: member.original_name ?? member.name,
          roleKind: "actor" as const,
          creditGroup: "cast" as const,
          department: member.known_for_department ?? "Acting",
          job: "Actor",
          characterName: member.character ?? "",
          creditOrder: member.order ?? index,
          isPrimary: index < 5,
          profileUrl: member.profile_path
            ? `https://image.tmdb.org/t/p/w500${member.profile_path}`
            : "",
        })),
      ];
      return { director, actors, people };
    } catch {
      return { director: "", actors: "", people: [] };
    }
  };

  const fetchGenreMap = async (mediaType: "movie" | "tv") => {
    const genreUrl = new URL(`https://api.themoviedb.org/3/genre/${mediaType}/list`);
    genreUrl.searchParams.set("language", "uk-UA");
    if (apiKey) {
      genreUrl.searchParams.set("api_key", apiKey);
    }
    try {
      const genreResponse = await fetch(genreUrl.toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!genreResponse.ok) return new Map<number, string>();
      const genreData = (await genreResponse.json()) as TmdbGenreList;
      return new Map(
        (genreData.genres ?? [])
          .filter((genre) => Number.isFinite(genre.id) && Boolean(genre.name))
          .map((genre) => [genre.id, genre.name]),
      );
    } catch {
      return new Map<number, string>();
    }
  };

  const payload = data as { results?: TmdbMovie[] };
  const mediaResults = (payload.results ?? []).filter(
    (item): item is TmdbMovie & { media_type: "movie" | "tv" } =>
      item.media_type === "movie" || item.media_type === "tv",
  );
  const [movieGenreMap, tvGenreMap] = await Promise.all([
    fetchGenreMap("movie"),
    fetchGenreMap("tv"),
  ]);
  const results = await Promise.all(
    mediaResults.map(async (item) => {
      const { director, actors, people } = await fetchCredits(item.id, item.media_type);
      const genreMap = item.media_type === "movie" ? movieGenreMap : tvGenreMap;
      const genreItems = (item.genre_ids ?? [])
        .map((genreId) => {
          const name = genreMap.get(genreId);
          if (!name) {
            return null;
          }
          return {
            tmdbGenreId: String(genreId),
            name,
          };
        })
        .filter(Boolean);
      const genres = (item.genre_ids ?? [])
        .map((genreId) => genreMap.get(genreId))
        .filter((genreName): genreName is string => Boolean(genreName))
        .join(", ");
      return {
        id: String(item.id),
        title: item.title ?? item.name ?? "",
        originalTitle: item.original_title ?? item.original_name ?? "",
        year: (item.release_date ?? item.first_air_date ?? "").slice(0, 4),
        poster: item.poster_path
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
          : "",
        plot: item.overview ?? "",
        genres,
        genreItems,
        director,
        actors,
        people,
        imdbRating:
          typeof item.vote_average === "number"
            ? item.vote_average.toFixed(1)
            : "",
        mediaType: item.media_type,
        source: "tmdb" as const,
      };
    }),
  );

  return NextResponse.json({ results });
}
