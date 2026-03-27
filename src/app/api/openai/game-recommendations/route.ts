import { NextResponse } from "next/server";
import {
  buildGameLlmRecoContextText,
  buildKnownTitlesForGamesLlm,
  type GameLlmExportRow,
} from "@/app/statistics/gameLlmContext";

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
  fitTag: string;
  raw: string;
};

const OPENAI_MODEL = process.env.OPENAI_RECOMMENDATION_MODEL || "gpt-4.1-mini";

const buildPrompt = (
  context: string,
  requestedCount: number,
  scopeLabel?: string,
  userWishes?: string,
) => `You are given a compact recommendation context for one user.
Your task: Suggest ${requestedCount} candidate video game titles that fit the user's taste profile extremely well.

Critical rules:
1. Recommend only strong-fit candidates, not broad genre matches.
2. Optimize for deep taste resonance across gameplay feel, decision texture, feedback speed, progression shape, and emotional tone.
3. Avoid generic, formulaic, safe, or obvious filler picks.
4. Keep the ${requestedCount} suggestions distinct by subtype or play feel, while all remaining inside the user's proven taste core.
5. You are generating a candidate pool. Some titles may later be filtered out by code if they already exist in the user's collection, so prioritize quality and fit.
6. Do not explain the full user profile back to me.
7. Do not recommend anything from the representative positive titles, representative negative titles, or current interest vector if those titles are explicitly listed there.
8. Use the representative positive titles as evidence of specific valued aspects, not as raw name anchors.
9. Prioritize deep taste resonance over surface similarity to any single representative title.
10. Do not anchor too heavily on one positive example if the broader profile suggests a better match elsewhere.
11. Prefer internationally known titles with stable naming to reduce ambiguity.
12. Active recommendation platform slice: ${scopeLabel || "вся бібліотека"}.
13. User wishes: ${userWishes || "немає додаткових побажань"}.
14. Treat user wishes as a modifier of the proven taste profile, not as an override.
15. Keep the platform slice primary and do not let unrelated platform history dominate the recommendation.

Output format:
Return exactly ${requestedCount} items as a numbered list.
For each item use this format:
1. Original Title (Year) — type: game
Why it fits: 1-2 short sentences in Ukrainian.
Fit tag: one short label only.

Important:
- "Why it fits" must explain why this game matches this specific user's taste.
- Do not write plot summary, lore summary, or generic description of the game.
- Pay attention to the separate layers in the context: gameplay axes, experience / emotional axes, explicit avoid / anti-match axes.
- The representative positive titles include short aspect explanations; extract and generalize those aspects instead of matching by franchise adjacency.

Allowed fit tag examples:
- systems mastery
- dark pressure
- tactical depth
- build experimentation
- harsh atmosphere
- skill expression
- sovereign tone

Keep the writing compact.
Do not add intros or conclusions.

=== USER CONTEXT START ===
${context}
=== USER CONTEXT END ===`;

const buildRetryPrompt = (
  context: string,
  requestedCount: number,
  scopeLabel?: string,
  userWishes?: string,
) => `You previously generated candidates that were either malformed, too overlapping, or not usable after filtering.
Generate ${requestedCount} new candidates with stricter diversity and better formatting.

Hard requirements:
1. Return exactly ${requestedCount} items.
2. Do not repeat obvious canon already implied by representative titles.
3. Prefer less obvious but still high-fit candidates.
4. Keep formatting exact.
5. Write "Why it fits" content in Ukrainian.
6. Optimize for deep taste resonance, not superficial genre overlap.
7. Keep candidates distinct by play feel while staying inside the same proven taste core.
8. Active recommendation platform slice: ${scopeLabel || "вся бібліотека"}.
9. User wishes: ${userWishes || "немає додаткових побажань"}.
10. Treat user wishes as a modifier of the proven taste profile, not as an override.

Output format:
1. Original Title (Year) — type: game
Why it fits: 1-2 short sentences in Ukrainian.
Fit tag: one short label only.

Important:
- "Why it fits" must explain the user-fit, not the plot.
- Do not write synopsis or lore summary.
- Respect anti-match rules even if a title looks superficially similar to one anchor.
- Do not over-anchor on one example such as a single tactics game if the broader profile points elsewhere.

=== USER CONTEXT START ===
${context}
=== USER CONTEXT END ===`;

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
      const fitLine = lines.find((line) => /^Fit tag:/i.test(line));
      const whyText =
        whyLineIndex >= 0
          ? (() => {
              const collected: string[] = [];
              for (let index = whyLineIndex; index < lines.length; index += 1) {
                const line = lines[index];
                if (index > whyLineIndex && /^Fit tag:/i.test(line)) {
                  break;
                }
                collected.push(line);
              }
              return collected.join(" ").replace(/^Why it fits:\s*/i, "").trim();
            })()
          : "";

      return {
        title: stripMarkdown(titleMatch[1].trim()),
        year: titleMatch[2],
        type: "game",
        why: whyText,
        fitTag: fitLine?.replace(/^Fit tag:\s*/i, "").trim() ?? "",
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
      rows?: GameLlmExportRow[];
      knownTitleRows?: GameLlmExportRow[];
      scopeLabel?: string;
      userWishes?: string;
    };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const knownTitleRows =
      Array.isArray(body.knownTitleRows) && body.knownTitleRows.length > 0
        ? body.knownTitleRows
        : rows;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Missing game rows." }, { status: 400 });
    }

    const context = buildGameLlmRecoContextText(rows, { includeKnownTitles: false });
    const knownTitles = buildKnownTitleSet(knownTitleRows);

    const firstResponse = await callOpenAi(context, 4, (nextContext, requestedCount) =>
      buildPrompt(nextContext, requestedCount, body.scopeLabel, body.userWishes),
    );
    const firstFiltered = filterRecommendations(parseRecommendations(firstResponse), knownTitles);

    let finalRecommendations = firstFiltered;

    if (finalRecommendations.length < 3) {
      const secondResponse = await callOpenAi(context, 6, (nextContext, requestedCount) =>
        buildRetryPrompt(nextContext, requestedCount, body.scopeLabel, body.userWishes),
      );
      const secondFiltered = filterRecommendations(parseRecommendations(secondResponse), knownTitles);
      const merged = [...firstFiltered];
      secondFiltered.forEach((entry) => {
        if (!merged.some((existing) => normalizeTitle(existing.title) === normalizeTitle(entry.title))) {
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
        if (!merged.some((existing) => normalizeTitle(existing.title) === normalizeTitle(entry.title))) {
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
                `${index + 1}. ${entry.title} (${entry.year}) — type: ${entry.type}\nWhy it fits: ${entry.why}\nFit tag: ${entry.fitTag}`,
            )
            .join("\n\n")
        : "Не вдалося підібрати рекомендації. Спробуйте ще раз — модель повернула або вже відомі тайтли, або нестабільний формат відповіді.";

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
