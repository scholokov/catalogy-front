"use client";

import { supabase } from "@/lib/supabase/client";

const normalizeGenreKey = (value: string) => value.trim().toLocaleLowerCase("uk-UA");

export const parseGenreFilterValues = (value?: string | null) => {
  if (!value) {
    return [];
  }

  const unique = new Map<string, string>();
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const key = normalizeGenreKey(entry);
      if (!unique.has(key)) {
        unique.set(key, entry);
      }
    });

  return Array.from(unique.values());
};

export const buildAvailableGenreOptions = (values: Array<string | null | undefined>) => {
  const unique = new Map<string, string>();

  values.forEach((value) => {
    parseGenreFilterValues(value).forEach((entry) => {
      const key = normalizeGenreKey(entry);
      if (!unique.has(key)) {
        unique.set(key, entry);
      }
    });
  });

  return Array.from(unique.values()).sort((left, right) =>
    left.localeCompare(right, "uk", { sensitivity: "base" }),
  );
};

export const matchesGenreSelection = (value: string | null | undefined, selectedGenres: string[]) => {
  if (selectedGenres.length === 0) {
    return true;
  }

  const genreKeys = new Set(parseGenreFilterValues(value).map((entry) => normalizeGenreKey(entry)));
  return selectedGenres.some((entry) => genreKeys.has(normalizeGenreKey(entry)));
};

export const loadAvailableGenresForCollection = async ({
  mediaKind,
  ownerUserId,
}: {
  mediaKind: "game" | "film";
  ownerUserId?: string;
}) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [] as string[];
  }

  const effectiveOwnerId = ownerUserId ?? user.id;
  const { data, error } = await supabase
    .from("user_views")
    .select("items:items!inner(genres, type)")
    .eq("user_id", effectiveOwnerId)
    .eq("items.type", mediaKind);

  if (error) {
    throw new Error("Не вдалося завантажити жанри для фільтра.");
  }

  const genreValues = ((data ?? []) as Array<{
    items?: { genres?: string | null } | Array<{ genres?: string | null }> | null;
  }>).map((row) => {
    const relatedItem = Array.isArray(row.items) ? row.items[0] : row.items;
    return relatedItem?.genres ?? null;
  });

  return buildAvailableGenreOptions(genreValues);
};

export const loadMatchingItemIdsForGenres = async ({
  mediaKind,
  selectedGenres,
}: {
  mediaKind: "game" | "film";
  selectedGenres: string[];
}) => {
  if (selectedGenres.length === 0) {
    return [] as string[];
  }

  const { data: genreRows, error: genreError } = await supabase
    .from("genres")
    .select("id")
    .eq("media_kind", mediaKind)
    .in("name", selectedGenres);

  if (genreError) {
    throw new Error("Не вдалося знайти жанри для фільтра.");
  }

  const genreIds = ((genreRows ?? []) as Array<{ id?: string | null }>)
    .map((row) => row.id ?? null)
    .filter((id): id is string => Boolean(id));

  if (genreIds.length === 0) {
    return [] as string[];
  }

  const { data: itemGenreRows, error: itemGenreError } = await supabase
    .from("item_genres")
    .select("item_id")
    .in("genre_id", genreIds);

  if (itemGenreError) {
    throw new Error("Не вдалося завантажити ігри або фільми для жанрового фільтра.");
  }

  return Array.from(
    new Set(
      ((itemGenreRows ?? []) as Array<{ item_id?: string | null }>)
        .map((row) => row.item_id ?? null)
        .filter((itemId): itemId is string => Boolean(itemId)),
    ),
  );
};
