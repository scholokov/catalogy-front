"use client";

import { supabase } from "@/lib/supabase/client";
import { normalizeGamePlatforms } from "@/lib/games/platforms";
import type { GameNormalizedGenre } from "@/lib/games/normalizedMetadata";
import type { ShishkaFitAssessment } from "@/lib/shishka/fitAssessment";
import type { GameGenreEditEntry, GameGenreEditEntryView } from "./types";

export const loadGameGenreEditEntry = async (
  viewId: string,
): Promise<GameGenreEditEntry | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_views")
    .select(
      "id, viewed_at, comment, recommend_similar, is_viewed, rating, view_percent, availability, platforms, shishka_fit_label, shishka_fit_reason, shishka_fit_profile_analyzed_at, shishka_fit_scope_value, items!inner(id, title, description, genres, poster_url, external_id, year, imdb_rating, type, trailers)",
    )
    .eq("id", viewId)
    .eq("user_id", user.id)
    .eq("items.type", "game")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const item = Array.isArray(data.items) ? data.items[0] : data.items;
  if (!item || item.type !== "game") {
    return null;
  }

  const { data: genreLinks } = await supabase
    .from("item_genres")
    .select("genres!inner(source, source_genre_id, name)")
    .eq("item_id", item.id);

  const normalizedGenres = ((genreLinks ?? []) as Array<{
    genres:
      | {
          source?: string | null;
          source_genre_id?: string | null;
          name?: string | null;
        }
      | Array<{
          source?: string | null;
          source_genre_id?: string | null;
          name?: string | null;
        }>;
  }>)
    .map((row) => (Array.isArray(row.genres) ? row.genres[0] : row.genres))
    .filter(
      (genre): genre is { source: "rawg" | "igdb"; source_genre_id: string; name: string } =>
        Boolean(
          genre &&
            (genre.source === "rawg" || genre.source === "igdb") &&
            genre.source_genre_id &&
            genre.name,
        ),
    )
    .reduce<GameNormalizedGenre[]>((acc, genre) => {
      if (
        acc.some(
          (entry) =>
            entry.source === genre.source && entry.sourceGenreId === genre.source_genre_id,
        )
      ) {
        return acc;
      }
      acc.push({
        source: genre.source,
        sourceGenreId: genre.source_genre_id,
        name: genre.name,
      });
      return acc;
    }, []);

  const view: GameGenreEditEntryView = {
    viewId: data.id,
    viewedAt: data.viewed_at,
    comment: data.comment,
    recommendSimilar: data.recommend_similar,
    isViewed: data.is_viewed,
    rating: data.rating,
    viewPercent: data.view_percent,
    availability: data.availability,
    platforms: normalizeGamePlatforms(data.platforms),
    shishkaFitLabel: (data.shishka_fit_label as ShishkaFitAssessment["label"] | null) ?? null,
    shishkaFitReason: data.shishka_fit_reason ?? null,
    shishkaFitProfileAnalyzedAt: data.shishka_fit_profile_analyzed_at ?? null,
    shishkaFitScopeValue: data.shishka_fit_scope_value ?? null,
    item: {
      id: item.id,
      title: item.title,
      description: item.description ?? null,
      genres: item.genres ?? null,
      posterUrl: item.poster_url ?? null,
      externalId: item.external_id ?? null,
      year: item.year ?? null,
      imdbRating: item.imdb_rating ?? null,
      genreItems: normalizedGenres,
      trailers: Array.isArray(item.trailers) ? item.trailers : null,
    },
  };

  return { view };
};
