import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deriveScopeMaturityStatus } from "./scopeReadiness";
import type {
  FilmMediaType,
  FilmScopeStats,
  FilmStatisticsPayload,
} from "../statisticsTypes";

const RELATED_QUERY_BATCH_SIZE = 200;

type RawStatsRow = {
  created_at: string | null;
  viewed_at: string | null;
  is_viewed: boolean | null;
  rating: number | null;
  view_percent: number | null;
  items:
    | {
        id?: string | null;
        title?: string | null;
        genres?: string | null;
        director?: string | null;
        actors?: string | null;
        film_media_type?: "movie" | "tv" | null;
        type?: string | null;
      }
    | Array<{
        id?: string | null;
        title?: string | null;
        genres?: string | null;
        director?: string | null;
        actors?: string | null;
        film_media_type?: "movie" | "tv" | null;
        type?: string | null;
      }>
    | null;
};

type FilmStatsRow = {
  itemId: string | null;
  title: string;
  createdAt: string | null;
  viewedAt: string | null;
  isViewed: boolean;
  rating: number | null;
  viewPercent: number;
  mediaType: FilmMediaType;
  genres: string[];
  genreItems: Array<{
    genreId: string;
    name: string;
  }>;
  director: string | null;
  actors: string[];
  people: Array<{
    tmdbPersonId: string;
    name: string;
    roleKind: "actor" | "director" | "writer";
    creditOrder: number | null;
  }>;
};

const normalizeGenres = (value?: string | null) => {
  if (!value) return [];
  const unique = new Set<string>();
  return value
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean)
    .filter((genre) => {
      if (unique.has(genre)) return false;
      unique.add(genre);
      return true;
    });
};

const normalizeDirector = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const normalizeActors = (value?: string | null) => {
  if (!value) return [];
  const unique = new Set<string>();
  return value
    .split(",")
    .map((actor) => actor.trim())
    .filter(Boolean)
    .filter((actor) => {
      if (unique.has(actor)) return false;
      unique.add(actor);
      return true;
    });
};

const normalizeFilmMediaType = (value?: string | null): FilmMediaType => {
  if (value === "tv") return "tv";
  return "movie";
};

const getFilmScopeLabel = (mediaType: FilmMediaType) =>
  mediaType === "tv" ? "Серіали" : "Кіно";

const isCompletedFilm = (row: FilmStatsRow) => row.isViewed && row.viewPercent >= 100;

const isPartialViewedFilm = (row: FilmStatsRow) => row.isViewed && row.viewPercent < 100;

const isPlannedFilm = (row: FilmStatsRow) => !row.isViewed;

const isAddedInLast30Days = (row: FilmStatsRow, now: Date) => {
  if (!row.createdAt) return false;
  const createdAt = new Date(row.createdAt);
  if (Number.isNaN(createdAt.getTime())) return false;
  return now.getTime() - createdAt.getTime() <= 30 * 24 * 60 * 60 * 1000;
};

const getPreferenceWeight = (rating: number | null) => {
  if (rating === null || rating < 3) return 0;
  if (rating === 3) return 1;
  if (rating === 3.5) return 3;
  if (rating === 4) return 9;
  if (rating === 4.5) return 27;
  if (rating === 5) return 81;
  return 0;
};

const getDislikeWeight = (rating: number | null) => {
  if (rating === null || rating >= 3) return 0;
  if (rating === 2.5) return 1;
  if (rating === 2) return 3;
  if (rating === 1.5) return 9;
  if (rating === 1) return 27;
  if (rating === 0.5) return 81;
  return 0;
};

