import { NextResponse } from "next/server";
import { getOpenAiRecommendationModel } from "@/lib/openai/models";
import { buildFilmRecommendationProfileContext } from "@/lib/recommendations/profileAnalysisContext";
import {
  buildLlmRecoContextText,
  type FilmLlmExportRow,
} from "@/app/statistics/filmLlmCsv";
import type { FilmProfileSystemLayer, FilmProfileUserLayer } from "@/lib/profile-analysis/types";

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

type FilmRecommendationProfileAnalysis = {
  userProfile: FilmProfileUserLayer;
  systemProfile: FilmProfileSystemLayer;
  sourceTitlesCount?: number;
  analyzedAt?: string;
};

const OPENAI_MODEL = getOpenAiRecommendationModel();

const getScopedFilmRequirement = (scopeLabel?: string) => {
  if (scopeLabel === "Серіали") {
    return {
      taskLabel: "series or miniseries",
      typeLabel: "series/miniseries",
      instruction: "Recommend only series or miniseries. Do not return movies.",
    };
  }

  if (scopeLabel === "Кіно") {
    return {
      taskLabel: "movies",
      typeLabel: "movie",
      instruction: "Recommend only movies. Do not return series or miniseries.",
    };
  }

  return {
    taskLabel: "movie or series titles",
    typeLabel: "movie/series/miniseries",
    instruction: "Stay inside the active format and do not drift into the other format.",
  };
};

const buildPrompt = (
  context: string,
  requestedCount: number,
  scopeLabel?: string,
  userWishes?: string,
) => {
  const scopedRequirement = getScopedFilmRequirement(scopeLabel);

  return `You are given a compact recommendation context for one user.
Your task: Suggest ${requestedCount} candidate ${scopedRequirement.taskLabel} that fit the user's taste profile extremely well.

Critical rules:
1. Recommend only strong-fit candidates, not broad genre matches.
2. Prefer titles with a high probability of emotional/taste resonance, not just cultural importance.
3. Avoid generic, formulaic, safe, or obvious filler picks.
4. Avoid titles too similar to each other; keep the ${requestedCount} suggestions distinct in tone or subtype while still matching the same taste core.
5. You are generating a candidate pool. Some titles may later be filtered out by code if they already exist in the user's collection, so prioritize quality and fit.
6. Do not explain the full user profile back to me.
7. Do not recommend anything from the "Representative positive titles", "Representative negative titles", or "Current interest vector" if those titles are explicitly listed there.
8. Prefer internationally known titles with stable naming to reduce ambiguity.
9. Active recommendation format: ${scopeLabel || "вся бібліотека"}.
10. User wishes: ${userWishes || "немає додаткових побажань"}.
11. Treat user wishes as a modifier of the proven taste profile, not as an override.
12. ${scopedRequirement.instruction}

Output format:
Return exactly ${requestedCount} items as a numbered list.
For each item use this format:
1. Original Title (Year) — type: ${scopedRequirement.typeLabel}
Why it fits: 1-2 short sentences in Ukrainian.

Important:
- "Why it fits" must explain why this title matches this specific user's taste.
- Do not write plot summary, synopsis, or generic description of the title.

Keep the writing compact.
Do not add intros or conclusions.

=== USER CONTEXT START ===
${context}
=== USER CONTEXT END ===`;
};

const buildRetryPrompt = (
  context: string,
  requestedCount: number,
  scopeLabel?: string,
  userWishes?: string,
) => {
  const scopedRequirement = getScopedFilmRequirement(scopeLabel);

  return `You previously generated candidates that were either malformed, too overlapping, or not usable after filtering.
Generate ${requestedCount} new candidates with stricter diversity and better formatting.

Hard requirements:
1. Return exactly ${requestedCount} items.
2. Do not repeat obvious canon already implied by representative titles.
3. Prefer less obvious but still high-fit candidates.
4. Keep formatting exact.
5. Write "Why it fits" content in Ukrainian.
6. Active recommendation format: ${scopeLabel || "вся бібліотека"}.
7. User wishes: ${userWishes || "немає додаткових побажань"}.
8. Treat user wishes as a modifier of the proven taste profile, not as an override.
9. ${scopedRequirement.instruction}

Output format:
1. Original Title (Year) — type: ${scopedRequirement.typeLabel}
Why it fits: 1-2 short sentences in Ukrainian.

Important:
- "Why it fits" must explain the user-fit, not the plot.
- Do not write synopsis.

=== USER CONTEXT START ===
${context}
=== USER CONTEXT END ===`;
};

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

