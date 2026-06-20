"use client";

import { supabase } from "@/lib/supabase/client";

export async function loadOwnCollectionItemExists(itemId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data } = await supabase
    .from("user_views")
    .select("id")
    .eq("user_id", user.id)
    .eq("item_id", itemId)
    .limit(1);

  return Boolean(data?.length);
}
