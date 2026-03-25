"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { downloadCsvFile } from "@/lib/csv/downloadCsv";
import { getCsvTimestamp } from "@/lib/csv/getCsvTimestamp";
import StatisticsMonthlyList from "./StatisticsMonthlyList";
import StatisticsRankedList from "./StatisticsRankedList";
import styles from "./StatisticsPage.module.css";

type StatisticsGamesPageProps = {
  onTotalChange: (count: number) => void;
  onExportReady?: (handler: (() => void) | null) => void;
};

type RawStatsRow = {
  viewed_at: string | null;
  is_viewed: boolean | null;
  rating: number | null;
  view_percent: number | null;
  platforms: string[] | null;
  items:
    | {
        title?: string | null;
        genres?: string | null;
        type?: string | null;
      }
    | Array<{
        title?: string | null;
        genres?: string | null;
        type?: string | null;
      }>
    | null;
};

type GameStatsRow = {
  title: string;
  viewedAt: string | null;
  isViewed: boolean;
  rating: number | null;
  viewPercent: number;
  platforms: string[];
  genres: string[];
};

const formatAverageRating = (value: number | null) => {
  if (value === null) return "—";
  return value.toFixed(2);
};

const formatPercent = (value: number | null) => {
  if (value === null) return "—";
  return `${value.toFixed(0)}%`;
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

const normalizePlatforms = (value?: string[] | null) => {
  if (!value) return [];
  const unique = new Set<string>();
  return value
    .map((platform) => platform.trim())
    .filter(Boolean)
    .filter((platform) => {
      if (unique.has(platform)) return false;
      unique.add(platform);
      return true;
    });
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

const buildRankedEntries = (
  rows: GameStatsRow[],
  mode: "genres" | "platforms",
  scoreMode: "viewed" | "liked",
) => {
  const aggregate = new Map<string, { value: number; itemCount: number }>();

  rows.forEach((row) => {
    const labels = mode === "genres" ? row.genres : row.platforms;
    if (labels.length === 0) return;
    const increment = scoreMode === "liked" ? getPreferenceWeight(row.rating) : 1;
    if (scoreMode === "liked" && increment <= 0) return;
    labels.forEach((label) => {
      const current = aggregate.get(label) ?? { value: 0, itemCount: 0 };
      aggregate.set(label, {
        value: current.value + increment,
        itemCount: current.itemCount + 1,
      });
    });
  });

  return Array.from(aggregate.entries())
    .map(([label, entry]) => ({
      label,
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

const buildPlatformGenrePreferences = (rows: GameStatsRow[]) => {
  const platformGenreMap = new Map<string, Map<string, { value: number; itemCount: number }>>();

  rows.forEach((row) => {
    const increment = getPreferenceWeight(row.rating);
    if (increment <= 0 || row.platforms.length === 0 || row.genres.length === 0) {
      return;
    }

    row.platforms.forEach((platform) => {
      const genreMap = platformGenreMap.get(platform) ?? new Map<string, { value: number; itemCount: number }>();
      row.genres.forEach((genre) => {
        const current = genreMap.get(genre) ?? { value: 0, itemCount: 0 };
        genreMap.set(genre, {
          value: current.value + increment,
          itemCount: current.itemCount + 1,
        });
      });
      platformGenreMap.set(platform, genreMap);
    });
  });

  return Array.from(platformGenreMap.entries())
    .map(([platform, genreMap]) => ({
      platform,
      entries: Array.from(genreMap.entries())
        .map(([label, entry]) => ({
          label,
          value: entry.value,
          itemCount: entry.itemCount,
        }))
        .sort((left, right) => {
          if (right.value !== left.value) return right.value - left.value;
          if (right.itemCount !== left.itemCount) return right.itemCount - left.itemCount;
          return left.label.localeCompare(right.label, "uk");
        })
        .slice(0, 3),
    }))
    .filter((entry) => entry.entries.length > 0)
    .sort((left, right) => {
      const leftValue = left.entries.reduce((sum, entry) => sum + entry.value, 0);
      const rightValue = right.entries.reduce((sum, entry) => sum + entry.value, 0);
      if (rightValue !== leftValue) return rightValue - leftValue;
      return left.platform.localeCompare(right.platform, "uk");
    })
    .slice(0, 6);
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

        while (true) {
          const { data, error } = await supabase
            .from("user_views")
            .select(
              "viewed_at, is_viewed, rating, view_percent, platforms, items:items!inner(title, genres, type)",
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

          const chunk = chunkRaw.map((row) => {
            const item = Array.isArray(row.items) ? row.items[0] : row.items;
            return {
              title: item?.title?.trim() || "Без назви",
              viewedAt: row.viewed_at,
              isViewed: Boolean(row.is_viewed),
              rating: row.rating,
              viewPercent: Math.max(0, Math.min(100, row.view_percent ?? 0)),
              platforms: normalizePlatforms(row.platforms),
              genres: normalizeGenres(item?.genres),
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
    const viewedRows = rows.filter((row) => row.isViewed);
    const ratedViewedRows = viewedRows.filter((row) => row.rating !== null);
    const startedRows = rows.filter((row) => row.viewPercent > 0);
    const fullyViewedRows = rows.filter((row) => row.viewPercent >= 100);
    const partiallyViewedRows = rows.filter((row) => row.viewPercent > 0 && row.viewPercent < 100);
    const droppedRows = rows.filter((row) => row.viewPercent > 0 && row.viewPercent < 80);

    const totalGames = rows.length;
    const viewedCount = viewedRows.length;
    const plannedCount = totalGames - viewedCount;
    const viewedShare = totalGames > 0 ? (viewedCount / totalGames) * 100 : null;
    const plannedShare = totalGames > 0 ? (plannedCount / totalGames) * 100 : null;
    const startedCount = startedRows.length;
    const fullyViewedCount = fullyViewedRows.length;
    const partiallyViewedCount = partiallyViewedRows.length;
    const averageRating =
      ratedViewedRows.length > 0
        ? ratedViewedRows.reduce((sum, row) => sum + (row.rating ?? 0), 0) / ratedViewedRows.length
        : null;
    const completionRate = startedCount > 0 ? (fullyViewedCount / startedCount) * 100 : null;
    const partialRate = startedCount > 0 ? (partiallyViewedCount / startedCount) * 100 : null;

    return {
      totalGames,
      viewedCount,
      plannedCount,
      viewedShare,
      plannedShare,
      fullyViewedCount,
      partiallyViewedCount,
      completionRate,
      partialRate,
      averageRating,
      topViewedGenres: buildRankedEntries(viewedRows, "genres", "viewed"),
      topViewedPlatforms: buildRankedEntries(viewedRows, "platforms", "viewed"),
      topLikedGenres: buildRankedEntries(viewedRows, "genres", "liked"),
      topLikedPlatforms: buildRankedEntries(viewedRows, "platforms", "liked"),
      topDroppedGenres: buildRankedEntries(droppedRows, "genres", "viewed"),
      topDroppedPlatforms: buildRankedEntries(droppedRows, "platforms", "viewed"),
      monthlyEntries: buildMonthlyEntries(viewedRows),
      platformGenrePreferences: buildPlatformGenrePreferences(viewedRows),
    };
  }, [rows]);

  const handleExportCsv = useCallback(() => {
    if (rows.length === 0) {
      return;
    }

    const summaryRows = [
      ["Всього ігор", String(statistics.totalGames)],
      ["Пройдено", `${statistics.viewedCount} (${formatPercent(statistics.viewedShare)})`],
      ["Заплановано", `${statistics.plannedCount} (${formatPercent(statistics.plannedShare)})`],
      ["Сер. мій рейтинг", formatAverageRating(statistics.averageRating)],
      [
        "Повністю пройдено",
        `${statistics.fullyViewedCount} (${formatPercent(statistics.completionRate)})`,
      ],
      [
        "Частково пройдено",
        `${statistics.partiallyViewedCount} (${formatPercent(statistics.partialRate)})`,
      ],
    ];

    const rankedColumns = [
      { label: "Топ жанрів пройдено", entries: statistics.topViewedGenres },
      { label: "Топ платформ пройдено", entries: statistics.topViewedPlatforms },
      { label: "Топ жанрів сподобались", entries: statistics.topLikedGenres },
      { label: "Топ платформ сподобались", entries: statistics.topLikedPlatforms },
      { label: "Топ жанрів кинуто", entries: statistics.topDroppedGenres },
      { label: "Топ платформ кинуто", entries: statistics.topDroppedPlatforms },
      {
        label: "Улюблені жанри по платформах",
        entries: statistics.platformGenrePreferences.flatMap((entry) =>
          entry.entries.map((genreEntry) => ({
            label: `${entry.platform} → ${genreEntry.label}`,
            value: genreEntry.value,
            itemCount: genreEntry.itemCount,
          })),
        ),
      },
    ];

    const csvHeaders = [
      "Метрика",
      "Значення",
      ...rankedColumns.flatMap((column) => [column.label, "Значення"]),
      "Перелік ігор",
    ];

    const maxLength = Math.max(
      summaryRows.length,
      rows.length,
      ...rankedColumns.map((column) => column.entries.length),
    );

    const rowsForCsv = Array.from({ length: maxLength }, (_, index) => [
      summaryRows[index]?.[0] ?? "",
      summaryRows[index]?.[1] ?? "",
      ...rankedColumns.flatMap((column) => [
        column.entries[index]?.label ?? "",
        column.entries[index] ? String(column.entries[index].value) : "",
      ]),
      rows[index]?.title ?? "",
    ]);

    downloadCsvFile(
      `games_statistics_export_${getCsvTimestamp()}.csv`,
      csvHeaders,
      rowsForCsv,
    );
  }, [rows, statistics]);

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

  if (statistics.totalGames === 0) {
    return <p className={styles.message}>Додайте ігри до бібліотеки, щоб побачити статистику.</p>;
  }

  return (
    <div className={styles.content}>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Всього ігор</span>
          <strong className={styles.kpiValue}>{statistics.totalGames}</strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Пройдено</span>
          <strong className={styles.kpiValue}>
            {statistics.viewedCount}{" "}
            <span className={styles.kpiValueMuted}>({formatPercent(statistics.viewedShare)})</span>
          </strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Заплановано</span>
          <strong className={styles.kpiValue}>
            {statistics.plannedCount}{" "}
            <span className={styles.kpiValueMuted}>
              ({formatPercent(statistics.plannedShare)})
            </span>
          </strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Сер. мій рейтинг</span>
          <strong className={styles.kpiValue}>{formatAverageRating(statistics.averageRating)}</strong>
        </div>
      </div>

      <div className={styles.sectionGrid}>
        <div className={`${styles.kpiGridCompact} ${styles.sectionFull}`}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Повністю пройдено</span>
            <strong className={styles.kpiValue}>
              {statistics.fullyViewedCount}{" "}
              <span className={styles.kpiValueMuted}>({formatPercent(statistics.completionRate)})</span>
            </strong>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Частково пройдено</span>
            <strong className={styles.kpiValue}>
              {statistics.partiallyViewedCount}{" "}
              <span className={styles.kpiValueMuted}>({formatPercent(statistics.partialRate)})</span>
            </strong>
          </div>
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 жанрів пройдено</h2>
          <StatisticsRankedList
            entries={statistics.topViewedGenres}
            valueLabel="games"
            emptyMessage="Недостатньо даних по жанрах."
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 платформ пройдено</h2>
          <StatisticsRankedList
            entries={statistics.topViewedPlatforms}
            valueLabel="games"
            emptyMessage="Недостатньо даних по платформах."
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 жанрів, які сподобались</h2>
          <StatisticsRankedList
            entries={statistics.topLikedGenres}
            valueLabel="points"
            emptyMessage="Поставте більше оцінок, щоб побачити смакову статистику."
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 платформ, які сподобались</h2>
          <StatisticsRankedList
            entries={statistics.topLikedPlatforms}
            valueLabel="points"
            emptyMessage="Поставте більше оцінок, щоб побачити смакову статистику."
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 жанрів, які кинуто</h2>
          <StatisticsRankedList
            entries={statistics.topDroppedGenres}
            valueLabel="games"
            emptyMessage="Поки немає достатньо кинутих ігор по жанрах."
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 платформ, які кинуто</h2>
          <StatisticsRankedList
            entries={statistics.topDroppedPlatforms}
            valueLabel="games"
            emptyMessage="Поки немає достатньо кинутих ігор по платформах."
          />
        </section>

        <section className={`${styles.section} ${styles.sectionFull}`}>
          <h2 className={styles.sectionTitle}>Улюблені жанри по платформах</h2>
          {statistics.platformGenrePreferences.length === 0 ? (
            <div className={styles.emptyBox}>
              Поставте більше оцінок на різних платформах, щоб побачити звʼязку платформа × жанр.
            </div>
          ) : (
            <div className={styles.nestedGrid}>
              {statistics.platformGenrePreferences.map((entry) => (
                <section key={entry.platform} className={styles.nestedCard}>
                  <h3 className={styles.nestedTitle}>{entry.platform}</h3>
                  <StatisticsRankedList
                    entries={entry.entries}
                    valueLabel="points"
                    emptyMessage="Недостатньо даних."
                  />
                </section>
              ))}
            </div>
          )}
        </section>

        <section className={`${styles.section} ${styles.sectionFull}`}>
          <h2 className={styles.sectionTitle}>Ігри по місяцях</h2>
          <StatisticsMonthlyList
            entries={statistics.monthlyEntries}
            itemLabel="games"
            initialLimit={5}
          />
        </section>
      </div>
    </div>
  );
}
