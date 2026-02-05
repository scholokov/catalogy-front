import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing RAWG_API_KEY." },
      { status: 500 },
    );
  }

  const detailUrl = new URL(`https://api.rawg.io/api/games/${id}`);
  detailUrl.searchParams.set("key", apiKey);

  const response = await fetch(detailUrl.toString());
  const data = (await response.json()) as {
    description_raw?: string;
    description?: string;
  };

  const raw = data.description_raw || data.description || "";
  const description = raw.replace(/<[^>]*>/g, "");

  return NextResponse.json({ description });
}
