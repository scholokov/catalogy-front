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
    // Fallback below.
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
  };
  try {
    data = (await response.json()) as {
      name?: string;
      rating?: number;
      released?: string;
      background_image?: string;
      description_raw?: string;
      description?: string;
    };
  } catch {
    return NextResponse.json(
      { error: "Failed to parse RAWG JSON response." },
      { status: 502 },
    );
  }

  const raw = data.description_raw || data.description || "";
  const description = raw.replace(/<[^>]*>/g, "");

  return NextResponse.json({
    title: data.name ?? "",
    rating: typeof data.rating === "number" ? data.rating : null,
    source: "rawg" as const,
    released: data.released ?? "",
    poster: data.background_image ?? "",
    description,
  });
}
