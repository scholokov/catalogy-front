import {
  buildProfileAnalysisPrompt,
  COMMON_IMPORTANT_RULES_EXTRA,
  buildCommonClusterSeparationRules,
  buildCommonHigherLevelPatternRules,
  buildCommonPracticalGuidance,
  buildCommonTasteAxisValueRules,
  type PromptBullet,
} from "@/lib/profile-analysis/promptBuilder";
import { FILM_PROFILE_ANALYSIS_JSON_SCHEMA } from "@/lib/profile-analysis/promptSchemas";
import type { FilmProfilePromptRow } from "@/lib/profile-analysis/types";

export type FilmPromptMediaType = "movie" | "tv";

const buildFilmScopePreviewCsv = (rows: FilmProfilePromptRow[]) => {
  const header = ["title", "year", "creator", "genres", "actors_top", "dropped", "rating"];
  const csvRows = rows.map((row) => [
    row.title,
    row.year,
    row.creator,
    row.genres,
    row.actors_top,
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

export const buildFilmProfilePromptRows = (
  rows: Array<{
    title: string;
    year: string;
    director: string;
    genres: string;
    actors: string;
    isViewed: boolean;
    viewPercent: number;
    rating: number | null;
    mediaType: FilmPromptMediaType;
  }>,
  mediaType: FilmPromptMediaType,
): FilmProfilePromptRow[] =>
  rows
    .filter((row) => row.mediaType === mediaType && row.isViewed)
    .map((row) => ({
      title: row.title,
      year: row.year,
      creator: row.director,
      genres: row.genres,
      actors_top: row.actors,
      dropped: row.isViewed && row.viewPercent < 100 ? "true" : "false",
      rating: row.rating === null ? "" : String(row.rating),
    }));

export const buildFilmScopeProfilePrompt = (
  rows: FilmProfilePromptRow[],
  mediaType: FilmPromptMediaType,
) => {
  const csvData = buildFilmScopePreviewCsv(rows);
  const mediaLabel = mediaType === "tv" ? "TV series" : "movies";
  const titleLabel = mediaType === "tv" ? "series title" : "movie title";
  const creatorLabel =
    mediaType === "tv"
      ? "key creative authorship signal for the series; treat it as a secondary creative signal, not as a stronger signal than direct user rating"
      : "director / key creative authorship signal for the movie; treat it as a secondary creative signal, not as a stronger signal than direct user rating";
  const droppedLabel =
    mediaType === "tv"
      ? "explicit user signal that the series was abandoned intentionally; treat this as a strong negative signal"
      : "explicit user signal that the movie was abandoned intentionally; treat this as a strong negative signal";
  const higherLevelPatternRules: PromptBullet[] = buildCommonHigherLevelPatternRules({
    splitExamples: [
      "authored vs generic",
      "grounded vs franchise-heavy",
      "tense/practical vs glossy/spectacle-first",
      "concept-led vs formulaic",
      "classic/older vs modern weaker equivalents",
      "specific sub-type inside a broad genre",
    ],
    latentClusterExamples: [
      "franchise-like or sequel-like behavior when obvious from titles",
      "adaptation-like groups when clearly visible from titles",
      "local, regional, or national film clusters when clearly visible from titles or creators",
      "era or decade tendencies",
      "narrower tone, style, or content-mode clusters that cut across broad genres",
    ],
    uncertainGroupingRule:
      "Do not force franchise membership or adaptation grouping when title evidence is uncertain",
  });

  const clusterSeparationRules: PromptBullet[] = buildCommonClusterSeparationRules({
    exampleClusters:
      "superhero films, video-game adaptations, franchise sci-fi, legacy sequels, monster or creature films, and IP-driven adventure films",
    adaptationMergeTargets:
      "superhero, sci-fi, or franchise-blockbuster patterns",
  });

  const tasteAxisValueRules: PromptBullet[] = buildCommonTasteAxisValueRules({
    preferredAxisNames: [
      "Horror selectivity",
      "Franchise/IP selectivity",
      "Comedy polarity",
      "Action selectivity",
      "Creator-mode selectivity",
    ],
    avoidAxisNames: [
      "Franchise/IP affinity",
      "Franchise/IP tolerance",
      "Comedy affinity",
      "Action preference",
    ],
    explanationTargets: '"contradictions", "negative_patterns", or "core_preferences"',
  });

  const practicalGuidance: PromptBullet[] = buildCommonPracticalGuidance({
    selectiveGenreLine:
      'If a broad genre is selective, explain the selectivity instead of stopping at "the user is selective in this genre"',
    mixedSignalLine:
      "If a creator signal is mixed, try to identify whether the user responds to a specific mode of that creator's work rather than to the creator in general",
  });

  return buildProfileAnalysisPrompt({
    introduction: `You are analyzing a user's ACTUAL taste profile for ${mediaLabel} based only on factual viewing data.`,
    importantRulesExtra: [
      "Your job is not only to summarize explicit fields such as genres and creators, but also to detect repeated latent taste patterns that emerge across multiple titles with similar rating or dropped behavior.",
      ...COMMON_IMPORTANT_RULES_EXTRA.slice(1),
    ],
    interpretationRules: [
      `"title" = ${titleLabel}`,
      '"year" = release year',
      `"creator" = ${creatorLabel}`,
      '"genres" = genre labels',
      '"actors_top" = main cast; this is a weak supporting signal, weaker than genres, dropped status, and rating',
      `"dropped" = ${droppedLabel}`,
      '"rating" = user\'s personal rating on a 1 to 5 scale, where 5 is highest and 1 is lowest; half-points are allowed',
    ],
    interpretationPriorities: [
      "rating is the strongest direct preference signal",
      "dropped=true is a strong negative signal",
      "genres help identify repeated affinity and aversion patterns, but broad genres are often too coarse to explain taste on their own",
      "creator is usually a secondary signal, but repeated creator-level matches across multiple titles may indicate a meaningful authorship preference",
      "actors_top is a weak supporting signal only",
      "absence of a value in any field is NOT a signal by itself",
    ],
    behavioralRulesExtra: [
      "Only include actor-related observations if repeated actor-related evidence is clearly present across multiple titles AND is genuinely useful for recommendation quality",
      "Identify repeated positive and negative creator-level signals when they are supported by multiple titles",
      "If a creator-level pattern is strong and clearly supported by the data, reflect it explicitly in both the user-facing and system-facing output",
      "Do not mention creator-level affinity if it is based on only one title or weak evidence",
      "If a creator is not a stable overall affinity but shows a clear positive mode, include this as a selective creator-mode signal rather than omitting it",
      "A creator may work in one recurring mode but fail in another",
      "Do not flatten mixed creators into a simple positive or negative signal",
      "If a creator works only in a specific mode, describe that mode clearly",
      "Example pattern: a director may be positive for grounded professional or revenge action but not for all action titles",
      "Do not let selective creator-mode or actor-in-context signals displace stronger stable creator or cluster signals",
      "If a creator has many strong positive ratings and no or very few negative exceptions, keep them as a primary strong signal",
      "Selective creator-mode signals should supplement the core profile, not replace it",
      "Do not label a creator as negative if they have several strong positive titles and several weak or dropped titles",
      "In that case, describe the creator as mixed or selective and identify which mode works and which mode fails",
      "Actor signals must remain secondary",
      "Do not describe actor presence as a standalone preference unless the evidence is extremely strong and repeated across different contexts",
      "If an actor repeatedly works inside a specific successful content mode, mention this as an actor-in-context pattern",
      "Actor-in-context patterns should explain the context, not just the actor name",
      "Example pattern: an actor may be a positive supporting signal in crime or action thrillers, but not a general reason to recommend unrelated titles",
      "Actor signals must not override genre, cluster, creator-mode, rating, or dropped evidence",
    ],
    higherLevelPatternRules,
    clusterSeparationRules,
    tasteAxisValueRules,
    practicalGuidance,
    jsonStructure: FILM_PROFILE_ANALYSIS_JSON_SCHEMA,
    additionalOutputConstraints: [
      "If a higher-level pattern is important, express it through summary, likes, dislikes, watching_patterns, taste_axes, contradictions, or creator_signals as appropriate",
    ],
    csvData,
  });
};
