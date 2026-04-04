import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameNormalizedGenre } from "@/lib/games/normalizedMetadata";

export const loadStoredGameGenresForItem = async (
  supabase: SupabaseClient,
  itemId: string,
): Promise<GameNormalizedGenre[]> => {
  const { data, error } = await supabase
    .from("item_genres")
    .select("genres!inner(source,source_genre_id,name)")
    .eq("item_id", itemId);

  if (error) {
    return [];
  }

  const mappedGenres: Array<GameNormalizedGenre | null> = ((data ?? []) as Array<{
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
    .map((row) => {
      const genre = Array.isArray(row.genres) ? row.genres[0] : row.genres;
      if (
        (genre?.source !== "rawg" && genre?.source !== "igdb") ||
        !genre.source_genre_id ||
        !genre.name
      ) {
        return null;
      }
      return {
        source: genre.source,
        sourceGenreId: genre.source_genre_id,
        name: genre.name,
      };
    });

  const unique = new Map<string, GameNormalizedGenre>();
  mappedGenres.forEach((genre) => {
    if (!genre) {
      return;
    }
    unique.set(`${genre.source}:${genre.sourceGenreId}`, genre);
  });

  return [...unique.values()];
};
