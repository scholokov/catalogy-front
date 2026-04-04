import { NextResponse } from "next/server";
import { getIgdbGameDetails } from "@/lib/igdb/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const igdbData = await getIgdbGameDetails(id);
    if (igdbData) {
      return NextResponse.json(igdbData);
    }
  } catch {
  }

  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Failed to fetch game details from IGDB." },
      { status: 502 },
    );
  }

  const detailUrl = new URL(`https://api.rawg.io/api/games/${id}`);
  detailUrl.searchParams.set("key", apiKey);

  const response = await fetch(detailUrl.toString());
  if (!response.ok) {
    return NextResponse.json(
      { error: `RAWG detail failed with status ${response.status}.` },
      { status: 502 },
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "RAWG returned non-JSON response." },
      { status: 502 },
    );
  }

  let data: {
    name?: string;
    rating?: number;
    released?: string;
    background_image?: string;
    description_raw?: string;
    description?: string;
    genres?: Array<{
      id?: number;
      name?: string;
    }>;
  };
  try {
    data = (await response.json()) as {
      name?: string;
      rating?: number;
      released?: string;
      background_image?: string;
      description_raw?: string;
      description?: string;
      genres?: Array<{
        id?: number;
        name?: string;
      }>;
    };
  } catch {
    return NextResponse.json(
      { error: "Failed to parse RAWG JSON response." },
      { status: 502 },
    );
  }

  const raw = data.description_raw || data.description || "";
  const description = raw.replace(/<[^>]*>/g, "");
  let trailers: Array<{
    id: string;
    name: string;
    site: string;
    key: string;
    type: string;
    official: boolean;
    language: string;
    region: string;
    url: string;
  }> = [];
  const moviesUrl = new URL(`https://api.rawg.io/api/games/${id}/movies`);
  moviesUrl.searchParams.set("key", apiKey);
  try {
    const moviesResponse = await fetch(moviesUrl.toString());
    if (moviesResponse.ok) {
      const moviesData = (await moviesResponse.json()) as {
        results?: Array<{
          id?: number;
          name?: string;
          preview?: string;
          data?: Record<string, string>;
        }>;
      };
      trailers = (moviesData.results ?? [])
        .map((movie) => {
          const dataUrl =
            movie.data?.max ||
            movie.data?.["480"] ||
            movie.preview ||
            "";
          return {
            id: movie.id ? String(movie.id) : "",
            name: movie.name ?? "",
            site: "RAWG",
            key: "",
            type: "Trailer",
            official: false,
            language: "",
            region: "",
            url: dataUrl,
          };
        })
        .filter((movie) => movie.url);
    }
  } catch {
    trailers = [];
  }

  return NextResponse.json({
    title: data.name ?? "",
    rating: typeof data.rating === "number" ? data.rating : null,
    source: "rawg" as const,
    released: data.released ?? "",
    poster: data.background_image ?? "",
    genres: (data.genres ?? []).map((genre) => genre.name).filter(Boolean).join(", "),
    genreItems: (data.genres ?? [])
      .filter((genre): genre is { id: number; name: string } => Boolean(genre.id && genre.name))
      .map((genre) => ({
        source: "rawg" as const,
        sourceGenreId: String(genre.id),
        name: genre.name,
      })),
    description,
    trailers,
  });
}
