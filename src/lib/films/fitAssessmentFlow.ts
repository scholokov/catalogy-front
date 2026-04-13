import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShishkaFitAssessment } from "@/lib/shishka/fitAssessment";
import {
  fetchLatestFilmFitProfileAnalysis,
  requestFilmFitEvaluation,
} from "@/lib/shishka/fitEvaluationClient";

export const getFilmScopeValue = (mediaType?: "movie" | "tv" | null) =>
  mediaType === "tv" ? "Серіали" : "Кіно";

export const getStoredFilmFitAssessment = (item: {
  label?: ShishkaFitAssessment["label"] | null;
  reason?: string | null;
  profileAnalyzedAt?: string | null;
  scopeValue?: string | null;
  mediaType?: "movie" | "tv" | null;
}): ShishkaFitAssessment | null => {
  if (!item.label || !item.reason?.trim()) {
    return null;
  }

  return {
    label: item.label,
    reason: item.reason.trim(),
    // Old records may miss these fields, but the badge can still be displayed.
    profileAnalyzedAt: item.profileAnalyzedAt?.trim() || "legacy",
    scopeValue: item.scopeValue?.trim() || getFilmScopeValue(item.mediaType),
  };
};

export const evaluateFilmWithProfile = async (
  supabase: SupabaseClient,
  item: {
    title: string;
    year?: string | number | null;
    mediaType?: "movie" | "tv" | null;
    genres?: string | null;
    director?: string | null;
    actors?: string | null;
    plot?: string | null;
  },
  previousAssessment?: ShishkaFitAssessment | null,
) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Не вдалося визначити користувача.");
  }

  const scopeValue = getFilmScopeValue(item.mediaType);
  const profileAnalysis = await fetchLatestFilmFitProfileAnalysis(
    supabase,
    user.id,
    scopeValue,
  );

  if (!profileAnalysis) {
    throw new Error("Спершу онови профіль для цього формату.");
  }

  if (
    previousAssessment?.profileAnalyzedAt &&
    previousAssessment.profileAnalyzedAt === profileAnalysis.analyzedAt
  ) {
    throw new Error("Спершу онови профіль, а потім запускай переоцінку.");
  }

  return requestFilmFitEvaluation({
    scopeLabel: scopeValue,
    profileAnalysis,
    item,
  });
};

export const persistFilmViewAssessment = async (
  supabase: SupabaseClient,
  viewId: string,
  assessment: ShishkaFitAssessment,
) => {
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

  return updatePayload;
};
