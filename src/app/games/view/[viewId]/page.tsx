"use client";

import { useParams, useRouter } from "next/navigation";
import { buildGameCatalogHref } from "@/lib/catalog/edit/routes";
import GameEditRoute from "../../GameEditRoute";

export default function GameViewPage() {
  const params = useParams<{ viewId: string | string[] }>();
  const router = useRouter();
  const viewId = Array.isArray(params.viewId) ? params.viewId[0] : params.viewId;

  return (
    <GameEditRoute
      mode="page"
      viewId={viewId}
      onRequestClose={() => router.replace(buildGameCatalogHref())}
    />
  );
}
