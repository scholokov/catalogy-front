import type { Dispatch, SetStateAction } from "react";
import type { FilmCollectionTrailer } from "@/lib/films/collectionFlow";
import { normalizeTrailers as normalizeFilmTrailers } from "@/lib/films/collectionFlow";
import type { GameCollectionTrailer } from "@/lib/games/collectionFlow";
import { normalizeGameTrailers } from "@/lib/games/collectionFlow";

type TrailerLike = {
  name?: string;
  type?: string | null;
  official?: boolean | null;
  url?: string | null;
};

export type TrailerModalState<T extends { name?: string; url: string }> = {
  trailers: T[];
  index: number;
  baseTitle: string;
} | null;

export const selectPreferredTrailer = <T extends TrailerLike>(
  trailers?: T[] | null,
) => {
  if (!trailers || trailers.length === 0) return null;
  const officialTrailer = trailers.find(
    (trailer) => trailer.type === "Trailer" && trailer.official && trailer.url,
  );
  const trailer = trailers.find(
    (candidate) => candidate.type === "Trailer" && candidate.url,
  );
  const teaser = trailers.find(
    (candidate) => candidate.type === "Teaser" && candidate.url,
  );
  return officialTrailer ?? trailer ?? teaser ?? trailers.find((candidate) => candidate.url) ?? null;
};

export const fetchFilmTrailers = async (
  filmId: string,
  mediaType?: "movie" | "tv",
): Promise<FilmCollectionTrailer[] | null> => {
  const query = mediaType ? `?mediaType=${mediaType}` : "";
  const response = await fetch(`/api/tmdb/${filmId}${query}`);
  if (!response.ok) return null;
  const detail = (await response.json()) as { trailers?: FilmCollectionTrailer[] | null };
  return normalizeFilmTrailers(detail.trailers ?? null);
};

export const fetchGameTrailers = async (
  gameId: string,
): Promise<GameCollectionTrailer[] | null> => {
  const response = await fetch(`/api/rawg/${gameId}`);
  if (!response.ok) return null;
  const detail = (await response.json()) as { trailers?: GameCollectionTrailer[] | null };
  return normalizeGameTrailers(detail.trailers ?? null);
};

export const openTrailerViewerModal = <
  T extends { name?: string; url: string; type?: string | null; official?: boolean | null },
>({
  title,
  trailers,
  setTrailerMessage,
  setTrailerModal,
}: {
  title: string;
  trailers?: T[] | null;
  setTrailerMessage: Dispatch<SetStateAction<string>>;
  setTrailerModal: Dispatch<SetStateAction<TrailerModalState<T>>>;
}) => {
  const picked = selectPreferredTrailer(trailers);
  if (!picked) {
    setTrailerMessage("Трейлер недоступний.");
    return false;
  }

  const safeTrailers = trailers ?? [];
  const pickedIndex = safeTrailers.indexOf(picked as T);
  setTrailerModal({
    trailers: safeTrailers,
    index: pickedIndex >= 0 ? pickedIndex : 0,
    baseTitle: title,
  });
  return true;
};

export const watchExistingEntryTrailer = async <
  T extends { name?: string; url: string; type?: string | null; official?: boolean | null },
>({
  title,
  currentTrailers,
  externalId,
  fetchTrailers,
  openTrailerModal,
  onTrailersLoaded,
  setTrailerMessage,
  setIsTrailerLoading,
}: {
  title: string;
  currentTrailers: T[] | null;
  externalId: string;
  fetchTrailers: (externalId: string) => Promise<T[] | null>;
  openTrailerModal: (title: string, trailers?: T[] | null) => boolean;
  onTrailersLoaded: (trailers: T[]) => Promise<void> | void;
  setTrailerMessage: Dispatch<SetStateAction<string>>;
  setIsTrailerLoading: Dispatch<SetStateAction<boolean>>;
}) => {
  setTrailerMessage("");

  if (currentTrailers) {
    openTrailerModal(title, currentTrailers);
    return;
  }

  if (!externalId) {
    setTrailerMessage("Трейлер недоступний.");
    return;
  }

  setIsTrailerLoading(true);
  try {
    const trailers = await fetchTrailers(externalId);
    if (!trailers) {
      setTrailerMessage("Трейлер недоступний.");
      return;
    }

    await onTrailersLoaded(trailers);
    openTrailerModal(title, trailers);
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Не вдалося отримати трейлер.";
    setTrailerMessage(message);
  } finally {
    setIsTrailerLoading(false);
  }
};
