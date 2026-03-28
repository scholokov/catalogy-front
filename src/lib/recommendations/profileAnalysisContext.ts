import type {
  FilmProfileSystemLayer,
  GameProfileSystemLayer,
} from "@/lib/profile-analysis/types";

type FilmRecommendationProfileAnalysis = {
  systemProfile: FilmProfileSystemLayer;
  sourceTitlesCount?: number;
  analyzedAt?: string;
};

type GameRecommendationProfileAnalysis = {
  systemProfile: GameProfileSystemLayer;
  sourceTitlesCount?: number;
  analyzedAt?: string;
};

const formatList = (items: string[]) => (items.length > 0 ? items.join("; ") : "none");

const formatTasteAxes = (
  items: Array<{
    axis: string;
    value: string;
    evidence: string[];
  }>,
) =>
  items.length > 0
    ? items
        .map((item) =>
          `${item.axis} (${item.value})${
            item.evidence.length > 0 ? ` — evidence: ${item.evidence.join("; ")}` : ""
          }`,
        )
        .join(" | ")
    : "none";

export const buildFilmRecommendationProfileContext = (
  analysis?: FilmRecommendationProfileAnalysis | null,
  scopeLabel?: string,
) => {
  if (!analysis) return "";

  return `
=== PROFILE ANALYSIS START ===
Active analyzed film scope: ${scopeLabel || "unknown"}
System profile summary: ${analysis.systemProfile.profile_summary}
Core preferences: ${formatList(analysis.systemProfile.core_preferences)}
Negative patterns: ${formatList(analysis.systemProfile.negative_patterns)}
Taste axes: ${formatTasteAxes(analysis.systemProfile.taste_axes)}
Strong creator affinities: ${formatList(analysis.systemProfile.strong_creator_affinities)}
Creator signals: ${formatList(analysis.systemProfile.creator_signals)}
Actor signals: ${formatList(analysis.systemProfile.actor_signals)}
Representative likes: ${formatList(analysis.systemProfile.representative_likes)}
Representative dislikes: ${formatList(analysis.systemProfile.representative_dislikes)}
Contradictions: ${formatList(analysis.systemProfile.contradictions)}
Treat this active-scope profile analysis as the primary signal layer for recommendations when it is present.
=== PROFILE ANALYSIS END ===`.trim();
};

export const buildGameRecommendationProfileContext = (
  analysis?: GameRecommendationProfileAnalysis | null,
  scopeLabel?: string,
) => {
  if (!analysis) return "";

  return `
=== PROFILE ANALYSIS START ===
Active analyzed game scope: ${scopeLabel || "unknown"}
System profile summary: ${analysis.systemProfile.profile_summary}
Core preferences: ${formatList(analysis.systemProfile.core_preferences)}
Negative patterns: ${formatList(analysis.systemProfile.negative_patterns)}
Experience signals: ${formatList(analysis.systemProfile.experience_signals)}
Playstyle signals: ${formatList(analysis.systemProfile.playstyle_signals)}
Taste axes: ${formatTasteAxes(analysis.systemProfile.taste_axes)}
Genre signals: ${formatList(analysis.systemProfile.genre_signals)}
Franchise affinities: ${formatList(analysis.systemProfile.franchise_affinities)}
Representative likes: ${formatList(analysis.systemProfile.representative_likes)}
Representative dislikes: ${formatList(analysis.systemProfile.representative_dislikes)}
Contradictions: ${formatList(analysis.systemProfile.contradictions)}
Treat this active-scope profile analysis as the primary signal layer for recommendations when it is present.
=== PROFILE ANALYSIS END ===`.trim();
};
