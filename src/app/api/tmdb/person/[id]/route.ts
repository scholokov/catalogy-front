import { NextResponse } from "next/server";

type TmdbPersonCredit = {
  id: number;
  media_type?: "movie" | "tv";
  title?: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  character?: string | null;
  job?: string | null;
  vote_average?: number | null;
};

type TmdbPersonDetail = {
  id: number;
  name?: string;
  also_known_as?: string[];
  biography?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  profile_path?: string | null;
  known_for_department?: string | null;
  popularity?: number | null;
  images?: {
    profiles?: Array<{ file_path?: string | null }>;
  };
  external_ids?: Record<string, string | null | undefined>;
  combined_credits?: {
    cast?: TmdbPersonCredit[];
    crew?: TmdbPersonCredit[];
  };
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;

  if (!token && !apiKey) {
    return NextResponse.json(
      { error: "Missing TMDB credentials." },
      { status: 500 },
    );
  }

  const detailUrl = new URL(`https://api.themoviedb.org/3/person/${id}`);
  detailUrl.searchParams.set("append_to_response", "combined_credits,images,external_ids");
  detailUrl.searchParams.set("language", "uk-UA");
  const englishDetailUrl = new URL(`https://api.themoviedb.org/3/person/${id}`);
  englishDetailUrl.searchParams.set("language", "en-US");
  if (apiKey) {
    detailUrl.searchParams.set("api_key", apiKey);
    englishDetailUrl.searchParams.set("api_key", apiKey);
  }

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  let response: Response;

  try {
    response = await fetch(detailUrl.toString(), { headers });
  } catch (error) {
    console.error("[api/tmdb/person] primary fetch failed", {
      id,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    });
    return NextResponse.json({ error: "TMDB fetch failed." }, { status: 502 });
  }

  const data = (await response.json()) as
    | TmdbPersonDetail
    | { status_message?: string };

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          "status_message" in data && data.status_message
            ? data.status_message
            : "TMDB error.",
      },
      { status: response.status },
    );
  }

  const detail = data as TmdbPersonDetail;
  let englishData: TmdbPersonDetail | null = null;
  try {
    const englishResponse = await fetch(englishDetailUrl.toString(), { headers });
    if (englishResponse.ok) {
      englishData = (await englishResponse.json()) as TmdbPersonDetail;
    }
  } catch (error) {
    console.warn("[api/tmdb/person] english fallback fetch failed", {
      id,
      error: error instanceof Error ? error.message : error,
    });
  }

  const imageUrls = (detail.images?.profiles ?? [])
    .map((image) =>
      image.file_path ? `https://image.tmdb.org/t/p/w780${image.file_path}` : "",
    )
    .filter(Boolean)
    .slice(0, 12);
  const filmography = [
    ...(detail.combined_credits?.cast ?? []).map((credit) => ({
      ...credit,
      creditGroup: "cast" as const,
    })),
    ...(detail.combined_credits?.crew ?? []).map((credit) => ({
      ...credit,
      creditGroup: "crew" as const,
    })),
  ]
    .filter((credit) => credit.media_type === "movie" || credit.media_type === "tv")
    .sort((left, right) =>
      (right.release_date ?? right.first_air_date ?? "").localeCompare(
        left.release_date ?? left.first_air_date ?? "",
      ),
    )
    .filter((credit, index, items) => {
      const key = [
        credit.media_type ?? "movie",
        credit.id,
        credit.creditGroup,
        credit.character ?? "",
        credit.job ?? "",
      ].join(":");
      return (
        items.findIndex((candidate) => {
          const candidateKey = [
            candidate.media_type ?? "movie",
            candidate.id,
            candidate.creditGroup,
            candidate.character ?? "",
            candidate.job ?? "",
          ].join(":");
          return candidateKey === key;
        }) === index
      );
    })
    .map((credit) => ({
      id: String(credit.id),
      mediaType: credit.media_type ?? "movie",
      title: credit.title ?? credit.name ?? "",
      originalTitle: credit.original_title ?? credit.original_name ?? "",
      year: (credit.release_date ?? credit.first_air_date ?? "").slice(0, 4),
      poster: credit.poster_path
        ? `https://image.tmdb.org/t/p/w500${credit.poster_path}`
        : "",
      characterName: credit.character ?? "",
      job: credit.job ?? "",
      creditGroup: credit.creditGroup,
      imdbRating:
        typeof credit.vote_average === "number" && credit.vote_average > 0
          ? credit.vote_average.toFixed(1)
          : "",
    }));

  return NextResponse.json({
    id: String(detail.id),
    name: detail.name ?? "",
    originalName: detail.also_known_as?.[0] ?? detail.name ?? "",
    englishName: englishData?.name ?? detail.name ?? "",
    biography: detail.biography ?? "",
    birthday: detail.birthday ?? "",
    deathday: detail.deathday ?? "",
    placeOfBirth: detail.place_of_birth ?? "",
    knownForDepartment: detail.known_for_department ?? "",
    popularity: detail.popularity ?? null,
    profileUrl: detail.profile_path
      ? `https://image.tmdb.org/t/p/w500${detail.profile_path}`
      : "",
    imageUrls,
    externalIds: detail.external_ids ?? {},
    filmography,
  });
}
