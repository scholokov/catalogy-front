"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import CatalogModal from "@/components/catalog/CatalogModal";
import FilmMetadataContent from "@/components/films/FilmMetadataContent";
import TrailerViewerModal from "@/components/films/TrailerViewerModal";
import PersonHoverLink from "@/components/people/PersonHoverLink";
import { useSnackbar } from "@/components/ui/SnackbarProvider";
import {
  addFilmToCollection,
  normalizeEnglishTitle,
  normalizeFilmMediaType,
  normalizeTitle,
  normalizeTrailers,
  summarizeFilmPeople,
  type FilmCollectionFormPayload,
  type FilmCollectionSource,
  type FilmItemDraftInput,
  updateFilmView,
} from "@/lib/films/collectionFlow";
import {
  DISPLAY_PREFERENCES_STORAGE_KEY,
  readDisplayPreferences,
} from "@/lib/settings/displayPreferences";
import { supabase } from "@/lib/supabase/client";
import type { FilmNormalizedGenre, FilmNormalizedPerson } from "@/lib/films/normalizedMetadata";
import { loadStoredGenresForItem } from "@/lib/films/storedGenres";
import { loadStoredPeopleForItem } from "@/lib/films/storedPeople";
import styles from "@/components/catalog/CatalogSearch.module.css";

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

type FilmResult = {
  id: string;
  title: string;
  englishTitle?: string;
  originalTitle?: string;
  year: string;
  poster: string;
  imageUrls?: string[];
  plot: string;
  genres: string;
  director: string;
  actors: string;
  imdbRating: string;
  trailers?: Trailer[];
  mediaType?: "movie" | "tv";
  people?: Array<{
    tmdbPersonId: string;
    name: string;
    originalName?: string;
    roleKind: "actor" | "director" | "writer" | "producer";
    creditGroup: "cast" | "crew";
    department?: string | null;
    job?: string | null;
    characterName?: string | null;
    creditOrder?: number | null;
    isPrimary?: boolean;
    profileUrl?: string | null;
  }>;
  genreItems?: Array<{
    tmdbGenreId: string;
    name: string;
  }>;
};

export type FilmCollectionPopupView = {
  viewId: string;
  viewedAt: string;
  comment: string | null;
  recommendSimilar: boolean;
  isViewed: boolean;
  rating: number | null;
  viewPercent: number;
  availability: string | null;
  item: {
    id: string;
    title: string;
    titleUk: string | null;
    titleEn: string | null;
    titleOriginal: string | null;
    description: string | null;
    genres: string | null;
    director: string | null;
    actors: string | null;
    posterUrl: string | null;
    externalId: string | null;
    mediaType: "movie" | "tv" | null;
    imdbRating: string | null;
    trailers: Trailer[] | null;
    year: number | null;
  };
};

export type FilmCollectionPopupCandidate = {
  id: string;
  mediaType: "movie" | "tv";
  title: string;
  originalTitle?: string;
  year?: string;
  poster?: string;
};

