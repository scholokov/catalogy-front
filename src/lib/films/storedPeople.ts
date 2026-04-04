import type { SupabaseClient } from "@supabase/supabase-js";
import type { FilmNormalizedPerson } from "@/lib/films/normalizedMetadata";

export const loadStoredPeopleForItem = async (
  supabase: SupabaseClient,
  itemId: string,
): Promise<FilmNormalizedPerson[]> => {
  const { data, error } = await supabase
    .from("item_people")
    .select(
      "role_kind, credit_group, department, job, character_name, credit_order, is_primary, people!inner(source_person_id, name, name_original, profile_url)",
    )
    .eq("item_id", itemId)
    .order("credit_order", { ascending: true });

  if (error) {
    return [] as FilmNormalizedPerson[];
  }

  const mappedPeople: Array<FilmNormalizedPerson | null> = ((data ?? []) as Array<{
    role_kind: "actor" | "director" | "writer" | "producer";
    credit_group: "cast" | "crew";
    department?: string | null;
    job?: string | null;
    character_name?: string | null;
    credit_order?: number | null;
    is_primary?: boolean | null;
    people:
      | {
          source_person_id?: string;
          name?: string;
          name_original?: string | null;
          profile_url?: string | null;
        }
      | Array<{
          source_person_id?: string;
          name?: string;
          name_original?: string | null;
          profile_url?: string | null;
        }>;
  }>)
    .map((row) => {
      const person = Array.isArray(row.people) ? row.people[0] : row.people;
      if (!person?.source_person_id || !person.name) {
        return null;
      }
      return {
        tmdbPersonId: person.source_person_id,
        name: person.name,
        originalName: person.name_original ?? person.name,
        roleKind: row.role_kind,
        creditGroup: row.credit_group,
        department: row.department ?? null,
        job: row.job ?? null,
        characterName: row.character_name ?? null,
        creditOrder: row.credit_order ?? null,
        isPrimary: Boolean(row.is_primary),
        profileUrl: person.profile_url ?? null,
      };
    });

  return mappedPeople.filter((person): person is FilmNormalizedPerson => Boolean(person));
};
