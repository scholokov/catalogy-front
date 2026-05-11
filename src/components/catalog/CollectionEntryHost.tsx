"use client";

import { useEffect, useMemo, useState } from "react";
import CatalogModal from "@/components/catalog/CatalogModal";
import FilmCatalogModal from "@/components/films/FilmCatalogModal";
import TrailerViewerModal from "@/components/films/TrailerViewerModal";
import GameMetadataContent from "@/components/games/GameMetadataContent";
import { useSnackbar } from "@/components/ui/SnackbarProvider";
import {
  evaluateFilmCollectionFit,
  evaluateGameCollectionFit,
} from "@/lib/collection/fitEvaluation";
import { emitCollectionEntrySaved } from "@/lib/collection/events";
import {
  saveFilmDraftToCollection,
  saveGameDraftToCollection,
} from "@/lib/collection/draftSubmission";
import {
  buildFilmServiceMenuAction,
  buildGameServiceMenuAction,
} from "@/lib/collection/serviceSearchLinks";
import {
  fetchFilmTrailers,
  fetchGameTrailers,
  selectPreferredTrailer,
} from "@/lib/collection/trailers";
import type { CollectionEntryLaunchRequest } from "@/lib/collection/entryLauncher";
import {
  type FilmCollectionTrailer,
  type FilmCollectionFormPayload,
} from "@/lib/films/collectionFlow";
import { type FilmNormalizedGenre, type FilmNormalizedPerson } from "@/lib/films/normalizedMetadata";
import { loadStoredGenresForItem } from "@/lib/films/storedGenres";
import { loadStoredPeopleForItem } from "@/lib/films/storedPeople";
import {
  type GameCollectionTrailer,
  type GameCollectionFormPayload,
} from "@/lib/games/collectionFlow";
import { type GameNormalizedGenre } from "@/lib/games/normalizedMetadata";
import { loadStoredGameGenresForItem } from "@/lib/games/storedGenres";
import { DEFAULT_GAME_PLATFORM_OPTIONS, readDisplayPreferences } from "@/lib/settings/displayPreferences";
import {
  mergeShishkaAssessmentIntoComment,
  type ShishkaFitAssessment,
} from "@/lib/shishka/fitAssessment";
import { supabase } from "@/lib/supabase/client";
import styles from "@/components/catalog/CatalogSearch.module.css";

const AVAILABILITY_OPTIONS = [
  "В колекції",
  "Тимчасовий доступ",
  "Пройдено/переглянуто десь",
  "Продано",
  "Втрачено",
];

type HostProps = {
  request: CollectionEntryLaunchRequest | null;
  onClose: () => void;
};

type SharedInitialValues = {
  viewedAt?: string;
  comment?: string | null;
  recommendSimilar?: boolean;
  isViewed?: boolean;
  rating?: number | null;
  viewPercent?: number | null;
  platforms?: string[] | null;
  availability?: string | null;
  shishkaFitAssessment?: ShishkaFitAssessment | null;
};

type ExistingOwnView = {
  id: string;
  item_id: string;
  viewed_at: string;
  rating: number | null;
  comment: string | null;
  recommend_similar: boolean;
  is_viewed: boolean;
  view_percent: number;
  availability: string | null;
  platforms: string[] | null;
};

type FilmEntryState = {
  kind: "film";
  entryMode: "item" | "draft";
  externalId: string;
  itemId?: string;
  title: string;
  posterUrl?: string;
  imageUrls?: string[];
  imdbRating?: string | null;
  year?: string | number | null;
  mediaType?: string | null;
  originalTitle?: string | null;
  englishTitle?: string | null;
  director?: string | null;
  actors?: string | null;
  genres?: string | null;
  description?: string | null;
  people: FilmNormalizedPerson[];
  genreItems: FilmNormalizedGenre[];
  trailers?: FilmCollectionTrailer[] | null;
  existingView: ExistingOwnView | null;
  initialValues: SharedInitialValues;
  availabilityOptions: string[];
  recommendationScopeValue?: string | null;
};

