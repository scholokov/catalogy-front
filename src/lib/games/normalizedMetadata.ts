import type { SupabaseClient } from "@supabase/supabase-js";

export type GameNormalizedGenre = {
  source: "rawg" | "igdb";
  sourceGenreId: string;
  name: string;
};

const uniqueGenres = (genres: GameNormalizedGenre[]) => {
  const seen = new Set<string>();
  return genres.filter((genre) => {
    const key = `${genre.source}:${genre.sourceGenreId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const syncGameNormalizedGenres = async (
  supabase: SupabaseClient,
  itemId: string,
  genres?: GameNormalizedGenre[] | null,
) => {
  if (!genres) {
    return;
  }

  const safeGenres = uniqueGenres(
    genres.filter((genre) => genre.sourceGenreId.trim() && genre.name.trim()),
  );

  const { error: deleteGenresError } = await supabase
    .from("item_genres")
    .delete()
    .eq("item_id", itemId);

  if (deleteGenresError) {
    throw new Error("Не вдалося синхронізувати жанри для гри.");
  }

  if (safeGenres.length === 0) {
    return;
  }

  const { data: upsertedGenres, error: upsertGenresError } = await supabase
    .from("genres")
    .upsert(
      safeGenres.map((genre) => ({
        media_kind: "game",
        source: genre.source,
        source_genre_id: genre.sourceGenreId,
        name: genre.name,
      })),
      { onConflict: "media_kind,source,source_genre_id" },
    )
    .select("id, source, source_genre_id");

  if (upsertGenresError) {
    throw new Error("Не вдалося зберегти жанри для гри.");
  }

  const genreIdsByKey = new Map(
    ((upsertedGenres ?? []) as Array<{ id: string; source: string; source_genre_id: string }>).map(
      (row) => [`${row.source}:${row.source_genre_id}`, row.id],
    ),
  );

  const itemGenreRows = safeGenres
    .map((genre) => {
      const genreId = genreIdsByKey.get(`${genre.source}:${genre.sourceGenreId}`);
      if (!genreId) {
        return null;
      }
      return {
        item_id: itemId,
        genre_id: genreId,
      };
    })
    .filter(Boolean);

  if (itemGenreRows.length === 0) {
    return;
  }

  const { error: insertItemGenresError } = await supabase
    .from("item_genres")
    .insert(itemGenreRows);

  if (insertItemGenresError) {
    throw new Error("Не вдалося зв’язати жанри з грою.");
  }
};

export const trySyncGameNormalizedGenres = async (
  supabase: SupabaseClient,
  itemId: string,
  genres?: GameNormalizedGenre[] | null,
) => {
  try {
    await syncGameNormalizedGenres(supabase, itemId, genres);
    return true;
  } catch {
    return false;
  }
};
