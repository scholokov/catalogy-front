import { buildGenreHref } from "@/lib/genres/routes";
import { normalizeGamePlatforms } from "@/lib/games/platforms";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildScopeBreakdownEntry,
  calculateMedian,
  deriveProfileInterpretation,
} from "./scopeReadiness";
import type { GameStatisticsPayload, GlobalSummary } from "../statisticsTypes";

const RELATED_QUERY_BATCH_SIZE = 200;

const logGameStatisticsDebug = (
  stage: string,
  details: Record<string, unknown>,
  error: unknown,
) => {
  console.error("[statistics:games]", stage, {
    ...details,
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : error,
  });
};

type RawStatsRow = {
  created_at: string | null;
  viewed_at: string | null;
  is_viewed: boolean | null;
  rating: number | null;
  view_percent: number | null;
  platforms: string[] | null;
  items:
    | {
        id?: string | null;
        title?: string | null;
        genres?: string | null;
        type?: string | null;
      }
    | Array<{
        id?: string | null;
        title?: string | null;
        genres?: string | null;
        type?: string | null;
      }>
    | null;
};

type GameStatsRow = {
  itemId: string | null;
  title: string;
  createdAt: string | null;
  viewedAt: string | null;
  isViewed: boolean;
  rating: number | null;
  viewPercent: number;
  platforms: string[];
  genres: string[];
  genreItems: Array<{
    source: "rawg" | "igdb";
    sourceGenreId: string;
    name: string;
  }>;
};

const HIGH_RATED_THRESHOLD = 4;
const LOW_RATED_THRESHOLD = 2;

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

const normalizeGenreLabelKey = (value: string) => value.trim().toLocaleLowerCase("uk-UA");

const isCompletedGame = (row: GameStatsRow) => row.isViewed && row.viewPercent >= 100;

const isDroppedGame = (row: GameStatsRow) => row.isViewed && row.viewPercent < 100;

const isTriedOnlyGame = (row: GameStatsRow) =>
  !row.isViewed && row.viewPercent > 0 && row.viewPercent < 100;

const isPlannedGame = (row: GameStatsRow) => !row.isViewed;

const isAddedInLast30Days = (row: GameStatsRow, now: Date) => {
  if (!row.createdAt) return false;
  const createdAt = new Date(row.createdAt);
  if (Number.isNaN(createdAt.getTime())) return false;
  return now.getTime() - createdAt.getTime() <= 30 * 24 * 60 * 60 * 1000;
};