const buildCanonicalPersonHrefMap = (
  rows: FilmStatsRow[],
  roleKind: "actor" | "director" | "writer",
) => {
  const countsByLabel = new Map<string, Map<string, number>>();

  rows.forEach((row) => {
    row.people
      .filter((person) => person.roleKind === roleKind)
      .forEach((person) => {
        const normalizedLabel = person.name.trim().toLocaleLowerCase("uk-UA");
        if (!normalizedLabel || !person.tmdbPersonId.trim()) {
          return;
        }

        const countsForLabel = countsByLabel.get(normalizedLabel) ?? new Map<string, number>();
        countsForLabel.set(
          person.tmdbPersonId,
          (countsForLabel.get(person.tmdbPersonId) ?? 0) + 1,
        );
        countsByLabel.set(normalizedLabel, countsForLabel);
      });
  });

  const hrefByLabel = new Map<string, string>();
  countsByLabel.forEach((countsForLabel, normalizedLabel) => {
    const preferredPersonId = Array.from(countsForLabel.entries())
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }
        return left[0].localeCompare(right[0], "uk");
      })[0]?.[0];

    if (preferredPersonId) {
      hrefByLabel.set(normalizedLabel, `/people/${preferredPersonId}`);
    }
  });

  return hrefByLabel;
};

const buildRankedEntries = (
  rows: FilmStatsRow[],
  mode: "genres" | "directors" | "writers" | "actors",
  scoreMode: "viewed" | "liked" | "disliked",
  canonicalPersonHrefByLabel?: Map<string, string>,
) => {
  type RankedAggregateEntry = {
    key: string;
    label: string;
    href?: string;
  };

  const aggregate = new Map<
    string,
    { key: string; label: string; href?: string; value: number; itemCount: number }
  >();
  const personLabelKeys = new Map<string, string>();

  rows.forEach((row) => {
    const increment =
      scoreMode === "liked"
        ? getPreferenceWeight(row.rating)
        : scoreMode === "disliked"
          ? getDislikeWeight(row.rating)
          : 1;
    if (scoreMode !== "viewed" && increment <= 0) return;

    const entries: RankedAggregateEntry[] =
      mode === "genres"
        ? row.genreItems.length > 0
          ? row.genreItems.map((genre) => ({
              key: genre.genreId,
              label: genre.name,
              href: `/genres/${genre.genreId}`,
            }))
          : row.genres.map((label) => ({
              key: label,
              label,
            }))
        : (mode === "actors"
            ? row.people.filter((person) => person.roleKind === "actor")
            : mode === "writers"
              ? row.people.filter((person) => person.roleKind === "writer")
              : row.people.filter((person) => person.roleKind === "director")
          ).map((person) => ({
            key: person.tmdbPersonId,
            label: person.name,
            href:
              canonicalPersonHrefByLabel?.get(
                person.name.trim().toLocaleLowerCase("uk-UA"),
              ) ?? `/people/${person.tmdbPersonId}`,
          }));

    if (entries.length === 0) {
      const fallbackEntries: RankedAggregateEntry[] =
        mode === "actors"
          ? row.actors.map((label) => ({ key: label, label }))
          : mode === "directors"
            ? row.director
              ? [{ key: row.director, label: row.director }]
              : []
            : [];

      fallbackEntries.forEach((entry) => {
        const normalizedLabel = entry.label.trim().toLocaleLowerCase("uk-UA");
        const aggregateKey =
          mode === "genres"
            ? entry.key
            : personLabelKeys.get(normalizedLabel) ?? `person-label:${normalizedLabel}`;
        if (mode !== "genres" && !personLabelKeys.has(normalizedLabel)) {
          personLabelKeys.set(normalizedLabel, aggregateKey);
        }
        const current = aggregate.get(aggregateKey) ?? {
          ...entry,
          key: aggregateKey,
          value: 0,
          itemCount: 0,
        };
        aggregate.set(aggregateKey, {
          ...current,
          value: current.value + increment,
          itemCount: current.itemCount + 1,
        });
      });
      return;
    }

    entries.forEach((entry) => {
      const normalizedLabel = entry.label.trim().toLocaleLowerCase("uk-UA");
      const aggregateKey =
        mode === "genres"
          ? entry.key
          : personLabelKeys.get(normalizedLabel) ?? entry.key;
      if (mode !== "genres" && !personLabelKeys.has(normalizedLabel)) {
        personLabelKeys.set(normalizedLabel, aggregateKey);
      }
      const current = aggregate.get(aggregateKey) ?? {
        ...entry,
        key: aggregateKey,
        value: 0,
        itemCount: 0,
      };
      aggregate.set(aggregateKey, {
        ...current,
        href: current.href ?? entry.href,
        value: current.value + increment,
        itemCount: current.itemCount + 1,
      });
    });
  });

  return Array.from(aggregate.entries())
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      href: entry.href,
      value: entry.value,
      itemCount: entry.itemCount,
    }))
    .sort((left, right) => {
      if (right.value !== left.value) return right.value - left.value;
      if (right.itemCount !== left.itemCount) return right.itemCount - left.itemCount;
      return left.label.localeCompare(right.label, "uk");
    })
    .slice(0, 5);
};

