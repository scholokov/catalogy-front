"use client";

import { useParams, useRouter } from "next/navigation";
import FriendFilmEditRoute from "../../FriendFilmEditRoute";
import { buildFriendFilmsHref } from "@/lib/friends/routes";

export default function FriendFilmViewPage() {
  const params = useParams<{ friendId: string | string[]; viewId: string | string[] }>();
  const router = useRouter();
  const friendId = Array.isArray(params.friendId) ? params.friendId[0] : params.friendId;
  const viewId = Array.isArray(params.viewId) ? params.viewId[0] : params.viewId;

  return (
    <FriendFilmEditRoute
      mode="page"
      friendId={friendId}
      viewId={viewId}
      onRequestClose={() => router.replace(buildFriendFilmsHref(friendId))}
    />
  );
}
