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

  return `You are analyzing a user's ACTUAL taste profile for ${mediaLabel} based only on factual viewing data.

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

- "title" = ${titleLabel}
- "year" = release year
- "creator" = ${creatorLabel}
- "genres" = genre labels
- "actors_top" = main cast; this is a weak supporting signal, weaker than genres, dropped status, and rating
- "dropped" = ${droppedLabel}
- "rating" = user's personal rating on a 1 to 5 scale, where 5 is highest and 1 is lowest; half-points are allowed

Interpretation priorities:

- rating is the strongest direct preference signal
- dropped=true is a strong negative signal
- genres help identify repeated affinity and aversion patterns
- creator is usually a secondary signal, but repeated creator-level matches across multiple titles may indicate a meaningful authorship preference
- actors_top is a weak supporting signal only
- absence of a value in any field is NOT a signal by itself

Important behavioral rules:

- Do not treat a title as liked only because it was not dropped
- Do not treat a title as disliked only because rating is moderate
- Ratings around 3.0-3.5 should usually be treated as mixed, moderate, or context-dependent signals unless reinforced by broader patterns
- Distinguish strong likes, moderate likes, neutral or mixed cases, and strong dislikes
- Pay attention to repeated patterns across highly rated titles and separately across dropped or low-rated titles
- If the dataset contains conflicting signals, reflect that in the output
- Do not merely restate genres; infer meaningful but grounded viewing preferences
- Avoid niche, handcrafted, or overly personalized labels unless they are strongly supported by multiple titles
- Only include actor-related observations if repeated actor-related evidence is clearly present across multiple titles
- Identify repeated positive and negative creator-level signals when they are supported by multiple titles
- If a creator-level pattern is strong and clearly supported by the data, reflect it explicitly in both the user-facing and system-facing output
- Do not mention creator-level affinity if it is based on only one title or weak evidence
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
    "watching_patterns": [
      "2 to 5 concise Ukrainian bullets about observable viewing patterns"
    ],
    "strong_author_signals": [
      "2 to 5 concise Ukrainian bullets about strong creator or director matches, only if clearly supported"
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
    "taste_axes": [
      {
        "axis": "Name of preference axis in English",
        "value": "low | medium | high",
        "evidence": ["Title A", "Title B"]
      }
    ],
    "strong_creator_affinities": [
      "Creator or director name with a short English note, only if clearly supported by multiple titles"
    ],
    "creator_signals": [
      "Short English observations only if supported by data"
    ],
    "actor_signals": [
      "Short English observations only if clearly supported by repeated evidence across multiple titles"
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
- Do not add any fields outside the required JSON.
- Do not wrap the JSON in markdown.
- Do not output any commentary before or after the JSON.

CSV data:
${csvData}`;
};