type FilmCollectionPopupProps = {
  mode: "add" | "edit";
  candidate?: FilmCollectionPopupCandidate | null;
  existingView?: FilmCollectionPopupView | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

const AVAILABILITY_OPTIONS = [
  "В колекції",
  "Тимчасовий доступ",
  "У друзів",
  "Відсутній",
];

export default function FilmCollectionPopup({
  mode,
  candidate,
  existingView,
  onClose,
  onSaved,
}: FilmCollectionPopupProps) {
  const { showSnackbar } = useSnackbar();
  const [detail, setDetail] = useState<FilmResult | null>(null);
  const [itemDraft, setItemDraft] = useState<FilmItemDraftInput | null>(null);
  const [storedPeople, setStoredPeople] = useState<FilmNormalizedPerson[]>([]);
  const [storedGenres, setStoredGenres] = useState<FilmNormalizedGenre[]>([]);
  const [showAvailability, setShowAvailability] = useState(true);
  const [defaultFilmAvailability, setDefaultFilmAvailability] = useState<string | null>(null);
  const [defaultFilmIsViewed, setDefaultFilmIsViewed] = useState<boolean | null>(null);
  const [trailerMessage, setTrailerMessage] = useState("");
  const [isTrailerLoading, setIsTrailerLoading] = useState(false);
  const [trailerModal, setTrailerModal] = useState<{
    trailers: Trailer[];
    index: number;
    baseTitle: string;
  } | null>(null);
  const [isCopyTooltipSuppressed, setIsCopyTooltipSuppressed] = useState(false);
  const copyTooltipTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const applyPreferences = () => {
      const prefs = readDisplayPreferences();
      setShowAvailability(prefs.showFilmAvailability);
      setDefaultFilmAvailability(prefs.defaultFilmAvailability);
      setDefaultFilmIsViewed(prefs.defaultFilmIsViewed);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === DISPLAY_PREFERENCES_STORAGE_KEY) {
        applyPreferences();
      }
    };

    applyPreferences();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const selectPreferredTrailer = (trailers?: Trailer[] | null) => {
    if (!trailers || trailers.length === 0) return null;
    const officialTrailer = trailers.find(
      (trailer) => trailer.type === "Trailer" && trailer.official && trailer.url,
    );
    const trailer = trailers.find((candidate) => candidate.type === "Trailer" && candidate.url);
    const teaser = trailers.find((candidate) => candidate.type === "Teaser" && candidate.url);
    return officialTrailer ?? trailer ?? teaser ?? trailers.find((candidate) => candidate.url);
  };

  const openTrailerModal = (title: string, trailers?: Trailer[] | null) => {
    const picked = selectPreferredTrailer(trailers);
    if (!picked) {
      setTrailerMessage("Трейлер недоступний.");
      return false;
    }
    const safeTrailers = trailers ?? [];
    const pickedIndex = safeTrailers.indexOf(picked);
    setTrailerModal({
      trailers: safeTrailers,
      index: pickedIndex >= 0 ? pickedIndex : 0,
      baseTitle: title,
    });
    return true;
  };

  const fetchFilmTrailers = async (filmId: string, mediaType?: "movie" | "tv") => {
    const query = mediaType ? `?mediaType=${mediaType}` : "";
    const response = await fetch(`/api/tmdb/${filmId}${query}`);
    if (!response.ok) return null;
    const fetchedDetail = (await response.json()) as FilmResult;
    return normalizeTrailers(fetchedDetail.trailers ?? null);
  };

  useEffect(() => {
    setItemDraft(null);
    setStoredPeople([]);
    setStoredGenres([]);
    setTrailerMessage("");
    setTrailerModal(null);
    setDetail(null);

    const filmId = mode === "add" ? candidate?.id : existingView?.item.externalId;
    const mediaType = mode === "add" ? candidate?.mediaType : existingView?.item.mediaType;

    if (!filmId) {
      return;
    }

    let isCancelled = false;

    void (async () => {
      try {
        const response = await fetch(
          `/api/tmdb/${filmId}?mediaType=${mediaType ?? "movie"}`,
        );
        if (!response.ok) {
          if (!isCancelled) {
            setDetail(null);
          }
          return;
        }
        const data = (await response.json()) as FilmResult;
        if (!isCancelled) {
          setDetail(data);
        }
      } catch {
        if (!isCancelled) {
          setDetail(null);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [mode, candidate?.id, candidate?.mediaType, existingView?.item.externalId, existingView?.item.mediaType]);

  useEffect(() => {
    const itemId = existingView?.item.id;

    if (!itemId) {
      setStoredPeople([]);
      setStoredGenres([]);
      return;
    }

    let isCancelled = false;

    void (async () => {
      const [people, genres] = await Promise.all([
        loadStoredPeopleForItem(supabase, itemId),
        loadStoredGenresForItem(supabase, itemId),
      ]);
      if (!isCancelled) {
        setStoredPeople(people);
        setStoredGenres(genres);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [existingView?.item.id]);

  const currentPeople =
    itemDraft?.normalizedPeople ?? (storedPeople.length > 0 ? storedPeople : detail?.people ?? null);
  const currentGenres =
    itemDraft?.normalizedGenres ?? (storedGenres.length > 0 ? storedGenres : detail?.genreItems ?? null);

  const copyText = async (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    try {
      await navigator.clipboard.writeText(normalized);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = normalized;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    showSnackbar("Скопійовано");
  };

  const suppressCopyTooltip = () => {
    setIsCopyTooltipSuppressed(true);
    if (copyTooltipTimeoutRef.current !== null) {
      window.clearTimeout(copyTooltipTimeoutRef.current);
    }
    copyTooltipTimeoutRef.current = window.setTimeout(() => {
      setIsCopyTooltipSuppressed(false);
    }, 900);
  };

  useEffect(() => {
    return () => {
      if (copyTooltipTimeoutRef.current !== null) {
        window.clearTimeout(copyTooltipTimeoutRef.current);
      }
    };
  }, []);

  const renderCopyableFilmTitle = (
    value: string | null | undefined,
    label: "оригінальну" | "англійську",
  ) => {
    const resolvedValue = value?.trim();
    if (!resolvedValue) {
      return null;
    }

    return (
      <button
        type="button"
        className={`${styles.copyableInlineButton} ${
          isCopyTooltipSuppressed ? styles.copyTooltipHidden : ""
        }`}
        onClick={() => {
          suppressCopyTooltip();
          void copyText(resolvedValue);
        }}
        data-copy-tooltip="Клікніть для копіювання"
        aria-label={`Скопіювати ${label} назву: ${resolvedValue}`}
      >
        {resolvedValue}
      </button>
    );
  };

  const renderActorLinks = (
    people?: Array<{
      tmdbPersonId: string;
      name: string;
      roleKind: "actor" | "director" | "writer" | "producer";
      creditOrder?: number | null;
    }> | null,
  ) => {
    const actors = (people ?? [])
      .filter((person) => person.roleKind === "actor")
      .sort((left, right) => {
        const leftOrder = left.creditOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.creditOrder ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      })
      .slice(0, 12);

    if (actors.length === 0) {
      return null;
    }

    return (
      <span className={styles.metaEntityLinks}>
        {actors.map((actor, index) => (
          <span key={`${actor.tmdbPersonId}-${index}`}>
            {index > 0 ? ", " : null}
            <PersonHoverLink personId={actor.tmdbPersonId} name={actor.name} />
          </span>
        ))}
      </span>
    );
  };

  const renderDirectorLinks = (
    people?: Array<{
      tmdbPersonId: string;
      name: string;
      roleKind: "actor" | "director" | "writer" | "producer";
      creditOrder?: number | null;
    }> | null,
  ) => {
    const directors = (people ?? [])
      .filter((person) => person.roleKind === "director")
      .sort((left, right) => {
        const leftOrder = left.creditOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.creditOrder ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      })
      .slice(0, 6);

    if (directors.length === 0) {
      return null;
    }

    return (
      <span className={styles.metaEntityLinks}>
        {directors.map((director, index) => (
          <span key={`${director.tmdbPersonId}-${index}`}>
            {index > 0 ? ", " : null}
            <PersonHoverLink personId={director.tmdbPersonId} name={director.name} />
          </span>
        ))}
      </span>
    );
  };

  const renderWriterLinks = (
    people?: Array<{
      tmdbPersonId: string;
      name: string;
      roleKind: "actor" | "director" | "writer" | "producer";
      creditOrder?: number | null;
    }> | null,
  ) => {
    const writers = (people ?? [])
      .filter((person) => person.roleKind === "writer")
      .sort((left, right) => {
        const leftOrder = left.creditOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.creditOrder ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      })
      .slice(0, 6);

    if (writers.length === 0) {
      return null;
    }

    return (
      <span className={styles.metaEntityLinks}>
        {writers.map((writer, index) => (
          <span key={`${writer.tmdbPersonId}-${index}`}>
            {index > 0 ? ", " : null}
            <PersonHoverLink personId={writer.tmdbPersonId} name={writer.name} />
          </span>
        ))}
      </span>
    );
  };

  const renderProducerLinks = (
    people?: Array<{
      tmdbPersonId: string;
      name: string;
      roleKind: "actor" | "director" | "writer" | "producer";
      creditOrder?: number | null;
    }> | null,
  ) => {
    const producers = (people ?? [])
      .filter((person) => person.roleKind === "producer")
      .sort((left, right) => {
        const leftOrder = left.creditOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.creditOrder ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      })
      .slice(0, 6);

    if (producers.length === 0) {
      return null;
    }

    return (
      <span className={styles.metaEntityLinks}>
        {producers.map((producer, index) => (
          <span key={`${producer.tmdbPersonId}-${index}`}>
            {index > 0 ? ", " : null}
            <PersonHoverLink personId={producer.tmdbPersonId} name={producer.name} />
          </span>
        ))}
      </span>
    );
  };

  const renderGenreLinks = (genres?: FilmNormalizedGenre[] | null) => {
    const resolvedGenres = (genres ?? []).slice(0, 8);

    if (resolvedGenres.length === 0) {
      return null;
    }

    return (
      <span className={styles.metaEntityLinks}>
        {resolvedGenres.map((genre, index) => (
          <span key={`${genre.tmdbGenreId}-${index}`}>
            {index > 0 ? ", " : null}
            <Link href={`/genres/${genre.tmdbGenreId}`} className={styles.metaEntityLink}>
              {genre.name}
            </Link>
          </span>
        ))}
      </span>
    );
  };

  const resolvedTitle = useMemo(() => {
    if (itemDraft?.title) return itemDraft.title;
    if (mode === "edit") return existingView?.item.title ?? candidate?.title ?? "Фільм";
    if (detail?.title) return detail.title;
    return existingView?.item.title ?? candidate?.title ?? "Фільм";
  }, [mode, candidate?.title, detail?.title, existingView?.item.title, itemDraft?.title]);

  const resolvedPoster = mode === "edit"
    ? itemDraft?.poster_url ?? existingView?.item.posterUrl ?? detail?.poster ?? candidate?.poster
    : itemDraft?.poster_url ?? detail?.poster ?? existingView?.item.posterUrl ?? candidate?.poster;
  const resolvedYear = mode === "edit"
    ? itemDraft?.year ?? String(existingView?.item.year ?? "") ?? detail?.year ?? candidate?.year ?? ""
    : itemDraft?.year ?? detail?.year ?? String(existingView?.item.year ?? "") ?? candidate?.year ?? "";
  const resolvedMediaType = mode === "edit"
    ? itemDraft?.film_media_type ??
      existingView?.item.mediaType ??
      detail?.mediaType ??
      candidate?.mediaType ??
      "movie"
    : itemDraft?.film_media_type ??
      detail?.mediaType ??
      existingView?.item.mediaType ??
      candidate?.mediaType ??
      "movie";
  const resolvedOriginalTitle =
    mode === "edit"
      ? itemDraft?.title_original ??
        existingView?.item.titleOriginal ??
        detail?.originalTitle ??
        candidate?.originalTitle ??
        ""
      : itemDraft?.title_original ??
        detail?.originalTitle ??
        existingView?.item.titleOriginal ??
        candidate?.originalTitle ??
        "";
  const resolvedEnglishTitle =
    mode === "edit"
      ? itemDraft?.title_en ?? existingView?.item.titleEn ?? detail?.englishTitle ?? ""
      : itemDraft?.title_en ?? detail?.englishTitle ?? existingView?.item.titleEn ?? "";
  const resolvedDirector =
    mode === "edit"
      ? itemDraft?.director ?? existingView?.item.director ?? detail?.director ?? ""
      : itemDraft?.director ?? detail?.director ?? existingView?.item.director ?? "";
  const resolvedActors =
    mode === "edit"
      ? itemDraft?.actors ?? existingView?.item.actors ?? detail?.actors ?? ""
      : itemDraft?.actors ?? detail?.actors ?? existingView?.item.actors ?? "";
  const resolvedGenres =
    mode === "edit"
      ? itemDraft?.genres ?? existingView?.item.genres ?? detail?.genres ?? ""
      : itemDraft?.genres ?? detail?.genres ?? existingView?.item.genres ?? "";
  const resolvedDescription =
    mode === "edit"
      ? itemDraft?.description ?? existingView?.item.description ?? detail?.plot ?? ""
      : itemDraft?.description ?? detail?.plot ?? existingView?.item.description ?? "";
  const resolvedImdb =
    mode === "edit"
      ? itemDraft?.imdb_rating ?? existingView?.item.imdbRating ?? detail?.imdbRating ?? ""
      : itemDraft?.imdb_rating ?? detail?.imdbRating ?? existingView?.item.imdbRating ?? "";
  const resolvedImageUrls =
    mode === "edit"
      ? itemDraft?.imageUrls ?? []
      : itemDraft?.imageUrls ?? detail?.imageUrls ?? [];

  const handleAddFilm = async (payload: FilmCollectionFormPayload) => {
    const film: FilmCollectionSource = detail ?? {
      id: candidate?.id ?? "",
      title: candidate?.title ?? "",
      originalTitle: candidate?.originalTitle,
      year: candidate?.year ?? "",
      poster: candidate?.poster ?? "",
      plot: "",
      genres: "",
      director: "",
      actors: "",
      imdbRating: "",
      mediaType: candidate?.mediaType ?? "movie",
    };
    await addFilmToCollection({
      supabase,
      film,
      payload,
      allowUpdateExistingView: false,
    });

    await onSaved();
  };

  const handleUpdateFilmView = async (payload: FilmCollectionFormPayload) => {
    if (!existingView) {
      return;
    }

    await updateFilmView({
      supabase,
      viewId: existingView.viewId,
      itemId: existingView.item.id,
      itemDraft,
      payload,
    });

    await onSaved();
  };

  const handleRefreshMetadata = async () => {
    const filmId = existingView?.item.externalId ?? candidate?.id;
    const mediaType = existingView?.item.mediaType ?? candidate?.mediaType ?? "movie";

    if (!filmId) {
      throw new Error("Не вдалося оновити дані фільму.");
    }

    const response = await fetch(`/api/tmdb/${filmId}?mediaType=${mediaType}`);
    if (!response.ok) {
      throw new Error("Не вдалося оновити дані фільму.");
    }

    const refreshedDetail = (await response.json()) as FilmResult;
    setDetail(refreshedDetail);

    if (!existingView) {
      return;
    }

    const parsedYear = Number.parseInt(refreshedDetail.year ?? "", 10);
    const titleUk = normalizeTitle(refreshedDetail.title) ?? existingView.item.titleUk ?? null;
    const titleOriginal =
      normalizeTitle(refreshedDetail.originalTitle) ?? existingView.item.titleOriginal ?? null;
    const titleEn = normalizeEnglishTitle(refreshedDetail.englishTitle, titleOriginal);
    const resolvedDraftTitle =
      titleUk ??
      titleEn ??
      titleOriginal ??
      normalizeTitle(existingView.item.title) ??
      "Без назви";
    const peopleSummary = summarizeFilmPeople(refreshedDetail.people ?? null);

    setItemDraft({
      title: resolvedDraftTitle,
      title_uk: titleUk,
      title_en: titleEn,
      title_original: titleOriginal,
      poster_url: refreshedDetail.poster?.trim() ? refreshedDetail.poster.trim() : existingView.item.posterUrl ?? null,
      imageUrls: refreshedDetail.imageUrls ?? null,
      year: Number.isFinite(parsedYear) ? parsedYear : existingView.item.year ?? null,
      imdb_rating:
        refreshedDetail.imdbRating?.trim() && refreshedDetail.imdbRating !== "N/A"
          ? refreshedDetail.imdbRating.trim()
          : existingView.item.imdbRating ?? null,
      description: refreshedDetail.plot?.trim()
        ? refreshedDetail.plot.trim()
        : existingView.item.description ?? null,
      genres: refreshedDetail.genres?.trim()
        ? refreshedDetail.genres.trim()
        : existingView.item.genres ?? null,
      director:
        peopleSummary.director ??
        (refreshedDetail.director?.trim()
          ? refreshedDetail.director.trim()
          : existingView.item.director ?? null),
      actors:
        peopleSummary.actors ??
        (refreshedDetail.actors?.trim()
          ? refreshedDetail.actors.trim()
          : existingView.item.actors ?? null),
      external_id: refreshedDetail.id,
      film_media_type:
        normalizeFilmMediaType(refreshedDetail.mediaType ?? existingView.item.mediaType) ?? "movie",
      trailers: normalizeTrailers(refreshedDetail.trailers ?? existingView.item.trailers ?? null),
      normalizedGenres: refreshedDetail.genreItems ?? null,
      normalizedPeople: refreshedDetail.people ?? null,
    });
  };

  const handleWatchTrailer = async () => {
    const trailers = normalizeTrailers(itemDraft?.trailers ?? detail?.trailers ?? existingView?.item.trailers ?? null);
    const baseTitle = resolvedTitle;
    setTrailerMessage("");

    if (trailers) {
      openTrailerModal(baseTitle, trailers);
      return;
    }

    const filmId = itemDraft?.external_id ?? detail?.id ?? existingView?.item.externalId ?? candidate?.id;
    const mediaType =
      itemDraft?.film_media_type ?? detail?.mediaType ?? existingView?.item.mediaType ?? candidate?.mediaType ?? "movie";

    if (!filmId) {
      setTrailerMessage("Трейлер недоступний.");
      return;
    }

    setIsTrailerLoading(true);
    try {
      const fetchedTrailers = await fetchFilmTrailers(filmId, mediaType);
      if (!fetchedTrailers) {
        setTrailerMessage("Трейлер недоступний.");
        return;
      }

      setDetail((prev) => (prev ? { ...prev, trailers: fetchedTrailers } : prev));
      setItemDraft((prev) => (prev ? { ...prev, trailers: fetchedTrailers } : prev));
      openTrailerModal(baseTitle, fetchedTrailers);
    } finally {
      setIsTrailerLoading(false);
    }
  };

  const handleDeleteView = async () => {
    if (!existingView) {
      return;
    }

    const { error } = await supabase.from("user_views").delete().eq("id", existingView.viewId);

    if (error) {
      throw new Error("Не вдалося видалити запис.");
    }

    await onSaved();
  };

  return (
    <CatalogModal
      title={resolvedTitle}
      posterUrl={resolvedPoster || undefined}
      imageUrls={resolvedImageUrls}
      size="wide"
      onClose={onClose}
      onAdd={mode === "edit" ? handleUpdateFilmView : handleAddFilm}
      onDelete={mode === "edit" ? handleDeleteView : undefined}
      onRefresh={mode === "edit" ? handleRefreshMetadata : undefined}
      previewAction={{
        label: isTrailerLoading ? "Завантаження..." : "Переглянути трейлер",
        onClick: handleWatchTrailer,
        disabled: isTrailerLoading,
      }}
      submitLabel={mode === "edit" ? "Зберегти" : "Додати"}
      initialValues={
        mode === "edit" && existingView
          ? {
              viewedAt: existingView.viewedAt,
              comment: existingView.comment,
              recommendSimilar: existingView.recommendSimilar,
              isViewed: existingView.isViewed,
              rating: existingView.rating,
              viewPercent: existingView.viewPercent,
              availability: existingView.availability,
            }
          : {
              availability: showAvailability ? defaultFilmAvailability : null,
              isViewed: defaultFilmIsViewed ?? undefined,
            }
      }
      availabilityOptions={showAvailability ? AVAILABILITY_OPTIONS : []}
      showRecommendSimilar={false}
    >
      <FilmMetadataContent
        imdbRating={resolvedImdb}
        personalRating={mode === "edit" ? String(existingView?.rating ?? "—") : null}
        year={resolvedYear}
        mediaType={resolvedMediaType}
        originalTitle={renderCopyableFilmTitle(resolvedOriginalTitle, "оригінальну")}
        englishTitle={renderCopyableFilmTitle(resolvedEnglishTitle, "англійську")}
        showEnglishTitle={
          Boolean(resolvedEnglishTitle?.trim()) &&
          resolvedEnglishTitle?.trim() !== resolvedOriginalTitle?.trim()
        }
        director={renderDirectorLinks(currentPeople) ?? resolvedDirector}
        writers={renderWriterLinks(currentPeople)}
        producers={renderProducerLinks(currentPeople)}
        actors={renderActorLinks(currentPeople) ?? resolvedActors}
        genres={renderGenreLinks(currentGenres) ?? resolvedGenres}
        description={resolvedDescription}
        message={trailerMessage ? <p className={styles.message}>{trailerMessage}</p> : null}
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
    </CatalogModal>
  );
}
