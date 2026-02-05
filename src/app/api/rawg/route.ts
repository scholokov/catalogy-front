import { NextResponse } from "next/server";

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

  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { results: [], error: "Missing RAWG_API_KEY." },
      { status: 500 },
    );
  }

  const searchUrl = new URL("https://api.rawg.io/api/games");
  searchUrl.searchParams.set("key", apiKey);
  searchUrl.searchParams.set("search", query);
  searchUrl.searchParams.set("page_size", "10");

  const response = await fetch(searchUrl.toString());
  const data = (await response.json()) as { results?: RawgGame[] };

  const results = (data.results ?? []).map((game) => ({
    id: String(game.id),
    title: game.name,
    rating: Number.isFinite(game.rating) ? game.rating : null,
    released: game.released ?? "",
    poster: game.background_image ?? "",
    genres: (game.genres ?? []).map((g) => g.name).join(", "),
  }));

  return NextResponse.json({ results });
}
