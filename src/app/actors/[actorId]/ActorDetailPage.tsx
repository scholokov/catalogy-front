"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import FilmCollectionPopup, {
  type FilmCollectionPopupCandidate,
  type FilmCollectionPopupView,
} from "@/components/films/FilmCollectionPopup";
import { supabase } from "@/lib/supabase/client";
import styles from "../ActorsPage.module.css";

type ActorFilmographyEntry = {
  id: string;
  mediaType: "movie" | "tv";
  title: string;
  originalTitle: string;
  year: string;
  poster: string;
  imdbRating: string;
  characterName: string;
  job: string;
  creditGroup: "cast" | "crew";
};

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

type ActorDetail = {
  id: string;
  name: string;
  originalName: string;
  biography: string;
  birthday: string;
  deathday: string;
  placeOfBirth: string;
  knownForDepartment: string;
  popularity: number | null;
  profileUrl: string;
  imageUrls: string[];
  filmography: ActorFilmographyEntry[];
};

type ActorFilmographyCard = {
  id: string;
  mediaType: "movie" | "tv";
  title: string;
  originalTitle: string;
  year: string;
  poster: string;
  imdbRating: string;
  creditLabels: string[];
};

const getFilmExternalKey = (externalId?: string | null, mediaType?: string | null) => {
  if (!externalId) return "";
  return `${mediaType === "tv" ? "tv" : "movie"}:${externalId}`;
};

const getFilmographyCardKey = (entry: ActorFilmographyCard) =>
  [entry.mediaType, entry.id].join(":");

const mergeActorFilmography = (entries: ActorFilmographyEntry[]): ActorFilmographyCard[] => {
  const grouped = new Map<string, ActorFilmographyCard>();

  entries.forEach((entry) => {
    const key = `${entry.mediaType}:${entry.id}`;
    const creditLabel = entry.characterName || entry.job || "Участь";
    const existing = grouped.get(key);

    if (existing) {
      if (!existing.creditLabels.includes(creditLabel)) {
        existing.creditLabels.push(creditLabel);
      }
      return;
    }

    grouped.set(key, {
      id: entry.id,
      mediaType: entry.mediaType,
      title: entry.title,
      originalTitle: entry.originalTitle,
      year: entry.year,
      poster: entry.poster,
      imdbRating: entry.imdbRating,
      creditLabels: [creditLabel],
    });
  });

  return [...grouped.values()];
};

