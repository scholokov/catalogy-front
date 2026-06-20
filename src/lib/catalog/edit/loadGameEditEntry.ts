"use client";

import { supabase } from "@/lib/supabase/client";
import type { GameEditEntry, GameEditEntryView } from "./types";

const GAME_EDIT_VIEW_SELECT =
  "id, created_at, updated_at, viewed_at, rating, comment, view_percent, recommend_similar, is_viewed, availability, platforms, shishka_fit_label, shishka_fit_reason, shishka_fit_profile_analyzed_at, shishka_fit_scope_value, items:items!inner (id, title, description, genres, poster_url, external_id, imdb_rating, trailers, year, type)";

export const loadGameEditEntry = async (viewId: string): Promise<GameEditEntry | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("user_views")
    .select(GAME_EDIT_VIEW_SELECT)
    .eq("id", viewId)
    .eq("user_id", user.id)
    .eq("items.type", "game")
    .maybeSingle();

  const view = (data as GameEditEntryView | null) ?? null;
  if (!view) {
    return null;
  }

  return {
    view,
  };
};
