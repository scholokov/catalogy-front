import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShishkaFitAssessment } from "@/lib/shishka/fitAssessment";
import {
  fetchLatestFilmFitProfileAnalysis,
  fetchLatestGameFitProfileAnalysis,
  requestFilmFitEvaluation,
  requestGameFitEvaluation,
} from "@/lib/shishka/fitEvaluationClient";

export const evaluateFilmCollectionFit = async ({
  supabase,
  film,
  previousAssessment,
}: {
  supabase: SupabaseClient;
  film: {
    title: string;
    year?: string | number | null;
    mediaType?: "movie" | "tv" | null;
    genres?: string | null;
    director?: string | null;
    actors?: string | null;
    plot?: string | null;
  };
  previousAssessment?: ShishkaFitAssessment | null;
}) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Не вдалося визначити користувача.");
  }

  const scopeValue = film.mediaType === "tv" ? "Серіали" : "Фільми";
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
    item: {
      title: film.title,
      year: film.year ?? null,
      mediaType: film.mediaType ?? "movie",
      genres: film.genres ?? null,
      director: film.director ?? null,
      actors: film.actors ?? null,
      plot: film.plot ?? null,
    },
  });
};

const getPrimaryGameScopeValue = (platforms?: string[] | null) => {
  const normalizedPlatforms = (platforms ?? [])
    .map((platform) => platform?.trim())
    .filter((platform): platform is string => Boolean(platform));

  return normalizedPlatforms[0] ?? "Ігри";
};

export const evaluateGameCollectionFit = async ({
  supabase,
  game,
  previousAssessment,
}: {
  supabase: SupabaseClient;
  game: {
    title: string;
    year?: string | number | null;
    genres?: string | null;
    description?: string | null;
    platforms?: string[] | null;
  };
  previousAssessment?: ShishkaFitAssessment | null;
}) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Не вдалося визначити користувача.");
  }

  const scopeValue = getPrimaryGameScopeValue(game.platforms);
  const profileAnalysis = await fetchLatestGameFitProfileAnalysis(
    supabase,
    user.id,
    scopeValue,
  );

  if (!profileAnalysis) {
    throw new Error("Спершу онови профіль для цієї платформи.");
  }

  if (
    previousAssessment?.profileAnalyzedAt &&
    previousAssessment.profileAnalyzedAt === profileAnalysis.analyzedAt
  ) {
    throw new Error("Спершу онови профіль, а потім запускай переоцінку.");
  }

  return requestGameFitEvaluation({
    scopeLabel: scopeValue,
    profileAnalysis,
    item: {
      title: game.title,
      year: game.year ?? null,
      genres: game.genres ?? null,
      description: game.description ?? null,
      platforms: game.platforms ?? null,
    },
  });
};
