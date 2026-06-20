"use client";

import { useParams, useRouter } from "next/navigation";
import GameEditRoute from "../../../GameEditRoute";

export default function GameModalRoutePage() {
  const params = useParams<{ viewId: string | string[] }>();
  const router = useRouter();
  const viewId = Array.isArray(params.viewId) ? params.viewId[0] : params.viewId;

  return (
    <GameEditRoute
      mode="modal"
      viewId={viewId}
      onRequestClose={() => router.back()}
    />
  );
}
