"use client";

import type { ReactNode } from "react";
import type { EditRouteMode } from "@/lib/catalog/edit/types";
import CollectionEntryEditLayout from "./CollectionEntryEditLayout";
import CollectionEntryEditModal from "./CollectionEntryEditModal";
import CollectionEntryEditPage from "./CollectionEntryEditPage";

type CollectionEntryEditShellProps = {
  mode: EditRouteMode;
  title: string;
  isLoading: boolean;
  error?: string;
  onClose: () => void;
  children: ReactNode;
};

export default function CollectionEntryEditShell({
  mode,
  title,
  isLoading,
  error,
  onClose,
  children,
}: CollectionEntryEditShellProps) {
  const content = (
    <CollectionEntryEditLayout isLoading={isLoading} error={error} onClose={onClose}>
      {children}
    </CollectionEntryEditLayout>
  );

  if (mode === "page") {
    return <CollectionEntryEditPage title={title}>{content}</CollectionEntryEditPage>;
  }

  return <CollectionEntryEditModal>{content}</CollectionEntryEditModal>;
}
