"use client";

import { useParams, useRouter } from "next/navigation";
import FilmEditRoute from "@/app/films/FilmEditRoute";
import GameGenreEditRoute from "../../GameGenreEditRoute";
import { buildGenreHref, parseGenreRouteId } from "@/lib/genres/routes";

export default function GenreGameViewPage() {
  const params = useParams<{ genreId: string | string[]; viewId: string | string[] }>();
  const router = useRouter();
  const genreId = Array.isArray(params.genreId) ? params.genreId[0] : params.genreId;
  const viewId = Array.isArray(params.viewId) ? params.viewId[0] : params.viewId;
  const target = parseGenreRouteId(genreId);

  if (target.mediaKind === "film") {
    return (
      <FilmEditRoute
        mode="page"
        viewId={viewId}
        onRequestClose={() =>
          router.replace(
            buildGenreHref({
              mediaKind: "film",
              source: target.source,
              sourceGenreId: target.sourceGenreId,
            }),
          )
        }
      />
    );
  }

  return (
    <GameGenreEditRoute
      mode="page"
      source={target.source}
      sourceGenreId={target.sourceGenreId}
      viewId={viewId}
      onRequestClose={() =>
        router.replace(
          buildGenreHref({
            mediaKind: "game",
            source: target.source,
            sourceGenreId: target.sourceGenreId,
          }),
        )
      }
    />
  );
}
