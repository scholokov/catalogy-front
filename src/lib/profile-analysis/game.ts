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

  return `You are analyzing a user's ACTUAL taste profile for video games on the ${platform} platform based only on factual play data.

Treat this as a platform-specific profile for ${platform} play behavior, not as a universal gaming profile across all platforms.

Your task is to build a reliable taste-profile snapshot from the provided CSV dataset.

Important rules:

1. Use ONLY factual signals from the CSV.
2. Do NOT infer preferences from planned, generated, suggested, or hypothetical titles.
3. Do NOT invent psychological traits, emotional narratives, or poetic interpretations.
4. Every important conclusion must be grounded in patterns visible in the data.
5. If the data is insufficient, mixed, or contradictory, say so explicitly.
6. Do NOT overclaim certainty.
7. Focus only on patterns that are useful later for recommendation quality.
8. Do NOT infer a stable preference or aversion from a single title unless the signal is extremely strong and clearly supported by rating or dropped status.

Interpretation rules for fields:

- "title" = game title
- "year" = release year
- "genres" = genre labels
- "dropped" = explicit user signal that the game was abandoned intentionally; treat this as a strong negative signal
- "rating" = user's personal rating on a 1 to 5 scale, where 5 is highest and 1 is lowest; half-points are allowed

Interpretation priorities:

- rating is the strongest direct preference signal
- dropped=true is a strong negative signal
- genres help identify repeated affinity and aversion patterns
- absence of a value in any field is NOT a signal by itself

Important behavioral rules:

- Do not treat a title as liked only because it was not dropped
- Do not treat a title as disliked only because rating is moderate
- Ratings around 3.0-3.5 should usually be treated as mixed, moderate, or context-dependent signals unless reinforced by broader patterns
- Distinguish strong likes, moderate likes, neutral or mixed cases, and strong dislikes
- Pay attention to repeated patterns across highly rated titles and separately across dropped or low-rated titles
- If the dataset contains conflicting signals, reflect that in the output
- Do not merely restate genres; infer meaningful but grounded play preferences
- Do not stop at broad genre labels such as RPG or Strategy if the data supports more specific recurring play preferences
- Prefer actionable play-pattern conclusions over generic genre restatements
- Identify repeated positive or negative franchise-level patterns when supported by multiple titles from the same game series or closely related subseries
- If a franchise-level pattern is strong, reflect it explicitly in the output
- Identify repeated positive or negative narrative-level and presentation-level patterns when supported by multiple titles
- Pay special attention to whether the user responds better to cinematic single-player experiences, systemic gameplay-first titles, or service-oriented multiplayer titles
- Identify repeated affinity or aversion toward single-player, multiplayer-first, co-op-first, PvP-first, or live-service experience structures when clearly supported by multiple titles
- Do not turn the output into a long blacklist of rejected categories; prioritize the most repeated and recommendation-relevant negative patterns
- Do not treat RPG as a stable positive category unless the data clearly supports it across multiple different subtypes; distinguish cinematic/action RPG from more niche, systems-heavy, anime-styled, or slower traditional RPG patterns when possible
- Missing genres do not reduce the importance of a title; use available factual signals without penalizing incomplete metadata
- Avoid niche, handcrafted, or overly personalized labels unless they are strongly supported by multiple titles
- Do not produce fake precision

Return ONLY valid JSON with exactly this structure:

{
  "user_profile_uk": {
    "summary": "Short user-facing Ukrainian summary of the taste profile. 3-5 sentences. Clear, natural, not poetic.",
    "likes": [
      "3 to 6 concise Ukrainian bullets about what usually works well for the user"
    ],
    "dislikes": [
      "3 to 6 concise Ukrainian bullets about what usually works worse for the user"
    ],
    "playing_patterns": [
      "2 to 5 concise Ukrainian bullets about observable play patterns"
    ],
    "franchise_signals_uk": [
      "2 to 5 concise Ukrainian bullets about clear franchise or series-level affinities, only if strongly supported"
    ],
    "confidence_label_uk": "Низька | Середня | Висока",
    "confidence_reason_uk": "Short Ukrainian explanation of profile reliability based on data volume and consistency"
  },
  "system_profile_en": {
    "profile_summary": "Compact English summary suitable for reuse in future recommendation prompts",
    "core_preferences": [
      "Short English points"
    ],
    "negative_patterns": [
      "Short English points"
    ],
    "experience_signals": [
      "Short English observations about preferred experience type, only if clearly supported"
    ],
    "playstyle_signals": [
      "Short English observations about preferred gameplay style, only if clearly supported"
    ],
    "taste_axes": [
      {
        "axis": "Name of preference axis in English",
        "value": "low | medium | high",
        "evidence": ["Title A", "Title B"]
      }
    ],
    "genre_signals": [
      "Short English observations only if supported by repeated evidence"
    ],
    "franchise_affinities": [
      "Franchise name with a short English note, only if clearly supported by multiple titles"
    ],
    "representative_likes": ["Title A", "Title B", "Title C"],
    "representative_dislikes": ["Title X", "Title Y", "Title Z"],
    "contradictions": [
      "Short English notes about mixed or conflicting signals"
    ],
    "confidence": {
      "label": "low | medium | high",
      "reason": "Short English explanation"
    },
    "evidence": {
      "positive_titles": ["Title A", "Title B"],
      "negative_titles": ["Title X", "Title Y"],
      "mixed_titles": ["Title M", "Title N"]
    }
  }
}

Additional output constraints:

- The Ukrainian layer is for direct UI display.
- The English layer is for system reuse in later recommendation prompts.
- Keep the English layer compact and reusable.
- "experience_signals" should describe the preferred type of overall game experience (for example cinematic single-player, multiplayer-first, live-service, story-driven, sandbox-heavy).
- "playstyle_signals" should describe preferred gameplay behavior and interaction style (for example action intensity, pacing, complexity, structure, exploration style, tolerance for repetition, tactical vs reflex emphasis).
- Do not add any fields outside the required JSON.
- Do not wrap the JSON in markdown.
- Do not output any commentary before or after the JSON.

CSV data:
${csvData}`;
};
