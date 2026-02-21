import { NextResponse } from "next/server";

type TmdbMovie = {
  id: number;
  media_type: "movie" | "tv" | "person";
  title: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string | null;
  vote_average?: number | null;
};

type TmdbCredits = {
  cast?: { name: string }[];
  crew?: { job: string; name: string }[];
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
      const director =
        credits.crew?.find((member) => directorJobs.includes(member.job))?.name ??
        "";
      const actors = (credits.cast ?? [])
        .slice(0, 5)
        .map((member) => member.name)
        .join(", ");
      return { director, actors };
    } catch {
      return { director: "", actors: "" };
    }
  };

  const payload = data as { results?: TmdbMovie[] };
  const mediaResults = (payload.results ?? []).filter(
    (item): item is TmdbMovie & { media_type: "movie" | "tv" } =>
      item.media_type === "movie" || item.media_type === "tv",
  );
  const results = await Promise.all(
    mediaResults.map(async (item) => {
      const { director, actors } = await fetchCredits(item.id, item.media_type);
      return {
        id: String(item.id),
        title: item.title ?? item.name ?? "",
        originalTitle: item.original_title ?? item.original_name ?? "",
        year: (item.release_date ?? item.first_air_date ?? "").slice(0, 4),
        poster: item.poster_path
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
          : "",
        plot: item.overview ?? "",
        genres: "",
        director,
        actors,
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
