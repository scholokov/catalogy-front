import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FilmProfileSystemLayer,
  FilmProfileUserLayer,
  GameProfileSystemLayer,
  GameProfileUserLayer,
} from "@/lib/profile-analysis/types";
import type { ShishkaFitAssessment } from "@/lib/shishka/fitAssessment";

export type FilmFitProfileAnalysis = {
  userProfile: FilmProfileUserLayer;
  systemProfile: FilmProfileSystemLayer;
  sourceTitlesCount: number;
  analyzedAt: string;
};

export type GameFitProfileAnalysis = {
  userProfile: GameProfileUserLayer;
  systemProfile: GameProfileSystemLayer;
  sourceTitlesCount: number;
  analyzedAt: string;
};

export const fetchLatestFilmFitProfileAnalysis = async (
  supabase: SupabaseClient,
  userId: string,
  scopeValue: string,
) => {
  const { data, error } = await supabase
    .from("profile_analyses")
    .select("user_profile, system_profile, source_titles_count, analyzed_at")
    .eq("user_id", userId)
    .eq("media_kind", "film")
    .eq("scope_type", "format")
    .eq("scope_value", scopeValue)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    userProfile: data.user_profile as FilmProfileUserLayer,
    systemProfile: data.system_profile as FilmProfileSystemLayer,
    sourceTitlesCount: data.source_titles_count ?? 0,
    analyzedAt: data.analyzed_at,
  } satisfies FilmFitProfileAnalysis;
};

export const fetchLatestGameFitProfileAnalysis = async (
  supabase: SupabaseClient,
  userId: string,
  scopeValue: string,
) => {
  const { data, error } = await supabase
    .from("profile_analyses")
    .select("user_profile, system_profile, source_titles_count, analyzed_at")
    .eq("user_id", userId)
    .eq("media_kind", "game")
    .eq("scope_type", "platform")
    .eq("scope_value", scopeValue)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    userProfile: data.user_profile as GameProfileUserLayer,
    systemProfile: data.system_profile as GameProfileSystemLayer,
    sourceTitlesCount: data.source_titles_count ?? 0,
    analyzedAt: data.analyzed_at,
  } satisfies GameFitProfileAnalysis;
};

export const requestFilmFitEvaluation = async (payload: {
  scopeLabel: string;
  profileAnalysis: FilmFitProfileAnalysis;
  item: {
    title: string;
    year?: string | number | null;
    mediaType?: "movie" | "tv" | null;
    genres?: string | null;
    director?: string | null;
    actors?: string | null;
    plot?: string | null;
  };
}) => {
  const response = await fetch("/api/openai/film-fit-evaluation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as {
    assessment?: { label: ShishkaFitAssessment["label"]; reason: string };
    error?: string;
  };

  if (!response.ok || !data.assessment) {
    throw new Error(data.error ?? "Не вдалося отримати оцінку.");
  }

  return {
    label: data.assessment.label,
    reason: data.assessment.reason,
    profileAnalyzedAt: payload.profileAnalysis.analyzedAt,
    scopeValue: payload.scopeLabel,
  } satisfies ShishkaFitAssessment;
};

export const requestGameFitEvaluation = async (payload: {
  scopeLabel: string;
  profileAnalysis: GameFitProfileAnalysis;
  item: {
    title: string;
    year?: string | number | null;
    genres?: string | null;
    description?: string | null;
    platforms?: string[] | null;
  };
}) => {
  const response = await fetch("/api/openai/game-fit-evaluation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as {
    assessment?: { label: ShishkaFitAssessment["label"]; reason: string };
    error?: string;
  };

  if (!response.ok || !data.assessment) {
    throw new Error(data.error ?? "Не вдалося отримати оцінку.");
  }

  return {
    label: data.assessment.label,
    reason: data.assessment.reason,
    profileAnalyzedAt: payload.profileAnalysis.analyzedAt,
    scopeValue: payload.scopeLabel,
  } satisfies ShishkaFitAssessment;
};
