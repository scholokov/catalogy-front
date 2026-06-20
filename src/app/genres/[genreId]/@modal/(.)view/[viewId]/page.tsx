"use client";

import { useParams, useRouter } from "next/navigation";
import FilmEditRoute from "@/app/films/FilmEditRoute";
import { parseGenreRouteId } from "@/lib/genres/routes";
import GameGenreEditRoute from "../../../GameGenreEditRoute";

export default function GenreGameModalRoutePage() {
  const params = useParams<{ genreId: string | string[]; viewId: string | string[] }>();
  const router = useRouter();
  const genreId = Array.isArray(params.genreId) ? params.genreId[0] : params.genreId;
  const viewId = Array.isArray(params.viewId) ? params.viewId[0] : params.viewId;
  const target = parseGenreRouteId(genreId);

  if (target.mediaKind === "film") {
    return (
      <FilmEditRoute
        mode="modal"
        viewId={viewId}
        onRequestClose={() => router.back()}
      />
    );
  }

  return (
    <GameGenreEditRoute
      mode="modal"
      source={target.source}
      sourceGenreId={target.sourceGenreId}
      viewId={viewId}
      onRequestClose={() => router.back()}
    />
  );
}
