import { NextResponse } from "next/server";

type TmdbMovie = {
  id: number;
  title: string;
  release_date?: string;
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

  const searchUrl = new URL("https://api.themoviedb.org/3/search/movie");
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

  const fetchCredits = async (id: number) => {
    const creditsUrl = new URL(
      `https://api.themoviedb.org/3/movie/${id}/credits`,
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
      const director =
        credits.crew?.find((member) => member.job === "Director")?.name ?? "";
      const actors = (credits.cast ?? [])
        .slice(0, 5)
        .map((member) => member.name)
        .join(", ");
      return { director, actors };
    } catch {
      return { director: "", actors: "" };
    }
  };

  const results = await Promise.all(
    (data.results ?? []).map(async (movie) => {
      const { director, actors } = await fetchCredits(movie.id);
      return {
        id: String(movie.id),
        title: movie.title,
        year: movie.release_date ? movie.release_date.slice(0, 4) : "",
        poster: movie.poster_path
          ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
          : "",
        plot: movie.overview ?? "",
        genres: "",
        director,
        actors,
        imdbRating:
          typeof movie.vote_average === "number"
            ? movie.vote_average.toFixed(1)
            : "",
        source: "tmdb" as const,
      };
    }),
  );

  return NextResponse.json({ results });
}
