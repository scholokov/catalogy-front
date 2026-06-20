"use client";

import { useParams, useRouter } from "next/navigation";
import { buildFilmCatalogHref } from "@/lib/catalog/edit/routes";
import FilmEditRoute from "../../FilmEditRoute";

export default function FilmViewPage() {
  const params = useParams<{ viewId: string | string[] }>();
  const router = useRouter();
  const viewId = Array.isArray(params.viewId) ? params.viewId[0] : params.viewId;

  return (
    <FilmEditRoute
      mode="page"
      viewId={viewId}
      onRequestClose={() => router.replace(buildFilmCatalogHref())}
    />
  );
}