type GameEntryState = {
  kind: "game";
  entryMode: "item" | "draft";
  externalId: string;
  itemId?: string;
  title: string;
  posterUrl?: string;
  rating: number | null;
  ratingSource?: "igdb" | "rawg";
  year?: string | null;
  genres?: string | null;
  description?: string | null;
  genreItems: GameNormalizedGenre[];
  trailers?: GameCollectionTrailer[] | null;
  existingView: ExistingOwnView | null;
  initialValues: SharedInitialValues;
  availabilityOptions: string[];
  platformOptions: string[];
  recommendationScopeValue?: string | null;
};

type HostState = FilmEntryState | GameEntryState | null;

type TrailerModalState = {
  trailers: Array<{ name?: string; url: string }>;
  index: number;
  baseTitle: string;
} | null;

const toInitialValues = (existingView: ExistingOwnView | null): SharedInitialValues => {
  if (!existingView) {
    return {};
  }

  return {
    viewedAt: existingView.viewed_at,
    comment: existingView.comment,
    recommendSimilar: existingView.recommend_similar,
    isViewed: existingView.is_viewed,
    rating: existingView.rating,
    viewPercent: existingView.view_percent,
    platforms: existingView.platforms ?? [],
    availability: existingView.availability,
  };
};

async function loadExistingOwnView(itemId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("user_views")
    .select(
      "id, item_id, viewed_at, rating, comment, recommend_similar, is_viewed, view_percent, availability, platforms",
    )
    .eq("user_id", user.id)
    .eq("item_id", itemId)
    .maybeSingle();

  return (data as ExistingOwnView | null) ?? null;
}

