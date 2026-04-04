"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import CatalogModal from "@/components/catalog/CatalogModal";
import searchStyles from "@/components/catalog/CatalogSearch.module.css";
import { supabase } from "@/lib/supabase/client";
import { buildGenreHref, type GenreSource } from "@/lib/genres/routes";
import {
  type GameNormalizedGenre,
  trySyncGameNormalizedGenres,
} from "@/lib/games/normalizedMetadata";
import { normalizeGamePlatforms } from "@/lib/games/platforms";
import { DEFAULT_GAME_PLATFORM_OPTIONS } from "@/lib/settings/displayPreferences";
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

type GameGenreRecord = {
  id: string;
  name: string;
  source: GenreSource;
  sourceGenreId: string;
};

type GameGenreView = {
  viewId: string;
  viewedAt: string;
  comment: string | null;
  recommendSimilar: boolean;
  isViewed: boolean;
  rating: number | null;
  viewPercent: number;
  availability: string | null;
  platforms: string[];
  item: {
    id: string;
    title: string;
    description: string | null;
    genres: string | null;
    posterUrl: string | null;
    externalId: string | null;
    year: number | null;
    imdbRating: string | null;
    genreItems: GameNormalizedGenre[];
    trailers: Trailer[] | null;
  };
};

type GameItemDraft = {
  posterUrl: string | null;
  year: number | null;
  imdbRating: string | null;
  description: string | null;
  genres: string | null;
  normalizedGenres: GameNormalizedGenre[] | null;
  trailers: Trailer[] | null;
};

const GAME_BATCH_SIZE = 12;
const GAME_PLATFORM_OPTIONS = [...DEFAULT_GAME_PLATFORM_OPTIONS];
const AVAILABILITY_OPTIONS = ["В колекції", "Тимчасовий доступ", "У друзів", "Відсутній"];

const sanitizePosterUrl = (value?: string | null) => value?.trim().replace(/\)+$/, "") || null;

type GameGenreSectionProps = {
  title: string;
  entries: GameGenreView[];
  emptyMessage: string;
  onOpenExisting: (view: GameGenreView) => void;
};

