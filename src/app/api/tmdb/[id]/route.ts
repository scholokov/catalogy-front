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

  const director =
    data.credits?.crew?.find((member) => member.job === "Director")?.name ?? "";
  const actors = (data.credits?.cast ?? [])
    .slice(0, 5)
    .map((member) => member.name)
    .join(", ");
  const baseImageUrl = "https://image.tmdb.org/t/p/w780";
  const primaryPoster = data.poster_path
    ? `${baseImageUrl}${data.poster_path}`
    : "";
  const posterImages = (data.images?.posters ?? [])
    .slice(0, 10)
    .map((image) => `${baseImageUrl}${image.file_path}`);
  const backdropImages = (data.images?.backdrops ?? [])
    .slice(0, 6)
    .map((image) => `${baseImageUrl}${image.file_path}`);
  const imageUrls = Array.from(
    new Set([primaryPoster, ...posterImages, ...backdropImages].filter(Boolean)),
  );

  return NextResponse.json({
    id: String(data.id),
    title: data.title,
    year: data.release_date ? data.release_date.slice(0, 4) : "",
    poster: primaryPoster,
    imageUrls,
    plot: data.overview ?? "",
    genres: (data.genres ?? []).map((g) => g.name).join(", "),
    director,
    actors,
    imdbRating:
      typeof data.vote_average === "number"
        ? data.vote_average.toFixed(1)
        : "",
    source: "tmdb" as const,
  });
}
