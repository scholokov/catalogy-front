"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import searchStyles from "@/components/catalog/CatalogSearch.module.css";
import FilmCollectionPopup, {
  type FilmCollectionPopupView,
} from "@/components/films/FilmCollectionPopup";
import { supabase } from "@/lib/supabase/client";
import styles from "@/app/actors/ActorsPage.module.css";

type Trailer = {
  id: string;
  name: string;
  site: string;
  key: string;
  type: string;
  official: boolean;
  language: string;
  region: string;
  url: string;
};

type GenreRecord = {
  id: string;
  name: string;
  sourceGenreId: string;
};

const GENRE_BATCH_SIZE = 12;

type GenreSectionProps = {
  title: string;
  entries: FilmCollectionPopupView[];
  emptyMessage: string;
  onOpenExisting: (view: FilmCollectionPopupView) => void;
};

function GenreSection({
  title,
  entries,
  emptyMessage,
  onOpenExisting,
}: GenreSectionProps) {
  const [visibleCount, setVisibleCount] = useState(GENRE_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element || visibleCount >= entries.length) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((current) => Math.min(current + GENRE_BATCH_SIZE, entries.length));
        }
      },
      { rootMargin: "320px 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [entries.length, visibleCount]);

  const visibleEntries = entries.slice(0, visibleCount);
  const hasMore = visibleCount < entries.length;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <span className={styles.sectionMeta}>{entries.length}</span>
      </div>
      {entries.length > 0 ? (
        <>
          <div className={searchStyles.results}>
            {visibleEntries.map((entry) => (
              <button
                key={entry.viewId}
                type="button"
                className={`${searchStyles.resultItem} ${searchStyles.resultButton} ${searchStyles.collectionItem}`}
                onClick={() => onOpenExisting(entry)}
              >
                <div className={searchStyles.resultHeader}>
                  <div className={searchStyles.titleRow}>
                    <h3 className={searchStyles.resultTitle}>{entry.item.title}</h3>
                    <div className={searchStyles.ratingRow}>
                      {entry.item.imdbRating ? (
                        <span className={searchStyles.resultRating}>
                          IMDb: {entry.item.imdbRating}
                        </span>
                      ) : null}
                      <span className={searchStyles.resultRating}>Мій: {entry.rating ?? "—"}</span>
                    </div>
                  </div>
                </div>
                <div className={searchStyles.posterWrapper}>
                  {entry.item.posterUrl ? (
                    <Image
                      src={entry.item.posterUrl}
                      alt={entry.item.title}
                      width={180}
                      height={270}
                      className={searchStyles.poster}
                    />
                  ) : (
                    <div className={searchStyles.posterPlaceholder}>Без постера</div>
                  )}
                </div>
                <div className={searchStyles.resultContent}>
                  <p className={searchStyles.resultMeta}>
                    Рік: {entry.item.year ?? "—"} · {entry.item.mediaType === "tv" ? "Серіал" : "Фільм"}
                  </p>
                  {entry.item.director ? (
                    <p className={searchStyles.resultMeta}>Режисер: {entry.item.director}</p>
                  ) : null}
                  <div className={searchStyles.userMeta}>
                    <span>Переглянуто: {entry.isViewed ? "так" : "ні"}</span>
                    {entry.availability ? <span>Наявність: {entry.availability}</span> : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {hasMore ? (
            <div className={styles.sectionFooter}>
              <button
                type="button"
                className="btnBase btnSecondary"
                onClick={() =>
                  setVisibleCount((current) => Math.min(current + GENRE_BATCH_SIZE, entries.length))
                }
              >
                Показати ще
              </button>
              <div ref={loadMoreRef} className={styles.loadMoreAnchor} aria-hidden="true" />
            </div>
          ) : null}
        </>
      ) : (
        <p className={styles.emptyBox}>{emptyMessage}</p>
      )}
    </section>
  );
}

const loadGenreCollectionData = async (genreId: string) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: genreRows, error: genreError } = await supabase
    .from("genres")
    .select("id, name, source_genre_id")
    .eq("media_kind", "film")
    .eq("source", "tmdb")
    .eq("source_genre_id", genreId)
    .maybeSingle();

  if (genreError || !genreRows) {
    return {
      genre: null,
      collectionFilms: [] as FilmCollectionPopupView[],
      message: "Жанр не знайдено.",
    };
  }

  const resolvedGenre: GenreRecord = {
    id: genreRows.id,
    name: genreRows.name,
    sourceGenreId: genreRows.source_genre_id,
  };

  if (!user) {
    return {
      genre: resolvedGenre,
      collectionFilms: [] as FilmCollectionPopupView[],
      message: "Потрібна авторизація.",
    };
  }

  const { data: itemGenreRows, error: itemGenreError } = await supabase
    .from("item_genres")
    .select("item_id")
    .eq("genre_id", genreRows.id);

  if (itemGenreError) {
    return {
      genre: resolvedGenre,
      collectionFilms: [] as FilmCollectionPopupView[],
      message: "Не вдалося завантажити жанр.",
    };
  }

  const itemIds = Array.from(
    new Set(
      ((itemGenreRows ?? []) as Array<{ item_id?: string | null }>)
        .map((row) => row.item_id ?? null)
        .filter((itemId): itemId is string => Boolean(itemId)),
    ),
  );

  if (itemIds.length === 0) {
    return {
      genre: resolvedGenre,
      collectionFilms: [] as FilmCollectionPopupView[],
      message: "",
    };
  }

  const { data, error } = await supabase
    .from("user_views")
    .select(
      "id, viewed_at, comment, recommend_similar, is_viewed, rating, view_percent, availability, items!inner(id, title, title_uk, title_en, title_original, description, genres, director, actors, poster_url, external_id, film_media_type, imdb_rating, trailers, year, type)",
    )
    .eq("user_id", user.id)
    .in("item_id", itemIds)
    .eq("items.type", "film");

  if (error) {
    return {
      genre: resolvedGenre,
      collectionFilms: [] as FilmCollectionPopupView[],
      message: "Не вдалося завантажити жанр.",
    };
  }

  const collectionFilms = ((data ?? []) as Array<{
    id: string;
    viewed_at: string;
    comment: string | null;
    recommend_similar: boolean;
    is_viewed: boolean;
    rating: number | null;
    view_percent: number;
    availability: string | null;
    items:
      | {
          id: string;
          title: string;
          title_uk?: string | null;
          title_en?: string | null;
          title_original?: string | null;
          description?: string | null;
          genres?: string | null;
          director?: string | null;
          actors?: string | null;
          poster_url?: string | null;
          external_id?: string | null;
          film_media_type?: "movie" | "tv" | null;
          year?: number | null;
          imdb_rating?: string | null;
          trailers?: Trailer[] | null;
          type?: string | null;
        }
      | Array<{
          id: string;
          title: string;
          title_uk?: string | null;
          title_en?: string | null;
          title_original?: string | null;
          description?: string | null;
          genres?: string | null;
          director?: string | null;
          actors?: string | null;
          poster_url?: string | null;
          external_id?: string | null;
          film_media_type?: "movie" | "tv" | null;
          year?: number | null;
          imdb_rating?: string | null;
          trailers?: Trailer[] | null;
          type?: string | null;
        }>;
  }>)
    .map((row) => ({
      viewId: row.id,
      viewedAt: row.viewed_at,
      comment: row.comment,
      recommendSimilar: row.recommend_similar,
      isViewed: row.is_viewed,
      rating: row.rating,
      viewPercent: row.view_percent,
      availability: row.availability,
      item: Array.isArray(row.items) ? row.items[0] : row.items,
    }))
    .filter((row) => row.item?.type === "film")
    .map((row) => ({
      viewId: row.viewId,
      viewedAt: row.viewedAt,
      comment: row.comment,
      recommendSimilar: row.recommendSimilar,
      isViewed: row.isViewed,
      rating: row.rating,
      viewPercent: row.viewPercent,
      availability: row.availability,
      item: {
        id: row.item.id,
        title: row.item.title,
        titleUk: row.item.title_uk ?? null,
        titleEn: row.item.title_en ?? null,
        titleOriginal: row.item.title_original ?? null,
        description: row.item.description ?? null,
        genres: row.item.genres ?? null,
        director: row.item.director ?? null,
        actors: row.item.actors ?? null,
        posterUrl: row.item.poster_url ?? null,
        externalId: row.item.external_id ?? null,
        mediaType: row.item.film_media_type ?? null,
        year: row.item.year ?? null,
        imdbRating: row.item.imdb_rating ?? null,
        trailers: row.item.trailers ?? null,
      },
    }))
    .sort((left, right) => {
      if (left.isViewed !== right.isViewed) return left.isViewed ? -1 : 1;
      const leftDate = left.viewedAt ? new Date(left.viewedAt).getTime() : 0;
      const rightDate = right.viewedAt ? new Date(right.viewedAt).getTime() : 0;
      if (rightDate !== leftDate) return rightDate - leftDate;
      return left.item.title.localeCompare(right.item.title, "uk");
    });

  return {
    genre: resolvedGenre,
    collectionFilms,
    message: "",
  };
};

export default function GenreDetailPage({ genreId }: { genreId: string }) {
  const [genre, setGenre] = useState<GenreRecord | null>(null);
  const [collectionFilms, setCollectionFilms] = useState<FilmCollectionPopupView[]>([]);
  const [selectedExistingFilm, setSelectedExistingFilm] = useState<FilmCollectionPopupView | null>(
    null,
  );
  const [message, setMessage] = useState("Завантаження жанру…");

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      const data = await loadGenreCollectionData(genreId);
      if (isCancelled) {
        return;
      }
      setGenre(data.genre);
      setCollectionFilms(data.collectionFilms);
      setMessage(data.message);
    })();

    return () => {
      isCancelled = true;
    };
  }, [genreId]);

  const watchedEntries = useMemo(
    () => collectionFilms.filter((entry) => entry.isViewed),
    [collectionFilms],
  );
  const plannedEntries = useMemo(
    () => collectionFilms.filter((entry) => !entry.isViewed),
    [collectionFilms],
  );

  const stats = useMemo(() => {
    const rated = collectionFilms.filter((entry) => entry.rating !== null);
    return {
      total: collectionFilms.length,
      watched: watchedEntries.length,
      average:
        rated.length > 0
          ? rated.reduce((sum, entry) => sum + (entry.rating ?? 0), 0) / rated.length
          : null,
      movies: collectionFilms.filter((entry) => entry.item.mediaType !== "tv").length,
      series: collectionFilms.filter((entry) => entry.item.mediaType === "tv").length,
    };
  }, [collectionFilms, watchedEntries.length]);

  return (
    <CatalogLayout
      title={genre?.name ?? "Жанр"}
      headerRight={
        <Link href="/statistics" className="btnBase btnSecondary">
          До статистики
        </Link>
      }
    >
      <div className={styles.content}>
        {message ? <p className={styles.message}>{message}</p> : null}

        {genre ? (
          <>
            <section className={styles.section}>
              <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>У колекції</span>
                  <span className={styles.kpiValue}>{stats.total}</span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>Переглянуто</span>
                  <span className={styles.kpiValue}>{stats.watched}</span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>Середня моя оцінка</span>
                  <span className={styles.kpiValue}>
                    {stats.average !== null ? stats.average.toFixed(1) : "—"}
                  </span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>Кіно / Серіали</span>
                  <span className={styles.kpiValue}>
                    {stats.movies} / {stats.series}
                  </span>
                </div>
              </div>
            </section>

            <GenreSection
              key={`${genreId}:watched`}
              title="Переглянуте в жанрі"
              entries={watchedEntries}
              emptyMessage="У цьому жанрі поки немає переглянутих позицій."
              onOpenExisting={setSelectedExistingFilm}
            />
            <GenreSection
              key={`${genreId}:planned`}
              title="Ще не переглянуто"
              entries={plannedEntries}
              emptyMessage="У цьому жанрі все в колекції вже переглянуто."
              onOpenExisting={setSelectedExistingFilm}
            />
          </>
        ) : null}

        {selectedExistingFilm ? (
          <FilmCollectionPopup
            mode="edit"
            existingView={selectedExistingFilm}
            onClose={() => setSelectedExistingFilm(null)}
            onSaved={async () => {
              const data = await loadGenreCollectionData(genreId);
              setGenre(data.genre);
              setCollectionFilms(data.collectionFilms);
              setMessage(data.message);
            }}
          />
        ) : null}
      </div>
    </CatalogLayout>
  );
}
