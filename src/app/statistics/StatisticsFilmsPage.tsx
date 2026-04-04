"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { downloadCsvFile } from "@/lib/csv/downloadCsv";
import { getCsvTimestamp } from "@/lib/csv/getCsvTimestamp";
import StatisticsMonthlyList from "./StatisticsMonthlyList";
import styles from "./StatisticsPage.module.css";
import StatisticsRankedList from "./StatisticsRankedList";
import { deriveScopeMaturityStatus } from "./lib/scopeReadiness";
import type { ScopeMaturityStatus } from "./statisticsTypes";

type StatisticsFilmsPageProps = {
  onTotalChange: (count: number) => void;
  onExportReady?: (handler: (() => void) | null) => void;
};

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

type FilmMediaType = "movie" | "tv";

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

type FilmScopeStats = {
  mediaType: FilmMediaType;
  label: string;
  totalTitles: number;
  ratedTitles: number;
  engagedTitles: number;
  watchedTitles: number;
  completedTitles: number;
  partialTitles: number;
  plannedTitles: number;
  addedLast30Days: number;
  maturityStatus: ScopeMaturityStatus;
  recommendationEligible: boolean;
  averageRating: number | null;
  topLikedGenres: ReturnType<typeof buildRankedEntries>;
  topDislikedGenres: ReturnType<typeof buildRankedEntries>;
  topDroppedGenres: ReturnType<typeof buildRankedEntries>;
  topLikedDirectors: ReturnType<typeof buildRankedEntries>;
  topDislikedDirectors: ReturnType<typeof buildRankedEntries>;
  topDroppedDirectors: ReturnType<typeof buildRankedEntries>;
  topLikedWriters: ReturnType<typeof buildRankedEntries>;
  topDislikedWriters: ReturnType<typeof buildRankedEntries>;
  topDroppedWriters: ReturnType<typeof buildRankedEntries>;
  topLikedActors: ReturnType<typeof buildRankedEntries>;
  topDislikedActors: ReturnType<typeof buildRankedEntries>;
  topDroppedActors: ReturnType<typeof buildRankedEntries>;
  monthlyEntries: ReturnType<typeof buildMonthlyEntries>;
};

const formatNullableMetric = (value: number | null) => {
  if (value === null) return "—";
  return value.toFixed(2);
};

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

const buildRankedEntries = (
  rows: FilmStatsRow[],
  mode: "genres" | "directors" | "writers" | "actors",
  scoreMode: "viewed" | "liked" | "disliked",
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
            href: `/people/${person.tmdbPersonId}`,
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
        const current = aggregate.get(aggregateKey) ?? { ...entry, key: aggregateKey, value: 0, itemCount: 0 };
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
      const current = aggregate.get(aggregateKey) ?? { ...entry, key: aggregateKey, value: 0, itemCount: 0 };
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
    topLikedDirectors: buildRankedEntries(rows, "directors", "liked"),
    topDislikedDirectors: buildRankedEntries(rows, "directors", "disliked"),
    topDroppedDirectors: buildRankedEntries(partialRows, "directors", "viewed"),
    topLikedWriters: buildRankedEntries(rows, "writers", "liked"),
    topDislikedWriters: buildRankedEntries(rows, "writers", "disliked"),
    topDroppedWriters: buildRankedEntries(partialRows, "writers", "viewed"),
    topLikedActors: buildRankedEntries(rows, "actors", "liked"),
    topDislikedActors: buildRankedEntries(rows, "actors", "disliked"),
    topDroppedActors: buildRankedEntries(partialRows, "actors", "viewed"),
    monthlyEntries: buildMonthlyEntries(rows.filter((row) => row.isViewed)),
  };
};