function GameGenreSection({
  title,
  entries,
  emptyMessage,
  onOpenExisting,
}: GameGenreSectionProps) {
  const [visibleCount, setVisibleCount] = useState(GAME_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element || visibleCount >= entries.length) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((current) => Math.min(current + GAME_BATCH_SIZE, entries.length));
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
            {visibleEntries.map((entry) => {
              const posterUrl = sanitizePosterUrl(entry.item.posterUrl);

              return (
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
                            RAWG: {entry.item.imdbRating}
                          </span>
                        ) : null}
                        <span className={searchStyles.resultRating}>Мій: {entry.rating ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                  <div className={searchStyles.posterWrapper}>
                    {posterUrl ? (
                      <Image
                        src={posterUrl}
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
                    <p className={searchStyles.resultMeta}>Рік: {entry.item.year ?? "—"}</p>
                    <div className={searchStyles.userMeta}>
                      <span>Пройдено: {entry.isViewed ? "так" : "ні"}</span>
                      {entry.availability ? <span>Наявність: {entry.availability}</span> : null}
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
                  setVisibleCount((current) => Math.min(current + GAME_BATCH_SIZE, entries.length))
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

const ModalDescription = ({ text }: { text: string }) => {
  const normalized = text.trim();
  const [expanded, setExpanded] = useState(false);
  const [isOverflow, setIsOverflow] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const node = descriptionRef.current;
    if (!node || !normalized) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      setIsOverflow(node.scrollHeight > node.clientHeight + 1);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [expanded, normalized]);

  const handleExpand = (event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setExpanded(true);
  };

  if (!normalized) {
    return <p className={searchStyles.resultPlot}>Опис недоступний.</p>;
  }

  return (
    <div className={searchStyles.plotBlock}>
      <p
        ref={descriptionRef}
        className={`${searchStyles.resultPlot} ${expanded ? "" : searchStyles.modalPlotClamp}`}
      >
        {normalized}
      </p>
      {!expanded && isOverflow ? (
        <span
          className={searchStyles.plotToggle}
          role="button"
          tabIndex={0}
          onClick={handleExpand}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              handleExpand(event);
            }
          }}
        >
          Детальніше
        </span>
      ) : null}
    </div>
  );
};

const renderGenreLinks = (genres?: GameNormalizedGenre[] | null) => {
  const resolvedGenres = (genres ?? []).slice(0, 8);

  if (resolvedGenres.length === 0) {
    return null;
  }

  return (
    <span className={searchStyles.metaEntityLinks}>
      {resolvedGenres.map((genre, index) => (
        <span key={`${genre.source}:${genre.sourceGenreId}:${index}`}>
          {index > 0 ? ", " : null}
          <Link
            href={buildGenreHref({
              mediaKind: "game",
              source: genre.source,
              sourceGenreId: genre.sourceGenreId,
            })}
            className={searchStyles.metaEntityLink}
          >
            {genre.name}
          </Link>
        </span>
      ))}
    </span>
  );
};

const loadGameGenreCollectionData = async (source: GenreSource, sourceGenreId: string) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: genreRow, error: genreError } = await supabase
    .from("genres")
    .select("id, name, source, source_genre_id")
    .eq("media_kind", "game")
    .eq("source", source)
    .eq("source_genre_id", sourceGenreId)
    .maybeSingle();

  if (genreError || !genreRow) {
    return {
      genre: null,
      collectionGames: [] as GameGenreView[],
      message: "Жанр не знайдено.",
    };
  }

  const resolvedGenre: GameGenreRecord = {
    id: genreRow.id,
    name: genreRow.name,
    source: genreRow.source,
    sourceGenreId: genreRow.source_genre_id,
  };

  if (!user) {
    return {
      genre: resolvedGenre,
      collectionGames: [] as GameGenreView[],
      message: "Потрібна авторизація.",
    };
  }

  const { data: itemGenreRows, error: itemGenreError } = await supabase
    .from("item_genres")
    .select("item_id")
    .eq("genre_id", genreRow.id);

  if (itemGenreError) {
    return {
      genre: resolvedGenre,
      collectionGames: [] as GameGenreView[],
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
      collectionGames: [] as GameGenreView[],
      message: "",
    };
  }

  const { data: genreLinks } = await supabase
    .from("item_genres")
    .select("item_id, genres!inner(source, source_genre_id, name)")
    .in("item_id", itemIds);

  const genresByItemId = new Map<string, GameNormalizedGenre[]>();
  ((genreLinks ?? []) as Array<{
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
          entry.source === genre.source && entry.sourceGenreId === genre.source_genre_id,
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

  const { data, error } = await supabase
    .from("user_views")
    .select(
      "id, viewed_at, comment, recommend_similar, is_viewed, rating, view_percent, availability, platforms, items!inner(id, title, description, genres, poster_url, external_id, year, imdb_rating, type)",
    )
    .eq("user_id", user.id)
    .in("item_id", itemIds)
    .eq("items.type", "game");

  if (error) {
    return {
      genre: resolvedGenre,
      collectionGames: [] as GameGenreView[],
      message: "Не вдалося завантажити жанр.",
    };
  }

  const collectionGames = ((data ?? []) as Array<{
    id: string;
    viewed_at: string;
    comment: string | null;
    recommend_similar: boolean;
    is_viewed: boolean;
    rating: number | null;
    view_percent: number;
    availability: string | null;
    platforms: string[] | null;
    items:
      | {
          id: string;
          title: string;
          description?: string | null;
          genres?: string | null;
          poster_url?: string | null;
          external_id?: string | null;
          year?: number | null;
          imdb_rating?: string | null;
          type?: string | null;
        }
      | Array<{
          id: string;
          title: string;
          description?: string | null;
          genres?: string | null;
          poster_url?: string | null;
          external_id?: string | null;
          year?: number | null;
          imdb_rating?: string | null;
          type?: string | null;
        }>;
  }>)
    .map((row) => {
      const item = Array.isArray(row.items) ? row.items[0] : row.items;
      return item?.type === "game"
        ? {
            viewId: row.id,
            viewedAt: row.viewed_at,
            comment: row.comment,
            recommendSimilar: row.recommend_similar,
            isViewed: row.is_viewed,
            rating: row.rating,
            viewPercent: row.view_percent,
            availability: row.availability,
            platforms: normalizeGamePlatforms(row.platforms),
            item: {
              id: item.id,
              title: item.title,
              description: item.description ?? null,
              genres: item.genres ?? null,
              posterUrl: item.poster_url ?? null,
              externalId: item.external_id ?? null,
              year: item.year ?? null,
              imdbRating: item.imdb_rating ?? null,
              genreItems: genresByItemId.get(item.id) ?? [],
              trailers: null as Trailer[] | null,
            },
          }
        : null;
    })
    .filter((entry): entry is GameGenreView => Boolean(entry))
    .sort((left, right) => {
      if (left.isViewed !== right.isViewed) return left.isViewed ? -1 : 1;
      const leftDate = left.viewedAt ? new Date(left.viewedAt).getTime() : 0;
      const rightDate = right.viewedAt ? new Date(right.viewedAt).getTime() : 0;
      if (rightDate !== leftDate) return rightDate - leftDate;
      return left.item.title.localeCompare(right.item.title, "uk");
    });

  return {
    genre: resolvedGenre,
    collectionGames,
    message: "",
  };
};

export default function GameGenreDetailPage({
  source,
  sourceGenreId,
}: {
  source: GenreSource;
  sourceGenreId: string;
}) {
  const [genre, setGenre] = useState<GameGenreRecord | null>(null);
  const [collectionGames, setCollectionGames] = useState<GameGenreView[]>([]);
  const [selectedExistingGame, setSelectedExistingGame] = useState<GameGenreView | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<GameItemDraft | null>(null);
  const [message, setMessage] = useState("Завантаження жанру…");

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      const data = await loadGameGenreCollectionData(source, sourceGenreId);
      if (isCancelled) {
        return;
      }
      setGenre(data.genre);
      setCollectionGames(data.collectionGames);
      setMessage(data.message);
    })();

    return () => {
      isCancelled = true;
    };
  }, [source, sourceGenreId]);

  const watchedEntries = useMemo(
    () => collectionGames.filter((entry) => entry.isViewed),
    [collectionGames],
  );
  const plannedEntries = useMemo(
    () => collectionGames.filter((entry) => !entry.isViewed),
    [collectionGames],
  );
  const stats = useMemo(() => {
    const rated = collectionGames.filter((entry) => entry.rating !== null);
    return {
      total: collectionGames.length,
      watched: watchedEntries.length,
      average:
        rated.length > 0
          ? rated.reduce((sum, entry) => sum + (entry.rating ?? 0), 0) / rated.length
          : null,
    };
  }, [collectionGames, watchedEntries.length]);

  const handleUpdateSelectedGame = useCallback(
    async (payload: {
      viewedAt: string;
      comment: string;
      recommendSimilar: boolean;
      isViewed: boolean;
      rating: number | null;
      viewPercent: number;
      platforms: string[];
      availability: string | null;
    }) => {
      if (!selectedExistingGame) {
        return;
      }

      const normalizedPlatforms = normalizeGamePlatforms(payload.platforms);
      const { error: updateViewError } = await supabase
        .from("user_views")
        .update({
          viewed_at: payload.viewedAt,
          comment: payload.comment,
          recommend_similar: payload.recommendSimilar,
          is_viewed: payload.isViewed,
          rating: payload.rating,
          view_percent: payload.viewPercent,
          availability: payload.availability,
          platforms: normalizedPlatforms,
        })
        .eq("id", selectedExistingGame.viewId);

      if (updateViewError) {
        throw new Error(updateViewError.message);
      }

      if (selectedDraft) {
        const { error: updateItemError } = await supabase
          .from("items")
          .update({
            poster_url: selectedDraft.posterUrl,
            year: selectedDraft.year,
            imdb_rating: selectedDraft.imdbRating,
            description: selectedDraft.description,
            genres: selectedDraft.genres,
            trailers: selectedDraft.trailers,
          })
          .eq("id", selectedExistingGame.item.id);

        if (updateItemError) {
          throw new Error(updateItemError.message);
        }

        await trySyncGameNormalizedGenres(
          supabase,
          selectedExistingGame.item.id,
          selectedDraft.normalizedGenres,
        );
      }

      const data = await loadGameGenreCollectionData(source, sourceGenreId);
      setGenre(data.genre);
      setCollectionGames(data.collectionGames);
      setMessage(data.message);
      setSelectedExistingGame(null);
    },
    [selectedDraft, selectedExistingGame, source, sourceGenreId],
  );

  const handleDeleteSelectedGame = useCallback(async () => {
    if (!selectedExistingGame) {
      return;
    }

    const { error } = await supabase.from("user_views").delete().eq("id", selectedExistingGame.viewId);
    if (error) {
      throw new Error(error.message);
    }

    const data = await loadGameGenreCollectionData(source, sourceGenreId);
    setGenre(data.genre);
    setCollectionGames(data.collectionGames);
    setMessage(data.message);
    setSelectedExistingGame(null);
  }, [selectedExistingGame, source, sourceGenreId]);

  const handleRefreshSelectedGame = useCallback(async () => {
    if (!selectedExistingGame?.item.externalId) {
      return;
    }

    const response = await fetch(`/api/rawg/${selectedExistingGame.item.externalId}`);
    if (!response.ok) {
      throw new Error("Не вдалося оновити метадані гри.");
    }

    const detail = (await response.json()) as {
      rating?: number | null;
      released?: string;
      poster?: string;
      genres?: string;
      genreItems?: GameNormalizedGenre[];
      description?: string;
      trailers?: Trailer[] | null;
    };

    setSelectedDraft({
      posterUrl: detail.poster?.trim() || selectedExistingGame.item.posterUrl,
      year: detail.released?.trim()
        ? Number.parseInt(detail.released.slice(0, 4), 10) || selectedExistingGame.item.year
        : selectedExistingGame.item.year,
      imdbRating:
        typeof detail.rating === "number"
          ? detail.rating.toFixed(1)
          : selectedExistingGame.item.imdbRating,
      description: detail.description?.trim() || selectedExistingGame.item.description,
      genres: detail.genres?.trim() || selectedExistingGame.item.genres,
      normalizedGenres: detail.genreItems ?? selectedExistingGame.item.genreItems,
      trailers: detail.trailers ?? selectedExistingGame.item.trailers,
    });
  }, [selectedExistingGame]);

  const activeGame = selectedExistingGame;
  const activeGenres = selectedDraft?.normalizedGenres ?? activeGame?.item.genreItems ?? null;
  const activeGenreText = selectedDraft?.genres ?? activeGame?.item.genres ?? null;

  return (
    <CatalogLayout
      title={genre?.name ?? "Жанр"}
      headerRight={
        <Link href="/statistics?media=games" className="btnBase btnSecondary">
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
                  <span className={styles.kpiLabel}>Пройдено</span>
                  <span className={styles.kpiValue}>{stats.watched}</span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>Середня моя оцінка</span>
                  <span className={styles.kpiValue}>
                    {stats.average !== null ? stats.average.toFixed(1) : "—"}
                  </span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>Джерело</span>
                  <span className={styles.kpiValue}>{genre.source.toUpperCase()}</span>
                </div>
              </div>
            </section>

            <GameGenreSection
              key={`${source}:${sourceGenreId}:watched`}
              title="Пройдене в жанрі"
              entries={watchedEntries}
              emptyMessage="У цьому жанрі поки немає пройдених ігор."
              onOpenExisting={(view) => {
                setSelectedDraft(null);
                setSelectedExistingGame(view);
              }}
            />
            <GameGenreSection
              key={`${source}:${sourceGenreId}:planned`}
              title="Ще не пройдено"
              entries={plannedEntries}
              emptyMessage="У цьому жанрі все в колекції вже пройдено."
              onOpenExisting={(view) => {
                setSelectedDraft(null);
                setSelectedExistingGame(view);
              }}
            />
          </>
        ) : null}

        {activeGame ? (
          <CatalogModal
            title={activeGame.item.title}
            posterUrl={
              sanitizePosterUrl(selectedDraft?.posterUrl ?? activeGame.item.posterUrl) ?? undefined
            }
            onClose={() => {
              setSelectedDraft(null);
              setSelectedExistingGame(null);
            }}
            size="wide"
            availabilityOptions={AVAILABILITY_OPTIONS}
            platformOptions={GAME_PLATFORM_OPTIONS}
            onAdd={handleUpdateSelectedGame}
            onDelete={handleDeleteSelectedGame}
            onRefresh={handleRefreshSelectedGame}
            initialValues={{
              viewedAt: activeGame.viewedAt,
              comment: activeGame.comment,
              recommendSimilar: activeGame.recommendSimilar,
              isViewed: activeGame.isViewed,
              rating: activeGame.rating,
              viewPercent: activeGame.viewPercent,
              platforms: activeGame.platforms,
              availability: activeGame.availability,
            }}
            submitLabel="Зберегти"
          >
            <div className={searchStyles.resultContent}>
              {selectedDraft?.year ?? activeGame.item.year ? (
                <p className={searchStyles.resultMeta}>
                  Рік: {selectedDraft?.year ?? activeGame.item.year}
                </p>
              ) : null}
              {selectedDraft?.imdbRating ?? activeGame.item.imdbRating ? (
                <p className={searchStyles.resultMeta}>
                  RAWG: {selectedDraft?.imdbRating ?? activeGame.item.imdbRating}
                </p>
              ) : null}
              {activeGenres?.length || activeGenreText ? (
                <p className={searchStyles.resultMeta}>
                  Жанри: {renderGenreLinks(activeGenres) ?? activeGenreText}
                </p>
              ) : null}
              <ModalDescription text={selectedDraft?.description ?? activeGame.item.description ?? ""} />
            </div>
          </CatalogModal>
        ) : null}
      </div>
    </CatalogLayout>
  );
}
