import { NextResponse } from "next/server";

type TmdbCredits = {
  cast?: { name: string }[];
  crew?: { job: string; name: string }[];
};

type TmdbDetail = {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string | null;
  genres?: { name: string }[];
  vote_average?: number | null;
  credits?: TmdbCredits;
  images?: {
    posters?: { file_path: string }[];
    backdrops?: { file_path: string }[];
  };
};

export async function GET(
  _request: Request,
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

  const detailUrl = new URL(`https://api.themoviedb.org/3/movie/${id}`);
  detailUrl.searchParams.set("append_to_response", "credits,images");
  detailUrl.searchParams.set("include_image_language", "uk,en,null");
  detailUrl.searchParams.set("language", "uk-UA");
  detailUrl.searchParams.set("region", "UA");
  if (apiKey) {
    detailUrl.searchParams.set("api_key", apiKey);
  }

  const response = await fetch(detailUrl.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const data = (await response.json()) as
    | TmdbDetail
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

  const detail = data as TmdbDetail;
  const director =
    detail.credits?.crew?.find((member) => member.job === "Director")?.name ??
    "";
  const actors = (detail.credits?.cast ?? [])
    .slice(0, 5)
    .map((member) => member.name)
    .join(", ");
  const baseImageUrl = "https://image.tmdb.org/t/p/w780";
  const primaryPoster = detail.poster_path
    ? `${baseImageUrl}${detail.poster_path}`
    : "";
  const posterImages = (detail.images?.posters ?? [])
    .slice(0, 10)
    .map((image) => `${baseImageUrl}${image.file_path}`);
  const backdropImages = (detail.images?.backdrops ?? [])
    .slice(0, 6)
    .map((image) => `${baseImageUrl}${image.file_path}`);
  const imageUrls = Array.from(
    new Set([primaryPoster, ...posterImages, ...backdropImages].filter(Boolean)),
  );

  return NextResponse.json({
    id: String(detail.id),
    title: detail.title,
    year: detail.release_date ? detail.release_date.slice(0, 4) : "",
    poster: primaryPoster,
    imageUrls,
    plot: detail.overview ?? "",
    genres: (detail.genres ?? []).map((g) => g.name).join(", "),
    director,
    actors,
    imdbRating:
      typeof detail.vote_average === "number"
        ? detail.vote_average.toFixed(1)
        : "",
    source: "tmdb" as const,
  });
}