export default function CollectionEntryHost({ request, onClose }: HostProps) {
  const { showSnackbar } = useSnackbar();
  const [state, setState] = useState<HostState>(null);
  const [trailerModal, setTrailerModal] = useState<TrailerModalState>(null);
  const [trailerMessage, setTrailerMessage] = useState("");
  const [isTrailerLoading, setIsTrailerLoading] = useState(false);

  useEffect(() => {
    if (!request) {
      setState(null);
      setTrailerModal(null);
      setTrailerMessage("");
      return;
    }

    let isCancelled = false;

    void (async () => {
      try {
        const displayPreferences = readDisplayPreferences();
        if (request.kind === "draft") {
          const existingView = request.draft.itemId
            ? await loadExistingOwnView(request.draft.itemId)
            : null;

          if (request.mediaKind === "film") {
            const initialValues = existingView
              ? toInitialValues(existingView)
              : {
                  availability: displayPreferences.showFilmAvailability
                    ? displayPreferences.defaultFilmAvailability
                    : null,
                  isViewed: displayPreferences.defaultFilmIsViewed ?? undefined,
                  comment: request.recommendationComment ?? null,
                  shishkaFitAssessment: request.recommendationFitAssessment ?? null,
                };

            if (!isCancelled) {
              setState({
                kind: "film",
                entryMode: "draft",
                externalId: request.draft.id,
                itemId: request.draft.itemId,
                title: request.draft.title,
                posterUrl: request.draft.poster ?? undefined,
                imageUrls: request.draft.imageUrls,
                imdbRating: request.draft.imdbRating,
                year: request.draft.year,
                mediaType: request.draft.mediaType,
                originalTitle: request.draft.originalTitle,
                englishTitle: request.draft.englishTitle,
                director: request.draft.director,
                actors: request.draft.actors,
                genres: request.draft.genres,
                description: request.draft.plot,
                people: request.draft.people ?? [],
                genreItems: request.draft.genreItems ?? [],
                trailers: request.draft.trailers ?? null,
                existingView,
                initialValues,
                availabilityOptions: displayPreferences.showFilmAvailability
                  ? AVAILABILITY_OPTIONS
                  : [],
                recommendationScopeValue: request.recommendationScopeValue ?? null,
              });
            }

            return;
          }

          const initialValues = existingView
            ? toInitialValues(existingView)
            : {
                platforms: displayPreferences.defaultGamePlatform
                  ? [displayPreferences.defaultGamePlatform]
                  : [],
                availability: displayPreferences.showGameAvailability
                  ? displayPreferences.defaultGameAvailability
                  : null,
                isViewed: displayPreferences.defaultGameIsViewed ?? undefined,
                comment: request.recommendationComment ?? null,
                shishkaFitAssessment: request.recommendationFitAssessment ?? null,
              };

          if (!isCancelled) {
            setState({
              kind: "game",
              entryMode: "draft",
              externalId: request.draft.id,
              itemId: request.draft.itemId,
              title: request.draft.title,
              posterUrl: request.draft.poster ?? undefined,
              rating: request.draft.rating,
              ratingSource: request.draft.ratingSource,
              year: request.draft.released ? request.draft.released.slice(0, 4) : null,
              genres: request.draft.genres,
              description: request.draft.description ?? null,
              genreItems: request.draft.genreItems ?? [],
              trailers: request.draft.trailers ?? null,
              existingView,
              initialValues,
              availabilityOptions: displayPreferences.showGameAvailability
                ? AVAILABILITY_OPTIONS
                : [],
              platformOptions: displayPreferences.visibleGamePlatforms.length > 0
                ? displayPreferences.visibleGamePlatforms
                : [...DEFAULT_GAME_PLATFORM_OPTIONS],
              recommendationScopeValue: request.recommendationScopeValue ?? null,
            });
          }

          return;
        }

        const existingView = await loadExistingOwnView(request.itemId);

        if (request.mediaKind === "film") {
          const { data: item } = await supabase
            .from("items")
            .select(
              "id, title, title_en, title_original, description, genres, director, actors, poster_url, imdb_rating, year, film_media_type, external_id",
            )
            .eq("id", request.itemId)
            .eq("type", "film")
            .maybeSingle();

          if (!item) {
          if (!isCancelled) {
            showSnackbar("Фільм не знайдено.");
            onClose();
          }
          return;
          }

          const [people, genreItems] = await Promise.all([
            loadStoredPeopleForItem(supabase, request.itemId),
            loadStoredGenresForItem(supabase, request.itemId),
          ]);

          const initialValues = existingView
            ? toInitialValues(existingView)
            : {
                availability: displayPreferences.showFilmAvailability
                  ? displayPreferences.defaultFilmAvailability
                  : null,
                isViewed: displayPreferences.defaultFilmIsViewed ?? undefined,
              };

          if (!isCancelled) {
            setState({
              kind: "film",
              entryMode: "item",
              externalId: item.external_id ?? request.itemId,
              itemId: request.itemId,
              title: item.title,
              posterUrl: item.poster_url ?? undefined,
              imdbRating: item.imdb_rating,
              year: item.year,
              mediaType: item.film_media_type,
              originalTitle: item.title_original,
              englishTitle: item.title_en,
              director: item.director,
              actors: item.actors,
              genres: item.genres,
              description: item.description,
              people,
              genreItems,
              trailers: null,
              existingView,
              initialValues,
              availabilityOptions: displayPreferences.showFilmAvailability
                ? AVAILABILITY_OPTIONS
                : [],
              recommendationScopeValue: null,
            });
          }

          return;
        }

        const { data: item } = await supabase
          .from("items")
          .select("id, title, description, genres, poster_url, imdb_rating, year, external_id")
          .eq("id", request.itemId)
          .eq("type", "game")
          .maybeSingle();

        if (!item) {
          if (!isCancelled) {
            showSnackbar("Гру не знайдено.");
            onClose();
          }
          return;
        }

        const genreItems = await loadStoredGameGenresForItem(supabase, request.itemId);
        const parsedRating =
          typeof item.imdb_rating === "string" && item.imdb_rating.trim()
            ? Number.parseFloat(item.imdb_rating)
            : null;
        const initialValues = existingView
          ? toInitialValues(existingView)
          : {
              platforms: displayPreferences.defaultGamePlatform
                ? [displayPreferences.defaultGamePlatform]
                : [],
              availability: displayPreferences.showGameAvailability
                ? displayPreferences.defaultGameAvailability
                : null,
              isViewed: displayPreferences.defaultGameIsViewed ?? undefined,
            };

        if (!isCancelled) {
          setState({
            kind: "game",
            entryMode: "item",
            externalId: item.external_id ?? request.itemId,
            itemId: request.itemId,
            title: item.title,
            posterUrl: item.poster_url ?? undefined,
            rating: Number.isFinite(parsedRating) ? parsedRating : null,
            ratingSource: undefined,
            year: item.year ? String(item.year) : null,
            genres: item.genres,
            description: item.description,
            genreItems,
            trailers: null,
            existingView,
            initialValues,
            availabilityOptions: displayPreferences.showGameAvailability
              ? AVAILABILITY_OPTIONS
              : [],
            platformOptions: displayPreferences.visibleGamePlatforms.length > 0
              ? displayPreferences.visibleGamePlatforms
              : [...DEFAULT_GAME_PLATFORM_OPTIONS],
            recommendationScopeValue: null,
          });
        }
      } catch (error) {
        if (!isCancelled) {
          showSnackbar(
            error instanceof Error && error.message
              ? error.message
              : "Не вдалося відкрити форму.",
          );
          onClose();
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [onClose, request, showSnackbar]);

  useEffect(() => {
    if (
      !state ||
      state.entryMode !== "draft" ||
      !state.recommendationScopeValue ||
      state.initialValues.shishkaFitAssessment
    ) {
      return;
    }

    let isCancelled = false;

    void (async () => {
      try {
        if (state.kind === "film") {
          const assessment = await evaluateFilmCollectionFit({
            supabase,
            film: {
              title: state.title,
              year: state.year,
              mediaType:
                state.mediaType === "movie" || state.mediaType === "tv"
                  ? state.mediaType
                  : null,
              genres: state.genres ?? null,
              director: state.director ?? null,
              actors: state.actors ?? null,
              plot: state.description ?? null,
            },
            previousAssessment: null,
          });

          if (!isCancelled) {
            setState((prev) =>
              prev?.kind === "film"
                ? {
                    ...prev,
                    initialValues: {
                      ...prev.initialValues,
                      shishkaFitAssessment: assessment,
                      comment: mergeShishkaAssessmentIntoComment(
                        prev.initialValues.comment ?? "",
                        assessment,
                      ),
                    },
                  }
                : prev,
            );
          }
          return;
        }

        const assessment = await evaluateGameCollectionFit({
          supabase,
          game: {
            title: state.title,
            year: state.year,
            genres: state.genres ?? null,
            description: state.description ?? null,
            platforms: state.recommendationScopeValue
              ? [state.recommendationScopeValue]
              : null,
          },
          previousAssessment: null,
        });

        if (!isCancelled) {
          setState((prev) =>
            prev?.kind === "game"
              ? {
                  ...prev,
                  initialValues: {
                    ...prev.initialValues,
                    shishkaFitAssessment: assessment,
                    comment: mergeShishkaAssessmentIntoComment(
                      prev.initialValues.comment ?? "",
                      assessment,
                    ),
                  },
                }
              : prev,
          );
        }
      } catch {
        // Keep the form usable even when fit auto-evaluation is unavailable.
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [state]);

  const openTrailerModal = (
    title: string,
    trailers?: Array<{ name?: string; url?: string | null; type?: string | null; official?: boolean | null }> | null,
  ) => {
    const picked = selectPreferredTrailer(trailers);
    if (!picked?.url) {
      setTrailerMessage("Трейлер недоступний.");
      return false;
    }
    const safeTrailers = (trailers ?? []).filter(
      (trailer): trailer is { name?: string; url: string } => Boolean(trailer.url),
    );
    const pickedIndex = safeTrailers.findIndex((trailer) => trailer.url === picked.url);
    setTrailerModal({
      trailers: safeTrailers,
      index: pickedIndex >= 0 ? pickedIndex : 0,
      baseTitle: title,
    });
    return true;
  };

  const handlePreview = async () => {
    if (!state) {
      return;
    }

    setTrailerMessage("");
    if (openTrailerModal(state.title, state.trailers ?? null)) {
      return;
    }

    if (!state.externalId?.trim()) {
      setTrailerMessage("Трейлер недоступний.");
      return;
    }

    setIsTrailerLoading(true);
    try {
      const trailers =
        state.kind === "film"
          ? await fetchFilmTrailers(
              state.externalId,
              state.mediaType === "movie" || state.mediaType === "tv"
                ? state.mediaType
                : undefined,
            )
          : await fetchGameTrailers(state.externalId);

      if (!trailers || trailers.length === 0) {
        setTrailerMessage("Трейлер недоступний.");
        return;
      }

      setState((prev) =>
        prev && prev.kind === state.kind ? { ...prev, trailers } : prev,
      );
      openTrailerModal(state.title, trailers);
    } finally {
      setIsTrailerLoading(false);
    }
  };

  const filmMessage = useMemo(
    () =>
      state?.kind === "film" ? (
        <>
          {state.existingView ? (
            <p className={styles.message}>Запис уже є у твоїй колекції. Відкрито форму редагування.</p>
          ) : null}
          {trailerMessage ? <p className={styles.message}>{trailerMessage}</p> : null}
        </>
      ) : null,
    [state, trailerMessage],
  );
  const canPreviewTrailer = Boolean(
    state && ((state.trailers?.length ?? 0) > 0 || state.externalId?.trim()),
  );

  if (!request || !state) {
    return null;
  }

  if (state.kind === "film") {
    return (
      <>
        <FilmCatalogModal
          title={state.title}
          posterUrl={state.posterUrl}
          imageUrls={state.imageUrls}
          size="wide"
          fitTargetText="цей фільм"
          showRecommendSimilar={false}
          onClose={onClose}
          imdbRating={state.imdbRating}
          personalRating={
            typeof state.initialValues.rating === "number"
              ? state.initialValues.rating.toFixed(1)
              : null
          }
          year={state.year}
          mediaType={state.mediaType}
          originalTitle={state.originalTitle}
          englishTitle={state.englishTitle}
          director={state.director}
          actors={state.actors}
          genres={state.genres}
          description={state.description}
          people={state.people}
          genreItems={state.genreItems}
          message={filmMessage}
          availabilityOptions={state.availabilityOptions}
          initialValues={state.initialValues}
          submitLabel={state.existingView ? "Зберегти" : "Додати"}
          previewAction={
            canPreviewTrailer
              ? {
                  label: isTrailerLoading ? "Завантаження..." : "Переглянути трейлер",
                  onClick: handlePreview,
                  disabled: isTrailerLoading,
                }
              : undefined
          }
          previewMenuAction={buildFilmServiceMenuAction(state.originalTitle, state.title)}
          onEvaluate={
            state.entryMode === "draft"
              ? (payload) =>
                  evaluateFilmCollectionFit({
                    supabase,
                    film: {
                      title: state.title,
                      year: state.year,
                      mediaType:
                        state.mediaType === "movie" || state.mediaType === "tv"
                          ? state.mediaType
                          : null,
                      genres: state.genres ?? null,
                      director: state.director ?? null,
                      actors: state.actors ?? null,
                      plot: state.description ?? null,
                    },
                    previousAssessment: payload.shishkaFitAssessment,
                  })
              : undefined
          }
          onAdd={async (payload) => {
            const result = await saveFilmDraftToCollection({
              supabase,
              film: {
                id: state.externalId,
                itemId: state.itemId,
                title: state.title,
                englishTitle: state.englishTitle ?? undefined,
                originalTitle: state.originalTitle ?? undefined,
                year:
                  typeof state.year === "number"
                    ? String(state.year)
                    : (state.year ?? undefined),
                poster: state.posterUrl ?? "",
                plot: state.description ?? "",
                genres: state.genres ?? "",
                director: state.director ?? "",
                actors: state.actors ?? "",
                imdbRating: state.imdbRating ?? undefined,
                mediaType:
                  state.mediaType === "movie" || state.mediaType === "tv"
                    ? state.mediaType
                    : undefined,
                trailers: state.trailers ?? null,
                people: state.people,
                genreItems: state.genreItems,
              },
              payload: payload as FilmCollectionFormPayload,
            });
            emitCollectionEntrySaved({
              mediaKind: "film",
              itemId: result.itemId ?? state.itemId ?? null,
            });
            await request.onCompleted?.();
          }}
        />
        {trailerModal ? (
          <TrailerViewerModal
            key={`${trailerModal.baseTitle}:${trailerModal.index}:${trailerModal.trailers.length}`}
            trailers={trailerModal.trailers}
            initialIndex={trailerModal.index}
            baseTitle={trailerModal.baseTitle}
            onClose={() => setTrailerModal(null)}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <CatalogModal
        title={state.title}
        posterUrl={state.posterUrl}
        size="wide"
        fitTargetText="ця гра"
        showRecommendSimilar={false}
        platformOptions={state.platformOptions}
        availabilityOptions={state.availabilityOptions}
        initialValues={state.initialValues}
        submitLabel={state.existingView ? "Зберегти" : "Додати"}
        onClose={onClose}
        previewAction={
          canPreviewTrailer
            ? {
                label: isTrailerLoading ? "Завантаження..." : "Переглянути трейлер",
                onClick: handlePreview,
                disabled: isTrailerLoading,
              }
            : undefined
        }
        previewMenuAction={buildGameServiceMenuAction(state.title)}
        onAdd={async (payload) => {
          const result = await saveGameDraftToCollection({
            supabase,
            game: {
              id: state.externalId,
              itemId: state.itemId,
              title: state.title,
              rating: state.rating,
              genres: state.genres ?? "",
              genreItems: state.genreItems,
              released: state.year ?? "",
              poster: state.posterUrl ?? "",
              trailers: state.trailers ?? null,
              description: state.description ?? null,
            },
            payload: payload as GameCollectionFormPayload,
          });
          emitCollectionEntrySaved({
            mediaKind: "game",
            itemId: result.itemId ?? state.itemId ?? null,
          });
          await request.onCompleted?.();
        }}
      >
        {({ fitBadge }) => (
          <GameMetadataContent
            externalRating={state.rating}
            externalRatingSource={state.ratingSource}
            personalRating={
              typeof state.initialValues.rating === "number"
                ? state.initialValues.rating.toFixed(1)
                : null
            }
            fitBadge={fitBadge}
            year={state.year}
            genres={
              state.genreItems.length > 0
                ? state.genreItems.map((genre) => genre.name).join(", ")
                : state.genres
            }
            description={state.description}
            message={
              <>
                {state.existingView ? (
                  <p className={styles.message}>Запис уже є у твоїй колекції. Відкрито форму редагування.</p>
                ) : null}
                {trailerMessage ? <p className={styles.message}>{trailerMessage}</p> : null}
              </>
            }
          />
        )}
      </CatalogModal>
      {trailerModal ? (
        <TrailerViewerModal
          key={`${trailerModal.baseTitle}:${trailerModal.index}:${trailerModal.trailers.length}`}
          trailers={trailerModal.trailers}
          initialIndex={trailerModal.index}
          baseTitle={trailerModal.baseTitle}
          onClose={() => setTrailerModal(null)}
        />
      ) : null}
    </>
  );
}
