"use client";

import { use, useEffect, useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import GamesManager from "@/app/games/GamesManager";
import { supabase } from "@/lib/supabase/client";
import { getDisplayName } from "@/lib/users/displayName";

export default function FriendGamesPage({
  params,
}: {
  params: Promise<{ friendId: string }>;
}) {
  const { friendId } = use(params);
  const [count, setCount] = useState(0);
  const [friendName, setFriendName] = useState(() =>
    getDisplayName(null, friendId),
  );

  useEffect(() => {
    let isCancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", friendId)
        .maybeSingle();
      if (isCancelled) return;
      setFriendName(getDisplayName(data?.username ?? null, friendId));
    })();
    return () => {
      isCancelled = true;
    };
  }, [friendId]);

  return (
    <CatalogLayout title={`Бібліотека ${friendName}: Games`} headerRight={`Кількість: ${count}`}>
      <GamesManager
        onCountChange={setCount}
        ownerUserId={friendId}
        readOnly
      />
    </CatalogLayout>
  );
}
