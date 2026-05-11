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
import TrailerViewerModal from "@/components/films/TrailerViewerModal";
import searchStyles from "@/components/catalog/CatalogSearch.module.css";
import { buildGameServiceMenuAction } from "@/lib/collection/serviceSearchLinks";
import { supabase } from "@/lib/supabase/client";
import { buildGenreHref, type GenreSource } from "@/lib/genres/routes";
import {
  type GameNormalizedGenre,
  trySyncGameNormalizedGenres,
} from "@/lib/games/normalizedMetadata";
import { normalizeGamePlatforms } from "@/lib/games/platforms";
import { DEFAULT_GAME_PLATFORM_OPTIONS } from "@/lib/settings/displayPreferences";
import {
  fetchLatestGameFitProfileAnalysis,
  requestGameFitEvaluation,
} from "@/lib/shishka/fitEvaluationClient";
import type { ShishkaFitAssessment } from "@/lib/shishka/fitAssessment";
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
  shishkaFitLabel: ShishkaFitAssessment["label"] | null;
  shishkaFitReason: string | null;
  shishkaFitProfileAnalyzedAt: string | null;
  shishkaFitScopeValue: string | null;
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
const ALLOWED_GAME_IMAGE_HOSTS = new Set([
  "images.igdb.com",
  "media.rawg.io",
]);

const getPrimaryGameScopeValue = (platforms: string[] | null | undefined) => {
  const normalizedPlatforms = normalizeGamePlatforms(platforms);
  return normalizedPlatforms[0] ?? "Усі платформи";
};

