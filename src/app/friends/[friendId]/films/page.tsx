"use client";

import { use, useEffect, useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import FilmsManager from "@/app/films/FilmsManager";
import { supabase } from "@/lib/supabase/client";
import { getDisplayName } from "@/lib/users/displayName";

export default function FriendFilmsPage({
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
    <CatalogLayout title={`Бібліотека ${friendName}: Films`} headerRight={`Кількість: ${count}`}>
      <FilmsManager
        onCountChange={setCount}
        ownerUserId={friendId}
        readOnly
      />
    </CatalogLayout>
  );
}
