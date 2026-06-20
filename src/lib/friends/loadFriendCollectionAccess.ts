"use client";

import { supabase } from "@/lib/supabase/client";

export async function loadFriendCollectionAccess(ownerUserId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  if (user.id === ownerUserId) {
    return true;
  }

  const [{ data: ownerProfile }, { data: contact }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, views_visible_to_friends")
      .eq("id", ownerUserId)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("other_user_id")
      .eq("user_id", user.id)
      .eq("other_user_id", ownerUserId)
      .eq("status", "accepted")
      .maybeSingle(),
  ]);

  return Boolean(contact?.other_user_id && ownerProfile?.views_visible_to_friends);
}
