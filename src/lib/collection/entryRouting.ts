"use client";

import { useEffect, type MutableRefObject } from "react";

export const VIEW_SEARCH_PARAM = "view";
export const ITEM_SEARCH_PARAM = "item";
export const ADD_ITEM_SEARCH_PARAM = "addItem";
const COLLECTION_ENTRY_HISTORY_STATE_KEY = "__catalogyCollectionEntry";

type SearchParamsLike = Pick<URLSearchParams, "get" | "toString">;

const readBrowserHistoryState = () => {
  if (typeof window === "undefined") {
    return {};
  }
  if (typeof window.history.state !== "object" || window.history.state === null) {
    return {};
  }
  return window.history.state as Record<string, unknown>;
};

const writeBrowserHistoryState = ({
  nextUrl,
  historyMode,
  marksCollectionEntryOpen,
}: {
  nextUrl: string;
  historyMode: "replace" | "push";
  marksCollectionEntryOpen: boolean;
}) => {
  if (typeof window === "undefined") {
    return;
  }

  const nextState = { ...readBrowserHistoryState() };
  if (marksCollectionEntryOpen) {
    nextState[COLLECTION_ENTRY_HISTORY_STATE_KEY] = true;
  } else {
    delete nextState[COLLECTION_ENTRY_HISTORY_STATE_KEY];
  }

  if (historyMode === "push") {
    window.history.pushState(nextState, "", nextUrl);
    return;
  }

  window.history.replaceState(nextState, "", nextUrl);
};

export const hasCollectionEntryHistoryState = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return readBrowserHistoryState()[COLLECTION_ENTRY_HISTORY_STATE_KEY] === true;
};

type OpenSelectedViewOptions = {
  syncUrl?: boolean;
  historyMode?: "replace" | "push";
};

export type CloseSelectedViewRouteOptions = {
  source?: "user" | "history";
};

type UseRequestedCollectionViewSyncParams<T> = {
  pendingViewParamSyncRef: MutableRefObject<string | null | false>;
  requestedViewId: string | null;
  requestedItemId: string | null;
  selectedViewId: string | null;
  selectedItemId: string | null;
  collection: T[];
  getViewId: (item: T) => string;
  getItemId: (item: T) => string;
  clearSelectedViewRoute: (options?: CloseSelectedViewRouteOptions) => void;
  openSelectedView: (
    item: T,
    options?: OpenSelectedViewOptions,
  ) => Promise<void> | void;
  loadSelectedViewById: (viewId: string) => Promise<T | null>;
  loadSelectedViewByItemId: (itemId: string) => Promise<T | null>;
};

export const readCollectionEntrySearchParams = (
  searchParams: SearchParamsLike,
) => ({
  requestedViewId: searchParams.get(VIEW_SEARCH_PARAM)?.trim() || null,
  requestedItemId: searchParams.get(ITEM_SEARCH_PARAM)?.trim() || null,
  requestedAddItemId: searchParams.get(ADD_ITEM_SEARCH_PARAM)?.trim() || null,
});

export const replaceSelectedCollectionViewSearchParam = ({
  pathname,
  searchParams,
  viewId,
  historyMode = "replace",
}: {
  pathname: string;
  searchParams: SearchParamsLike;
  viewId: string | null;
  historyMode?: "replace" | "push";
}) => {
  const nextParams = new URLSearchParams(searchParams.toString());
  if (viewId) {
    nextParams.set(VIEW_SEARCH_PARAM, viewId);
  } else {
    nextParams.delete(VIEW_SEARCH_PARAM);
  }
  nextParams.delete(ITEM_SEARCH_PARAM);
  nextParams.delete(ADD_ITEM_SEARCH_PARAM);
  const nextSearch = nextParams.toString();
  const nextUrl = nextSearch ? `${pathname}?${nextSearch}` : pathname;
  writeBrowserHistoryState({
    nextUrl,
    historyMode,
    marksCollectionEntryOpen: Boolean(viewId),
  });
};

export const replaceSelectedCollectionAddItemSearchParam = ({
  pathname,
  searchParams,
  itemId,
}: {
  pathname: string;
  searchParams: SearchParamsLike;
  itemId: string | null;
}) => {
  const nextParams = new URLSearchParams(searchParams.toString());
  if (itemId) {
    nextParams.set(ADD_ITEM_SEARCH_PARAM, itemId);
  } else {
    nextParams.delete(ADD_ITEM_SEARCH_PARAM);
  }
  const nextSearch = nextParams.toString();
  const nextUrl = nextSearch ? `${pathname}?${nextSearch}` : pathname;
  if (typeof window !== "undefined") {
    window.history.replaceState(window.history.state, "", nextUrl);
  }
};

export const useRequestedCollectionViewSync = <T>({
  pendingViewParamSyncRef,
  requestedViewId,
  requestedItemId,
  selectedViewId,
  selectedItemId,
  collection,
  getViewId,
  getItemId,
  clearSelectedViewRoute,
  openSelectedView,
  loadSelectedViewById,
  loadSelectedViewByItemId,
}: UseRequestedCollectionViewSyncParams<T>) => {
  useEffect(() => {
    const pendingViewParam = pendingViewParamSyncRef.current;

    if (pendingViewParam !== false) {
      if (pendingViewParam === null) {
        if (!requestedViewId && !requestedItemId) {
          pendingViewParamSyncRef.current = false;
        }
        return;
      }

      if (requestedViewId === pendingViewParam && !requestedItemId) {
        pendingViewParamSyncRef.current = false;
      }
      return;
    }

    if (!requestedViewId && !requestedItemId && selectedViewId) {
      clearSelectedViewRoute({ source: "history" });
    }
  }, [
    clearSelectedViewRoute,
    pendingViewParamSyncRef,
    requestedItemId,
    requestedViewId,
    selectedViewId,
  ]);

  useEffect(() => {
    if (pendingViewParamSyncRef.current !== false) {
      return;
    }

    if (!requestedViewId && !requestedItemId) {
      return;
    }

    if (requestedViewId && selectedViewId === requestedViewId) {
      return;
    }

    if (requestedItemId && !requestedViewId && selectedItemId === requestedItemId) {
      return;
    }

    const existingView = requestedViewId
      ? collection.find((item) => getViewId(item) === requestedViewId)
      : collection.find((item) => getItemId(item) === requestedItemId);
    if (existingView) {
      void openSelectedView(existingView, {
        syncUrl: !requestedViewId,
        historyMode: "replace",
      });
      return;
    }

    let isCancelled = false;

    void (async () => {
      const view = requestedViewId
        ? await loadSelectedViewById(requestedViewId)
        : requestedItemId
          ? await loadSelectedViewByItemId(requestedItemId)
          : null;
      if (isCancelled) {
        return;
      }
      if (view) {
        await openSelectedView(view, {
          syncUrl: !requestedViewId,
          historyMode: "replace",
        });
        return;
      }
      pendingViewParamSyncRef.current = null;
      clearSelectedViewRoute({ source: "history" });
    })();

    return () => {
      isCancelled = true;
    };
  }, [
    clearSelectedViewRoute,
    collection,
    getItemId,
    getViewId,
    loadSelectedViewById,
    loadSelectedViewByItemId,
    openSelectedView,
    pendingViewParamSyncRef,
    requestedItemId,
    requestedViewId,
    selectedItemId,
    selectedViewId,
  ]);
};
