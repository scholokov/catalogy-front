import { NextResponse } from "next/server";
import { getOpenAiRecommendationModel } from "@/lib/openai/models";
import { buildGameRecommendationProfileContext } from "@/lib/recommendations/profileAnalysisContext";
import {
  buildRecommendationFailureMessage,
  filterRecommendationsWithStats,
  type RecommendationAttemptDiagnostics,
} from "@/lib/recommendations/diagnostics";
import {
  buildGameLlmRecoContextText,
  buildKnownTitlesForGamesLlm,
  type GameLlmExportRow,
} from "@/app/statistics/gameLlmContext";
import type { GameProfileSystemLayer, GameProfileUserLayer } from "@/lib/profile-analysis/types";

type OpenAiMessage = {
  content?: string;
};

type OpenAiChoice = {
  message?: OpenAiMessage;
};

type OpenAiResponse = {
  choices?: OpenAiChoice[];
  error?: {
    message?: string;
  };
};

type ParsedRecommendation = {
  title: string;
  year: string;
  type: string;
  why: string;
  raw: string;
};

type GameRecommendationProfileAnalysis = {
  userProfile: GameProfileUserLayer;
  systemProfile: GameProfileSystemLayer;
  sourceTitlesCount?: number;
  analyzedAt?: string;
};

const OPENAI_MODEL = getOpenAiRecommendationModel();
const DEFAULT_REQUESTED_COUNT = 6;
const DEFAULT_OUTPUT_COUNT = 6;
const DEFAULT_MINIMUM_RECOMMENDATION_COUNT = 4;

const normalizePositiveInt = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.trunc(value);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
};

const buildPrompt = (
  context: string,
  requestedCount: number,
  scopeLabel?: string,
  userWishes?: string,
) => `You are given a compact recommendation context for one user.

Your task:
Suggest exactly ${requestedCount} video game candidates for ${scopeLabel || "the active platform slice"} that fit this user's proven taste profile extremely well.

Primary objective:
Select titles with deep taste resonance, not broad genre overlap.

Core recommendation principles:
1. Prioritize strong fit to the user's proven gameplay and experience core.
2. Optimize for gameplay feel, decision texture, feedback speed, progression depth, campaign structure, and overall experience type.
3. Prefer recommendation quality over safety, filler, popularity, or generic genre similarity.
4. Keep all ${requestedCount} picks inside the proven taste core, but make them distinct by subtype, structure, or play feel.
5. Do not explain the full user profile back to me.
6. Do not write plot summaries, lore summaries, or generic game descriptions.
7. Use profile signals as pattern evidence, not as franchise-copying instructions.
8. Prioritize deep resonance over surface similarity to any one title, franchise, or keyword.
9. Prefer internationally known titles with stable naming to reduce ambiguity.
10. Keep the ${scopeLabel || "active platform"} slice primary. Do not let unrelated platform history dominate the recommendation.
11. User wishes modify the proven taste profile, but do not override it.

Important constraints:
- You are generating a candidate pool, not performing full collection deduplication.
- Do NOT try to infer the user's full existing collection beyond the titles explicitly listed in this prompt.
- Do NOT recommend any title explicitly listed in:
  - Representative likes
  - Representative dislikes
  - Current-interest anchors
- Do not recommend a title only because it is franchise-adjacent to a known positive series.
- Prefer games that match the user's proven playstyle and experience structure, not just familiar branding or surface genre overlap.
- Current-interest anchors are weak exploratory hints only, not proven taste evidence.
- Never let current-interest anchors outweigh repeated factual signals from the analyzed profile.
- The ${requestedCount} suggestions must stay inside the proven taste core, but should diversify across adjacent sub-patterns rather than repeating one obvious formula ${requestedCount} times.

Output format:
Return exactly ${requestedCount} items as a numbered list.

For each item use exactly this format:
1. Original Title (Year) — type: game
Why it fits: 1-2 short sentences in Ukrainian.

Output rules:
- "Why it fits" must explain why this game matches this specific user's taste.
- Keep the explanation compact and concrete.
- Do not repeat the same reasoning formula ${requestedCount} times.
- The ${requestedCount} picks should feel distinct while staying inside the same proven taste core.
- Do not add any intro or conclusion.

=== ACTIVE RECOMMENDATION CONTEXT START ===
Platform slice: ${scopeLabel || "вся бібліотека"}
User wishes: ${userWishes || "немає додаткових побажань."}

${context}
=== ACTIVE RECOMMENDATION CONTEXT END ===`;

