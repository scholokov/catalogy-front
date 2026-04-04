import GenreDetailPage from "./GenreDetailPage";
import GameGenreDetailPage from "./GameGenreDetailPage";
import { parseGenreRouteId } from "@/lib/genres/routes";

export default async function GenrePage({
  params,
}: {
  params: Promise<{ genreId: string }>;
}) {
  const { genreId } = await params;
  const target = parseGenreRouteId(genreId);

  if (target.mediaKind === "game") {
    return <GameGenreDetailPage source={target.source} sourceGenreId={target.sourceGenreId} />;
  }

  return <GenreDetailPage genreId={target.sourceGenreId} />;
}
