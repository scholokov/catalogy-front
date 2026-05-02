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

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const asOptionalString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const asTasteAxes = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((entry) => {
          const object = asObject(entry);
          const axis = asOptionalString(object.axis);
          const tasteValue = asOptionalString(object.value);
          const evidence = asStringArray(object.evidence);

          if (!axis || !tasteValue) {
            return null;
          }

          return {
            axis,
            value: tasteValue,
            evidence,
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            axis: string;
            value: string;
            evidence: string[];
          } => Boolean(entry),
        )
    : [];

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

  const systemProfile = asObject(analysis.systemProfile);

  return `
=== PROFILE ANALYSIS START ===
Active analyzed film scope: ${scopeLabel || "unknown"}
System profile summary: ${asOptionalString(systemProfile.profile_summary) || "none"}
Core preferences: ${formatList(asStringArray(systemProfile.core_preferences))}
Negative patterns: ${formatList(asStringArray(systemProfile.negative_patterns))}
Taste axes: ${formatTasteAxes(asTasteAxes(systemProfile.taste_axes))}
Strong creator affinities: ${formatList(asStringArray(systemProfile.strong_creator_affinities))}
Creator signals: ${formatList(asStringArray(systemProfile.creator_signals))}
Actor signals: ${formatList(asStringArray(systemProfile.actor_signals))}
Representative likes: ${formatList(asStringArray(systemProfile.representative_likes))}
Representative dislikes: ${formatList(asStringArray(systemProfile.representative_dislikes))}
Contradictions: ${formatList(asStringArray(systemProfile.contradictions))}
Treat this active-scope profile analysis as the primary signal layer for recommendations when it is present.
=== PROFILE ANALYSIS END ===`.trim();
};

export const buildGameRecommendationProfileContext = (
  analysis?: GameRecommendationProfileAnalysis | null,
  scopeLabel?: string,
) => {
  if (!analysis) return "";

  const systemProfile = asObject(analysis.systemProfile);

  return `
=== PROFILE ANALYSIS START ===
Active analyzed game scope: ${scopeLabel || "unknown"}
System profile summary: ${asOptionalString(systemProfile.profile_summary) || "none"}
Core preferences: ${formatList(asStringArray(systemProfile.core_preferences))}
Negative patterns: ${formatList(asStringArray(systemProfile.negative_patterns))}
Experience signals: ${formatList(asStringArray(systemProfile.experience_signals))}
Playstyle signals: ${formatList(asStringArray(systemProfile.playstyle_signals))}
Taste axes: ${formatTasteAxes(asTasteAxes(systemProfile.taste_axes))}
Genre signals: ${formatList(asStringArray(systemProfile.genre_signals))}
Franchise affinities: ${formatList(asStringArray(systemProfile.franchise_affinities))}
Representative likes: ${formatList(asStringArray(systemProfile.representative_likes))}
Representative dislikes: ${formatList(asStringArray(systemProfile.representative_dislikes))}
Contradictions: ${formatList(asStringArray(systemProfile.contradictions))}
Treat this active-scope profile analysis as the primary signal layer for recommendations when it is present.
=== PROFILE ANALYSIS END ===`.trim();
};
