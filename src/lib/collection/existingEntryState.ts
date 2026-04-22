"use client";

import type { Dispatch, SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShishkaFitAssessment } from "@/lib/shishka/fitAssessment";

type StoredEntryFitFields = {
  shishka_fit_label?: ShishkaFitAssessment["label"] | null;
  shishka_fit_reason?: string | null;
  shishka_fit_profile_analyzed_at?: string | null;
  shishka_fit_scope_value?: string | null;
};

type Identifiable = {
  id: string;
};

type ItemIdentifiable = {
  items: {
    id: string;
  };
};

type ItemWithTrailers<TTrailer> = {
  items: {
    id: string;
    trailers: TTrailer[] | null;
  };
};

type PatchCollectionEntryByViewIdParams<T extends Identifiable> = {
  viewId: string;
  setCollection: Dispatch<SetStateAction<T[]>>;
  setSelectedView: Dispatch<SetStateAction<T | null>>;
  applyPatch: (item: T) => T;
};

type PatchCollectionEntryByItemIdParams<T extends Identifiable & ItemIdentifiable> = {
  itemId: string;
  setCollection: Dispatch<SetStateAction<T[]>>;
  setSelectedView: Dispatch<SetStateAction<T | null>>;
  applyPatch: (item: T) => T;
};

type CollectionEntryFormPayloadLike = {
  viewedAt: string;
  comment: string;
  recommendSimilar: boolean;
  isViewed: boolean;
  rating: number | null;
  viewPercent: number;
  availability: string | null;
  shishkaFitAssessment: ShishkaFitAssessment | null;
};

type ApplyExistingCollectionEntryViewSaveParams<
  T extends Identifiable,
  TExtra extends Record<string, unknown> = Record<string, never>,
> = {
  viewId: string;
  payload: CollectionEntryFormPayloadLike;
  setCollection: Dispatch<SetStateAction<T[]>>;
  setSelectedView: Dispatch<SetStateAction<T | null>>;
  extraViewPatch?: TExtra;
  applyPatch?: (item: T) => T;
};

export const getStoredCollectionEntryFitAssessment = (
  item: StoredEntryFitFields,
): ShishkaFitAssessment | null => {
  if (
    !item.shishka_fit_label ||
    !item.shishka_fit_reason?.trim() ||
    !item.shishka_fit_profile_analyzed_at ||
    !item.shishka_fit_scope_value
  ) {
    return null;
  }

  return {
    label: item.shishka_fit_label,
    reason: item.shishka_fit_reason.trim(),
    profileAnalyzedAt: item.shishka_fit_profile_analyzed_at,
    scopeValue: item.shishka_fit_scope_value,
  };
};

export const formatCollectionEntryPersonalRating = (value: number | null) => {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

export const patchCollectionEntryByViewId = <T extends Identifiable>({
  viewId,
  setCollection,
  setSelectedView,
  applyPatch,
}: PatchCollectionEntryByViewIdParams<T>) => {
  setCollection((prev) =>
    prev.map((item) => (item.id === viewId ? applyPatch(item) : item)),
  );

  setSelectedView((prev) =>
    prev && prev.id === viewId ? applyPatch(prev) : prev,
  );
};

export const patchCollectionEntryByItemId = <
  T extends Identifiable & ItemIdentifiable,
>({
  itemId,
  setCollection,
  setSelectedView,
  applyPatch,
}: PatchCollectionEntryByItemIdParams<T>) => {
  setCollection((prev) =>
    prev.map((item) => (item.items.id === itemId ? applyPatch(item) : item)),
  );

  setSelectedView((prev) =>
    prev && prev.items.id === itemId ? applyPatch(prev) : prev,
  );
};

export const patchCollectionEntryTrailersByItemId = <
  TTrailer,
  T extends Identifiable & ItemWithTrailers<TTrailer>,
>({
  itemId,
  trailers,
  setCollection,
  setSelectedView,
}: {
  itemId: string;
  trailers: TTrailer[] | null;
  setCollection: Dispatch<SetStateAction<T[]>>;
  setSelectedView: Dispatch<SetStateAction<T | null>>;
}) => {
  patchCollectionEntryByItemId({
    itemId,
    setCollection,
    setSelectedView,
    applyPatch: (item) => ({
      ...item,
      items: {
        ...item.items,
        trailers,
      },
    }),
  });
};

export const buildExistingCollectionEntryViewPatch = <
  TExtra extends Record<string, unknown> = Record<string, never>,
>({
  payload,
  extra,
}: {
  payload: CollectionEntryFormPayloadLike;
  extra?: TExtra;
}) => ({
  viewed_at: payload.viewedAt,
  rating: payload.rating,
  comment: payload.comment,
  recommend_similar: payload.recommendSimilar,
  is_viewed: payload.isViewed,
  view_percent: payload.viewPercent,
  availability: payload.availability,
  shishka_fit_label: payload.shishkaFitAssessment?.label ?? null,
  shishka_fit_reason: payload.shishkaFitAssessment?.reason ?? null,
  shishka_fit_profile_analyzed_at:
    payload.shishkaFitAssessment?.profileAnalyzedAt ?? null,
  shishka_fit_scope_value: payload.shishkaFitAssessment?.scopeValue ?? null,
  ...(extra ?? ({} as TExtra)),
});

export const applyExistingCollectionEntryViewSave = <
  T extends Identifiable,
  TExtra extends Record<string, unknown> = Record<string, never>,
>({
  viewId,
  payload,
  setCollection,
  setSelectedView,
  extraViewPatch,
  applyPatch,
}: ApplyExistingCollectionEntryViewSaveParams<T, TExtra>) => {
  const viewPatch = buildExistingCollectionEntryViewPatch({
    payload,
    extra: extraViewPatch,
  });

  patchCollectionEntryByViewId({
    viewId,
    setCollection,
    setSelectedView,
    applyPatch: (item) => {
      const nextItem = {
        ...item,
        ...viewPatch,
      };
      return applyPatch ? applyPatch(nextItem) : nextItem;
    },
  });
};

export const persistCollectionEntryAssessment = async <
  T extends Identifiable & StoredEntryFitFields,
>({
  supabase,
  viewId,
  assessment,
  setCollection,
  setSelectedView,
}: {
  supabase: SupabaseClient;
  viewId: string;
  assessment: ShishkaFitAssessment;
  setCollection: Dispatch<SetStateAction<T[]>>;
  setSelectedView: Dispatch<SetStateAction<T | null>>;
}) => {
  const updatePayload = {
    shishka_fit_label: assessment.label,
    shishka_fit_reason: assessment.reason,
    shishka_fit_profile_analyzed_at: assessment.profileAnalyzedAt,
    shishka_fit_scope_value: assessment.scopeValue,
  };

  const { error } = await supabase
    .from("user_views")
    .update(updatePayload)
    .eq("id", viewId);

  if (error) {
    throw new Error("Не вдалося зберегти оцінку.");
  }

  patchCollectionEntryByViewId({
    viewId,
    setCollection,
    setSelectedView,
    applyPatch: (item) => ({
      ...item,
      ...updatePayload,
    }),
  });
};

export const deleteCollectionView = async ({
  supabase,
  viewId,
}: {
  supabase: SupabaseClient;
  viewId: string;
}) => {
  const { error } = await supabase.from("user_views").delete().eq("id", viewId);

  if (error) {
    throw new Error("Не вдалося видалити запис.");
  }
};
