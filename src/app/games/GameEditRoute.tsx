"use client";

import { useEffect, useState } from "react";
import CollectionEntryEditShell from "@/components/catalog/edit/CollectionEntryEditShell";
import { loadGameEditEntry } from "@/lib/catalog/edit/loadGameEditEntry";
import type { EditRouteMode, GameEditEntry } from "@/lib/catalog/edit/types";
import { useEditRouteLeaveGuard } from "@/lib/catalog/edit/useEditRouteLeaveGuard";
import GamesManager from "./GamesManager";

type GameEditRouteProps = {
  mode: EditRouteMode;
  viewId?: string;
  onRequestClose: () => void;
};

export default function GameEditRoute({
  mode,
  viewId,
  onRequestClose,
}: GameEditRouteProps) {
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
      const nextEntry = await loadGameEditEntry(viewId);
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
  }, [viewId]);

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
          renderMode="edit-only"
          onRequestClose={requestClose}
          onEditDirtyChange={setIsDirty}
          prefetchedSelectedView={entry.view}
        />
      ) : null}
    </CollectionEntryEditShell>
  );
}
