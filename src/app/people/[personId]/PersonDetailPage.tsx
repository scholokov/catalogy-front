"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import searchStyles from "@/components/catalog/CatalogSearch.module.css";
import FilmCollectionPopup, {
  type FilmCollectionPopupCandidate,
  type FilmCollectionPopupView,
} from "@/components/films/FilmCollectionPopup";
import { supabase } from "@/lib/supabase/client";
import styles from "@/app/actors/ActorsPage.module.css";

type PersonFilmographyEntry = {
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

type PersonDetail = {
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
  filmography: PersonFilmographyEntry[];
};

type PersonFilmographyCard = {
  id: string;
  mediaType: "movie" | "tv";
  title: string;
  originalTitle: string;
  year: string;
  poster: string;
  imdbRating: string;
  creditLabels: string[];
};

const FILMOGRAPHY_BATCH_SIZE = 12;

const getFilmExternalKey = (externalId?: string | null, mediaType?: string | null) => {
  if (!externalId) return "";
  return `${mediaType === "tv" ? "tv" : "movie"}:${externalId}`;
};

const getFilmographyCardKey = (entry: PersonFilmographyCard) =>
  [entry.mediaType, entry.id].join(":");

const mergeFilmography = (
  entries: PersonFilmographyEntry[],
  getLabel: (entry: PersonFilmographyEntry) => string,
): PersonFilmographyCard[] => {
  const grouped = new Map<string, PersonFilmographyCard>();

  entries.forEach((entry) => {
    const key = `${entry.mediaType}:${entry.id}`;
    const creditLabel = getLabel(entry);
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

const isActorCredit = (entry: PersonFilmographyEntry) => entry.creditGroup === "cast";

const isDirectorCredit = (entry: PersonFilmographyEntry) => {
  const normalizedJob = entry.job.trim().toLowerCase();
  return (
    entry.creditGroup === "crew" &&
    (normalizedJob === "director" ||
      normalizedJob === "series director" ||
      normalizedJob === "creator")
  );
};

const isWriterCredit = (entry: PersonFilmographyEntry) => {
  const normalizedJob = entry.job.trim().toLowerCase();
  return (
    entry.creditGroup === "crew" &&
    [
      "writer",
      "screenplay",
      "teleplay",
      "story editor",
      "series composition",
    ].includes(normalizedJob)
  );
};

const isProducerCredit = (entry: PersonFilmographyEntry) => {
  const normalizedJob = entry.job.trim().toLowerCase();
  return (
    entry.creditGroup === "crew" &&
    ["producer", "executive producer", "co-producer", "series producer"].includes(
      normalizedJob,
    )
  );
};

const getRoleLabels = (detail: PersonDetail | null) => {
  if (!detail) {
    return [];
  }

  const hasActing = detail.filmography.some(isActorCredit);
  const hasDirecting = detail.filmography.some(isDirectorCredit);
  const hasWriting = detail.filmography.some(isWriterCredit);
  const hasProducing = detail.filmography.some(isProducerCredit);
  const roles: string[] = [];

  if (hasActing) {
    roles.push("Актор");
  }
  if (hasDirecting) {
    roles.push("Режисер");
  }
  if (hasWriting) {
    roles.push("Сценарист");
  }
  if (hasProducing) {
    roles.push("Продюсер");
  }

  if (roles.length === 0 && detail.knownForDepartment) {
    roles.push(detail.knownForDepartment);
  }

  return roles;
};

const collectUniqueTitles = (groups: PersonFilmographyCard[][]) => {
  const unique = new Map<string, PersonFilmographyCard>();

  groups.flat().forEach((entry) => {
    const key = `${entry.mediaType}:${entry.id}`;
    if (!unique.has(key)) {
      unique.set(key, entry);
    }
  });

  return [...unique.values()];
};

type FilmographySectionProps = {
  title: string;
  count: number;
  entries: PersonFilmographyCard[];
  inCollectionMap: Map<string, FilmCollectionPopupView>;
  emptyMessage: string;
  labelSingular: string;
  labelPlural: string;
  onOpenExisting: (view: FilmCollectionPopupView) => void;
  onOpenCandidate: (candidate: FilmCollectionPopupCandidate) => void;
};

function FilmographySection({
  title,
  count,
  entries,
  inCollectionMap,
  emptyMessage,
  labelSingular,
  labelPlural,
  onOpenExisting,
  onOpenCandidate,
}: FilmographySectionProps) {
  const [visibleCount, setVisibleCount] = useState(FILMOGRAPHY_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element || visibleCount >= entries.length) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((current) =>
            Math.min(current + FILMOGRAPHY_BATCH_SIZE, entries.length),
          );
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
        <span className={styles.sectionMeta}>{count}</span>
      </div>
      {entries.length > 0 ? (
        <>
          <div className={searchStyles.results}>
            {visibleEntries.map((entry) => {
            const existing = inCollectionMap.get(getFilmExternalKey(entry.id, entry.mediaType));
            return (
              <button
                key={getFilmographyCardKey(entry)}
                type="button"
                className={`${searchStyles.resultItem} ${searchStyles.resultButton} ${searchStyles.collectionItem}`}
                onClick={() => {
                  if (existing) {
                    onOpenExisting(existing);
                    return;
                  }
                  onOpenCandidate({
                    id: entry.id,
                    mediaType: entry.mediaType,
                    title: entry.title,
                    originalTitle: entry.originalTitle,
                    year: entry.year,
                    poster: entry.poster,
                  });
                }}
              >
                <div className={searchStyles.resultHeader}>
                  <div className={searchStyles.titleRow}>
                    <h3 className={searchStyles.resultTitle}>
                      {existing?.item.title ?? entry.title}
                    </h3>
                    <div className={searchStyles.ratingRow}>
                      {existing?.item.imdbRating ?? entry.imdbRating ? (
                        <span className={searchStyles.resultRating}>
                          IMDb: {existing?.item.imdbRating ?? entry.imdbRating}
                        </span>
                      ) : null}
                      {existing ? (
                        <span className={searchStyles.resultRating}>
                          Мій: {existing.rating ?? "—"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className={searchStyles.posterWrapper}>
                  {(existing?.item.posterUrl ?? entry.poster) ? (
                    <Image
                      src={existing?.item.posterUrl ?? entry.poster}
                      alt={existing?.item.title ?? entry.title}
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
                    Рік: {entry.year || "—"} · {entry.mediaType === "tv" ? "Серіал" : "Фільм"}
                  </p>
                  {entry.creditLabels.length > 0 ? (
                    <p className={searchStyles.resultMeta}>
                      {entry.creditLabels.length > 1 ? labelPlural : labelSingular}:{" "}
                      {entry.creditLabels.join("; ")}
                    </p>
                  ) : null}
                  <div className={searchStyles.userMeta}>
                    {existing ? (
                      <span>Переглянуто: {existing.isViewed ? "так" : "ні"}</span>
                    ) : (
                      <span>Ще немає у колекції</span>
                    )}
                    {existing?.availability ? <span>Наявність: {existing.availability}</span> : null}
                  </div>
                </div>
              </button>
            );
            })}
          </div>
          {hasMore ? (
            <div className={styles.sectionFooter}>
              <button
                type="button"
                className="btnBase btnSecondary"
                onClick={() =>
                  setVisibleCount((current) =>
                    Math.min(current + FILMOGRAPHY_BATCH_SIZE, entries.length),
                  )
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

export default function PersonDetailPage({ personId }: { personId: string }) {
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [collectionFilms, setCollectionFilms] = useState<FilmCollectionPopupView[]>([]);
  const [selectedExistingFilm, setSelectedExistingFilm] = useState<FilmCollectionPopupView | null>(
    null,
  );
  const [selectedCandidateFilm, setSelectedCandidateFilm] =
    useState<FilmCollectionPopupCandidate | null>(null);
  const [message, setMessage] = useState("Завантаження персони…");

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      setMessage("Завантаження персони…");
      try {
        const response = await fetch(`/api/tmdb/person/${personId}`);
        const data = (await response.json()) as PersonDetail & { error?: string };

        if (!response.ok) {
          if (!isCancelled) {
            setDetail(null);
            setMessage(data.error ?? "Не вдалося завантажити сторінку персони.");
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
              : "Не вдалося завантажити сторінку персони.",
          );
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [personId]);

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

  const actingCards = useMemo(
    () =>
      mergeFilmography(
        (detail?.filmography ?? []).filter(isActorCredit),
        (entry) => entry.characterName || entry.job || "Участь",
      ),
    [detail],
  );

  const directingCards = useMemo(
    () =>
      mergeFilmography(
        (detail?.filmography ?? []).filter(isDirectorCredit),
        (entry) => entry.job || "Режисура",
      ),
    [detail],
  );

  const writerCards = useMemo(
    () =>
      mergeFilmography(
        (detail?.filmography ?? []).filter(isWriterCredit),
        (entry) => entry.job || "Сценарій",
      ),
    [detail],
  );

  const producerCards = useMemo(
    () =>
      mergeFilmography(
        (detail?.filmography ?? []).filter(isProducerCredit),
        (entry) => entry.job || "Продюсування",
      ),
    [detail],
  );

  const uniqueCards = useMemo(
    () => collectUniqueTitles([actingCards, directingCards, writerCards, producerCards]),
    [actingCards, directingCards, writerCards, producerCards],
  );

  const overallInCollection = useMemo(
    () =>
      uniqueCards.filter((entry) =>
        collectionByExternalKey.has(getFilmExternalKey(entry.id, entry.mediaType)),
      ),
    [collectionByExternalKey, uniqueCards],
  );

  const stats = useMemo(() => {
    const watched = overallInCollection.filter((entry) => {
      const existing = collectionByExternalKey.get(getFilmExternalKey(entry.id, entry.mediaType));
      return existing?.isViewed;
    }).length;
    const rated = overallInCollection
      .map((entry) => collectionByExternalKey.get(getFilmExternalKey(entry.id, entry.mediaType)))
      .filter((entry): entry is FilmCollectionPopupView => Boolean(entry?.rating !== null));
    const average =
      rated.length > 0
        ? rated.reduce((sum, entry) => sum + (entry.rating ?? 0), 0) / rated.length
        : null;

    return {
      totalKnown: uniqueCards.length,
      inCollection: overallInCollection.length,
      watched,
      average,
    };
  }, [collectionByExternalKey, overallInCollection, uniqueCards.length]);

  const roleLabels = useMemo(() => getRoleLabels(detail), [detail]);

  return (
    <CatalogLayout
      title={detail?.name ?? "Персона"}
      headerRight={
        <Link href="/people" className="btnBase btnSecondary">
          Пошук персон
        </Link>
      }
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
                    <span className={styles.kpiLabel}>Всього у фільмографії</span>
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
                  {roleLabels.length > 0 ? (
                    <p className={styles.metaItem}>Ролі: {roleLabels.join(" • ")}</p>
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

            {actingCards.length > 0 ? (
              <>
                <FilmographySection
                  key={`${personId}:acting:collection`}
                  title="У твоїй колекції · Актор"
                  count={
                    actingCards.filter((entry) =>
                      collectionByExternalKey.has(getFilmExternalKey(entry.id, entry.mediaType)),
                    ).length
                  }
                  entries={actingCards.filter((entry) =>
                    collectionByExternalKey.has(getFilmExternalKey(entry.id, entry.mediaType)),
                  )}
                  inCollectionMap={collectionByExternalKey}
                  emptyMessage="У колекції поки немає фільмів чи серіалів із цією персоною як актором."
                  labelSingular="Роль"
                  labelPlural="Ролі"
                  onOpenExisting={setSelectedExistingFilm}
                  onOpenCandidate={setSelectedCandidateFilm}
                />
                <FilmographySection
                  key={`${personId}:acting:missing`}
                  title="Ще немає у колекції · Актор"
                  count={
                    actingCards.filter(
                      (entry) =>
                        !collectionByExternalKey.has(
                          getFilmExternalKey(entry.id, entry.mediaType),
                        ),
                    ).length
                  }
                  entries={actingCards.filter(
                    (entry) =>
                      !collectionByExternalKey.has(
                        getFilmExternalKey(entry.id, entry.mediaType),
                      ),
                  )}
                  inCollectionMap={collectionByExternalKey}
                  emptyMessage="Уся доступна акторська фільмографія вже перетинається з колекцією."
                  labelSingular="Роль"
                  labelPlural="Ролі"
                  onOpenExisting={setSelectedExistingFilm}
                  onOpenCandidate={setSelectedCandidateFilm}
                />
              </>
            ) : null}

            {directingCards.length > 0 ? (
              <>
                <FilmographySection
                  key={`${personId}:directing:collection`}
                  title="У твоїй колекції · Режисер"
                  count={
                    directingCards.filter((entry) =>
                      collectionByExternalKey.has(getFilmExternalKey(entry.id, entry.mediaType)),
                    ).length
                  }
                  entries={directingCards.filter((entry) =>
                    collectionByExternalKey.has(getFilmExternalKey(entry.id, entry.mediaType)),
                  )}
                  inCollectionMap={collectionByExternalKey}
                  emptyMessage="У колекції поки немає фільмів чи серіалів із цією персоною як режисером."
                  labelSingular="Кредит"
                  labelPlural="Кредити"
                  onOpenExisting={setSelectedExistingFilm}
                  onOpenCandidate={setSelectedCandidateFilm}
                />
                <FilmographySection
                  key={`${personId}:directing:missing`}
                  title="Ще немає у колекції · Режисер"
                  count={
                    directingCards.filter(
                      (entry) =>
                        !collectionByExternalKey.has(
                          getFilmExternalKey(entry.id, entry.mediaType),
                        ),
                    ).length
                  }
                  entries={directingCards.filter(
                    (entry) =>
                      !collectionByExternalKey.has(
                        getFilmExternalKey(entry.id, entry.mediaType),
                      ),
                  )}
                  inCollectionMap={collectionByExternalKey}
                  emptyMessage="Уся доступна режисерська фільмографія вже перетинається з колекцією."
                  labelSingular="Кредит"
                  labelPlural="Кредити"
                  onOpenExisting={setSelectedExistingFilm}
                  onOpenCandidate={setSelectedCandidateFilm}
                />
              </>
            ) : null}

            {writerCards.length > 0 ? (
              <>
                <FilmographySection
                  key={`${personId}:writing:collection`}
                  title="У твоїй колекції · Сценарист"
                  count={
                    writerCards.filter((entry) =>
                      collectionByExternalKey.has(getFilmExternalKey(entry.id, entry.mediaType)),
                    ).length
                  }
                  entries={writerCards.filter((entry) =>
                    collectionByExternalKey.has(getFilmExternalKey(entry.id, entry.mediaType))
                  )}
                  inCollectionMap={collectionByExternalKey}
                  emptyMessage="У колекції поки немає фільмів чи серіалів із цією персоною як сценаристом."
                  labelSingular="Кредит"
                  labelPlural="Кредити"
                  onOpenExisting={setSelectedExistingFilm}
                  onOpenCandidate={setSelectedCandidateFilm}
                />
                <FilmographySection
                  key={`${personId}:writing:missing`}
                  title="Ще немає у колекції · Сценарист"
                  count={
                    writerCards.filter(
                      (entry) =>
                        !collectionByExternalKey.has(
                          getFilmExternalKey(entry.id, entry.mediaType),
                        ),
                    ).length
                  }
                  entries={writerCards.filter(
                    (entry) =>
                      !collectionByExternalKey.has(
                        getFilmExternalKey(entry.id, entry.mediaType),
                      ),
                  )}
                  inCollectionMap={collectionByExternalKey}
                  emptyMessage="Уся доступна сценарна фільмографія вже перетинається з колекцією."
                  labelSingular="Кредит"
                  labelPlural="Кредити"
                  onOpenExisting={setSelectedExistingFilm}
                  onOpenCandidate={setSelectedCandidateFilm}
                />
              </>
            ) : null}

            {producerCards.length > 0 ? (
              <>
                <FilmographySection
                  key={`${personId}:producing:collection`}
                  title="У твоїй колекції · Продюсер"
                  count={
                    producerCards.filter((entry) =>
                      collectionByExternalKey.has(getFilmExternalKey(entry.id, entry.mediaType)),
                    ).length
                  }
                  entries={producerCards.filter((entry) =>
                    collectionByExternalKey.has(getFilmExternalKey(entry.id, entry.mediaType))
                  )}
                  inCollectionMap={collectionByExternalKey}
                  emptyMessage="У колекції поки немає фільмів чи серіалів із цією персоною як продюсером."
                  labelSingular="Кредит"
                  labelPlural="Кредити"
                  onOpenExisting={setSelectedExistingFilm}
                  onOpenCandidate={setSelectedCandidateFilm}
                />
                <FilmographySection
                  key={`${personId}:producing:missing`}
                  title="Ще немає у колекції · Продюсер"
                  count={
                    producerCards.filter(
                      (entry) =>
                        !collectionByExternalKey.has(
                          getFilmExternalKey(entry.id, entry.mediaType),
                        ),
                    ).length
                  }
                  entries={producerCards.filter(
                    (entry) =>
                      !collectionByExternalKey.has(
                        getFilmExternalKey(entry.id, entry.mediaType),
                      ),
                  )}
                  inCollectionMap={collectionByExternalKey}
                  emptyMessage="Уся доступна продюсерська фільмографія вже перетинається з колекцією."
                  labelSingular="Кредит"
                  labelPlural="Кредити"
                  onOpenExisting={setSelectedExistingFilm}
                  onOpenCandidate={setSelectedCandidateFilm}
                />
              </>
            ) : null}
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
