"use client";

import { useEffect, useState } from "react";
import CollectionEntryEditShell from "@/components/catalog/edit/CollectionEntryEditShell";
import { loadGameGenreEditEntry } from "@/lib/catalog/edit/loadGameGenreEditEntry";
import type { EditRouteMode, GameGenreEditEntry } from "@/lib/catalog/edit/types";
import { useEditRouteLeaveGuard } from "@/lib/catalog/edit/useEditRouteLeaveGuard";
import type { GenreSource } from "@/lib/genres/routes";
import GameGenreDetailPage from "./GameGenreDetailPage";

type GameGenreEditRouteProps = {
  mode: EditRouteMode;
  viewId?: string;
  source: GenreSource;
  sourceGenreId: string;
  onRequestClose: () => void;
};

export default function GameGenreEditRoute({
  mode,
  viewId,
  source,
  sourceGenreId,
  onRequestClose,
}: GameGenreEditRouteProps) {
  const [isDirty, setIsDirty] = useState(false);
  const [entry, setEntry] = useState<GameGenreEditEntry | null>(null);
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
      const nextEntry = await loadGameGenreEditEntry(viewId);
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
      title="Жанр"
      isLoading={isLoading}
      error={error}
      onClose={requestClose}
    >
      {entry ? (
        <GameGenreDetailPage
          source={source}
          sourceGenreId={sourceGenreId}
          renderMode="edit-only"
          onRequestClose={requestClose}
          onEditDirtyChange={setIsDirty}
          prefetchedSelectedView={entry.view}
        />
      ) : null}
    </CollectionEntryEditShell>
  );
}