const buildRetryPrompt = (
  context: string,
  requestedCount: number,
  scopeLabel?: string,
  userWishes?: string,
) => `You previously generated candidates that were malformed, too overlapping, too weak, or not usable after filtering.

Generate exactly ${requestedCount} new video game candidates for ${scopeLabel || "the active platform slice"} with stricter fit quality, clearer differentiation, and exact formatting.

Primary objective:
Stay inside the same proven taste core while avoiding repetition and weak surface-level matches.

Hard requirements:
1. Return exactly ${requestedCount} items.
2. Keep all ${requestedCount} picks inside the proven taste core, but make them distinct by subtype, structure, or play feel.
3. Prefer less obvious but still high-fit candidates.
4. Do not repeat obvious canon already implied by representative likes.
5. Write "Why it fits" in Ukrainian.
6. Do not write plot summaries, lore summaries, or generic game descriptions.
7. Respect negative patterns, contradictions, and anti-match signals even when a title looks superficially similar to a positive anchor.
8. Current-interest anchors are weak exploratory hints only, not proven taste evidence.
9. User wishes modify the proven taste profile, but do not override it.
10. Keep the ${scopeLabel || "active platform"} slice primary.

Output format:
1. Original Title (Year) — type: game
Why it fits: 1-2 short sentences in Ukrainian.

Output rules:
- Keep explanations compact and concrete.
- Do not repeat the same reasoning formula ${requestedCount} times.
- Do not add any intro or conclusion.

=== ACTIVE RECOMMENDATION CONTEXT START ===
Platform slice: ${scopeLabel || "вся бібліотека"}
User wishes: ${userWishes || "немає додаткових побажань."}

${context}
=== ACTIVE RECOMMENDATION CONTEXT END ===`;

const normalizeTitle = (value: string) =>
  value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-zа-яіїєґ0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripMarkdown = (value: string) =>
  value
    .replace(/\*\*/g, "")
    .replace(/^[-•]\s*/, "")
    .trim();

const buildKnownTitleSet = (rows: GameLlmExportRow[]) => {
  const titles = new Set<string>();
  rows.forEach((row) => {
    [row.title, row.year ? `${row.title} (${row.year})` : ""]
      .filter(Boolean)
      .forEach((title) => {
        titles.add(normalizeTitle(title));
      });
  });
  return titles;
};

const parseRecommendations = (text: string): ParsedRecommendation[] => {
  const normalizedText = text.replace(/\r\n/g, "\n").trim();
  const blocks = normalizedText
    .split(/\n(?=\s*\d+[.)]\s+)/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => stripMarkdown(line))
        .filter(Boolean);
      if (lines.length === 0) return null;

      const firstLine = lines[0].replace(/^\d+[.)]\s*/, "").trim();
      const titleMatch = firstLine.match(/^(.*?)\s*\((\d{4})\)\s*[—–-]\s*type:\s*(game|video game)$/i);
      if (!titleMatch) return null;

      const whyLineIndex = lines.findIndex((line) => /^Why it fits:/i.test(line));
      const whyText =
        whyLineIndex >= 0
          ? (() => {
              const collected: string[] = [];
              for (let index = whyLineIndex; index < lines.length; index += 1) {
                collected.push(lines[index]);
              }
              return collected.join(" ").replace(/^Why it fits:\s*/i, "").trim();
            })()
          : "";
      if (!whyText) return null;

      return {
        title: stripMarkdown(titleMatch[1].trim()),
        year: titleMatch[2],
        type: "game",
        why: whyText,
        raw: block,
      };
    })
    .filter((entry): entry is ParsedRecommendation => Boolean(entry));
};