export default function StatisticsFilmsPage({
  onTotalChange,
  onExportReady,
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
              "created_at, viewed_at, is_viewed, rating, view_percent, items:items!inner(id, title, genres, director, actors, film_media_type, type)",
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
            const { data: itemPeopleRows } = await supabase
              .from("item_people")
              .select(
                "item_id, role_kind, credit_order, people!inner(source_person_id, name)",
              )
              .in("item_id", itemIds)
              .in("role_kind", ["actor", "director", "writer"])
              .order("credit_order", { ascending: true });

            ((itemPeopleRows ?? []) as Array<{
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
            }>).forEach((row) => {
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

            const { data: itemGenreRows } = await supabase
              .from("item_genres")
              .select("item_id, genres!inner(source_genre_id, name)")
              .in("item_id", itemIds);

            ((itemGenreRows ?? []) as Array<{
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
            }>).forEach((row) => {
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
    const now = new Date();
    const completedRows = rows.filter(isCompletedFilm);
    const partialRows = rows.filter(isPartialViewedFilm);
    const plannedRows = rows.filter(isPlannedFilm);
    const ratedRows = rows.filter((row) => row.rating !== null);
    const addedLast30DaysRows = rows.filter((row) => isAddedInLast30Days(row, now));

    const summary = {
      totalTitles: rows.length,
      watchedTitles: rows.filter((row) => row.isViewed).length,
      completedTitles: completedRows.length,
      partialTitles: partialRows.length,
      plannedTitles: plannedRows.length,
      addedLast30Days: addedLast30DaysRows.length,
      averageRating:
        ratedRows.length > 0
          ? ratedRows.reduce((sum, row) => sum + (row.rating ?? 0), 0) / ratedRows.length
          : null,
    };

    const scopeEntries = (["movie", "tv"] as FilmMediaType[])
      .map((mediaType) => buildScopeStats(rows.filter((row) => row.mediaType === mediaType), mediaType))
      .filter((entry) => entry.totalTitles > 0);

    return {
      summary,
      scopeEntries,
    };
  }, [rows]);

  const handleExportCsv = useCallback(() => {
    if (rows.length === 0) {
      return;
    }
    const csvHeaders = [
      "Назва",
      "Режисер",
      "Переглянуто у відсотках",
      "Особистий рейтинг",
      "Дата перегляду",
    ];

    const rowsForCsv = rows.map((row) => [
      row.title,
      row.director ?? "",
      String(row.viewPercent),
      row.rating == null ? "" : String(row.rating),
      row.viewedAt ? row.viewedAt.slice(0, 10) : "",
    ]);

    downloadCsvFile(
      `films_export_${getCsvTimestamp()}.csv`,
      csvHeaders,
      rowsForCsv,
    );
  }, [rows]);

  useEffect(() => {
    onExportReady?.(rows.length > 0 ? handleExportCsv : null);
    return () => onExportReady?.(null);
  }, [handleExportCsv, onExportReady, rows.length]);

  if (isLoading) {
    return <p className={styles.message}>Завантаження статистики…</p>;
  }

  if (errorMessage) {
    return <p className={styles.message}>{errorMessage}</p>;
  }

  if (statistics.summary.totalTitles === 0) {
    return <p className={styles.message}>Додайте фільми до бібліотеки, щоб побачити статистику.</p>;
  }

  return (
    <div className={styles.content}>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Усього</span>
          <strong className={styles.kpiValue}>{statistics.summary.totalTitles}</strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Переглянуто</span>
          <strong className={styles.kpiValue}>
            {statistics.summary.watchedTitles}{" "}
            <span className={styles.kpiValueMuted}>
              ({formatShare(statistics.summary.watchedTitles, statistics.summary.totalTitles)})
            </span>
          </strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Кинуто</span>
          <strong className={styles.kpiValue}>
            {statistics.summary.partialTitles}{" "}
            <span className={styles.kpiValueMuted}>
              ({formatShare(statistics.summary.partialTitles, statistics.summary.totalTitles)})
            </span>
          </strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Не переглянуто</span>
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
          {statistics.scopeEntries.length === 0 ? (
            <div className={styles.emptyBox}>
              Додайте фільми й серіали до бібліотеки, щоб сформувати окрему статистику за форматами.
            </div>
          ) : (
            <div className={styles.list}>
              {statistics.scopeEntries.map((entry) => (
                <details
                  key={entry.mediaType}
                  className={styles.nestedCard}
                  open={entry.maturityStatus === "working"}
                >
                  <summary className={styles.accordionSummary}>
                    <span className={styles.accordionSummaryInner}>
                      <h3 className={styles.nestedTitle}>{entry.label}</h3>
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
                        <span className={styles.kpiLabel}>Переглянуто</span>
                        <strong className={styles.kpiValue}>
                          {entry.watchedTitles}{" "}
                          <span className={styles.kpiValueMuted}>
                            ({formatShare(entry.watchedTitles, entry.totalTitles)})
                          </span>
                        </strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Кинуто</span>
                        <strong className={styles.kpiValue}>
                          {entry.partialTitles}{" "}
                          <span className={styles.kpiValueMuted}>
                            ({formatShare(entry.partialTitles, entry.totalTitles)})
                          </span>
                        </strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Не переглянуто</span>
                        <strong className={styles.kpiValue}>
                          {entry.plannedTitles}{" "}
                          <span className={styles.kpiValueMuted}>
                            ({formatShare(entry.plannedTitles, entry.totalTitles)})
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
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ жанрів, які сподобались</h3>
                        <StatisticsRankedList
                          entries={entry.topLikedGenres}
                          valueLabel="points"
                          emptyMessage="Поставте більше оцінок, щоб побачити смакову статистику."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ жанрів, які не зайшли</h3>
                        <StatisticsRankedList
                          entries={entry.topDislikedGenres}
                          valueLabel="points"
                          emptyMessage="Поки немає достатньо низьких оцінок по жанрах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ жанрів, які кинуто</h3>
                        <StatisticsRankedList
                          entries={entry.topDroppedGenres}
                          valueLabel="films"
                          emptyMessage="Поки немає достатньо частково переглянутих позицій по жанрах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ режисерів, які сподобались</h3>
                        <StatisticsRankedList
                          entries={entry.topLikedDirectors}
                          valueLabel="points"
                          emptyMessage="Поставте більше оцінок, щоб побачити смакову статистику."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ режисерів, які не зайшли</h3>
                        <StatisticsRankedList
                          entries={entry.topDislikedDirectors}
                          valueLabel="points"
                          emptyMessage="Поки немає достатньо низьких оцінок по режисерах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ режисерів, яких кинуто</h3>
                        <StatisticsRankedList
                          entries={entry.topDroppedDirectors}
                          valueLabel="films"
                          emptyMessage="Поки немає достатньо частково переглянутих позицій по режисерах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ сценаристів, які сподобались</h3>
                        <StatisticsRankedList
                          entries={entry.topLikedWriters}
                          valueLabel="points"
                          emptyMessage="Поставте більше оцінок, щоб побачити смакову статистику."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ сценаристів, які не зайшли</h3>
                        <StatisticsRankedList
                          entries={entry.topDislikedWriters}
                          valueLabel="points"
                          emptyMessage="Поки немає достатньо низьких оцінок по сценаристах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ сценаристів, яких кинуто</h3>
                        <StatisticsRankedList
                          entries={entry.topDroppedWriters}
                          valueLabel="films"
                          emptyMessage="Поки немає достатньо частково переглянутих позицій по сценаристах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ акторів, які сподобались</h3>
                        <StatisticsRankedList
                          entries={entry.topLikedActors}
                          valueLabel="points"
                          emptyMessage="Поставте більше оцінок, щоб побачити смакову статистику."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ акторів, які не зайшли</h3>
                        <StatisticsRankedList
                          entries={entry.topDislikedActors}
                          valueLabel="points"
                          emptyMessage="Поки немає достатньо низьких оцінок по акторах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ акторів, яких кинуто</h3>
                        <StatisticsRankedList
                          entries={entry.topDroppedActors}
                          valueLabel="films"
                          emptyMessage="Поки немає достатньо частково переглянутих позицій по акторах."
                        />
                      </section>
                      <section className={`${styles.section} ${styles.sectionFull}`}>
                        <h3 className={styles.sectionTitle}>Перегляди по місяцях</h3>
                        <StatisticsMonthlyList entries={entry.monthlyEntries} initialLimit={5} />
                      </section>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>

        <section className={`${styles.section} ${styles.sectionFull}`}>
          <details>
            <summary className={styles.sectionTitle}>Пояснення</summary>
            <div className={styles.list}>
              <p className={styles.sectionText}>
                Статистика розділяється на два формати: «Кіно» для записів з типом movie і
                «Серіали» для записів з типом tv.
              </p>
              <p className={styles.sectionText}>
                Формат вважається готовим для рекомендацій лише тоді, коли має достатньо даних:
                щонайменше 50 позицій, 20 оцінених позицій і 15 переглянутих позицій.
              </p>
              <p className={styles.sectionText}>
                Якщо формат ще не дотягує до цих порогів, він не вважається придатним для
                рекомендацій, а акордеон лишається закритим.
              </p>
              <p className={styles.sectionText}>
                Лейба «Недостатньо даних» означає, що для цього формату поки замало історії
                переглядів або оцінок, щоб робити стабільні висновки.
              </p>
              <p className={styles.sectionText}>
                «Переглянуто» означає, що увімкнена галочка перегляду незалежно від відсотка
                прогресу.
              </p>
              <p className={styles.sectionText}>
                «Кинуто» означає, що є позначка перегляду, але прогрес перегляду менший за 100%.
              </p>
              <p className={styles.sectionText}>
                «Не переглянуто» означає, що позначка перегляду відсутня.
              </p>
              <p className={styles.sectionText}>
                «Додано за 30 днів» рахує кількість карток, створених за останні 30 днів від
                поточного моменту.
              </p>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
