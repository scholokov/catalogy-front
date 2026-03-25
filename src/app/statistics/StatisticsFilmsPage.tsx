"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { downloadCsvFile } from "@/lib/csv/downloadCsv";
import { getCsvTimestamp } from "@/lib/csv/getCsvTimestamp";
import { downloadTextFile } from "@/lib/csv/downloadText";
import { buildLlmRecoContextText } from "./filmLlmCsv";
import StatisticsMonthlyList from "./StatisticsMonthlyList";
import styles from "./StatisticsPage.module.css";
import StatisticsRankedList from "./StatisticsRankedList";

type StatisticsFilmsPageProps = {
  onTotalChange: (count: number) => void;
  onExportReady?: (handler: (() => void) | null) => void;
  onLlmExportReady?: (handler: (() => void) | null) => void;
};

type RawStatsRow = {
  item_id: string | null;
  viewed_at: string | null;
  is_viewed: boolean | null;
  rating: number | null;
  view_percent: number | null;
  items:
    | {
        title?: string | null;
        title_uk?: string | null;
        title_en?: string | null;
        title_original?: string | null;
        year?: number | null;
        external_id?: string | null;
        genres?: string | null;
        director?: string | null;
        actors?: string | null;
        type?: string | null;
      }
    | Array<{
        title?: string | null;
        title_uk?: string | null;
        title_en?: string | null;
        title_original?: string | null;
        year?: number | null;
        external_id?: string | null;
        genres?: string | null;
        director?: string | null;
        actors?: string | null;
        type?: string | null;
      }>
    | null;
};

