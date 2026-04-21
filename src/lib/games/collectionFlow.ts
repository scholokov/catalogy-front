import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameNormalizedGenre } from "@/lib/games/normalizedMetadata";
import { trySyncGameNormalizedGenres } from "@/lib/games/normalizedMetadata";
import { normalizeGamePlatforms } from "@/lib/games/platforms";
import type { ShishkaFitAssessment } from "@/lib/shishka/fitAssessment";

export type GameCollectionTrailer = {
  id: string;
  name: string;
  site: string;
  key: string;
  type: string;
  official: boolean;
  language: string;
  region: string;
  url: string;
};

export type GameCollectionFormPayload = {
  viewedAt: string;
  comment: string;
  recommendSimilar: boolean;
  isViewed: boolean;
  rating: number | null;
  viewPercent: number;
  platforms: string[];
  availability: string | null;
  shishkaFitAssessment: ShishkaFitAssessment | null;
};

export type GameCollectionSource = {
  id: string;
  title: string;
  rating: number | null;
  genres: string;
  genreItems?: GameNormalizedGenre[] | null;
  released: string;
  poster: string;
  trailers?: GameCollectionTrailer[] | null;
  description?: string | null;
};

export type GameItemDraftInput = {
  poster_url: string | null;
  year: number | null;
  imdb_rating: string | null;
  description: string | null;
  genres: string | null;
  normalizedGenres?: GameNormalizedGenre[] | null;
  external_id: string | null;
  trailers: GameCollectionTrailer[] | null;
};

export const normalizeGameTrailers = (trailers?: GameCollectionTrailer[] | null) =>
  trailers && trailers.length > 0 ? trailers : null;

const buildItemBasePayload = (game: GameCollectionSource) => {
  const overallRating =
    typeof game.rating === "number" ? game.rating.toFixed(1) : null;
  const parsedYear = game.released ? Number.parseInt(game.released.slice(0, 4), 10) : NaN;
  const yearValue = Number.isNaN(parsedYear) ? null : parsedYear;

  return {
    title: game.title,
    description: game.description ?? null,
    genres: game.genres || null,
    poster_url: game.poster,
    external_id: game.id,
    imdb_rating: overallRating,
    year: yearValue,
    trailers: normalizeGameTrailers(game.trailers ?? null),
  };
};

const resolveItemId = async (supabase: SupabaseClient, externalId: string) => {
  const { data, error } = await supabase
    .from("items")
    .select("id")
    .eq("type", "game")
    .eq("external_id", externalId)
    .maybeSingle();

  if (error) {
    throw new Error("Не вдалося перевірити каталог.");
  }

  return data?.id ?? null;
};

