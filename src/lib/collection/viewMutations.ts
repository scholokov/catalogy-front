import type { SupabaseClient } from "@supabase/supabase-js";

export const addExistingItemToCollection = async ({
  supabase,
  itemId,
}: {
  supabase: SupabaseClient;
  itemId: string;
}) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Потрібна авторизація.");
  }

  const { data: existing } = await supabase
    .from("user_views")
    .select("id")
    .eq("user_id", user.id)
    .eq("item_id", itemId)
    .maybeSingle();

  if (existing?.id) {
    throw new Error("Вже у твоїй колекції.");
  }

  const { error } = await supabase.from("user_views").insert({
    user_id: user.id,
    item_id: itemId,
    is_viewed: false,
    view_percent: 0,
    rating: null,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("Вже у твоїй колекції.");
    }
    throw new Error("Не вдалося додати у колекцію.");
  }

  return { itemId };
};