const buildRankedEntries = (rows: GameStatsRow[], mode: "genres" | "platforms") => {
  const aggregate = new Map<
    string,
    { label: string; href?: string; value: number; itemCount: number }
  >();

  rows.forEach((row) => {
    const entries: Array<{ key: string; label: string; href?: string }> =
      mode === "genres"
        ? row.genreItems.length > 0
          ? row.genreItems.map((genre) => ({
              key: normalizeGenreLabelKey(genre.name),
              label: genre.name,
              href: buildGenreHref({
                mediaKind: "game",
                source: genre.source,
                sourceGenreId: genre.sourceGenreId,
              }),
            }))
          : row.genres.map((genre) => ({
              key: normalizeGenreLabelKey(genre),
              label: genre,
            }))
        : row.platforms.map((platform) => ({
            key: platform,
            label: platform,
          }));
    if (entries.length === 0) return;
    entries.forEach((entry) => {
      const current = aggregate.get(entry.key) ?? {
        label: entry.label,
        href: entry.href,
        value: 0,
        itemCount: 0,
      };
      aggregate.set(entry.key, {
        label: current.label,
        href: current.href ?? entry.href,
        value: current.value + 1,
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

const buildMonthlyEntries = (rows: GameStatsRow[]) => {
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

export async function loadGameStatistics(userId: string): Promise<GameStatisticsPayload> {
  const supabaseAdmin = getSupabaseAdmin();
  const pageSize = 1000;
  let from = 0;
  const collected: GameStatsRow[] = [];
  const gameGenreByName = new Map<
    string,
    {
      source: "rawg" | "igdb";
      sourceGenreId: string;
      name: string;
    }
  >();

  const { data: genreDictionaryRows, error: genreDictionaryError } = await supabaseAdmin
    .from("genres")
    .select("name, source, source_genre_id")
    .eq("media_kind", "game")
    .in("source", ["rawg", "igdb"]);

  if (genreDictionaryError) {
    logGameStatisticsDebug(
      "load-genre-dictionary",
      {
        userId,
      },
      genreDictionaryError,
    );
    throw new Error(
      genreDictionaryError.message || "Не вдалося завантажити словник жанрів ігор.",
    );
  }

  ((genreDictionaryRows ?? []) as Array<{
    name?: string | null;
    source?: string | null;
    source_genre_id?: string | null;
  }>)
    .sort((left, right) => {
      if (left.source === right.source) return 0;
      return left.source === "rawg" ? -1 : 1;
    })
    .forEach((row) => {
      if (
        (row.source !== "rawg" && row.source !== "igdb") ||
        !row.source_genre_id ||
        !row.name?.trim()
      ) {
        return;
      }

      const key = normalizeGenreLabelKey(row.name);
      if (gameGenreByName.has(key)) {
        return;
      }

      gameGenreByName.set(key, {
        source: row.source,
        sourceGenreId: row.source_genre_id,
        name: row.name.trim(),
      });
    });

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("user_views")
      .select(
        "created_at, viewed_at, is_viewed, rating, view_percent, platforms, items:items!inner(id, title, genres, type)",
      )
      .eq("user_id", userId)
      .eq("items.type", "game")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      logGameStatisticsDebug(
        "load-user-views",
        {
          userId,
          from,
          pageSize,
        },
        error,
      );
      throw new Error(error.message || "Не вдалося завантажити статистику ігор.");
    }

    const chunkRaw = (data ?? []) as RawStatsRow[];
    if (chunkRaw.length === 0) {
      break;
    }

    const itemIds = chunkRaw
      .map((row) => (Array.isArray(row.items) ? row.items[0]?.id : row.items?.id))
      .filter((itemId): itemId is string => Boolean(itemId));
    const genresByItemId = new Map<
      string,
      Array<{
        source: "rawg" | "igdb";
        sourceGenreId: string;
        name: string;
      }>
    >();

    if (itemIds.length > 0) {
      const allItemGenreRows: Array<{
        item_id?: string | null;
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
      }> = [];

      for (let offset = 0; offset < itemIds.length; offset += RELATED_QUERY_BATCH_SIZE) {
        const itemIdBatch = itemIds.slice(offset, offset + RELATED_QUERY_BATCH_SIZE);
        const { data: itemGenreRows, error: itemGenresError } = await supabaseAdmin
          .from("item_genres")
          .select("item_id, genres!inner(source, source_genre_id, name)")
          .in("item_id", itemIdBatch);

        if (itemGenresError) {
          logGameStatisticsDebug(
            "load-item-genres",
            {
              userId,
              from,
              pageSize,
              itemIdsCount: itemIds.length,
              batchSize: itemIdBatch.length,
              sampleItemIds: itemIdBatch.slice(0, 5),
            },
            itemGenresError,
          );
          throw new Error(itemGenresError.message || "Не вдалося завантажити жанри ігор.");
        }

        allItemGenreRows.push(
          ...((itemGenreRows ?? []) as Array<{
            item_id?: string | null;
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
          }>),
        );
      }

      allItemGenreRows.forEach((row) => {
        const itemId = row.item_id ?? null;
        const genre = Array.isArray(row.genres) ? row.genres[0] : row.genres;
        if (
          !itemId ||
          (genre?.source !== "rawg" && genre?.source !== "igdb") ||
          !genre.source_genre_id ||
          !genre.name
        ) {
          return;
        }
        const current = genresByItemId.get(itemId) ?? [];
        if (
          current.some(
            (entry) =>
              entry.source === genre.source &&
              entry.sourceGenreId === genre.source_genre_id,
          )
        ) {
          return;
        }
        current.push({
          source: genre.source,
          sourceGenreId: genre.source_genre_id,
          name: genre.name,
        });
        genresByItemId.set(itemId, current);
      });
    }

    const chunk = chunkRaw.map((row) => {
      const item = Array.isArray(row.items) ? row.items[0] : row.items;
      const itemId = item?.id?.trim() || null;
      const fallbackGenreItems = normalizeGenres(item?.genres)
        .map((genreName) => gameGenreByName.get(normalizeGenreLabelKey(genreName)) ?? null)
        .filter(
          (
            genre,
          ): genre is {
            source: "rawg" | "igdb";
            sourceGenreId: string;
            name: string;
          } => Boolean(genre),
        );

      return {
        itemId,
        title: item?.title?.trim() || "Без назви",
        createdAt: row.created_at,
        viewedAt: row.viewed_at,
        isViewed: Boolean(row.is_viewed),
        rating: row.rating,
        viewPercent: Math.max(0, Math.min(100, row.view_percent ?? 0)),
        platforms: normalizeGamePlatforms(row.platforms),
        genres: normalizeGenres(item?.genres),
        genreItems:
          itemId && (genresByItemId.get(itemId)?.length ?? 0) > 0
            ? genresByItemId.get(itemId) ?? []
            : fallbackGenreItems,
      };
    });

    collected.push(...chunk);
    if (chunkRaw.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  const now = new Date();
  const completedRows = collected.filter(isCompletedGame);
  const droppedRows = collected.filter(isDroppedGame);
  const plannedRows = collected.filter(isPlannedGame);
  const engagedRows = collected.filter(
    (row) => isCompletedGame(row) || isDroppedGame(row) || isTriedOnlyGame(row),
  );
  const ratedRows = collected.filter((row) => row.rating !== null);
  const addedLast30DaysRows = collected.filter((row) => isAddedInLast30Days(row, now));
  const summary: GlobalSummary = {
    totalTitles: collected.length,
    ratedTitles: ratedRows.length,
    engagedTitles: engagedRows.length,
    completedTitles: completedRows.length,
    droppedTitles: droppedRows.length,
    plannedTitles: plannedRows.length,
    addedLast30Days: addedLast30DaysRows.length,
    averageRating:
      ratedRows.length > 0
        ? ratedRows.reduce((sum, row) => sum + (row.rating ?? 0), 0) / ratedRows.length
        : null,
    medianRating: calculateMedian(
      ratedRows
        .map((row) => row.rating)
        .filter((rating): rating is number => rating !== null),
    ),
    numberOfWorkingScopes: 0,
    profileType: "insufficient",
    recommendationReadiness: "not_ready",
    defaultScope: null,
  };

  const platformBuckets = new Map<string, GameStatsRow[]>();
  collected.forEach((row) => {
    row.platforms.forEach((platform) => {
      const bucket = platformBuckets.get(platform);
      if (bucket) {
        bucket.push(row);
      } else {
        platformBuckets.set(platform, [row]);
      }
    });
  });

  const scopeEntries = Array.from(platformBuckets.entries())
    .map(([platform, platformRows]) => {
      const platformNow = new Date();
      const platformRatedRows = platformRows.filter((row) => row.rating !== null);
      const platformCompletedRows = platformRows.filter(isCompletedGame);
      const platformDroppedRows = platformRows.filter(isDroppedGame);
      const platformPlannedRows = platformRows.filter(isPlannedGame);
      const platformAddedLast30DaysRows = platformRows.filter((row) =>
        isAddedInLast30Days(row, platformNow),
      );
      const platformEngagedRows = platformRows.filter(
        (row) => isCompletedGame(row) || isDroppedGame(row) || isTriedOnlyGame(row),
      );
      const platformLikedRows = platformRows.filter(
        (row) => row.rating !== null && row.rating >= HIGH_RATED_THRESHOLD,
      );
      const platformDislikedRows = platformRows.filter(
        (row) => row.rating !== null && row.rating <= LOW_RATED_THRESHOLD,
      );

      return buildScopeBreakdownEntry({
        scopeType: "platform",
        scopeValue: platform,
        totalTitles: platformRows.length,
        ratedTitles: platformRatedRows.length,
        engagedTitles: platformEngagedRows.length,
        completedTitles: platformCompletedRows.length,
        droppedTitles: platformDroppedRows.length,
        plannedTitles: platformPlannedRows.length,
        addedLast30Days: platformAddedLast30DaysRows.length,
        ratings: platformRatedRows
          .map((row) => row.rating)
          .filter((rating): rating is number => rating !== null),
        highRatedCount: platformRatedRows.filter(
          (row) => row.rating !== null && row.rating >= HIGH_RATED_THRESHOLD,
        ).length,
        lowRatedCount: platformRatedRows.filter(
          (row) => row.rating !== null && row.rating <= LOW_RATED_THRESHOLD,
        ).length,
        topLikedGenres: buildRankedEntries(platformLikedRows, "genres"),
        topDislikedGenres: buildRankedEntries(platformDislikedRows, "genres"),
        topDroppedGenres: buildRankedEntries(platformDroppedRows, "genres"),
        monthlyEntries: buildMonthlyEntries(platformEngagedRows),
      });
    })
    .sort((left, right) => {
      const statusOrder = { working: 0, exploratory: 1, insufficient: 2 };
      const statusDiff = statusOrder[left.maturityStatus] - statusOrder[right.maturityStatus];
      if (statusDiff !== 0) return statusDiff;
      if (right.totalTitles !== left.totalTitles) return right.totalTitles - left.totalTitles;
      return left.scopeValue.localeCompare(right.scopeValue, "uk");
    });

  const interpretation = deriveProfileInterpretation("platform", scopeEntries);
  summary.numberOfWorkingScopes = interpretation.workingScopes.length;
  summary.profileType = interpretation.profileType;
  summary.recommendationReadiness = interpretation.recommendationReadiness;
  summary.defaultScope = interpretation.defaultScope;

  return {
    exportRows: collected.map((row) => ({
      title: row.title,
      platforms: row.platforms,
      viewPercent: row.viewPercent,
      rating: row.rating,
      viewedAt: row.viewedAt,
    })),
    summary,
    scopeEntries,
    interpretation,
  };
}
