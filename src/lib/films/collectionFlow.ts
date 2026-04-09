import type { SupabaseClient } from "@supabase/supabase-js";
import {
  syncFilmNormalizedMetadata,
  type FilmNormalizedGenre,
  type FilmNormalizedPerson,
} from "@/lib/films/normalizedMetadata";
import type { ShishkaFitAssessment } from "@/lib/shishka/fitAssessment";

export type FilmCollectionTrailer = {
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

export type FilmCollectionFormPayload = {
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

export type FilmCollectionSource = {
  id: string;
  title: string;
  englishTitle?: string;
  originalTitle?: string;
  year?: string;
  poster?: string;
  plot?: string;
  genres?: string;
  director?: string;
  actors?: string;
  imdbRating?: string;
  mediaType?: "movie" | "tv";
  trailers?: FilmCollectionTrailer[] | null;
  people?: FilmNormalizedPerson[] | null;
  genreItems?: FilmNormalizedGenre[] | null;
};

export type FilmItemDraftInput = {
  title: string;
  title_uk: string | null;
  title_en: string | null;
  title_original: string | null;
  poster_url: string | null;
  imageUrls?: string[] | null;
  year: number | null;
  imdb_rating: string | null;
  description: string | null;
  genres: string | null;
  director: string | null;
  actors: string | null;
  external_id: string | null;
  film_media_type?: "movie" | "tv" | null;
  trailers: FilmCollectionTrailer[] | null;
  normalizedGenres?: FilmNormalizedGenre[] | null;
  normalizedPeople?: FilmNormalizedPerson[] | null;
};

export const normalizeFilmMediaType = (value?: string | null): "movie" | "tv" | null => {
  if (value === "movie" || value === "tv") return value;
  return null;
};

export const normalizeTrailers = (trailers?: FilmCollectionTrailer[] | null) =>
  trailers && trailers.length > 0 ? trailers : null;

export const normalizeTitle = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

export const normalizeEnglishTitle = (
  englishTitle?: string | null,
  originalTitle?: string | null,
) => {
  const normalizedEnglish = normalizeTitle(englishTitle);
  const normalizedOriginal = normalizeTitle(originalTitle);
  if (!normalizedEnglish) return null;
  if (normalizedOriginal && normalizedEnglish === normalizedOriginal) return null;
  return normalizedEnglish;
};

const buildPeopleSummary = (
  people: FilmNormalizedPerson[] | null | undefined,
  roleKind: "actor" | "director",
  limit: number,
) => {
  const names = (people ?? [])
    .filter((person) => person.roleKind === roleKind)
    .sort((left, right) => {
      const leftOrder = left.creditOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.creditOrder ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    })
    .slice(0, limit)
    .map((person) => normalizeTitle(person.name))
    .filter((name): name is string => Boolean(name));

  return names.length > 0 ? names.join(", ") : null;
};

export const summarizeFilmPeople = (people: FilmNormalizedPerson[] | null | undefined) => ({
  director: buildPeopleSummary(people, "director", 6),
  actors: buildPeopleSummary(people, "actor", 12),
});

const resolveItemId = async (
  supabase: SupabaseClient,
  externalId: string,
  mediaType: "movie" | "tv",
) => {
  const { data, error } = await supabase
    .from("items")
    .select("id")
    .eq("type", "film")
    .eq("film_media_type", mediaType)
    .eq("external_id", externalId)
    .maybeSingle();

  if (error) {
    throw new Error("Не вдалося перевірити каталог.");
  }

  return data?.id ?? null;
};

const buildItemBasePayload = (film: FilmCollectionSource) => {
  const titleUk = normalizeTitle(film.title);
  const titleOriginal = normalizeTitle(film.originalTitle);
  const titleEn = normalizeEnglishTitle(film.englishTitle, titleOriginal);
  const resolvedTitle = titleUk ?? titleEn ?? titleOriginal ?? "Без назви";
  const parsedYear = Number.parseInt(film.year ?? "", 10);
  const yearValue = Number.isNaN(parsedYear) ? null : parsedYear;
  const trailers = normalizeTrailers(film.trailers ?? null);
  const filmMediaType = normalizeFilmMediaType(film.mediaType) ?? "movie";
  const imdbRatingValue =
    film.imdbRating && film.imdbRating !== "N/A" ? film.imdbRating : null;
  const peopleSummary = summarizeFilmPeople(film.people);

  return {
    title: resolvedTitle,
    title_uk: titleUk,
    title_en: titleEn,
    title_original: titleOriginal,
    description: film.plot || null,
    genres: film.genres || null,
    director: peopleSummary.director ?? (film.director || null),
    actors: peopleSummary.actors ?? (film.actors || null),
    poster_url: film.poster || null,
    external_id: film.id,
    imdb_rating: imdbRatingValue,
    year: yearValue,
    film_media_type: filmMediaType,
    trailers,
  };
};

export const addFilmToCollection = async ({
  supabase,
  film,
  payload,
  allowUpdateExistingView,
}: {
  supabase: SupabaseClient;
  film: FilmCollectionSource;
  payload: FilmCollectionFormPayload;
  allowUpdateExistingView: boolean;
}) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Потрібна авторизація.");
  }

  const itemPayload = buildItemBasePayload(film);
  let itemId = await resolveItemId(supabase, film.id, itemPayload.film_media_type);

  if (!itemId) {
    const { data: createdItem, error: createError } = await supabase
      .from("items")
      .insert({
        type: "film",
        ...itemPayload,
      })
      .select("id")
      .single();

    if (createError) {
      if (createError.code === "23505") {
        itemId = await resolveItemId(supabase, film.id, itemPayload.film_media_type);
      } else {
        throw new Error("Не вдалося створити запис у каталозі.");
      }
    } else {
      itemId = createdItem.id;
    }
  }

  if (!itemId) {
    throw new Error("Не вдалося визначити запис фільму.");
  }

  const itemUpdates: {
    title?: string;
    title_uk?: string | null;
    title_en?: string | null;
    title_original?: string | null;
    imdb_rating?: string | null;
    year?: number | null;
    description?: string | null;
    genres?: string | null;
    director?: string | null;
    actors?: string | null;
    poster_url?: string | null;
    external_id?: string;
    film_media_type?: "movie" | "tv";
    trailers?: FilmCollectionTrailer[] | null;
  } = {
    title: itemPayload.title,
    title_uk: itemPayload.title_uk,
    title_en: itemPayload.title_en,
    title_original: itemPayload.title_original,
    poster_url: itemPayload.poster_url,
    external_id: itemPayload.external_id,
    film_media_type: itemPayload.film_media_type,
  };

  if (itemPayload.imdb_rating) itemUpdates.imdb_rating = itemPayload.imdb_rating;
  if (itemPayload.year) itemUpdates.year = itemPayload.year;
  if (itemPayload.description) itemUpdates.description = itemPayload.description;
  if (itemPayload.genres) itemUpdates.genres = itemPayload.genres;
  if (itemPayload.director) itemUpdates.director = itemPayload.director;
  if (itemPayload.actors) itemUpdates.actors = itemPayload.actors;
  if (itemPayload.trailers) itemUpdates.trailers = itemPayload.trailers;

  const { error: updateItemError } = await supabase
    .from("items")
    .update(itemUpdates)
    .eq("id", itemId);

  if (updateItemError) {
    throw new Error("Не вдалося оновити дані фільму.");
  }

  await syncFilmNormalizedMetadata(supabase, itemId, {
    people: film.people ?? null,
    genres: film.genreItems ?? null,
  });

  const { error: viewError } = await supabase.from("user_views").insert({
    user_id: user.id,
    item_id: itemId,
    rating: payload.rating,
    comment: payload.comment,
    viewed_at: payload.viewedAt,
    is_viewed: payload.isViewed,
    view_percent: payload.viewPercent,
    recommend_similar: payload.recommendSimilar,
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

export const updateFilmView = async ({
  supabase,
  viewId,
  itemId,
  itemDraft,
  payload,
}: {
  supabase: SupabaseClient;
  viewId: string;
  itemId: string;
  itemDraft: FilmItemDraftInput | null;
  payload: FilmCollectionFormPayload;
}) => {
  const { error } = await supabase
    .from("user_views")
    .update({
      rating: payload.rating,
      comment: payload.comment,
      viewed_at: payload.viewedAt,
      is_viewed: payload.isViewed,
      view_percent: payload.viewPercent,
      recommend_similar: payload.recommendSimilar,
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
    return;
  }

  const itemUpdatePayload = {
    title: itemDraft.title,
    title_uk: itemDraft.title_uk,
    title_en: itemDraft.title_en,
    title_original: itemDraft.title_original,
    poster_url: itemDraft.poster_url,
    year: itemDraft.year,
    imdb_rating: itemDraft.imdb_rating,
    description: itemDraft.description,
    genres: itemDraft.genres,
    director: itemDraft.director,
    actors: itemDraft.actors,
    external_id: itemDraft.external_id,
    film_media_type: itemDraft.film_media_type,
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
          title: itemDraft.title,
          title_uk: itemDraft.title_uk,
          title_en: itemDraft.title_en,
          title_original: itemDraft.title_original,
          poster_url: itemDraft.poster_url,
          year: itemDraft.year,
          imdb_rating: itemDraft.imdb_rating,
          description: itemDraft.description,
          genres: itemDraft.genres,
          director: itemDraft.director,
          actors: itemDraft.actors,
          film_media_type: itemDraft.film_media_type,
          trailers: itemDraft.trailers,
        })
        .eq("id", itemId);

      if (retryError) {
        throw new Error("Не вдалося оновити дані фільму.");
      }
    } else {
      throw new Error("Не вдалося оновити дані фільму.");
    }
  }

  await syncFilmNormalizedMetadata(supabase, itemId, {
    people: itemDraft.normalizedPeople ?? null,
    genres: itemDraft.normalizedGenres ?? null,
  });
};
