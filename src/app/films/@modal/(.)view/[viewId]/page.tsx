"use client";

import { useParams, useRouter } from "next/navigation";
import FilmEditRoute from "../../../FilmEditRoute";

export default function FilmModalRoutePage() {
  const params = useParams<{ viewId: string | string[] }>();
  const router = useRouter();
  const viewId = Array.isArray(params.viewId) ? params.viewId[0] : params.viewId;

  return (
    <FilmEditRoute
      mode="modal"
      viewId={viewId}
      onRequestClose={() => router.back()}
    />
  );
}
