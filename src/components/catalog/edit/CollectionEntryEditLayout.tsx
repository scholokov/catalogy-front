"use client";

import type { ReactNode } from "react";

type CollectionEntryEditLayoutProps = {
  isLoading: boolean;
  error?: string;
  onClose: () => void;
  loadingLabel?: string;
  emptyLabel?: string;
  children: ReactNode;
};

export default function CollectionEntryEditLayout({
  isLoading,
  error,
  onClose,
  loadingLabel = "Завантаження запису...",
  emptyLabel = "Підготовка форми редагування...",
  children,
}: CollectionEntryEditLayoutProps) {
  if (isLoading) {
    return <p aria-live="polite">{loadingLabel}</p>;
  }

  if (error) {
    return (
      <>
        <p>{error}</p>
        <button type="button" className="btnBase btnSecondary" onClick={onClose}>
          Повернутись до каталогу
        </button>
      </>
    );
  }

  return <>{children ?? <p aria-live="polite">{emptyLabel}</p>}</>;
}
