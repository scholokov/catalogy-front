import {
  buildProfileAnalysisPrompt,
  COMMON_IMPORTANT_RULES_EXTRA,
  buildCommonClusterSeparationRules,
  buildCommonHigherLevelPatternRules,
  buildCommonPracticalGuidance,
  buildCommonTasteAxisValueRules,
  type PromptBullet,
} from "@/lib/profile-analysis/promptBuilder";
import { GAME_PROFILE_ANALYSIS_JSON_SCHEMA } from "@/lib/profile-analysis/promptSchemas";
import type { GameProfilePromptRow } from "@/lib/profile-analysis/types";

const buildPlatformScopePreviewCsv = (rows: GameProfilePromptRow[]) => {
  const header = ["title", "year", "genres", "dropped", "rating"];
  const csvRows = rows.map((row) => [
    row.title,
    row.year,
    row.genres,
    row.dropped,
    row.rating,
  ]);

  return [header, ...csvRows]
    .map((columns) =>
      columns
        .map((value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`)
        .join(","),
    )
    .join("\n");
};

export const buildGameProfilePromptRows = (
  rows: Array<{
    title: string;
    year: string;
    genres: string;
    isViewed: boolean;
    viewPercent: number;
    rating: number | null;
    platforms: string[];
  }>,
  platform: string,
): GameProfilePromptRow[] =>
  rows
    .filter((row) => row.platforms.includes(platform) && row.isViewed)
    .map((row) => ({
      title: row.title,
      year: row.year,
      genres: row.genres,
      dropped: row.isViewed && row.viewPercent < 100 ? "true" : "false",
      rating: row.rating === null ? "" : String(row.rating),
    }));

export const buildPlatformScopeProfilePrompt = (
  rows: GameProfilePromptRow[],
  platform: string,
) => {
  const csvData = buildPlatformScopePreviewCsv(rows);
  const higherLevelPatternRules: PromptBullet[] = buildCommonHigherLevelPatternRules({
    splitExamples: [
      "cinematic/story-led vs systems-heavy",
      "authored single-player vs service-oriented multiplayer",
      "focused campaign vs endless grind loop",
      "tactile/action-forward vs slow/menu-heavy",
      "polished modern execution vs weaker derivative variants",
      "specific sub-type inside a broad genre",
    ],
    latentClusterExamples: [
      "franchise-like or sequel-like behavior when obvious from titles",
      "remake/remaster/legacy-series behavior when obvious from titles",
      "adaptation-like groups when clearly visible from titles",
      "platform-era tendencies",
      "narrower gameplay, pacing, progression, or presentation-mode clusters that cut across broad genres",
    ],
    uncertainGroupingRule:
      "Do not force franchise membership, adaptation grouping, or release-era grouping when title evidence is uncertain",
  });

  const clusterSeparationRules: PromptBullet[] = buildCommonClusterSeparationRules({
    exampleClusters:
      "live-service shooters, co-op looter games, open-world checklist games, Souls-like action RPGs, JRPGs, survival-crafting games, and remake/remaster nostalgia clusters",
    adaptationMergeTargets: "franchise action, shooter, or blockbuster patterns",
  });

  const tasteAxisValueRules: PromptBullet[] = buildCommonTasteAxisValueRules({
    preferredAxisNames: [
      "RPG selectivity",
      "Franchise/IP selectivity",
      "Multiplayer-service selectivity",
      "Open-world selectivity",
      "Narrative vs systems polarity",
    ],
    avoidAxisNames: [
      "RPG affinity",
      "Franchise affinity",
      "Multiplayer tolerance",
      "Open-world preference",
    ],
    explanationTargets:
      '"contradictions", "negative_patterns", "experience_signals", or "playstyle_signals"',
  });

  const practicalGuidance: PromptBullet[] = buildCommonPracticalGuidance({
    selectiveGenreLine:
      'If a broad genre is selective, explain the selectivity instead of stopping at "the user is selective in this genre"',
    mixedSignalLine:
      "If franchise evidence is mixed, describe the working mode instead of flattening the whole franchise into positive or negative",
  });

  return buildProfileAnalysisPrompt({
    introduction: `You are analyzing a user's ACTUAL taste profile for video games on the ${platform} platform based only on factual play data.`,
    scopeNotice: `Treat this as a platform-specific profile for ${platform} play behavior, not as a universal gaming profile across all platforms.`,
    importantRulesExtra: [
      "Your job is not only to summarize explicit fields such as genres, but also to detect repeated latent taste patterns that emerge across multiple titles with similar rating or dropped behavior.",
      ...COMMON_IMPORTANT_RULES_EXTRA.slice(1),
    ],
    interpretationRules: [
      '"title" = game title',
      '"year" = release year',
      '"genres" = genre labels',
      '"dropped" = explicit user signal that the game was abandoned intentionally; treat this as a strong negative signal',
      '"rating" = user\'s personal rating on a 1 to 5 scale, where 5 is highest and 1 is lowest; half-points are allowed',
    ],
    interpretationPriorities: [
      "rating is the strongest direct preference signal",
      "dropped=true is a strong negative signal",
      "genres help identify repeated affinity and aversion patterns, but broad genres are often too coarse to explain taste on their own",
      "absence of a value in any field is NOT a signal by itself",
    ],
    behavioralRulesExtra: [
      "Do not stop at broad genre labels such as RPG or Strategy if the data supports more specific recurring play preferences",
      "Prefer actionable play-pattern conclusions over generic genre restatements",
      "Identify repeated positive or negative franchise-level patterns when supported by multiple titles from the same game series or closely related subseries",
      "If a franchise-level pattern is strong, reflect it explicitly in the output",
      "Identify repeated positive or negative narrative-level and presentation-level patterns when supported by multiple titles",
      "Pay special attention to whether the user responds better to cinematic single-player experiences, systemic gameplay-first titles, or service-oriented multiplayer titles",
      "Identify repeated affinity or aversion toward single-player, multiplayer-first, co-op-first, PvP-first, or live-service experience structures when clearly supported by multiple titles",
      "Do not turn the output into a long blacklist of rejected categories; prioritize the most repeated and recommendation-relevant negative patterns",
      "Do not treat RPG as a stable positive category unless the data clearly supports it across multiple different subtypes; distinguish cinematic/action RPG from more niche, systems-heavy, anime-styled, or slower traditional RPG patterns when possible",
      "Missing genres do not reduce the importance of a title; use available factual signals without penalizing incomplete metadata",
    ],
    higherLevelPatternRules,
    clusterSeparationRules,
    tasteAxisValueRules,
    practicalGuidance,
    jsonStructure: GAME_PROFILE_ANALYSIS_JSON_SCHEMA,
    additionalOutputConstraints: [
      "experience_signals should describe the preferred type of overall game experience, for example cinematic single-player, multiplayer-first, live-service, story-driven, sandbox-heavy",
      "playstyle_signals should describe preferred gameplay behavior and interaction style, for example action intensity, pacing, complexity, structure, exploration style, tolerance for repetition, tactical vs reflex emphasis",
      "If a higher-level pattern is important, express it through summary, likes, dislikes, playing_patterns, experience_signals, playstyle_signals, taste_axes, contradictions, genre_signals, or franchise_affinities as appropriate",
    ],
    csvData,
  });
};
