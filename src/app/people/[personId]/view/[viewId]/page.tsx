"use client";

import { useParams, useRouter } from "next/navigation";
import FilmEditRoute from "@/app/films/FilmEditRoute";
import { buildPersonHref } from "@/lib/people/routes";

export default function PersonFilmViewPage() {
  const params = useParams<{ personId: string | string[]; viewId: string | string[] }>();
  const router = useRouter();
  const personId = Array.isArray(params.personId) ? params.personId[0] : params.personId;
  const viewId = Array.isArray(params.viewId) ? params.viewId[0] : params.viewId;

  return (
    <FilmEditRoute
      mode="page"
      viewId={viewId}
      onRequestClose={() => router.replace(buildPersonHref(personId))}
    />
  );
}