const buildMonthlyEntries = (rows: FilmStatsRow[]) => {
  const aggregate = new Map<string, number>();
  rows.forEach((row) => {
    if (!row.viewedAt) return;
    const date = new Date(row.viewedAt);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    aggregate.set(key, (aggregate.get(key) ?? 0) + 1);
  });

  return Array.from(aggregate.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, count]) => {
      const date = new Date(`${key}-01T00:00:00Z`);
      return {
        key,
        count,
        label: new Intl.DateTimeFormat("uk-UA", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(date),
      };
    });
};

const buildScopeStats = (rows: FilmStatsRow[], mediaType: FilmMediaType): FilmScopeStats => {
  const now = new Date();
  const completedRows = rows.filter(isCompletedFilm);
  const partialRows = rows.filter(isPartialViewedFilm);
  const plannedRows = rows.filter(isPlannedFilm);
  const ratedRows = rows.filter((row) => row.rating !== null);
  const addedLast30DaysRows = rows.filter((row) => isAddedInLast30Days(row, now));
  const engagedRows = rows.filter((row) => row.isViewed);
  const canonicalActorHrefByLabel = buildCanonicalPersonHrefMap(rows, "actor");
  const canonicalDirectorHrefByLabel = buildCanonicalPersonHrefMap(rows, "director");
  const canonicalWriterHrefByLabel = buildCanonicalPersonHrefMap(rows, "writer");
  const maturityStatus = deriveScopeMaturityStatus({
    totalTitles: rows.length,
    ratedTitles: ratedRows.length,
    engagedTitles: engagedRows.length,
    plannedTitles: plannedRows.length,
  });

  return {
    mediaType,
    label: getFilmScopeLabel(mediaType),
    totalTitles: rows.length,
    ratedTitles: ratedRows.length,
    engagedTitles: engagedRows.length,
    watchedTitles: engagedRows.length,
    completedTitles: completedRows.length,
    partialTitles: partialRows.length,
    plannedTitles: plannedRows.length,
    addedLast30Days: addedLast30DaysRows.length,
    maturityStatus,
    recommendationEligible: maturityStatus === "working",
    averageRating:
      ratedRows.length > 0
        ? ratedRows.reduce((sum, row) => sum + (row.rating ?? 0), 0) / ratedRows.length
        : null,
    topLikedGenres: buildRankedEntries(rows, "genres", "liked"),
    topDislikedGenres: buildRankedEntries(rows, "genres", "disliked"),
    topDroppedGenres: buildRankedEntries(partialRows, "genres", "viewed"),
    topLikedDirectors: buildRankedEntries(
      rows,
      "directors",
      "liked",
      canonicalDirectorHrefByLabel,
    ),
    topDislikedDirectors: buildRankedEntries(
      rows,
      "directors",
      "disliked",
      canonicalDirectorHrefByLabel,
    ),
    topDroppedDirectors: buildRankedEntries(
      partialRows,
      "directors",
      "viewed",
      canonicalDirectorHrefByLabel,
    ),
    topLikedWriters: buildRankedEntries(rows, "writers", "liked", canonicalWriterHrefByLabel),
    topDislikedWriters: buildRankedEntries(
      rows,
      "writers",
      "disliked",
      canonicalWriterHrefByLabel,
    ),
    topDroppedWriters: buildRankedEntries(
      partialRows,
      "writers",
      "viewed",
      canonicalWriterHrefByLabel,
    ),
    topLikedActors: buildRankedEntries(rows, "actors", "liked", canonicalActorHrefByLabel),
    topDislikedActors: buildRankedEntries(
      rows,
      "actors",
      "disliked",
      canonicalActorHrefByLabel,
    ),
    topDroppedActors: buildRankedEntries(
      partialRows,
      "actors",
      "viewed",
      canonicalActorHrefByLabel,
    ),
    monthlyEntries: buildMonthlyEntries(rows.filter((row) => row.isViewed)),
  };
};