const callOpenAi = async (
  context: string,
  requestedCount: number,
  promptBuilder: (context: string, requestedCount: number) => string = buildPrompt,
) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.9,
      messages: [
        {
          role: "user",
          content: promptBuilder(context, requestedCount),
        },
      ],
    }),
  });

  const data = (await response.json()) as OpenAiResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI request failed.");
  }

  return data.choices?.[0]?.message?.content?.trim() ?? "";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      rows?: GameLlmExportRow[];
      knownTitleRows?: GameLlmExportRow[];
      additionalKnownTitles?: string[];
      scopeLabel?: string;
      userWishes?: string;
      profileAnalysis?: GameRecommendationProfileAnalysis;
      debugPreview?: boolean;
      requestedCount?: number;
      outputCount?: number;
      minimumRecommendationCount?: number;
    };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const knownTitleRows =
      Array.isArray(body.knownTitleRows) && body.knownTitleRows.length > 0
        ? body.knownTitleRows
        : rows;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Missing game rows." }, { status: 400 });
    }

    const profileContext = buildGameRecommendationProfileContext(
      body.profileAnalysis,
      body.scopeLabel,
    );
    const context = [buildGameLlmRecoContextText(rows, { includeKnownTitles: false }), profileContext]
      .filter(Boolean)
      .join("\n\n");
    const knownTitles = buildKnownTitleSet(knownTitleRows);
    (Array.isArray(body.additionalKnownTitles) ? body.additionalKnownTitles : [])
      .filter((value) => value.trim().length > 0)
      .forEach((title) => {
        knownTitles.add(normalizeTitle(title));
      });
    const requestedCount = normalizePositiveInt(body.requestedCount, DEFAULT_REQUESTED_COUNT, 1, 20);
    const outputCount = normalizePositiveInt(
      body.outputCount,
      Math.min(DEFAULT_OUTPUT_COUNT, requestedCount),
      1,
      requestedCount,
    );
    const minimumRecommendationCount = normalizePositiveInt(
      body.minimumRecommendationCount,
      Math.min(DEFAULT_MINIMUM_RECOMMENDATION_COUNT, outputCount),
      1,
      outputCount,
    );
    const prompt = buildPrompt(context, requestedCount, body.scopeLabel, body.userWishes);
    const diagnostics: RecommendationAttemptDiagnostics[] = [];

    if (body.debugPreview && process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        prompt,
      });
    }

    const firstResponse = await callOpenAi(context, requestedCount, () => prompt);
    const firstParsed = parseRecommendations(firstResponse);
    const firstResult = filterRecommendationsWithStats(firstParsed, knownTitles, normalizeTitle);
    diagnostics.push({
      label: "Спроба 1 (базовий prompt)",
      requestedCount,
      ...firstResult.stats,
    });

    let finalRecommendations = firstResult.recommendations;

    if (finalRecommendations.length < minimumRecommendationCount) {
      const secondRequestedCount = Math.min(requestedCount + 4, 20);
      const secondResponse = await callOpenAi(context, secondRequestedCount, (nextContext, requestedCount) =>
        buildRetryPrompt(nextContext, requestedCount, body.scopeLabel, body.userWishes),
      );
      const secondParsed = parseRecommendations(secondResponse);
      const secondResult = filterRecommendationsWithStats(secondParsed, knownTitles, normalizeTitle);
      diagnostics.push({
        label: "Спроба 2 (retry prompt)",
        requestedCount: secondRequestedCount,
        ...secondResult.stats,
      });
      const merged = [...firstResult.recommendations];
      secondResult.recommendations.forEach((entry) => {
        if (!merged.some((existing) => normalizeTitle(existing.title) === normalizeTitle(entry.title))) {
          merged.push(entry);
        }
      });
      finalRecommendations = merged;
    }

    if (finalRecommendations.length < minimumRecommendationCount) {
      const thirdRequestedCount = Math.min(requestedCount + 8, 24);
      const thirdResponse = await callOpenAi(context, thirdRequestedCount, (nextContext, requestedCount) =>
        buildRetryPrompt(nextContext, requestedCount, body.scopeLabel, body.userWishes),
      );
      const thirdParsed = parseRecommendations(thirdResponse);
      const thirdResult = filterRecommendationsWithStats(thirdParsed, knownTitles, normalizeTitle);
      diagnostics.push({
        label: "Спроба 3 (retry prompt, розширена вибірка)",
        requestedCount: thirdRequestedCount,
        ...thirdResult.stats,
      });
      const merged = [...finalRecommendations];
      thirdResult.recommendations.forEach((entry) => {
        if (!merged.some((existing) => normalizeTitle(existing.title) === normalizeTitle(entry.title))) {
          merged.push(entry);
        }
      });
      finalRecommendations = merged;
    }

    const outputRecommendations = finalRecommendations.slice(0, outputCount);
    const message =
      outputRecommendations.length > 0
        ? outputRecommendations
            .map(
              (entry, index) =>
                `${index + 1}. ${entry.title} (${entry.year}) — type: ${entry.type}\nWhy it fits: ${entry.why}`,
            )
            .join("\n\n")
        : buildRecommendationFailureMessage(diagnostics);

    return NextResponse.json({
      message,
      recommendations: outputRecommendations,
      knownTitlesCount: buildKnownTitlesForGamesLlm(knownTitleRows).length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не вдалося згенерувати рекомендації.",
      },
      { status: 500 },
    );
  }
}
