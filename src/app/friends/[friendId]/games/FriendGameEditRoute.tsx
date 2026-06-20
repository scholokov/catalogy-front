"use client";

import { useEffect, useState } from "react";
import CollectionEntryEditShell from "@/components/catalog/edit/CollectionEntryEditShell";
import { loadFriendGameEditEntry } from "@/lib/catalog/edit/loadFriendGameEditEntry";
import type { EditRouteMode, GameEditEntry } from "@/lib/catalog/edit/types";
import { useEditRouteLeaveGuard } from "@/lib/catalog/edit/useEditRouteLeaveGuard";
import GamesManager from "@/app/games/GamesManager";

type FriendGameEditRouteProps = {
  mode: EditRouteMode;
  friendId: string;
  viewId?: string;
  onRequestClose: () => void;
};

export default function FriendGameEditRoute({
  mode,
  friendId,
  viewId,
  onRequestClose,
}: FriendGameEditRouteProps) {
  const [isDirty, setIsDirty] = useState(false);
  const [entry, setEntry] = useState<GameEditEntry | null>(null);
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
      const nextEntry = await loadFriendGameEditEntry(friendId, viewId);
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
      title="Ігри"
      isLoading={isLoading}
      error={error}
      onClose={requestClose}
    >
      {entry ? (
        <GamesManager
          ownerUserId={friendId}
          readOnly
          renderMode="edit-only"
          onRequestClose={requestClose}
          onEditDirtyChange={setIsDirty}
          prefetchedSelectedView={entry.view}
        />
      ) : null}
    </CollectionEntryEditShell>
  );
}
