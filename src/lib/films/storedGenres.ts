import type { SupabaseClient } from "@supabase/supabase-js";
import type { FilmNormalizedGenre } from "@/lib/films/normalizedMetadata";

export const loadStoredGenresForItem = async (
  supabase: SupabaseClient,
  itemId: string,
): Promise<FilmNormalizedGenre[]> => {
  const { data, error } = await supabase
    .from("item_genres")
    .select("genres!inner(source_genre_id, name)")
    .eq("item_id", itemId);

  if (error) {
    return [] as FilmNormalizedGenre[];
  }

  const mappedGenres: Array<FilmNormalizedGenre | null> = ((data ?? []) as Array<{
    genres:
      | {
          source_genre_id?: string | null;
          name?: string | null;
        }
      | Array<{
          source_genre_id?: string | null;
          name?: string | null;
        }>;
  }>)
    .map((row) => {
      const genre = Array.isArray(row.genres) ? row.genres[0] : row.genres;
      if (!genre?.source_genre_id || !genre.name) {
        return null;
      }
      return {
        tmdbGenreId: genre.source_genre_id,
        name: genre.name,
      };
    });

  const unique = new Map<string, FilmNormalizedGenre>();
  mappedGenres.forEach((genre) => {
    if (!genre) {
      return;
    }
    unique.set(genre.tmdbGenreId, genre);
  });

  return [...unique.values()];
};