export const addGameToCollection = async ({
  supabase,
  game,
  payload,
  allowUpdateExistingView,
}: {
  supabase: SupabaseClient;
  game: GameCollectionSource;
  payload: GameCollectionFormPayload;
  allowUpdateExistingView: boolean;
}) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Потрібна авторизація.");
  }

  const itemPayload = buildItemBasePayload(game);
  let itemId = await resolveItemId(supabase, game.id);

  if (!itemId) {
    const { data: createdItem, error: createError } = await supabase
      .from("items")
      .insert({
        type: "game",
        ...itemPayload,
      })
      .select("id")
      .single();

    if (createError) {
      if (createError.code === "23505") {
        itemId = await resolveItemId(supabase, game.id);
      } else {
        throw new Error("Не вдалося створити запис у каталозі.");
      }
    } else {
      itemId = createdItem.id;
    }
  }

  if (!itemId) {
    throw new Error("Не вдалося визначити запис гри.");
  }

  const itemUpdates: {
    imdb_rating?: string | null;
    year?: number | null;
    genres?: string | null;
    trailers?: GameCollectionTrailer[] | null;
    description?: string | null;
    poster_url?: string | null;
    external_id?: string;
  } = {
    poster_url: itemPayload.poster_url,
    external_id: itemPayload.external_id,
  };

  if (itemPayload.imdb_rating) itemUpdates.imdb_rating = itemPayload.imdb_rating;
  if (itemPayload.year) itemUpdates.year = itemPayload.year;
  if (itemPayload.genres) itemUpdates.genres = itemPayload.genres;
  if (itemPayload.trailers) itemUpdates.trailers = itemPayload.trailers;
  if (itemPayload.description) itemUpdates.description = itemPayload.description;

  const { error: updateItemError } = await supabase
    .from("items")
    .update(itemUpdates)
    .eq("id", itemId);

  if (updateItemError) {
    throw new Error("Не вдалося оновити дані гри.");
  }

  await trySyncGameNormalizedGenres(supabase, itemId, game.genreItems ?? null);

  const normalizedPlatforms = normalizeGamePlatforms(payload.platforms);
  const { error: viewError } = await supabase.from("user_views").insert({
    user_id: user.id,
    item_id: itemId,
    rating: payload.rating,
    comment: payload.comment,
    viewed_at: payload.viewedAt,
    is_viewed: payload.isViewed,
    view_percent: payload.viewPercent,
    recommend_similar: payload.recommendSimilar,
    platforms: normalizedPlatforms,
    availability: payload.availability,
    shishka_fit_label: payload.shishkaFitAssessment?.label ?? null,
    shishka_fit_reason: payload.shishkaFitAssessment?.reason ?? null,
    shishka_fit_profile_analyzed_at:
      payload.shishkaFitAssessment?.profileAnalyzedAt ?? null,
    shishka_fit_scope_value: payload.shishkaFitAssessment?.scopeValue ?? null,
  });

  if (viewError) {
    if (viewError.code === "23505" && allowUpdateExistingView) {
      const { error: updateExistingError } = await supabase
        .from("user_views")
        .update({
          rating: payload.rating,
          comment: payload.comment,
          viewed_at: payload.viewedAt,
          is_viewed: payload.isViewed,
          view_percent: payload.viewPercent,
          recommend_similar: payload.recommendSimilar,
          platforms: normalizedPlatforms,
          availability: payload.availability,
          shishka_fit_label: payload.shishkaFitAssessment?.label ?? null,
          shishka_fit_reason: payload.shishkaFitAssessment?.reason ?? null,
          shishka_fit_profile_analyzed_at:
            payload.shishkaFitAssessment?.profileAnalyzedAt ?? null,
          shishka_fit_scope_value: payload.shishkaFitAssessment?.scopeValue ?? null,
        })
        .eq("user_id", user.id)
        .eq("item_id", itemId);

      if (updateExistingError) {
        throw new Error("Не вдалося зберегти у колекцію.");
      }

      return { itemId, updatedExistingView: true };
    }

    if (viewError.code === "23505") {
      throw new Error("Вже у твоїй колекції.");
    }

    throw new Error("Не вдалося зберегти у колекцію.");
  }

  return { itemId, updatedExistingView: false };
};

export const updateGameView = async ({
  supabase,
  viewId,
  itemId,
  itemDraft,
  payload,
}: {
  supabase: SupabaseClient;
  viewId: string;
  itemId: string;
  itemDraft: GameItemDraftInput | null;
  payload: GameCollectionFormPayload;
}) => {
  const normalizedPlatforms = normalizeGamePlatforms(payload.platforms);
  const { error } = await supabase
    .from("user_views")
    .update({
      rating: payload.rating,
      comment: payload.comment,
      viewed_at: payload.viewedAt,
      is_viewed: payload.isViewed,
      view_percent: payload.viewPercent,
      recommend_similar: payload.recommendSimilar,
      platforms: normalizedPlatforms,
      availability: payload.availability,
      shishka_fit_label: payload.shishkaFitAssessment?.label ?? null,
      shishka_fit_reason: payload.shishkaFitAssessment?.reason ?? null,
      shishka_fit_profile_analyzed_at:
        payload.shishkaFitAssessment?.profileAnalyzedAt ?? null,
      shishka_fit_scope_value: payload.shishkaFitAssessment?.scopeValue ?? null,
    })
    .eq("id", viewId);

  if (error) {
    throw new Error("Не вдалося оновити запис.");
  }

  if (!itemDraft) {
    return { normalizedPlatforms };
  }

  const itemUpdatePayload = {
    poster_url: itemDraft.poster_url,
    year: itemDraft.year,
    imdb_rating: itemDraft.imdb_rating,
    description: itemDraft.description,
    genres: itemDraft.genres,
    external_id: itemDraft.external_id,
    trailers: itemDraft.trailers,
  };
  const { error: updateItemError } = await supabase
    .from("items")
    .update(itemUpdatePayload)
    .eq("id", itemId);

  if (updateItemError) {
    if (updateItemError.code === "23505") {
      const { error: retryError } = await supabase
        .from("items")
        .update({
          poster_url: itemDraft.poster_url,
          year: itemDraft.year,
          imdb_rating: itemDraft.imdb_rating,
          description: itemDraft.description,
          genres: itemDraft.genres,
          trailers: itemDraft.trailers,
        })
        .eq("id", itemId);
      if (retryError) {
        throw new Error("Не вдалося оновити дані гри.");
      }
    } else {
      throw new Error("Не вдалося оновити дані гри.");
    }
  }

  await trySyncGameNormalizedGenres(supabase, itemId, itemDraft.normalizedGenres ?? null);

  return { normalizedPlatforms };
};
