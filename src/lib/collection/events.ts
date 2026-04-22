export const COLLECTION_ENTRY_SAVED_EVENT = "collection:entry-saved";

export type CollectionEntrySavedEventDetail = {
  mediaKind: "film" | "game";
  itemId: string | null;
};

export const emitCollectionEntrySaved = (
  detail: CollectionEntrySavedEventDetail,
) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<CollectionEntrySavedEventDetail>(
      COLLECTION_ENTRY_SAVED_EVENT,
      {
        detail,
      },
    ),
  );
};
