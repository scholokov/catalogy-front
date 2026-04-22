import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShishkaFitAssessment } from "@/lib/shishka/fitAssessment";

type CollectionViewMutationPayload = {
  viewedAt: string;
  comment: string;
  recommendSimilar: boolean;
  isViewed: boolean;
  rating: number | null;
  viewPercent: number;
  availability: string | null;
  shishkaFitAssessment: ShishkaFitAssessment | null;
};

export const buildCollectionViewUpdatePayload = <
  TExtra extends Record<string, unknown> = Record<string, never>,
>({
  payload,
  extra,
}: {
  payload: CollectionViewMutationPayload;
  extra?: TExtra;
}) => ({
  rating: payload.rating,
  comment: payload.comment,
  viewed_at: payload.viewedAt,
  is_viewed: payload.isViewed,
  view_percent: payload.viewPercent,
  recommend_similar: payload.recommendSimilar,
  availability: payload.availability,
  shishka_fit_label: payload.shishkaFitAssessment?.label ?? null,
  shishka_fit_reason: payload.shishkaFitAssessment?.reason ?? null,
  shishka_fit_profile_analyzed_at:
    payload.shishkaFitAssessment?.profileAnalyzedAt ?? null,
  shishka_fit_scope_value: payload.shishkaFitAssessment?.scopeValue ?? null,
  ...(extra ?? ({} as TExtra)),
});

export const updateCollectionViewRecord = async <
  TExtra extends Record<string, unknown> = Record<string, never>,
>({
  supabase,
  viewId,
  payload,
  extra,
  errorMessage,
}: {
  supabase: SupabaseClient;
  viewId: string;
  payload: CollectionViewMutationPayload;
  extra?: TExtra;
  errorMessage: string;
}) => {
  const { error } = await supabase
    .from("user_views")
    .update(
      buildCollectionViewUpdatePayload({
        payload,
        extra,
      }),
    )
    .eq("id", viewId);

  if (error) {
    throw new Error(errorMessage);
  }
};

export const updateCollectionItemRecordWithRetry = async <
  TPrimary extends Record<string, unknown>,
  TRetry extends Record<string, unknown> = TPrimary,
>({
  supabase,
  itemId,
  primaryPayload,
  retryPayload,
  errorMessage,
}: {
  supabase: SupabaseClient;
  itemId: string;
  primaryPayload: TPrimary;
  retryPayload?: TRetry;
  errorMessage: string;
}) => {
  const { error: updateItemError } = await supabase
    .from("items")
    .update(primaryPayload)
    .eq("id", itemId);

  if (!updateItemError) {
    return;
  }

  if (updateItemError.code === "23505" && retryPayload) {
    const { error: retryError } = await supabase
      .from("items")
      .update(retryPayload)
      .eq("id", itemId);

    if (!retryError) {
      return;
    }
  }

  throw new Error(errorMessage);
};
