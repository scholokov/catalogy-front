import { NextResponse } from "next/server";

type TmdbPersonSearchResult = {
  id: number;
  name?: string;
  original_name?: string;
  known_for_department?: string;
  popularity?: number | null;
  profile_path?: string | null;
  known_for?: Array<{
    media_type?: "movie" | "tv";
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
  }>;
};

type TmdbPersonCreditsResponse = {
  combined_credits?: {
    cast?: Array<{
      id?: number;
      media_type?: "movie" | "tv";
    }>;
    crew?: Array<{
      id?: number;
      media_type?: "movie" | "tv";
    }>;
  };
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

  const searchUrl = new URL("https://api.themoviedb.org/3/search/person");
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
    | { results?: TmdbPersonSearchResult[] }
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

  const rawResults = (data as { results?: TmdbPersonSearchResult[] }).results ?? [];
  const filmographyCounts = new Map<string, number>();

  await Promise.all(
    rawResults.slice(0, 20).map(async (person) => {
      const detailUrl = new URL(`https://api.themoviedb.org/3/person/${person.id}`);
      detailUrl.searchParams.set("append_to_response", "combined_credits");
      detailUrl.searchParams.set("language", "uk-UA");
      if (apiKey) {
        detailUrl.searchParams.set("api_key", apiKey);
      }

      const detailResponse = await fetch(detailUrl.toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!detailResponse.ok) {
        filmographyCounts.set(String(person.id), 0);
        return;
      }

      const detailData = (await detailResponse.json()) as TmdbPersonCreditsResponse;
      const uniqueCredits = new Set(
        [
          ...(detailData.combined_credits?.cast ?? []),
          ...(detailData.combined_credits?.crew ?? []),
        ]
          .filter((entry) => entry.media_type === "movie" || entry.media_type === "tv")
          .map((entry) => `${entry.media_type}:${entry.id}`),
      );

      filmographyCounts.set(String(person.id), uniqueCredits.size);
    }),
  );

  const results = rawResults
    .map((person) => {
      const knownForTitles = (person.known_for ?? [])
        .filter((entry) => entry.media_type === "movie" || entry.media_type === "tv")
        .map((entry) => {
          const title = entry.title ?? entry.name ?? "";
          const year = (entry.release_date ?? entry.first_air_date ?? "").slice(0, 4);
          return year ? `${title} (${year})` : title;
        })
        .filter(Boolean)
        .slice(0, 6);
      const filmographyCount = filmographyCounts.get(String(person.id)) ?? 0;

      return {
        id: String(person.id),
        name: person.name ?? "",
        originalName: person.original_name ?? person.name ?? "",
        englishName: person.original_name ?? person.name ?? "",
        knownForDepartment: person.known_for_department ?? "",
        popularity: person.popularity ?? null,
        profileUrl: person.profile_path
          ? `https://image.tmdb.org/t/p/w500${person.profile_path}`
          : "",
        filmographyCount,
        knownForTitles,
      };
    })
    .filter((person) => person.filmographyCount > 0 || person.knownForTitles.length > 0);

  return NextResponse.json({ results });
}
