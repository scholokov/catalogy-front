import { NextResponse } from "next/server";

type OmdbSearchItem = {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster: string;
};

type OmdbDetail = {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster: string;
  Plot: string;
  Genre: string;
  Director: string;
  Actors: string;
  imdbRating: string;
  Response: "True" | "False";
  Error?: string;
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

  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { results: [], error: "Missing OMDB_API_KEY." },
      { status: 500 },
    );
  }

  const searchUrl = new URL("https://www.omdbapi.com/");
  searchUrl.searchParams.set("apikey", apiKey);
  searchUrl.searchParams.set("s", query);
  searchUrl.searchParams.set("type", "movie");

  const searchResponse = await fetch(searchUrl.toString());
  const searchData = (await searchResponse.json()) as {
    Response: "True" | "False";
    Search?: OmdbSearchItem[];
    Error?: string;
  };

  if (searchData.Response === "False") {
    return NextResponse.json({
      results: [],
      error: searchData.Error ?? "No results.",
    });
  }

  const items = (searchData.Search ?? []).slice(0, 6);
  const results = await Promise.all(
    items.map(async (item) => {
      const detailUrl = new URL("https://www.omdbapi.com/");
      detailUrl.searchParams.set("apikey", apiKey);
      detailUrl.searchParams.set("i", item.imdbID);
      detailUrl.searchParams.set("plot", "short");

      const detailResponse = await fetch(detailUrl.toString());
      const detailData = (await detailResponse.json()) as OmdbDetail;

      return {
        id: item.imdbID,
        title: detailData.Title ?? item.Title,
        year: detailData.Year ?? item.Year,
        type: detailData.Type ?? item.Type,
        poster: detailData.Poster ?? item.Poster,
        plot: detailData.Plot ?? "",
        genres: detailData.Genre ?? "",
        director: detailData.Director ?? "",
        actors: detailData.Actors ?? "",
        imdbRating: detailData.imdbRating ?? "",
      };
    }),
  );

  return NextResponse.json({ results });
}
