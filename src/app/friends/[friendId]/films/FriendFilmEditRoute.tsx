"use client";

import { useEffect, useState } from "react";
import CollectionEntryEditShell from "@/components/catalog/edit/CollectionEntryEditShell";
import { loadFriendFilmEditEntry } from "@/lib/catalog/edit/loadFriendFilmEditEntry";
import type { EditRouteMode, FilmEditEntry } from "@/lib/catalog/edit/types";
import { useEditRouteLeaveGuard } from "@/lib/catalog/edit/useEditRouteLeaveGuard";
import FilmsManager from "@/app/films/FilmsManager";

type FriendFilmEditRouteProps = {
  mode: EditRouteMode;
  friendId: string;
  viewId?: string;
  onRequestClose: () => void;
};

export default function FriendFilmEditRoute({
  mode,
  friendId,
  viewId,
  onRequestClose,
}: FriendFilmEditRouteProps) {
  const [isDirty, setIsDirty] = useState(false);
  const [entry, setEntry] = useState<FilmEditEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { requestClose } = useEditRouteLeaveGuard({
    isDirty,
    onCloseNavigation: onRequestClose,
  });

  useEffect(() => {
    if (!viewId) {
      setEntry(null);
      setError("Не вказано запис для відкриття.");
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError("");

    void (async () => {
      const nextEntry = await loadFriendFilmEditEntry(friendId, viewId);
      if (isCancelled) {
        return;
      }
      if (!nextEntry) {
        setEntry(null);
        setError("Не вдалося знайти запис.");
        setIsLoading(false);
        return;
      }
      setEntry(nextEntry);
      setIsLoading(false);
    })();

    return () => {
      isCancelled = true;
    };
  }, [friendId, viewId]);

  return (
    <CollectionEntryEditShell
      mode={mode}
      title="Фільми"
      isLoading={isLoading}
      error={error}
      onClose={requestClose}
    >
      {entry ? (
        <FilmsManager
          ownerUserId={friendId}
          readOnly
          renderMode="edit-only"
          onRequestClose={requestClose}
          onEditDirtyChange={setIsDirty}
          prefetchedSelectedView={entry.view}
          prefetchedSelectedViewPeople={entry.people}
        />
      ) : null}
    </CollectionEntryEditShell>
  );
}
