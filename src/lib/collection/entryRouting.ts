"use client";

export const ADD_ITEM_SEARCH_PARAM = "addItem";

type SearchParamsLike = Pick<URLSearchParams, "get" | "toString">;

export const readCollectionEntrySearchParams = (
  searchParams: SearchParamsLike,
) => ({
  requestedAddItemId: searchParams.get(ADD_ITEM_SEARCH_PARAM)?.trim() || null,
});

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
