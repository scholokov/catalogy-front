import { NextResponse } from "next/server";

type TmdbCredits = {
  cast?: { name: string }[];
  crew?: { job: string; name: string }[];
};

type TmdbVideo = {
  id?: string;
  key?: string;
  name?: string;
  site?: string;
  type?: string;
  official?: boolean;
  iso_639_1?: string;
  iso_3166_1?: string;
};

type TmdbDetail = {
  id: number;
  title: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string | null;
  genres?: { name: string }[];
  vote_average?: number | null;
  created_by?: { name: string }[];
  credits?: TmdbCredits;
  images?: {
    posters?: { file_path: string }[];
    backdrops?: { file_path: string }[];
  };
  videos?: {
    results?: TmdbVideo[];
  };
};

type TmdbLocalizedTitleDetail = {
  title?: string;
  name?: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const requestedMediaType = searchParams.get("mediaType");
  const primaryLocale = "uk-UA";
  const localeLanguage = "uk";
  const localeRegion = "UA";
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;

  if (!token && !apiKey) {
    return NextResponse.json(
      { error: "Missing TMDB credentials." },
      { status: 500 },
    );
  }

  const fallbackOrder: ("movie" | "tv")[] =
    requestedMediaType === "movie" || requestedMediaType === "tv"
      ? [requestedMediaType]
      : ["movie", "tv"];

  let detail: TmdbDetail | null = null;
  let resolvedMediaType: "movie" | "tv" | null = null;
  let lastError: { status: number; message: string } | null = null;

  for (const mediaType of fallbackOrder) {
    const detailUrl = new URL(`https://api.themoviedb.org/3/${mediaType}/${id}`);
    detailUrl.searchParams.set("append_to_response", "credits,images,videos");
    detailUrl.searchParams.set("include_image_language", "uk,en,null");
    detailUrl.searchParams.set("include_video_language", `${localeLanguage},en,null`);
    detailUrl.searchParams.set("language", primaryLocale);
    detailUrl.searchParams.set("region", localeRegion);
    if (apiKey) {
      detailUrl.searchParams.set("api_key", apiKey);
    }

    const response = await fetch(detailUrl.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const data = (await response.json()) as
      | TmdbDetail
      | { status_message?: string };

    if (response.ok) {
      detail = data as TmdbDetail;
      resolvedMediaType = mediaType;
      break;
    }

    lastError = {
      status: response.status,
      message:
        "status_message" in data && data.status_message
          ? data.status_message
          : "TMDB error.",
    };
  }

  if (!detail || !resolvedMediaType) {
    return NextResponse.json(
      { error: lastError?.message ?? "TMDB error." },
      { status: lastError?.status ?? 500 },
    );
  }

  const englishTitle = await (async () => {
    const localizedUrl = new URL(
      `https://api.themoviedb.org/3/${resolvedMediaType}/${detail.id}`,
    );
    localizedUrl.searchParams.set("language", "en-US");
    localizedUrl.searchParams.set("region", "US");
    if (apiKey) {
      localizedUrl.searchParams.set("api_key", apiKey);
    }
    try {
      const response = await fetch(localizedUrl.toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) return "";
      const localized = (await response.json()) as TmdbLocalizedTitleDetail;
      return localized.title ?? localized.name ?? "";
    } catch {
      return "";
    }
  })();

  const directorJobs =
    resolvedMediaType === "tv" ? ["Series Director", "Director", "Creator"] : ["Director"];
  const director =
    detail.credits?.crew?.find((member) => directorJobs.includes(member.job))?.name ??
    detail.created_by?.[0]?.name ??
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
  const videoCandidates = (detail.videos?.results ?? []).filter(
    (video) =>
      video.site === "YouTube" &&
      Boolean(video.key) &&
      (video.type === "Trailer" || video.type === "Teaser"),
  );
  const localeVideos = videoCandidates.filter(
    (video) => video.iso_639_1?.toLowerCase() === localeLanguage.toLowerCase(),
  );
  const trailers = (localeVideos.length > 0 ? localeVideos : videoCandidates).map(
    (video) => ({
      id: video.id ?? "",
      name: video.name ?? "",
      site: video.site ?? "",
      key: video.key ?? "",
      type: video.type ?? "",
      official: Boolean(video.official),
      language: video.iso_639_1 ?? "",
      region: video.iso_3166_1 ?? "",
      url: video.key ? `https://www.youtube.com/watch?v=${video.key}` : "",
    }),
  );

  return NextResponse.json({
    id: String(detail.id),
    title: detail.title ?? detail.name ?? "",
    englishTitle,
    originalTitle: detail.original_title ?? detail.original_name ?? "",
    year: (detail.release_date ?? detail.first_air_date ?? "").slice(0, 4),
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
    trailers,
    mediaType: resolvedMediaType,
    source: "tmdb" as const,
  });
}
