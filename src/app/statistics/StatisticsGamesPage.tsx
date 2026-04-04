"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { downloadCsvFile } from "@/lib/csv/downloadCsv";
import { getCsvTimestamp } from "@/lib/csv/getCsvTimestamp";
import { buildGenreHref } from "@/lib/genres/routes";
import { normalizeGamePlatforms } from "@/lib/games/platforms";
import StatisticsMonthlyList from "./StatisticsMonthlyList";
import StatisticsRankedList from "./StatisticsRankedList";
import type {
  GlobalSummary,
} from "./statisticsTypes";
import {
  buildScopeBreakdownEntry,
  calculateMedian,
  deriveProfileInterpretation,
  formatNullableMetric,
} from "./lib/scopeReadiness";
import styles from "./StatisticsPage.module.css";

type StatisticsGamesPageProps = {
  onTotalChange: (count: number) => void;
  onExportReady?: (handler: (() => void) | null) => void;
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

const formatShare = (count: number, total: number) => {
  if (total <= 0) return "0%";
  return `${Math.round((count / total) * 100)}%`;
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

const normalizeGenreLabelKey = (value: string) => value.trim().toLocaleLowerCase("uk-UA");

const isCompletedGame = (row: GameStatsRow) => row.isViewed && row.viewPercent >= 100;

const isDroppedGame = (row: GameStatsRow) =>
  row.isViewed && row.viewPercent < 100;

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
  const aggregate = new Map<string, { label: string; href?: string; value: number; itemCount: number }>();

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

export default function StatisticsGamesPage({
  onTotalChange,
  onExportReady,
}: StatisticsGamesPageProps) {
  const [rows, setRows] = useState<GameStatsRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isCancelled = false;

    const loadStatistics = async () => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          if (!isCancelled) {
            setRows([]);
            onTotalChange(0);
            setErrorMessage("Потрібна авторизація.");
          }
          return;
        }

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

        const { data: genreDictionaryRows } = await supabase
          .from("genres")
          .select("name, source, source_genre_id")
          .eq("media_kind", "game")
          .in("source", ["rawg", "igdb"]);

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
          const { data, error } = await supabase
            .from("user_views")
            .select(
              "created_at, viewed_at, is_viewed, rating, view_percent, platforms, items:items!inner(id, title, genres, type)",
            )
            .eq("user_id", user.id)
            .eq("items.type", "game")
            .order("created_at", { ascending: false })
            .range(from, from + pageSize - 1);

          if (error) {
            if (!isCancelled) {
              setRows([]);
              onTotalChange(0);
              setErrorMessage("Не вдалося завантажити статистику ігор.");
            }
            return;
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
            const { data: itemGenreRows } = await supabase
              .from("item_genres")
              .select("item_id, genres!inner(source, source_genre_id, name)")
              .in("item_id", itemIds);

            ((itemGenreRows ?? []) as Array<{
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
            }>).forEach((row) => {
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

        if (!isCancelled) {
          setRows(collected);
          onTotalChange(collected.length);
        }
      } catch (error) {
        if (!isCancelled) {
          setRows([]);
          onTotalChange(0);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Не вдалося завантажити статистику ігор.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadStatistics();

    return () => {
      isCancelled = true;
    };
  }, [onTotalChange]);

  const statistics = useMemo(() => {
    const now = new Date();
    const completedRows = rows.filter(isCompletedGame);
    const droppedRows = rows.filter(isDroppedGame);
    const plannedRows = rows.filter(isPlannedGame);
    const engagedRows = rows.filter(
      (row) => isCompletedGame(row) || isDroppedGame(row) || isTriedOnlyGame(row),
    );
    const ratedRows = rows.filter((row) => row.rating !== null);
    const addedLast30DaysRows = rows.filter((row) => isAddedInLast30Days(row, now));
    const summary: GlobalSummary = {
      totalTitles: rows.length,
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
    rows.forEach((row) => {
      row.platforms.forEach((platform) => {
        const bucket = platformBuckets.get(platform);
        if (bucket) {
          bucket.push(row);
        } else {
          platformBuckets.set(platform, [row]);
        }
      });
    });

    const platformEntries = Array.from(platformBuckets.entries())
      .map(([platform, platformRows]) => {
        const now = new Date();
        const platformRatedRows = platformRows.filter((row) => row.rating !== null);
        const platformCompletedRows = platformRows.filter(isCompletedGame);
        const platformDroppedRows = platformRows.filter(isDroppedGame);
        const platformPlannedRows = platformRows.filter(isPlannedGame);
        const platformAddedLast30DaysRows = platformRows.filter((row) =>
          isAddedInLast30Days(row, now),
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

    const interpretation = deriveProfileInterpretation("platform", platformEntries);
    summary.numberOfWorkingScopes = interpretation.workingScopes.length;
    summary.profileType = interpretation.profileType;
    summary.recommendationReadiness = interpretation.recommendationReadiness;
    summary.defaultScope = interpretation.defaultScope;

    return {
      summary,
      scopeEntries: platformEntries,
      interpretation,
    };
  }, [rows]);

  const handleExportCsv = useCallback(() => {
    if (rows.length === 0) {
      return;
    }
    const csvHeaders = [
      "Назва",
      "Платформа",
      "Переглянуто у відсотках",
      "Особистий рейтинг",
      "Дата перегляду",
    ];

    const rowsForCsv = rows.map((row) => [
      row.title,
      row.platforms.join("; "),
      String(row.viewPercent),
      row.rating == null ? "" : String(row.rating),
      row.viewedAt ? row.viewedAt.slice(0, 10) : "",
    ]);

    downloadCsvFile(
      `games_export_${getCsvTimestamp()}.csv`,
      csvHeaders,
      rowsForCsv,
    );
  }, [rows]);

  useEffect(() => {
    onExportReady?.(rows.length > 0 ? handleExportCsv : null);
    return () => onExportReady?.(null);
  }, [handleExportCsv, onExportReady, rows.length]);

  if (isLoading) {
    return <p className={styles.message}>Завантаження статистики ігор…</p>;
  }

  if (errorMessage) {
    return <p className={styles.message}>{errorMessage}</p>;
  }

  if (statistics.summary.totalTitles === 0) {
    return <p className={styles.message}>Додайте ігри до бібліотеки, щоб побачити статистику.</p>;
  }

  const platformGroups = [
    {
      title: "Для рекомендацій",
      entries: statistics.scopeEntries.filter((entry) => entry.maturityStatus === "working"),
    },
    {
      title: "Попередній профіль",
      entries: statistics.scopeEntries.filter((entry) => entry.maturityStatus === "exploratory"),
    },
    {
      title: "Недостатньо даних",
      entries: statistics.scopeEntries.filter((entry) => entry.maturityStatus === "insufficient"),
    },
  ].filter((group) => group.entries.length > 0);

  return (
    <div className={styles.content}>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Усього</span>
          <strong className={styles.kpiValue}>{statistics.summary.totalTitles}</strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Частково зіграно</span>
          <strong className={styles.kpiValue}>
            {statistics.summary.droppedTitles}{" "}
            <span className={styles.kpiValueMuted}>
              ({formatShare(statistics.summary.droppedTitles, statistics.summary.totalTitles)})
            </span>
          </strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Повністю зіграно</span>
          <strong className={styles.kpiValue}>
            {statistics.summary.completedTitles}{" "}
            <span className={styles.kpiValueMuted}>
              ({formatShare(statistics.summary.completedTitles, statistics.summary.totalTitles)})
            </span>
          </strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Не зіграно</span>
          <strong className={styles.kpiValue}>
            {statistics.summary.plannedTitles}{" "}
            <span className={styles.kpiValueMuted}>
              ({formatShare(statistics.summary.plannedTitles, statistics.summary.totalTitles)})
            </span>
          </strong>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardWide}`}>
          <span className={styles.kpiLabel}>Середня оцінка</span>
          <strong className={styles.kpiValue}>
            {formatNullableMetric(statistics.summary.averageRating)}
          </strong>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardWide}`}>
          <span className={styles.kpiLabel}>Додано за 30 днів</span>
          <strong className={styles.kpiValue}>{statistics.summary.addedLast30Days}</strong>
        </div>
      </div>

      <div className={styles.sectionGrid}>
        <section className={`${styles.section} ${styles.sectionFull}`}>
          {platformGroups.length === 0 ? (
            <div className={styles.emptyBox}>
              Додайте платформи до ігор, щоб сформувати шар зрілості платформ.
            </div>
          ) : (
            <div className={styles.list}>
              {platformGroups.map((group) => (
                group.entries.map((entry) => (
                  <details
                    key={entry.scopeValue}
                    className={styles.nestedCard}
                    open={entry.maturityStatus === "working"}
                  >
                    <summary className={styles.accordionSummary}>
                      <span className={styles.accordionSummaryInner}>
                        <h3 className={styles.nestedTitle}>{entry.scopeValue}</h3>
                        {entry.maturityStatus === "insufficient" ? (
                          <span className={styles.accordionMeta}>Недостатньо даних</span>
                        ) : null}
                      </span>
                    </summary>
                    <div className={styles.accordionContent}>
                    <div className={styles.kpiGridCompact}>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Усього</span>
                        <strong className={styles.kpiValue}>{entry.totalTitles}</strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Частково зіграно</span>
                        <strong className={styles.kpiValue}>
                          {entry.droppedTitles}{" "}
                          <span className={styles.kpiValueMuted}>
                            ({formatShare(entry.droppedTitles, entry.totalTitles)})
                          </span>
                        </strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Не зіграно</span>
                        <strong className={styles.kpiValue}>
                          {entry.plannedTitles}{" "}
                          <span className={styles.kpiValueMuted}>
                            ({formatShare(entry.plannedTitles, entry.totalTitles)})
                          </span>
                        </strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Повністю зіграно</span>
                        <strong className={styles.kpiValue}>
                          {entry.completedTitles}{" "}
                          <span className={styles.kpiValueMuted}>
                            ({formatShare(entry.completedTitles, entry.totalTitles)})
                          </span>
                        </strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Середня оцінка</span>
                        <strong className={styles.kpiValue}>
                          {formatNullableMetric(entry.averageRating)}
                        </strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Додано за 30 днів</span>
                        <strong className={styles.kpiValue}>{entry.addedLast30Days}</strong>
                      </div>
                    </div>
                    <div className={styles.statsBlocksGrid}>
                      {entry.topLikedGenres.length > 0 ? (
                        <section className={styles.section}>
                          <h3 className={styles.sectionTitle}>Топ жанрів, які сподобались</h3>
                          <StatisticsRankedList
                            entries={entry.topLikedGenres}
                            valueLabel="games"
                            emptyMessage="Недостатньо даних."
                          />
                        </section>
                      ) : null}
                      {entry.topDislikedGenres.length > 0 ? (
                        <section className={styles.section}>
                          <h3 className={styles.sectionTitle}>Топ жанрів, які не зайшли</h3>
                          <StatisticsRankedList
                            entries={entry.topDislikedGenres}
                            valueLabel="games"
                            emptyMessage="Недостатньо даних."
                          />
                        </section>
                      ) : null}
                      {entry.topDroppedGenres.length > 0 ? (
                        <section className={styles.section}>
                          <h3 className={styles.sectionTitle}>Топ жанрів, які покинуто</h3>
                          <StatisticsRankedList
                            entries={entry.topDroppedGenres}
                            valueLabel="games"
                            emptyMessage="Недостатньо даних."
                          />
                        </section>
                      ) : null}
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Перегляди по місяцях</h3>
                        <StatisticsMonthlyList
                          entries={entry.monthlyEntries}
                          itemLabel="games"
                          initialLimit={5}
                        />
                      </section>
                    </div>
                    {entry.topLikedGenres.length === 0 &&
                    entry.topDislikedGenres.length === 0 &&
                    entry.topDroppedGenres.length === 0 ? (
                      <div className={styles.emptyBox}>Недостатньо даних по жанрах для цієї платформи.</div>
                    ) : null}
                    </div>
                  </details>
                ))
              ))}
            </div>
          )}
        </section>

        <section className={`${styles.section} ${styles.sectionFull}`}>
          <details>
            <summary className={styles.sectionTitle}>Пояснення</summary>
            <div className={styles.list}>
              <p className={styles.sectionText}>
                Платформа вважається готовою для рекомендацій лише тоді, коли по ній уже є
                достатньо історії: щонайменше 50 ігор, 20 оцінених ігор і 15 зіграних ігор.
              </p>
              <p className={styles.sectionText}>
                Якщо платформа ще не дотягує до цих порогів, вона не вважається придатною для
                рекомендацій.
              </p>
              <p className={styles.sectionText}>
                «Попередній профіль» використовується, коли даних уже чимало, але їх ще замало для
                стабільних рекомендацій.
              </p>
              <p className={styles.sectionText}>
                «Недостатньо даних» означає, що для цієї платформи поки замало зіграних або
                оцінених ігор, щоб робити надійні висновки.
              </p>
              <p className={styles.sectionText}>
                Основна платформа обирається так: спершу за кількістю ігор, які ти пробував, потім за кількістю оцінених ігор, а потім за загальною кількістю ігор.
              </p>
              <p className={styles.sectionText}>
                Платформи для рекомендацій:{" "}
                {statistics.interpretation.recommendationValidScopes.length > 0
                  ? statistics.interpretation.recommendationValidScopes.join(", ")
                  : "немає"}
              </p>
              <p className={styles.sectionText}>
                Попередній профіль:{" "}
                {statistics.interpretation.exploratoryScopes.length > 0
                  ? statistics.interpretation.exploratoryScopes.join(", ")
                  : "немає"}
              </p>
              <p className={styles.sectionText}>
                Недостатньо даних:{" "}
                {statistics.interpretation.insufficientScopes.length > 0
                  ? statistics.interpretation.insufficientScopes.join(", ")
                  : "немає"}
              </p>
              <p className={styles.sectionText}>
                Ручний вибір платформи:{" "}
                {statistics.interpretation.manualScopeSelectionRequired ? "доступний" : "не потрібен"}
              </p>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
