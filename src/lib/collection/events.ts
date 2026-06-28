export const COLLECTION_ENTRY_SAVED_EVENT = "collection:entry-saved";
export const COLLECTION_ENTRY_DELETED_EVENT = "collection:entry-deleted";

export type CollectionEntrySavedEventDetail = {
  mediaKind: "film" | "game";
  itemId: string | null;
  viewId?: string | null;
};

export type CollectionEntryDeletedEventDetail = CollectionEntrySavedEventDetail;

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

export const emitCollectionEntryDeleted = (
  detail: CollectionEntryDeletedEventDetail,
) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<CollectionEntryDeletedEventDetail>(
      COLLECTION_ENTRY_DELETED_EVENT,
      {
        detail,
      },
    ),
  );
};
