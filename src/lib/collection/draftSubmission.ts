import type { SupabaseClient } from "@supabase/supabase-js";
import { addExistingItemToCollection } from "@/lib/collection/viewMutations";
import {
  addFilmToCollection,
  type FilmCollectionFormPayload,
  type FilmCollectionSource,
  updateFilmView as updateFilmViewMutation,
} from "@/lib/films/collectionFlow";
import {
  addGameToCollection,
  type GameCollectionFormPayload,
  type GameCollectionSource,
  updateGameView as updateGameViewMutation,
} from "@/lib/games/collectionFlow";

const ensureOwnViewId = async (supabase: SupabaseClient, itemId: string) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Потрібна авторизація.");
  }

  const { data: existingView } = await supabase
    .from("user_views")
    .select("id")
    .eq("user_id", user.id)
    .eq("item_id", itemId)
    .maybeSingle();

  if (!existingView?.id) {
    await addExistingItemToCollection({ supabase, itemId });
  }

  const { data: resolvedView } = await supabase
    .from("user_views")
    .select("id")
    .eq("user_id", user.id)
    .eq("item_id", itemId)
    .maybeSingle();

  if (!resolvedView?.id) {
    throw new Error("Не вдалося підготувати запис у колекції.");
  }

  return resolvedView.id;
};

export const saveFilmDraftToCollection = async ({
  supabase,
  film,
  payload,
  allowUpdateExistingViewForNew = true,
}: {
  supabase: SupabaseClient;
  film: FilmCollectionSource & { itemId?: string };
  payload: FilmCollectionFormPayload;
  allowUpdateExistingViewForNew?: boolean;
}) => {
  if (film.itemId) {
    const viewId = await ensureOwnViewId(supabase, film.itemId);
    await updateFilmViewMutation({
      supabase,
      viewId,
      itemId: film.itemId,
      itemDraft: null,
      payload,
    });
    return {
      itemId: film.itemId,
      updatedExistingView: true,
    };
  }

  return addFilmToCollection({
    supabase,
    film,
    payload,
    allowUpdateExistingView: allowUpdateExistingViewForNew,
  });
};

export const saveGameDraftToCollection = async ({
  supabase,
  game,
  payload,
  allowUpdateExistingViewForNew = false,
}: {
  supabase: SupabaseClient;
  game: GameCollectionSource & { itemId?: string };
  payload: GameCollectionFormPayload;
  allowUpdateExistingViewForNew?: boolean;
}) => {
  if (game.itemId) {
    const viewId = await ensureOwnViewId(supabase, game.itemId);
    await updateGameViewMutation({
      supabase,
      viewId,
      itemId: game.itemId,
      itemDraft: null,
      payload,
    });
    return {
      itemId: game.itemId,
      updatedExistingView: true,
    };
  }

  return addGameToCollection({
    supabase,
    game,
    payload,
    allowUpdateExistingView: allowUpdateExistingViewForNew,
  });
};