const sanitizePosterUrl = (value?: string | null) => {
  const normalized = value?.trim().replace(/\)+$/, "") || "";
  if (!normalized) {
    return null;
  }

  // Keep relative paths untouched if they ever appear.
  if (normalized.startsWith("/")) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") {
      return null;
    }
    if (!ALLOWED_GAME_IMAGE_HOSTS.has(parsed.hostname)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const normalizeTrailers = (trailers?: Trailer[] | null) => {
  const normalized = (trailers ?? []).filter(
    (trailer) => trailer?.site?.toLowerCase() === "youtube" && trailer.url,
  );
  return normalized.length > 0 ? normalized : null;
};

const selectPreferredTrailer = (trailers?: Trailer[] | null) =>
  normalizeTrailers(trailers)?.find((trailer) => trailer.official) ??
  normalizeTrailers(trailers)?.[0] ??
  null;

const getStoredShishkaFitAssessment = (
  view: GameGenreView,
): ShishkaFitAssessment | null => {
  if (
    !view.shishkaFitLabel ||
    !view.shishkaFitReason?.trim() ||
    !view.shishkaFitProfileAnalyzedAt ||
    !view.shishkaFitScopeValue
  ) {
    return null;
  }

  return {
    label: view.shishkaFitLabel,
    reason: view.shishkaFitReason.trim(),
    profileAnalyzedAt: view.shishkaFitProfileAnalyzedAt,
    scopeValue: view.shishkaFitScopeValue,
  };
};

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
      "id, viewed_at, comment, recommend_similar, is_viewed, rating, view_percent, availability, platforms, shishka_fit_label, shishka_fit_reason, shishka_fit_profile_analyzed_at, shishka_fit_scope_value, items!inner(id, title, description, genres, poster_url, external_id, year, imdb_rating, type)",
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
    shishka_fit_label?: ShishkaFitAssessment["label"] | null;
    shishka_fit_reason?: string | null;
    shishka_fit_profile_analyzed_at?: string | null;
    shishka_fit_scope_value?: string | null;
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
            shishkaFitLabel: row.shishka_fit_label ?? null,
            shishkaFitReason: row.shishka_fit_reason ?? null,
            shishkaFitProfileAnalyzedAt: row.shishka_fit_profile_analyzed_at ?? null,
            shishkaFitScopeValue: row.shishka_fit_scope_value ?? null,
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
  const [trailerMessage, setTrailerMessage] = useState("");
  const [isTrailerLoading, setIsTrailerLoading] = useState(false);
  const [trailerModal, setTrailerModal] = useState<{
    trailers: Trailer[];
    index: number;
    baseTitle: string;
  } | null>(null);

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

  const evaluateGameWithProfile = useCallback(
    async (
      game: {
        title: string;
        year?: string | number | null;
        genres?: string | null;
        description?: string | null;
        platforms?: string[] | null;
      },
      previousAssessment?: ShishkaFitAssessment | null,
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Не вдалося визначити користувача.");
      }

      const scopeValue = getPrimaryGameScopeValue(game.platforms);
      const profileAnalysis = await fetchLatestGameFitProfileAnalysis(
        supabase,
        user.id,
        scopeValue,
      );

      if (!profileAnalysis) {
        throw new Error("Спершу онови профіль для цієї платформи.");
      }

      if (
        previousAssessment?.profileAnalyzedAt &&
        previousAssessment.profileAnalyzedAt === profileAnalysis.analyzedAt
      ) {
        throw new Error("Спершу онови профіль, а потім запускай переоцінку.");
      }

      return requestGameFitEvaluation({
        scopeLabel: scopeValue,
        profileAnalysis,
        item: {
          title: game.title,
          year: game.year ?? null,
          genres: game.genres ?? null,
          description: game.description ?? null,
          platforms: game.platforms ?? null,
        },
      });
    },
    [],
  );

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
      shishkaFitAssessment: ShishkaFitAssessment | null;
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
          shishka_fit_label: payload.shishkaFitAssessment?.label ?? null,
          shishka_fit_reason: payload.shishkaFitAssessment?.reason ?? null,
          shishka_fit_profile_analyzed_at:
            payload.shishkaFitAssessment?.profileAnalyzedAt ?? null,
          shishka_fit_scope_value: payload.shishkaFitAssessment?.scopeValue ?? null,
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

  const persistSelectedGameAssessment = useCallback(
    async (assessment: ShishkaFitAssessment) => {
      if (!selectedExistingGame) {
        return;
      }

      const updatePayload = {
        shishka_fit_label: assessment.label,
        shishka_fit_reason: assessment.reason,
        shishka_fit_profile_analyzed_at: assessment.profileAnalyzedAt,
        shishka_fit_scope_value: assessment.scopeValue,
      };

      const { error } = await supabase
        .from("user_views")
        .update(updatePayload)
        .eq("id", selectedExistingGame.viewId);

      if (error) {
        throw new Error("Не вдалося зберегти оцінку.");
      }

      setCollectionGames((prev) =>
        prev.map((item) =>
          item.viewId === selectedExistingGame.viewId
            ? {
                ...item,
                shishkaFitLabel: updatePayload.shishka_fit_label,
                shishkaFitReason: updatePayload.shishka_fit_reason,
                shishkaFitProfileAnalyzedAt: updatePayload.shishka_fit_profile_analyzed_at,
                shishkaFitScopeValue: updatePayload.shishka_fit_scope_value,
              }
            : item,
        ),
      );

      setSelectedExistingGame((prev) =>
        prev && prev.viewId === selectedExistingGame.viewId
          ? {
              ...prev,
              shishkaFitLabel: updatePayload.shishka_fit_label,
              shishkaFitReason: updatePayload.shishka_fit_reason,
              shishkaFitProfileAnalyzedAt: updatePayload.shishka_fit_profile_analyzed_at,
              shishkaFitScopeValue: updatePayload.shishka_fit_scope_value,
            }
          : prev,
      );
    },
    [selectedExistingGame],
  );

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

  const openTrailerModal = useCallback((title: string, trailers?: Trailer[] | null) => {
    const picked = selectPreferredTrailer(trailers);
    if (!picked) {
      setTrailerMessage("Трейлер недоступний.");
      return false;
    }
    const safeTrailers = normalizeTrailers(trailers) ?? [];
    const pickedIndex = safeTrailers.indexOf(picked);
    setTrailerModal({
      trailers: safeTrailers,
      index: pickedIndex >= 0 ? pickedIndex : 0,
      baseTitle: title,
    });
    return true;
  }, []);

  const fetchGameTrailers = useCallback(async (gameId: string): Promise<Trailer[] | null> => {
    const response = await fetch(`/api/rawg/${gameId}`);
    if (!response.ok) return null;
    const detail = (await response.json()) as { trailers?: Trailer[] | null };
    return normalizeTrailers(detail.trailers ?? null);
  }, []);

  const handleWatchSelectedGameTrailer = useCallback(async () => {
    if (!selectedExistingGame) return;
    setTrailerMessage("");
    const currentTrailers =
      normalizeTrailers(selectedDraft?.trailers ?? null) ??
      normalizeTrailers(selectedExistingGame.item.trailers ?? null);
    if (currentTrailers) {
      openTrailerModal(selectedExistingGame.item.title, currentTrailers);
      return;
    }
    const externalId = selectedExistingGame.item.externalId ?? "";
    if (!externalId) {
      setTrailerMessage("Трейлер недоступний.");
      return;
    }

    setIsTrailerLoading(true);
    try {
      const trailers = await fetchGameTrailers(externalId);
      if (!trailers) {
        setTrailerMessage("Трейлер недоступний.");
        return;
      }

      setSelectedDraft((prev) => (prev ? { ...prev, trailers } : { ...({
        posterUrl: selectedExistingGame.item.posterUrl,
        year: selectedExistingGame.item.year,
        imdbRating: selectedExistingGame.item.imdbRating,
        description: selectedExistingGame.item.description,
        genres: selectedExistingGame.item.genres,
        normalizedGenres: selectedExistingGame.item.genreItems,
        trailers,
      } satisfies GameItemDraft) }));

      const { error } = await supabase
        .from("items")
        .update({ trailers })
        .eq("id", selectedExistingGame.item.id);

      if (error) {
        setTrailerMessage("Не вдалося зберегти трейлер.");
        return;
      }

      setCollectionGames((prev) =>
        prev.map((item) =>
          item.item.id === selectedExistingGame.item.id
            ? {
                ...item,
                item: {
                  ...item.item,
                  trailers,
                },
              }
            : item,
        ),
      );

      setSelectedExistingGame((prev) =>
        prev && prev.item.id === selectedExistingGame.item.id
          ? {
              ...prev,
              item: {
                ...prev.item,
                trailers,
              },
            }
          : prev,
      );

      openTrailerModal(selectedExistingGame.item.title, trailers);
    } catch (error) {
      const nextMessage =
        error instanceof Error && error.message
          ? error.message
          : "Не вдалося отримати трейлер.";
      setTrailerMessage(nextMessage);
    } finally {
      setIsTrailerLoading(false);
    }
  }, [fetchGameTrailers, openTrailerModal, selectedDraft, selectedExistingGame]);

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
            fitTargetText="ця гра"
            onClose={() => {
              setSelectedDraft(null);
              setSelectedExistingGame(null);
            }}
            size="wide"
            showRecommendSimilar={false}
            availabilityOptions={AVAILABILITY_OPTIONS}
            platformOptions={GAME_PLATFORM_OPTIONS}
            onAdd={handleUpdateSelectedGame}
            onDelete={handleDeleteSelectedGame}
            onRefresh={handleRefreshSelectedGame}
            previewAction={{
              label: isTrailerLoading ? "Завантаження..." : "Переглянути трейлер",
              onClick: handleWatchSelectedGameTrailer,
              disabled: isTrailerLoading,
            }}
            previewMenuAction={buildGameServiceMenuAction(activeGame.item.title)}
            onEvaluate={(payload) =>
              evaluateGameWithProfile(
                {
                  title: activeGame.item.title,
                  year: selectedDraft?.year ?? activeGame.item.year,
                  genres: selectedDraft?.genres ?? activeGame.item.genres,
                  description: selectedDraft?.description ?? activeGame.item.description,
                  platforms: payload.platforms,
                },
                payload.shishkaFitAssessment,
              )
            }
            onPersistEvaluatedAssessment={persistSelectedGameAssessment}
            initialValues={{
              viewedAt: activeGame.viewedAt,
              comment: activeGame.comment,
              recommendSimilar: activeGame.recommendSimilar,
              isViewed: activeGame.isViewed,
              rating: activeGame.rating,
              viewPercent: activeGame.viewPercent,
              platforms: activeGame.platforms,
              availability: activeGame.availability,
              shishkaFitAssessment: getStoredShishkaFitAssessment(activeGame),
            }}
            submitLabel="Зберегти"
          >
            {({ fitBadge }) => (
              <div className={searchStyles.resultContent}>
                <div className={searchStyles.titleRow}>
                  {selectedDraft?.imdbRating ?? activeGame.item.imdbRating ? (
                    <span className={searchStyles.resultRating}>
                      RAWG: {selectedDraft?.imdbRating ?? activeGame.item.imdbRating}
                    </span>
                  ) : null}
                  {fitBadge}
                  <span className={searchStyles.resultRating}>Мій: {activeGame.rating ?? "—"}</span>
                </div>
                {selectedDraft?.year ?? activeGame.item.year ? (
                  <p className={searchStyles.resultMeta}>
                    Рік: {selectedDraft?.year ?? activeGame.item.year}
                  </p>
                ) : null}
                {activeGenres?.length || activeGenreText ? (
                  <p className={searchStyles.resultMeta}>
                    Жанри: {renderGenreLinks(activeGenres) ?? activeGenreText}
                  </p>
                ) : null}
                {trailerMessage ? <p className={styles.message}>{trailerMessage}</p> : null}
                <ModalDescription text={selectedDraft?.description ?? activeGame.item.description ?? ""} />
              </div>
            )}
          </CatalogModal>
        ) : null}
        {trailerModal ? (
          <TrailerViewerModal
            key={`${trailerModal.baseTitle}:${trailerModal.index}:${trailerModal.trailers.length}`}
            trailers={trailerModal.trailers}
            initialIndex={trailerModal.index}
            baseTitle={trailerModal.baseTitle}
            onClose={() => setTrailerModal(null)}
          />
        ) : null}
      </div>
    </CatalogLayout>
  );
}
