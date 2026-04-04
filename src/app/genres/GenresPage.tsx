"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import { buildGenreHref, type GenreMediaKind, type GenreSource } from "@/lib/genres/routes";
import { supabase } from "@/lib/supabase/client";
import styles from "@/app/actors/ActorsPage.module.css";

type GenreCollectionStat = {
  genreId: string;
  mediaKind: GenreMediaKind;
  source: GenreSource;
  name: string;
  totalTitles: number;
  watchedTitles: number;
  averageRating: number | null;
};

export default function GenresPage() {
  const [genres, setGenres] = useState<GenreCollectionStat[]>([]);
  const [message, setMessage] = useState("Завантаження жанрів…");

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!isCancelled) {
          setGenres([]);
          setMessage("Потрібна авторизація.");
        }
        return;
      }

      const { data: viewsData, error: viewsError } = await supabase
        .from("user_views")
        .select("item_id, is_viewed, rating, items!inner(type)")
        .eq("user_id", user.id)
        .in("items.type", ["film", "game"]);

      if (viewsError) {
        if (!isCancelled) {
          setGenres([]);
          setMessage("Не вдалося завантажити жанри.");
        }
        return;
      }

      const itemStats = new Map<
        string,
        {
          type: "film" | "game";
          isViewed: boolean;
          rating: number | null;
        }
      >();

      ((viewsData ?? []) as Array<{
        item_id?: string | null;
        is_viewed?: boolean | null;
        rating?: number | null;
        items?:
          | {
              type?: string | null;
            }
          | Array<{
              type?: string | null;
            }>
          | null;
      }>).forEach((row) => {
        if (!row.item_id) {
          return;
        }
        const item = Array.isArray(row.items) ? row.items[0] : row.items;
        if (item?.type !== "film" && item?.type !== "game") {
          return;
        }
        itemStats.set(row.item_id, {
          type: item.type,
          isViewed: Boolean(row.is_viewed),
          rating: row.rating ?? null,
        });
      });

      const itemIds = [...itemStats.keys()];
      if (itemIds.length === 0) {
        if (!isCancelled) {
          setGenres([]);
          setMessage("");
        }
        return;
      }

      const { data: genreRows, error: genreError } = await supabase
        .from("item_genres")
        .select("item_id, genres!inner(media_kind, source, source_genre_id, name)")
        .in("item_id", itemIds);

      if (genreError) {
        if (!isCancelled) {
          setGenres([]);
          setMessage("Не вдалося завантажити жанри.");
        }
        return;
      }

      const aggregate = new Map<
        string,
        {
          genreId: string;
          mediaKind: GenreMediaKind;
          source: GenreSource;
          name: string;
          itemIds: Set<string>;
          watchedTitles: number;
          ratings: number[];
        }
      >();

      ((genreRows ?? []) as Array<{
        item_id?: string | null;
        genres:
          | {
                media_kind?: string | null;
                source?: string | null;
              source_genre_id?: string | null;
              name?: string | null;
            }
          | Array<{
                media_kind?: string | null;
                source?: string | null;
              source_genre_id?: string | null;
              name?: string | null;
            }>;
      }>).forEach((row) => {
        const itemId = row.item_id ?? null;
        const genre = Array.isArray(row.genres) ? row.genres[0] : row.genres;
        const item = itemId ? itemStats.get(itemId) : null;

        if (
          !itemId ||
          !genre?.source_genre_id ||
          !genre.name ||
          !item ||
          (genre.media_kind !== "film" && genre.media_kind !== "game") ||
          (genre.source !== "tmdb" && genre.source !== "rawg" && genre.source !== "igdb")
        ) {
          return;
        }

        const aggregateKey = `${genre.media_kind}:${genre.source}:${genre.source_genre_id}`;
        const current = aggregate.get(aggregateKey) ?? {
          genreId: genre.source_genre_id,
          mediaKind: genre.media_kind,
          source: genre.source,
          name: genre.name,
          itemIds: new Set<string>(),
          watchedTitles: 0,
          ratings: [],
        };

        if (!current.itemIds.has(itemId)) {
          current.itemIds.add(itemId);
          if (item.isViewed) {
            current.watchedTitles += 1;
          }
          if (item.rating !== null) {
            current.ratings.push(item.rating);
          }
        }

        aggregate.set(aggregateKey, current);
      });

      const nextGenres = [...aggregate.values()]
        .map((entry) => ({
          genreId: entry.genreId,
          mediaKind: entry.mediaKind,
          source: entry.source,
          name: entry.name,
          totalTitles: entry.itemIds.size,
          watchedTitles: entry.watchedTitles,
          averageRating:
            entry.ratings.length > 0
              ? entry.ratings.reduce((sum, value) => sum + value, 0) / entry.ratings.length
              : null,
        }))
        .sort((left, right) => {
          if (right.totalTitles !== left.totalTitles) return right.totalTitles - left.totalTitles;
          return left.name.localeCompare(right.name, "uk");
        });

      if (!isCancelled) {
        setGenres(nextGenres);
        setMessage("");
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const rated = genres.filter((entry) => entry.averageRating !== null);
    return {
      totalGenres: genres.length,
      totalFilmGenres: genres.filter((entry) => entry.mediaKind === "film").length,
      totalGameGenres: genres.filter((entry) => entry.mediaKind === "game").length,
      totalTitles: genres.reduce((sum, entry) => sum + entry.totalTitles, 0),
      watchedTitles: genres.reduce((sum, entry) => sum + entry.watchedTitles, 0),
      averageAcrossGenres:
        rated.length > 0
          ? rated.reduce((sum, entry) => sum + (entry.averageRating ?? 0), 0) / rated.length
          : null,
    };
  }, [genres]);

  const filmGenres = useMemo(
    () => genres.filter((entry) => entry.mediaKind === "film"),
    [genres],
  );
  const gameGenres = useMemo(
    () => genres.filter((entry) => entry.mediaKind === "game"),
    [genres],
  );

  return (
    <CatalogLayout
      title="Жанри"
      headerRight={
        <Link href="/statistics" className="btnBase btnSecondary">
          До статистики
        </Link>
      }
    >
      <div className={styles.content}>
        {message ? <p className={styles.message}>{message}</p> : null}

        {genres.length > 0 ? (
          <>
            <section className={styles.section}>
              <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>Жанрів у колекції</span>
                  <span className={styles.kpiValue}>{stats.totalGenres}</span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>Жанри кіно / ігор</span>
                  <span className={styles.kpiValue}>
                    {stats.totalFilmGenres} / {stats.totalGameGenres}
                  </span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>Переглянуто</span>
                  <span className={styles.kpiValue}>{stats.watchedTitles}</span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>Середня оцінка жанрів</span>
                  <span className={styles.kpiValue}>
                    {stats.averageAcrossGenres !== null
                      ? stats.averageAcrossGenres.toFixed(1)
                      : "—"}
                  </span>
                </div>
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Жанри кіно</h2>
                <span className={styles.sectionMeta}>{filmGenres.length}</span>
              </div>
              <div className={styles.results}>
                {filmGenres.map((genre) => (
                  <Link
                    key={`${genre.mediaKind}:${genre.source}:${genre.genreId}`}
                    href={buildGenreHref({
                      mediaKind: genre.mediaKind,
                      source: genre.source,
                      sourceGenreId: genre.genreId,
                    })}
                    className={styles.personCard}
                  >
                    <article className={styles.resultCard}>
                      <div className={styles.resultBody}>
                        <div className={styles.resultHeader}>
                          <h3 className={styles.resultTitle}>{genre.name}</h3>
                        </div>
                        <p className={styles.resultMeta}>Тайтлів: {genre.totalTitles}</p>
                        <p className={styles.resultMeta}>
                          Переглянуто: {genre.watchedTitles}
                        </p>
                        <p className={styles.resultMeta}>
                          Середня оцінка:{" "}
                          {genre.averageRating !== null ? genre.averageRating.toFixed(1) : "—"}
                        </p>
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            </section>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Жанри ігор</h2>
                <span className={styles.sectionMeta}>{gameGenres.length}</span>
              </div>
              <div className={styles.results}>
                {gameGenres.map((genre) => (
                  <Link
                    key={`${genre.mediaKind}:${genre.source}:${genre.genreId}`}
                    href={buildGenreHref({
                      mediaKind: genre.mediaKind,
                      source: genre.source,
                      sourceGenreId: genre.genreId,
                    })}
                    className={styles.personCard}
                  >
                    <article className={styles.resultCard}>
                      <div className={styles.resultBody}>
                        <div className={styles.resultHeader}>
                          <h3 className={styles.resultTitle}>{genre.name}</h3>
                        </div>
                        <p className={styles.resultMeta}>Тайтлів: {genre.totalTitles}</p>
                        <p className={styles.resultMeta}>
                          Переглянуто: {genre.watchedTitles}
                        </p>
                        <p className={styles.resultMeta}>
                          Середня оцінка:{" "}
                          {genre.averageRating !== null ? genre.averageRating.toFixed(1) : "—"}
                        </p>
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </CatalogLayout>
  );
}
