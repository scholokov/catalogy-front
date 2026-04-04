import type { SupabaseClient } from "@supabase/supabase-js";

export type FilmNormalizedPerson = {
  tmdbPersonId: string;
  name: string;
  originalName?: string;
  roleKind: "actor" | "director" | "writer" | "producer";
  creditGroup: "cast" | "crew";
  department?: string | null;
  job?: string | null;
  characterName?: string | null;
  creditOrder?: number | null;
  isPrimary?: boolean;
  profileUrl?: string | null;
};

export type FilmNormalizedGenre = {
  tmdbGenreId: string;
  name: string;
};

const uniquePeople = (people: FilmNormalizedPerson[]) => {
  const seen = new Set<string>();
  return people.filter((person) => {
    const key = [
      person.tmdbPersonId,
      person.roleKind,
      person.creditGroup,
      person.job ?? "",
      person.characterName ?? "",
      person.creditOrder ?? "",
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const uniqueGenres = (genres: FilmNormalizedGenre[]) => {
  const seen = new Set<string>();
  return genres.filter((genre) => {
    const key = genre.tmdbGenreId;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const uniquePeopleEntities = (people: FilmNormalizedPerson[]) => {
  const entities = new Map<string, FilmNormalizedPerson>();

  people.forEach((person) => {
    const existing = entities.get(person.tmdbPersonId);

    if (!existing) {
      entities.set(person.tmdbPersonId, person);
      return;
    }

    entities.set(person.tmdbPersonId, {
      ...existing,
      name: existing.name || person.name,
      originalName: existing.originalName || person.originalName,
      department: existing.department || person.department,
      profileUrl: existing.profileUrl || person.profileUrl,
      isPrimary: existing.isPrimary || person.isPrimary,
    });
  });

  return [...entities.values()];
};

export const syncFilmNormalizedMetadata = async (
  supabase: SupabaseClient,
  itemId: string,
  metadata: {
    people?: FilmNormalizedPerson[] | null;
    genres?: FilmNormalizedGenre[] | null;
  },
) => {
  if (metadata.people) {
    const people = uniquePeople(
      metadata.people.filter(
        (person) => person.tmdbPersonId.trim() && person.name.trim(),
      ),
    );

    const { error: deletePeopleError } = await supabase
      .from("item_people")
      .delete()
      .eq("item_id", itemId);

    if (deletePeopleError) {
      throw new Error("Не вдалося синхронізувати людей для фільму.");
    }

    if (people.length > 0) {
      const peopleEntities = uniquePeopleEntities(people);
      const { data: upsertedPeople, error: upsertPeopleError } = await supabase
        .from("people")
        .upsert(
          peopleEntities.map((person) => ({
            source: "tmdb",
            source_person_id: person.tmdbPersonId,
            name: person.name,
            name_original: person.originalName || null,
            profile_url: person.profileUrl || null,
            known_for_department: person.department || null,
          })),
          { onConflict: "source,source_person_id" },
        )
        .select("id, source_person_id");

      if (upsertPeopleError) {
        throw new Error("Не вдалося зберегти людей для фільму.");
      }

      const peopleIdsBySourceId = new Map(
        ((upsertedPeople ?? []) as Array<{ id: string; source_person_id: string }>).map(
          (row) => [row.source_person_id, row.id],
        ),
      );

      const itemPeopleRows = people
        .map((person) => {
          const personId = peopleIdsBySourceId.get(person.tmdbPersonId);
          if (!personId) {
            return null;
          }
          return {
            item_id: itemId,
            person_id: personId,
            role_kind: person.roleKind,
            credit_group: person.creditGroup,
            department: person.department || null,
            job: person.job || null,
            character_name: person.characterName || null,
            credit_order: person.creditOrder ?? null,
            is_primary: Boolean(person.isPrimary),
          };
        })
        .filter(Boolean);

      if (itemPeopleRows.length > 0) {
        const { error: insertItemPeopleError } = await supabase
          .from("item_people")
          .insert(itemPeopleRows);

        if (insertItemPeopleError) {
          throw new Error("Не вдалося зв’язати людей із фільмом.");
        }
      }
    }
  }

  if (metadata.genres) {
    const genres = uniqueGenres(
      metadata.genres.filter((genre) => genre.tmdbGenreId.trim() && genre.name.trim()),
    );

    const { error: deleteGenresError } = await supabase
      .from("item_genres")
      .delete()
      .eq("item_id", itemId);

    if (deleteGenresError) {
      throw new Error("Не вдалося синхронізувати жанри для фільму.");
    }

    if (genres.length > 0) {
      const { data: upsertedGenres, error: upsertGenresError } = await supabase
        .from("genres")
        .upsert(
          genres.map((genre) => ({
            media_kind: "film",
            source: "tmdb",
            source_genre_id: genre.tmdbGenreId,
            name: genre.name,
          })),
          { onConflict: "media_kind,source,source_genre_id" },
        )
        .select("id, source_genre_id");

      if (upsertGenresError) {
        throw new Error("Не вдалося зберегти жанри для фільму.");
      }

      const genreIdsBySourceId = new Map(
        ((upsertedGenres ?? []) as Array<{ id: string; source_genre_id: string }>).map(
          (row) => [row.source_genre_id, row.id],
        ),
      );

      const itemGenreRows = genres
        .map((genre) => {
          const genreId = genreIdsBySourceId.get(genre.tmdbGenreId);
          if (!genreId) {
            return null;
          }
          return {
            item_id: itemId,
            genre_id: genreId,
          };
        })
        .filter(Boolean);

      if (itemGenreRows.length > 0) {
        const { error: insertItemGenresError } = await supabase
          .from("item_genres")
          .insert(itemGenreRows);

        if (insertItemGenresError) {
          throw new Error("Не вдалося зв’язати жанри з фільмом.");
        }
      }
    }
  }
};
