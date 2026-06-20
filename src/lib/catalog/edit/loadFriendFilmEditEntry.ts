"use client";

import { loadStoredPeopleForItem } from "@/lib/films/storedPeople";
import { loadFriendCollectionAccess } from "@/lib/friends/loadFriendCollectionAccess";
import { supabase } from "@/lib/supabase/client";
import type { FilmEditEntry, FilmEditEntryView } from "./types";

const FRIEND_FILM_EDIT_VIEW_SELECT =
  "id, created_at, updated_at, viewed_at, rating, comment, view_percent, recommend_similar, is_viewed, availability, shishka_fit_label, shishka_fit_reason, shishka_fit_profile_analyzed_at, shishka_fit_scope_value, items:items!inner (id, title, title_uk, title_en, title_original, description, genres, director, actors, poster_url, external_id, film_media_type, imdb_rating, trailers, year, type)";

export const loadFriendFilmEditEntry = async (
  ownerUserId: string,
  viewId: string,
): Promise<FilmEditEntry | null> => {
  const hasAccess = await loadFriendCollectionAccess(ownerUserId);
  if (!hasAccess) {
    return null;
  }

  const { data } = await supabase
    .from("user_views")
    .select(FRIEND_FILM_EDIT_VIEW_SELECT)
    .eq("id", viewId)
    .eq("user_id", ownerUserId)
    .eq("items.type", "film")
    .maybeSingle();

  const view = (data as FilmEditEntryView | null) ?? null;
  if (!view) {
    return null;
  }

  const people = await loadStoredPeopleForItem(supabase, view.items.id);
  return {
    view,
    people,
  };
};
