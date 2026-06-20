"use client";

import type { ReactNode } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";

type CollectionEntryEditPageProps = {
  title: string;
  children: ReactNode;
};

export default function CollectionEntryEditPage({
  title,
  children,
}: CollectionEntryEditPageProps) {
  return (
    <CatalogLayout title={title} showBrandLogo>
      {children}
    </CatalogLayout>
  );
}
