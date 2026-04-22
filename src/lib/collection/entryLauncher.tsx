"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CollectionEntryHost from "@/components/catalog/CollectionEntryHost";
import type { FilmCollectionTrailer } from "@/lib/films/collectionFlow";
import type { FilmNormalizedGenre, FilmNormalizedPerson } from "@/lib/films/normalizedMetadata";
import type { GameCollectionTrailer } from "@/lib/games/collectionFlow";
import type { GameNormalizedGenre } from "@/lib/games/normalizedMetadata";
import type { ShishkaFitAssessment } from "@/lib/shishka/fitAssessment";

export type CollectionEntryOwnItemRequest = {
  kind: "own-item";
  mediaKind: "film" | "game";
  itemId: string;
  onCompleted?: () => Promise<void> | void;
};

export type FilmDraftLaunchSource = {
  id: string;
  itemId?: string;
  title: string;
  englishTitle?: string;
  originalTitle?: string;
  year: string;
  poster: string;
  imageUrls?: string[];
  plot: string;
  genres: string;
  genreItems?: FilmNormalizedGenre[];
  director: string;
  actors: string;
  people?: FilmNormalizedPerson[];
  imdbRating: string;
  trailers?: FilmCollectionTrailer[];
  mediaType?: "movie" | "tv";
};

export type GameDraftLaunchSource = {
  id: string;
  itemId?: string;
  title: string;
  rating: number | null;
  ratingSource?: "igdb" | "rawg";
  released: string;
  poster: string;
  genres: string;
  genreItems?: GameNormalizedGenre[];
  description?: string | null;
  trailers?: GameCollectionTrailer[];
};

export type CollectionEntryDraftRequest =
  | {
      kind: "draft";
      mediaKind: "film";
      draft: FilmDraftLaunchSource;
      recommendationComment?: string | null;
      recommendationScopeValue?: string | null;
      recommendationFitAssessment?: ShishkaFitAssessment | null;
      onCompleted?: () => Promise<void> | void;
    }
  | {
      kind: "draft";
      mediaKind: "game";
      draft: GameDraftLaunchSource;
      recommendationComment?: string | null;
      recommendationScopeValue?: string | null;
      recommendationFitAssessment?: ShishkaFitAssessment | null;
      onCompleted?: () => Promise<void> | void;
    };

export type CollectionEntryLaunchRequest =
  | CollectionEntryOwnItemRequest
  | CollectionEntryDraftRequest;

const FRIENDS_ADD_ITEM_MEDIA_KIND_PARAM = "addMediaKind";

type CollectionEntryLauncherContextValue = {
  openCreateOwnEntry: (
    request: Omit<CollectionEntryOwnItemRequest, "kind">,
  ) => void;
  openDraftEntry: (request: Omit<CollectionEntryDraftRequest, "kind">) => void;
  closeCollectionEntry: () => void;
};

const CollectionEntryLauncherContext =
  createContext<CollectionEntryLauncherContextValue | null>(null);

export function CollectionEntryLauncherProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [request, setRequest] = useState<CollectionEntryLaunchRequest | null>(null);
  const pendingFriendsOwnEntryParamSyncRef = useRef<null | false>(false);

  const isFriendsRoot = pathname === "/friends";

  const replaceFriendsOwnEntrySearchParams = useCallback(
    (itemId: string | null, mediaKind: "film" | "game" | null) => {
      if (!isFriendsRoot) {
        return;
      }

      const nextParams = new URLSearchParams(searchParams.toString());
      if (itemId && mediaKind) {
        nextParams.set("addItem", itemId);
        nextParams.set(FRIENDS_ADD_ITEM_MEDIA_KIND_PARAM, mediaKind);
      } else {
        nextParams.delete("addItem");
        nextParams.delete(FRIENDS_ADD_ITEM_MEDIA_KIND_PARAM);
      }

      const nextSearch = nextParams.toString();
      const nextUrl = nextSearch ? `${pathname}?${nextSearch}` : pathname;
      router.replace(nextUrl, { scroll: false });
    },
    [isFriendsRoot, pathname, router, searchParams],
  );

  const openCreateOwnEntry = useCallback((nextRequest: Omit<CollectionEntryOwnItemRequest, "kind">) => {
    pendingFriendsOwnEntryParamSyncRef.current = false;
    setRequest({
      kind: "own-item",
      mediaKind: nextRequest.mediaKind,
      itemId: nextRequest.itemId,
      onCompleted: nextRequest.onCompleted,
    });
    replaceFriendsOwnEntrySearchParams(nextRequest.itemId, nextRequest.mediaKind);
  }, [replaceFriendsOwnEntrySearchParams]);

  const openDraftEntry = useCallback((nextRequest: Omit<CollectionEntryDraftRequest, "kind">) => {
    setRequest({
      kind: "draft",
      ...nextRequest,
    });
  }, []);

  const closeCollectionEntry = useCallback(() => {
    pendingFriendsOwnEntryParamSyncRef.current = null;
    setRequest(null);
    replaceFriendsOwnEntrySearchParams(null, null);
  }, [replaceFriendsOwnEntrySearchParams]);

  useEffect(() => {
    if (!isFriendsRoot) {
      pendingFriendsOwnEntryParamSyncRef.current = false;
      return;
    }

    const itemId = searchParams.get("addItem")?.trim() || null;
    const mediaKindValue = searchParams.get(FRIENDS_ADD_ITEM_MEDIA_KIND_PARAM)?.trim() || null;
    const mediaKind =
      mediaKindValue === "film" || mediaKindValue === "game"
        ? mediaKindValue
        : null;
    const pendingSearchParamSync = pendingFriendsOwnEntryParamSyncRef.current;

    if (pendingSearchParamSync !== false) {
      if (pendingSearchParamSync === null) {
        if (!itemId && !mediaKind) {
          pendingFriendsOwnEntryParamSyncRef.current = false;
        }
      }
      return;
    }

    if (request) {
      return;
    }

    if (!itemId || !mediaKind) {
      return;
    }

    let isCancelled = false;

    queueMicrotask(() => {
      if (isCancelled) {
        return;
      }

      setRequest({
        kind: "own-item",
        mediaKind,
        itemId,
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [isFriendsRoot, request, searchParams]);

  const value = useMemo<CollectionEntryLauncherContextValue>(
    () => ({
      openCreateOwnEntry,
      openDraftEntry,
      closeCollectionEntry,
    }),
    [closeCollectionEntry, openCreateOwnEntry, openDraftEntry],
  );

  return (
    <CollectionEntryLauncherContext.Provider value={value}>
      {children}
      <CollectionEntryHost request={request} onClose={closeCollectionEntry} />
    </CollectionEntryLauncherContext.Provider>
  );
}

export const useCollectionEntryLauncher = () => {
  const context = useContext(CollectionEntryLauncherContext);
  if (!context) {
    throw new Error(
      "useCollectionEntryLauncher must be used within CollectionEntryLauncherProvider",
    );
  }
  return context;
};