export default function ActorDetailPage({ actorId }: { actorId: string }) {
  const [detail, setDetail] = useState<ActorDetail | null>(null);
  const [collectionFilms, setCollectionFilms] = useState<FilmCollectionPopupView[]>([]);
  const [selectedExistingFilm, setSelectedExistingFilm] = useState<FilmCollectionPopupView | null>(
    null,
  );
  const [selectedCandidateFilm, setSelectedCandidateFilm] =
    useState<FilmCollectionPopupCandidate | null>(null);
  const [message, setMessage] = useState("Завантаження актора…");

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      setMessage("Завантаження актора…");
      try {
        const response = await fetch(`/api/tmdb/person/${actorId}`);
        const data = (await response.json()) as ActorDetail & { error?: string };
        if (!response.ok) {
          if (!isCancelled) {
            setDetail(null);
            setMessage(data.error ?? "Не вдалося завантажити сторінку актора.");
          }
          return;
        }
        if (!isCancelled) {
          setDetail(data);
          setMessage("");
        }
      } catch (error) {
        if (!isCancelled) {
          setDetail(null);
          setMessage(
            error instanceof Error
              ? error.message
              : "Не вдалося завантажити сторінку актора.",
          );
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [actorId]);

  const loadCollection = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCollectionFilms([]);
      return;
    }

    const { data, error } = await supabase
      .from("user_views")
      .select(
        "id, viewed_at, comment, recommend_similar, is_viewed, rating, view_percent, availability, items!inner(id, title, title_uk, title_en, title_original, description, genres, director, actors, poster_url, external_id, film_media_type, imdb_rating, trailers, year, type)",
      )
      .eq("user_id", user.id)
      .eq("items.type", "film");

    if (error) {
      setCollectionFilms([]);
      return;
    }

    const nextCollection = ((data ?? []) as Array<{
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
      }));

    setCollectionFilms(nextCollection);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!isCancelled) {
          setCollectionFilms([]);
        }
        return;
      }

      await loadCollection();
    })();

    return () => {
      isCancelled = true;
    };
  }, [loadCollection]);

  const collectionByExternalKey = useMemo(() => {
    const map = new Map<string, FilmCollectionPopupView>();
    collectionFilms.forEach((film) => {
      const key = getFilmExternalKey(film.item.externalId, film.item.mediaType);
      if (key) {
        map.set(key, film);
      }
    });
    return map;
  }, [collectionFilms]);

  const mergedFilmography = useMemo(
    () => mergeActorFilmography(detail?.filmography ?? []),
    [detail],
  );

  const inCollection = useMemo(() => {
    return mergedFilmography
      .map((entry) => ({
        entry,
        existing: collectionByExternalKey.get(getFilmExternalKey(entry.id, entry.mediaType)),
      }))
      .filter(
        (
          row,
        ): row is {
          entry: ActorFilmographyCard;
          existing: FilmCollectionPopupView;
        } => Boolean(row.existing),
      );
  }, [collectionByExternalKey, mergedFilmography]);

  const notInCollection = useMemo(() => {
    return mergedFilmography.filter(
      (entry) => !collectionByExternalKey.has(getFilmExternalKey(entry.id, entry.mediaType)),
    );
  }, [collectionByExternalKey, mergedFilmography]);

  const stats = useMemo(() => {
    const watched = inCollection.filter((row) => row.existing.isViewed).length;
    const rated = inCollection.filter((row) => row.existing.rating !== null);
    const average =
      rated.length > 0
        ? rated.reduce((sum, row) => sum + (row.existing.rating ?? 0), 0) / rated.length
        : null;
    return {
      totalKnown: mergedFilmography.length,
      inCollection: inCollection.length,
      watched,
      average,
    };
  }, [inCollection, mergedFilmography.length]);

  return (
    <CatalogLayout
      title={detail?.name ?? "Актор"}
      description="Фільмографія з перетином із твоєю колекцією фільмів."
      headerRight={<Link href="/actors" className="btnBase btnSecondary">Пошук акторів</Link>}
    >
      <div className={styles.content}>
        {message ? <p className={styles.message}>{message}</p> : null}

        {detail ? (
          <>
            <section className={styles.hero}>
              <div className={styles.heroMedia}>
                {detail.profileUrl ? (
                  <Image
                    src={detail.profileUrl}
                    alt={detail.name}
                    width={360}
                    height={540}
                    className={styles.heroImage}
                  />
                ) : (
                  <div className={styles.heroPlaceholder}>Фото недоступне</div>
                )}
              </div>
              <div className={styles.heroContent}>
                <div className={styles.kpiGrid}>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Всього в filmography</span>
                    <span className={styles.kpiValue}>{stats.totalKnown}</span>
                  </div>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>У колекції</span>
                    <span className={styles.kpiValue}>{stats.inCollection}</span>
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
                </div>

                <div className={styles.metaList}>
                  {detail.originalName && detail.originalName !== detail.name ? (
                    <p className={styles.metaItem}>Оригінальне ім’я: {detail.originalName}</p>
                  ) : null}
                  {detail.birthday ? (
                    <p className={styles.metaItem}>Народження: {detail.birthday}</p>
                  ) : null}
                  {detail.placeOfBirth ? (
                    <p className={styles.metaItem}>Місце народження: {detail.placeOfBirth}</p>
                  ) : null}
                </div>

                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>Біографія</h2>
                  <p className={styles.sectionText}>
                    {detail.biography || "Біографія поки недоступна."}
                  </p>
                </div>
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>У твоїй колекції</h2>
                <span className={styles.sectionMeta}>{inCollection.length}</span>
              </div>
              {inCollection.length > 0 ? (
                <div className={styles.filmGrid}>
                  {inCollection.map(({ entry, existing }) => (
                    <button
                      key={getFilmographyCardKey(entry)}
                      type="button"
                      className={`${styles.filmCard} ${styles.cardButton}`}
                      onClick={() => setSelectedExistingFilm(existing)}
                    >
                      <div className={styles.filmPoster}>
                        {existing.item.posterUrl ? (
                          <Image
                            src={existing.item.posterUrl}
                            alt={existing.item.title}
                            width={140}
                            height={210}
                            className={styles.filmPosterImage}
                          />
                        ) : (
                          <div className={styles.posterPlaceholder}>Без постера</div>
                        )}
                      </div>
                      <div className={styles.filmBody}>
                        <h3 className={styles.filmTitle}>{existing.item.title}</h3>
                        <p className={styles.filmMeta}>
                          {entry.year || "—"} · {entry.mediaType === "tv" ? "Серіал" : "Фільм"}
                        </p>
                        {entry.creditLabels.length > 0 ? (
                          <p className={styles.filmMeta}>
                            {entry.creditLabels.length > 1 ? "Ролі" : "Роль"}:{" "}
                            {entry.creditLabels.join("; ")}
                          </p>
                        ) : null}
                        <p className={styles.filmMeta}>
                          Моя оцінка: {existing.rating ?? "—"} · IMDb:{" "}
                          {existing.item.imdbRating ?? "—"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyBox}>У колекції поки немає фільмів із цим актором.</p>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Ще немає у колекції</h2>
                <span className={styles.sectionMeta}>{notInCollection.length}</span>
              </div>
              {notInCollection.length > 0 ? (
                <div className={styles.filmGrid}>
                  {notInCollection.slice(0, 60).map((entry) => (
                    <button
                      key={getFilmographyCardKey(entry)}
                      type="button"
                      className={`${styles.filmCard} ${styles.cardButton}`}
                      onClick={() =>
                        setSelectedCandidateFilm({
                          id: entry.id,
                          mediaType: entry.mediaType,
                          title: entry.title,
                          originalTitle: entry.originalTitle,
                          year: entry.year,
                          poster: entry.poster,
                        })
                      }
                    >
                      <div className={styles.filmPoster}>
                        {entry.poster ? (
                          <Image
                            src={entry.poster}
                            alt={entry.title}
                            width={140}
                            height={210}
                            className={styles.filmPosterImage}
                          />
                        ) : (
                          <div className={styles.posterPlaceholder}>Без постера</div>
                        )}
                      </div>
                      <div className={styles.filmBody}>
                        <h3 className={styles.filmTitle}>{entry.title}</h3>
                        <p className={styles.filmMeta}>
                          {entry.year || "—"} · {entry.mediaType === "tv" ? "Серіал" : "Фільм"}
                        </p>
                        {entry.creditLabels.length > 0 ? (
                          <p className={styles.filmMeta}>
                            {entry.creditLabels.length > 1 ? "Ролі" : "Роль"}:{" "}
                            {entry.creditLabels.join("; ")}
                          </p>
                        ) : null}
                        <p className={styles.filmMeta}>IMDb: {entry.imdbRating || "—"}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyBox}>Уся доступна filmography уже перетинається з колекцією.</p>
              )}
            </section>
          </>
        ) : null}
        {selectedExistingFilm ? (
          <FilmCollectionPopup
            mode="edit"
            existingView={selectedExistingFilm}
            onClose={() => setSelectedExistingFilm(null)}
            onSaved={loadCollection}
          />
        ) : null}
        {selectedCandidateFilm ? (
          <FilmCollectionPopup
            mode="add"
            candidate={selectedCandidateFilm}
            onClose={() => setSelectedCandidateFilm(null)}
            onSaved={loadCollection}
          />
        ) : null}
      </div>
    </CatalogLayout>
  );
}