const buildKnownTitleSet = (rows: FilmLlmExportRow[]) => {
  const titles = new Set<string>();
  rows.forEach((row) => {
    [
      row.titleOriginal,
      row.titleEn,
      row.titleUk,
      row.title,
      row.year ? `${row.titleOriginal} (${row.year})` : "",
      row.year ? `${row.titleEn} (${row.year})` : "",
      row.year ? `${row.titleUk} (${row.year})` : "",
      row.year ? `${row.title} (${row.year})` : "",
    ]
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
      const titleMatch = firstLine.match(
        /^(.*?)\s*\((\d{4})\)\s*[—–-]\s*type:\s*(movie|series|miniseries|tv series|tv|miniseries\/series)$/i,
      );
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
      const normalizedType = titleMatch[3].toLowerCase().includes("mini")
        ? "miniseries"
        : titleMatch[3].toLowerCase().includes("series") || titleMatch[3].toLowerCase() === "tv"
          ? "series"
          : "movie";

      return {
        title: stripMarkdown(titleMatch[1].trim()),
        year: titleMatch[2],
        type: normalizedType,
        why: whyText,
        raw: block,
      };
    })
    .filter((entry): entry is ParsedRecommendation => Boolean(entry));
};

const filterRecommendations = (
  recommendations: ParsedRecommendation[],
  knownTitles: Set<string>,
) => {
  const seen = new Set<string>();
  return recommendations.filter((entry) => {
    const normalizedTitle = normalizeTitle(entry.title);
    const normalizedWithYear = normalizeTitle(`${entry.title} (${entry.year})`);
    if (knownTitles.has(normalizedTitle) || knownTitles.has(normalizedWithYear)) {
      return false;
    }
    if (seen.has(normalizedTitle)) {
      return false;
    }
    seen.add(normalizedTitle);
    return true;
  });
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
      rows?: FilmLlmExportRow[];
      knownTitleRows?: FilmLlmExportRow[];
      scopeLabel?: string;
      userWishes?: string;
      debugPreview?: boolean;
      profileAnalysis?: FilmRecommendationProfileAnalysis;
    };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const knownTitleRows =
      Array.isArray(body.knownTitleRows) && body.knownTitleRows.length > 0
        ? body.knownTitleRows
        : rows;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Missing film rows." }, { status: 400 });
    }

    const profileContext = buildFilmRecommendationProfileContext(
      body.profileAnalysis,
      body.scopeLabel,
    );
    const context = [buildLlmRecoContextText(rows, { includeKnownTitles: false }), profileContext]
      .filter(Boolean)
      .join("\n\n");
    const knownTitles = buildKnownTitleSet(knownTitleRows);
    const requestedCount = 4;
    const prompt = buildPrompt(context, requestedCount, body.scopeLabel, body.userWishes);

    if (body.debugPreview && process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        prompt,
      });
    }

    const firstResponse = await callOpenAi(context, requestedCount, () => prompt);
    const firstFiltered = filterRecommendations(parseRecommendations(firstResponse), knownTitles);

    let finalRecommendations = firstFiltered;

    if (finalRecommendations.length < 3) {
      const secondResponse = await callOpenAi(context, 6, (nextContext, requestedCount) =>
        buildRetryPrompt(nextContext, requestedCount, body.scopeLabel, body.userWishes),
      );
      const secondFiltered = filterRecommendations(parseRecommendations(secondResponse), knownTitles);
      const merged = [...firstFiltered];
      secondFiltered.forEach((entry) => {
        if (
          !merged.some(
            (existing) => normalizeTitle(existing.title) === normalizeTitle(entry.title),
          )
        ) {
          merged.push(entry);
        }
      });
      finalRecommendations = merged;
    }

    if (finalRecommendations.length < 3) {
      const thirdResponse = await callOpenAi(context, 8, (nextContext, requestedCount) =>
        buildRetryPrompt(nextContext, requestedCount, body.scopeLabel, body.userWishes),
      );
      const thirdFiltered = filterRecommendations(parseRecommendations(thirdResponse), knownTitles);
      const merged = [...finalRecommendations];
      thirdFiltered.forEach((entry) => {
        if (
          !merged.some(
            (existing) => normalizeTitle(existing.title) === normalizeTitle(entry.title),
          )
        ) {
          merged.push(entry);
        }
      });
      finalRecommendations = merged;
    }

    const outputRecommendations = finalRecommendations.slice(0, 3);
    const message =
      outputRecommendations.length > 0
        ? outputRecommendations
            .map(
              (entry, index) =>
                `${index + 1}. ${entry.title} (${entry.year}) — type: ${entry.type}\nWhy it fits: ${entry.why}`,
            )
            .join("\n\n")
        : "Не вдалося підібрати рекомендації. Спробуйте ще раз — модель повернула або вже відомі тайтли, або нестабільний формат відповіді.";

    return NextResponse.json({
      message,
      recommendations: outputRecommendations,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не вдалося згенерувати рекомендації.",
      },
      { status: 500 },
    );
  }
}
