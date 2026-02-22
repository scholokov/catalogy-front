import { NextResponse } from "next/server";
import { searchGamesInIgdb } from "@/lib/igdb/server";

type RawgGame = {
  id: number;
  name: string;
  rating: number;
  released?: string;
  background_image?: string;
  genres?: { name: string }[];
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

  try {
    const results = await searchGamesInIgdb(query);
    if (results.length > 0) {
      return NextResponse.json({ results });
    }
  } catch (igdbError) {
    // Continue with RAWG fallback below.
    const message =
      igdbError instanceof Error ? igdbError.message : "IGDB search failed.";
    console.warn(message);
  }

  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ results: [] });
  }

  const searchUrl = new URL("https://api.rawg.io/api/games");
  searchUrl.searchParams.set("key", apiKey);
  searchUrl.searchParams.set("search", query);
  searchUrl.searchParams.set("page_size", "10");

  const response = await fetch(searchUrl.toString());
  if (!response.ok) {
    return NextResponse.json(
      {
        results: [],
        error: `RAWG search failed with status ${response.status}.`,
      },
      { status: 502 },
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { results: [], error: "RAWG returned non-JSON response." },
      { status: 502 },
    );
  }

  let data: { results?: RawgGame[] };
  try {
    data = (await response.json()) as { results?: RawgGame[] };
  } catch {
    return NextResponse.json(
      { results: [], error: "Failed to parse RAWG JSON response." },
      { status: 502 },
    );
  }

  const results = (data.results ?? []).map((game) => ({
    id: String(game.id),
    title: game.name,
    rating: Number.isFinite(game.rating) ? game.rating : null,
    ratingSource: "rawg" as const,
    released: game.released ?? "",
    poster: game.background_image ?? "",
    genres: (game.genres ?? []).map((g) => g.name).join(", "),
  }));

  return NextResponse.json({ results });
}
