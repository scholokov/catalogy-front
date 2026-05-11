"use client";

import type { ReactNode } from "react";
import CatalogModal from "@/components/catalog/CatalogModal";
import type { PosterMenuAction } from "@/lib/collection/serviceSearchLinks";
import type { ShishkaFitAssessment } from "@/lib/shishka/fitAssessment";

type CatalogModalPayload = {
  viewedAt: string;
  comment: string;
  recommendSimilar: boolean;
  isViewed: boolean;
  rating: number | null;
  viewPercent: number;
  platforms: string[];
  availability: string | null;
  shishkaFitAssessment: ShishkaFitAssessment | null;
};

type ExistingCollectionEntryModalProps = {
  title: string;
  posterUrl?: string;
  imageUrls?: string[];
  fitTargetText: string;
  readOnly: boolean;
  onClose: () => void;
  onAddToOwnCollection: () => Promise<void> | void;
  previewAction: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    icon?: ReactNode;
  };
  previewMenuAction?: PosterMenuAction;
  extraActions?: ReactNode;
  initialValues: {
    viewedAt?: string;
    comment?: string | null;
    recommendSimilar?: boolean;
    isViewed?: boolean;
    rating?: number | null;
    viewPercent?: number | null;
    platforms?: string[] | null;
    availability?: string | null;
    shishkaFitAssessment?: ShishkaFitAssessment | null;
  };
  availabilityOptions?: string[];
  platformOptions?: string[];
  onRefresh?: () => Promise<void>;
  onEvaluate?: (payload: CatalogModalPayload) => Promise<ShishkaFitAssessment>;
  onPersistEvaluatedAssessment?: (assessment: ShishkaFitAssessment) => Promise<void>;
  onAdd?: (payload: CatalogModalPayload) => Promise<void>;
  onDelete?: () => Promise<void>;
  children: (context: { fitBadge: ReactNode | null }) => ReactNode;
};

export default function ExistingCollectionEntryModal({
  title,
  posterUrl,
  imageUrls,
  fitTargetText,
  readOnly,
  onClose,
  onAddToOwnCollection,
  previewAction,
  previewMenuAction,
  extraActions,
  initialValues,
  availabilityOptions = [],
  platformOptions = [],
  onRefresh,
  onEvaluate,
  onPersistEvaluatedAssessment,
  onAdd,
  onDelete,
  children,
}: ExistingCollectionEntryModalProps) {
  return (
    <CatalogModal
      title={title}
      posterUrl={posterUrl}
      imageUrls={imageUrls}
      size="wide"
      fitTargetText={fitTargetText}
      showRecommendSimilar={false}
      platformOptions={platformOptions}
      availabilityOptions={availabilityOptions}
      initialValues={initialValues}
      submitLabel={readOnly ? "Відкрити форму додавання" : "Зберегти"}
      onClose={onClose}
      readOnly={readOnly}
      onReadOnlyPrimaryAction={onAddToOwnCollection}
      readOnlyPrimarySuccessMessage={null}
      previewAction={previewAction}
      previewMenuAction={previewMenuAction}
      extraActions={extraActions}
      onRefresh={readOnly ? undefined : onRefresh}
      onEvaluate={readOnly ? undefined : onEvaluate}
      onPersistEvaluatedAssessment={
        readOnly ? undefined : onPersistEvaluatedAssessment
      }
      onAdd={readOnly ? undefined : onAdd}
      onDelete={readOnly ? undefined : onDelete}
    >
      {children}
    </CatalogModal>
  );
}
