"use client";

import { useParams, useRouter } from "next/navigation";
import FriendGameEditRoute from "../../FriendGameEditRoute";
import { buildFriendGamesHref } from "@/lib/friends/routes";

export default function FriendGameViewPage() {
  const params = useParams<{ friendId: string | string[]; viewId: string | string[] }>();
  const router = useRouter();
  const friendId = Array.isArray(params.friendId) ? params.friendId[0] : params.friendId;
  const viewId = Array.isArray(params.viewId) ? params.viewId[0] : params.viewId;

  return (
    <FriendGameEditRoute
      mode="page"
      friendId={friendId}
      viewId={viewId}
      onRequestClose={() => router.replace(buildFriendGamesHref(friendId))}
    />
  );
}