type FilmStatsRow = {
  itemId: string;
  externalId: string;
  title: string;
  titleUk: string;
  titleEn: string;
  titleOriginal: string;
  year: string;
  type: string;
  viewedAt: string | null;
  isViewed: boolean;
  rating: number | null;
  viewPercent: number;
  genres: string[];
  director: string | null;
  directors: string[];
  actors: string[];
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

const buildRankedEntries = (
  rows: FilmStatsRow[],
  mode: "genres" | "directors" | "actors",
  scoreMode: "viewed" | "liked" | "disliked",
) => {
  const aggregate = new Map<string, { value: number; itemCount: number }>();

  rows.forEach((row) => {
    const labels =
      mode === "genres"
        ? row.genres
        : mode === "actors"
          ? row.actors
          : row.director
            ? [row.director]
            : [];
    if (labels.length === 0) return;
    const increment =
      scoreMode === "liked"
        ? getPreferenceWeight(row.rating)
        : scoreMode === "disliked"
          ? getDislikeWeight(row.rating)
          : 1;
    if (scoreMode !== "viewed" && increment <= 0) return;
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
}

export default function StatisticsFilmsPage({
  onTotalChange,
  onExportReady,
  onLlmExportReady,
}: StatisticsFilmsPageProps) {
  const [rows, setRows] = useState<FilmStatsRow[]>([]);
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
        const collected: FilmStatsRow[] = [];

        while (true) {
          const { data, error } = await supabase
            .from("user_views")
            .select(
              "item_id, viewed_at, is_viewed, rating, view_percent, items:items!inner(title, title_uk, title_en, title_original, year, external_id, genres, director, actors, type)",
            )
            .eq("user_id", user.id)
            .eq("items.type", "film")
            .order("created_at", { ascending: false })
            .range(from, from + pageSize - 1);

          if (error) {
            if (!isCancelled) {
              setRows([]);
              onTotalChange(0);
              setErrorMessage("Не вдалося завантажити статистику.");
            }
            return;
          }

          const chunkRaw = (data ?? []) as RawStatsRow[];
          if (chunkRaw.length === 0) {
            break;
          }

          const chunk = chunkRaw.map((row) => {
            const item = Array.isArray(row.items) ? row.items[0] : row.items;
            const director = normalizeDirector(item?.director);
            const directors = director
              ? director
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean)
              : [];
            return {
              itemId: row.item_id ?? "",
              externalId: item?.external_id?.trim() || "",
              title: item?.title?.trim() || "Без назви",
              titleUk: item?.title_uk?.trim() || "",
              titleEn: item?.title_en?.trim() || "",
              titleOriginal: item?.title_original?.trim() || "",
              year: item?.year == null ? "" : String(item.year),
              type: item?.type?.trim() || "film",
              viewedAt: row.viewed_at,
              isViewed: Boolean(row.is_viewed),
              rating: row.rating,
              viewPercent: Math.max(0, Math.min(100, row.view_percent ?? 0)),
              genres: normalizeGenres(item?.genres),
              director,
              directors,
              actors: normalizeActors(item?.actors),
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
            error instanceof Error ? error.message : "Не вдалося завантажити статистику.",
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
    const partiallyViewedRows = rows.filter(
      (row) => row.viewPercent > 0 && row.viewPercent < 100,
    );
    const droppedRows = rows.filter((row) => row.viewPercent > 0 && row.viewPercent < 80);

    const totalFilms = rows.length;
    const viewedCount = viewedRows.length;
    const plannedCount = totalFilms - viewedCount;
    const viewedShare = totalFilms > 0 ? (viewedCount / totalFilms) * 100 : null;
    const plannedShare = totalFilms > 0 ? (plannedCount / totalFilms) * 100 : null;
    const startedCount = startedRows.length;
    const fullyViewedCount = fullyViewedRows.length;
    const partiallyViewedCount = partiallyViewedRows.length;
    const averageRating =
      ratedViewedRows.length > 0
        ? ratedViewedRows.reduce((sum, row) => sum + (row.rating ?? 0), 0) / ratedViewedRows.length
        : null;
    const completionRate =
      startedCount > 0 ? (fullyViewedCount / startedCount) * 100 : null;
    const partialRate =
      startedCount > 0 ? (partiallyViewedCount / startedCount) * 100 : null;

    return {
      totalFilms,
      viewedCount,
      plannedCount,
      viewedShare,
      plannedShare,
      startedCount,
      fullyViewedCount,
      partiallyViewedCount,
      completionRate,
      partialRate,
      averageRating,
      topViewedGenres: buildRankedEntries(viewedRows, "genres", "viewed"),
      topLikedGenres: buildRankedEntries(viewedRows, "genres", "liked"),
      topDislikedGenres: buildRankedEntries(viewedRows, "genres", "disliked"),
      topDroppedGenres: buildRankedEntries(droppedRows, "genres", "viewed"),
      topViewedDirectors: buildRankedEntries(viewedRows, "directors", "viewed"),
      topLikedDirectors: buildRankedEntries(viewedRows, "directors", "liked"),
      topDislikedDirectors: buildRankedEntries(viewedRows, "directors", "disliked"),
      topDroppedDirectors: buildRankedEntries(droppedRows, "directors", "viewed"),
      topViewedActors: buildRankedEntries(viewedRows, "actors", "viewed"),
      topLikedActors: buildRankedEntries(viewedRows, "actors", "liked"),
      monthlyEntries: buildMonthlyEntries(viewedRows),
    };
  }, [rows]);

  const handleExportCsv = useCallback(() => {
    if (rows.length === 0) {
      return;
    }

    const summaryRows = [
      ["Всього фільмів", String(statistics.totalFilms)],
      ["Переглянуто", `${statistics.viewedCount} (${formatPercent(statistics.viewedShare)})`],
      ["Заплановано", `${statistics.plannedCount} (${formatPercent(statistics.plannedShare)})`],
      ["Сер. мій рейтинг", formatAverageRating(statistics.averageRating)],
      [
        "Повністю переглянуто",
        `${statistics.fullyViewedCount} (${formatPercent(statistics.completionRate)})`,
      ],
      [
        "Частково переглянуто",
        `${statistics.partiallyViewedCount} (${formatPercent(statistics.partialRate)})`,
      ],
    ];

    const rankedColumns = [
      { label: "Топ жанрів переглянуто", entries: statistics.topViewedGenres },
      { label: "Топ режисерів переглянуто", entries: statistics.topViewedDirectors },
      { label: "Топ акторів переглянуто", entries: statistics.topViewedActors },
      { label: "Топ жанрів сподобались", entries: statistics.topLikedGenres },
      { label: "Топ режисерів сподобались", entries: statistics.topLikedDirectors },
      { label: "Топ акторів сподобались", entries: statistics.topLikedActors },
      { label: "Топ жанрів не зайшли", entries: statistics.topDislikedGenres },
      { label: "Топ режисерів не зайшли", entries: statistics.topDislikedDirectors },
      { label: "Топ жанрів кинуто", entries: statistics.topDroppedGenres },
      { label: "Топ режисерів кинуто", entries: statistics.topDroppedDirectors },
    ];

    const csvHeaders = [
      "Метрика",
      "Значення",
      ...rankedColumns.flatMap((column) => [column.label, "Значення"]),
      "Перелік фільмів",
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
      `films_statistics_export_${getCsvTimestamp()}.csv`,
      csvHeaders,
      rowsForCsv,
    );
  }, [rows, statistics]);

  const handleLlmExportCsv = useCallback(() => {
    if (rows.length === 0) {
      return;
    }

    const llmRows = rows.map((row) => ({
      itemId: row.itemId,
      externalId: row.externalId,
      title: row.title,
      titleUk: row.titleUk,
      titleEn: row.titleEn,
      titleOriginal: row.titleOriginal,
      year: row.year,
      type: row.type,
      progress: row.viewPercent,
      rating: row.rating,
      genres: row.genres,
      directors: row.directors,
    }));

    downloadTextFile("llm_reco_context.txt", buildLlmRecoContextText(llmRows));
  }, [rows]);

  useEffect(() => {
    onExportReady?.(rows.length > 0 ? handleExportCsv : null);
    return () => onExportReady?.(null);
  }, [handleExportCsv, onExportReady, rows.length]);

  useEffect(() => {
    onLlmExportReady?.(rows.length > 0 ? handleLlmExportCsv : null);
    return () => onLlmExportReady?.(null);
  }, [handleLlmExportCsv, onLlmExportReady, rows.length]);

  if (isLoading) {
    return <p className={styles.message}>Завантаження статистики…</p>;
  }

  if (errorMessage) {
    return <p className={styles.message}>{errorMessage}</p>;
  }

  if (statistics.totalFilms === 0) {
    return <p className={styles.message}>Додайте фільми до бібліотеки, щоб побачити статистику.</p>;
  }

  return (
    <div className={styles.content}>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Всього фільмів</span>
          <strong className={styles.kpiValue}>{statistics.totalFilms}</strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Переглянуто</span>
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
            <span className={styles.kpiLabel}>Повністю переглянуто</span>
            <strong className={styles.kpiValue}>
              {statistics.fullyViewedCount}{" "}
              <span className={styles.kpiValueMuted}>({formatPercent(statistics.completionRate)})</span>
            </strong>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Частково переглянуто</span>
            <strong className={styles.kpiValue}>
              {statistics.partiallyViewedCount}{" "}
              <span className={styles.kpiValueMuted}>({formatPercent(statistics.partialRate)})</span>
            </strong>
          </div>
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 жанрів переглянуто</h2>
          <StatisticsRankedList
            entries={statistics.topViewedGenres}
            valueLabel="films"
            emptyMessage="Недостатньо даних по жанрах."
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 режисерів переглянуто</h2>
          <StatisticsRankedList
            entries={statistics.topViewedDirectors}
            valueLabel="films"
            emptyMessage="Недостатньо даних по режисерах."
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 акторів переглянуто</h2>
          <StatisticsRankedList
            entries={statistics.topViewedActors}
            valueLabel="films"
            emptyMessage="Недостатньо даних по акторах."
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
          <h2 className={styles.sectionTitle}>Топ 5 режисерів, які сподобались</h2>
          <StatisticsRankedList
            entries={statistics.topLikedDirectors}
            valueLabel="points"
            emptyMessage="Поставте більше оцінок, щоб побачити смакову статистику."
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 акторів, які сподобались</h2>
          <StatisticsRankedList
            entries={statistics.topLikedActors}
            valueLabel="points"
            emptyMessage="Поставте більше оцінок, щоб побачити смакову статистику."
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 жанрів, які не зайшли</h2>
          <StatisticsRankedList
            entries={statistics.topDislikedGenres}
            valueLabel="points"
            emptyMessage="Поки немає достатньо низьких оцінок по жанрах."
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 режисерів, які не зайшли</h2>
          <StatisticsRankedList
            entries={statistics.topDislikedDirectors}
            valueLabel="points"
            emptyMessage="Поки немає достатньо низьких оцінок по режисерах."
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 жанрів, які кинуто</h2>
          <StatisticsRankedList
            entries={statistics.topDroppedGenres}
            valueLabel="films"
            emptyMessage="Поки немає достатньо кинутих фільмів по жанрах."
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Топ 5 режисерів, яких кинуто</h2>
          <StatisticsRankedList
            entries={statistics.topDroppedDirectors}
            valueLabel="films"
            emptyMessage="Поки немає достатньо кинутих фільмів по режисерах."
          />
        </section>

        <section className={`${styles.section} ${styles.sectionFull}`}>
          <h2 className={styles.sectionTitle}>Перегляди по місяцях</h2>
          <StatisticsMonthlyList entries={statistics.monthlyEntries} />
        </section>
      </div>
    </div>
  );
}