export async function loadFilmStatistics(userId: string): Promise<FilmStatisticsPayload> {
  const supabaseAdmin = getSupabaseAdmin();
  const pageSize = 1000;
  let from = 0;
  const collected: FilmStatsRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("user_views")
      .select(
        "created_at, viewed_at, is_viewed, rating, view_percent, items:items!inner(id, title, genres, director, actors, film_media_type, type)",
      )
      .eq("user_id", userId)
      .eq("items.type", "film")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message || "Не вдалося завантажити статистику.");
    }

    const chunkRaw = (data ?? []) as RawStatsRow[];
    if (chunkRaw.length === 0) {
      break;
    }

    const itemIds = chunkRaw
      .map((row) => (Array.isArray(row.items) ? row.items[0]?.id : row.items?.id))
      .filter((itemId): itemId is string => Boolean(itemId));
    const peopleByItemId = new Map<
      string,
      Array<{
        tmdbPersonId: string;
        name: string;
        roleKind: "actor" | "director" | "writer";
        creditOrder: number | null;
      }>
    >();
    const genresByItemId = new Map<
      string,
      Array<{
        genreId: string;
        name: string;
      }>
    >();

    if (itemIds.length > 0) {
      const allItemPeopleRows: Array<{
        item_id?: string | null;
        role_kind?: "actor" | "director" | "writer" | null;
        credit_order?: number | null;
        people:
          | {
              source_person_id?: string | null;
              name?: string | null;
            }
          | Array<{
              source_person_id?: string | null;
              name?: string | null;
            }>;
      }> = [];
      const allItemGenreRows: Array<{
        item_id?: string | null;
        genres:
          | {
              source_genre_id?: string | null;
              name?: string | null;
            }
          | Array<{
              source_genre_id?: string | null;
              name?: string | null;
            }>;
      }> = [];

      for (let offset = 0; offset < itemIds.length; offset += RELATED_QUERY_BATCH_SIZE) {
        const itemIdBatch = itemIds.slice(offset, offset + RELATED_QUERY_BATCH_SIZE);
        const [{ data: itemPeopleRows, error: itemPeopleError }, { data: itemGenreRows, error: itemGenresError }] =
          await Promise.all([
            supabaseAdmin
              .from("item_people")
              .select("item_id, role_kind, credit_order, people!inner(source_person_id, name)")
              .in("item_id", itemIdBatch)
              .in("role_kind", ["actor", "director", "writer"])
              .order("credit_order", { ascending: true }),
            supabaseAdmin
              .from("item_genres")
              .select("item_id, genres!inner(source_genre_id, name)")
              .in("item_id", itemIdBatch),
          ]);

        if (itemPeopleError) {
          throw new Error(itemPeopleError.message || "Не вдалося завантажити людей для статистики.");
        }

        if (itemGenresError) {
          throw new Error(itemGenresError.message || "Не вдалося завантажити жанри для статистики.");
        }

        allItemPeopleRows.push(
          ...((itemPeopleRows ?? []) as Array<{
            item_id?: string | null;
            role_kind?: "actor" | "director" | "writer" | null;
            credit_order?: number | null;
            people:
              | {
                  source_person_id?: string | null;
                  name?: string | null;
                }
              | Array<{
                  source_person_id?: string | null;
                  name?: string | null;
                }>;
          }>),
        );
        allItemGenreRows.push(
          ...((itemGenreRows ?? []) as Array<{
            item_id?: string | null;
            genres:
              | {
                  source_genre_id?: string | null;
                  name?: string | null;
                }
              | Array<{
                  source_genre_id?: string | null;
                  name?: string | null;
                }>;
          }>),
        );
      }

      allItemPeopleRows.forEach((row) => {
        const itemId = row.item_id ?? null;
        const person = Array.isArray(row.people) ? row.people[0] : row.people;

        if (
          !itemId ||
          !person?.source_person_id ||
          !person.name ||
          (row.role_kind !== "actor" &&
            row.role_kind !== "director" &&
            row.role_kind !== "writer")
        ) {
          return;
        }

        const current = peopleByItemId.get(itemId) ?? [];
        current.push({
          tmdbPersonId: person.source_person_id,
          name: person.name,
          roleKind: row.role_kind,
          creditOrder: row.credit_order ?? null,
        });
        peopleByItemId.set(itemId, current);
      });

      allItemGenreRows.forEach((row) => {
        const itemId = row.item_id ?? null;
        const genre = Array.isArray(row.genres) ? row.genres[0] : row.genres;

        if (!itemId || !genre?.source_genre_id || !genre.name) {
          return;
        }

        const current = genresByItemId.get(itemId) ?? [];
        if (current.some((entry) => entry.genreId === genre.source_genre_id)) {
          return;
        }
        current.push({
          genreId: genre.source_genre_id,
          name: genre.name,
        });
        genresByItemId.set(itemId, current);
      });
    }

    const chunk = chunkRaw.map((row) => {
      const item = Array.isArray(row.items) ? row.items[0] : row.items;
      const director = normalizeDirector(item?.director);
      const itemId = item?.id?.trim() || null;
      const people = itemId ? peopleByItemId.get(itemId) ?? [] : [];
      const genreItems = itemId ? genresByItemId.get(itemId) ?? [] : [];
      const sortedPeople = [...people].sort((left, right) => {
        const leftOrder = left.creditOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.creditOrder ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      });
      const directorNames = sortedPeople
        .filter((person) => person.roleKind === "director")
        .map((person) => person.name);
      const actorNames = sortedPeople
        .filter((person) => person.roleKind === "actor")
        .map((person) => person.name);

      return {
        itemId,
        title: item?.title?.trim() || "Без назви",
        createdAt: row.created_at,
        viewedAt: row.viewed_at,
        isViewed: Boolean(row.is_viewed),
        rating: row.rating,
        viewPercent: Math.max(0, Math.min(100, row.view_percent ?? 0)),
        mediaType: normalizeFilmMediaType(item?.film_media_type),
        genres: normalizeGenres(item?.genres),
        genreItems,
        director: directorNames[0] ?? director,
        actors: actorNames.length > 0 ? actorNames : normalizeActors(item?.actors),
        people: sortedPeople,
      };
    });

    collected.push(...chunk);
    if (chunkRaw.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  const now = new Date();
  const completedRows = collected.filter(isCompletedFilm);
  const partialRows = collected.filter(isPartialViewedFilm);
  const plannedRows = collected.filter(isPlannedFilm);
  const ratedRows = collected.filter((row) => row.rating !== null);
  const addedLast30DaysRows = collected.filter((row) => isAddedInLast30Days(row, now));

  return {
    exportRows: collected.map((row) => ({
      title: row.title,
      director: row.director,
      viewPercent: row.viewPercent,
      rating: row.rating,
      viewedAt: row.viewedAt,
    })),
    summary: {
      totalTitles: collected.length,
      watchedTitles: collected.filter((row) => row.isViewed).length,
      completedTitles: completedRows.length,
      partialTitles: partialRows.length,
      plannedTitles: plannedRows.length,
      addedLast30Days: addedLast30DaysRows.length,
      averageRating:
        ratedRows.length > 0
          ? ratedRows.reduce((sum, row) => sum + (row.rating ?? 0), 0) / ratedRows.length
          : null,
    },
    scopeEntries: (["movie", "tv"] as FilmMediaType[])
      .map((mediaType) =>
        buildScopeStats(
          collected.filter((row) => row.mediaType === mediaType),
          mediaType,
        ),
      )
      .filter((entry) => entry.totalTitles > 0),
  };
}
