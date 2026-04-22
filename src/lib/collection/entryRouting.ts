"use client";

import { useEffect, type MutableRefObject } from "react";

export const VIEW_SEARCH_PARAM = "view";
export const ITEM_SEARCH_PARAM = "item";
export const ADD_ITEM_SEARCH_PARAM = "addItem";

type SearchParamsLike = Pick<URLSearchParams, "get" | "toString">;

type RouterLike = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

type OpenSelectedViewOptions = {
  syncUrl?: boolean;
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
  clearSelectedView: () => void;
  clearSelectedViewRoute: () => void;
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
  router,
  searchParams,
  viewId,
}: {
  pathname: string;
  router: RouterLike;
  searchParams: SearchParamsLike;
  viewId: string | null;
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
  router.replace(nextUrl, { scroll: false });
};

export const replaceSelectedCollectionAddItemSearchParam = ({
  pathname,
  router,
  searchParams,
  itemId,
}: {
  pathname: string;
  router: RouterLike;
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
  router.replace(nextUrl, { scroll: false });
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
  clearSelectedView,
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
      clearSelectedView();
    }
  }, [
    clearSelectedView,
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
      void openSelectedView(existingView, { syncUrl: !requestedViewId });
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
        await openSelectedView(view, { syncUrl: !requestedViewId });
        return;
      }
      pendingViewParamSyncRef.current = null;
      clearSelectedViewRoute();
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
