import { NextResponse } from "next/server";
import { getOpenAiRecommendationModel } from "@/lib/openai/models";
import { buildFilmRecommendationProfileContext } from "@/lib/recommendations/profileAnalysisContext";
import type {
  FilmProfileSystemLayer,
  FilmProfileUserLayer,
} from "@/lib/profile-analysis/types";
import {
  SHISHKA_FIT_LABELS,
  isShishkaFitLabel,
} from "@/lib/shishka/fitAssessment";

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

type FilmRecommendationProfileAnalysis = {
  userProfile: FilmProfileUserLayer;
  systemProfile: FilmProfileSystemLayer;
  sourceTitlesCount?: number;
  analyzedAt?: string;
};

const OPENAI_MODEL = getOpenAiRecommendationModel();

const buildPrompt = (
  profileAnalysis: FilmRecommendationProfileAnalysis,
  scopeLabel: string,
  item: {
    title: string;
    year?: string | number | null;
    mediaType?: "movie" | "tv" | null;
    genres?: string | null;
    director?: string | null;
    actors?: string | null;
    plot?: string | null;
  },
) => `${buildFilmRecommendationProfileContext(profileAnalysis, scopeLabel)}

Evaluate how likely this title is to match the user's taste.

Return JSON only in this shape:
{"label":"Навряд|Слабко|Можливо|Схоже|Явно","reason":"1-2 concise sentences in Ukrainian"}

Label meaning:
- Навряд — strong mismatch
- Слабко — weak fit
- Можливо — mixed / uncertain fit
- Схоже — likely fit
- Явно — very strong fit

Rules:
- Base the answer on the analyzed taste profile, not popularity.
- Consider both positive fit signals and mismatch risk.
- Keep the reason specific to this user's taste.
- Do not write a plot summary.

Title:
- Назва: ${item.title}
- Рік: ${item.year ?? "невідомо"}
- Формат: ${item.mediaType === "tv" ? "Серіал" : "Фільм"}
- Жанри: ${item.genres?.trim() || "невідомо"}
- Режисер: ${item.director?.trim() || "невідомо"}
- Актори: ${item.actors?.trim() || "невідомо"}
- Опис: ${item.plot?.trim() || "немає опису"}`.trim();

const extractJsonObject = (value: string) => {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Модель повернула некоректну відповідь.");
  }
  return value.slice(start, end + 1);
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as {
      scopeLabel?: string;
      profileAnalysis?: FilmRecommendationProfileAnalysis;
      item?: {
        title?: string;
        year?: string | number | null;
        mediaType?: "movie" | "tv" | null;
        genres?: string | null;
        director?: string | null;
        actors?: string | null;
        plot?: string | null;
      };
    };

    const scopeLabel = body.scopeLabel?.trim();
    const profileAnalysis = body.profileAnalysis;
    const itemTitle = body.item?.title?.trim();

    if (!scopeLabel || !profileAnalysis || !itemTitle) {
      return NextResponse.json(
        { error: "Недостатньо даних для оцінки." },
        { status: 400 },
      );
    }

    const prompt = buildPrompt(profileAnalysis, scopeLabel, {
      title: itemTitle,
      year: body.item?.year ?? null,
      mediaType: body.item?.mediaType ?? "movie",
      genres: body.item?.genres ?? null,
      director: body.item?.director ?? null,
      actors: body.item?.actors ?? null,
      plot: body.item?.plot ?? null,
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a precise taste-fit evaluator. Always return valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const data = (await response.json()) as OpenAiResponse;

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || "OpenAI request failed." },
        { status: response.status },
      );
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json(
        { error: "Порожня відповідь моделі." },
        { status: 500 },
      );
    }

    const parsed = JSON.parse(extractJsonObject(content)) as {
      label?: string;
      reason?: string;
    };

    if (!parsed.label || !isShishkaFitLabel(parsed.label) || !parsed.reason?.trim()) {
      return NextResponse.json(
        { error: "Некоректний формат оцінки." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      assessment: {
        label: parsed.label,
        reason: parsed.reason.trim(),
      },
      labels: SHISHKA_FIT_LABELS,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося отримати оцінку.",
      },
      { status: 500 },
    );
  }
}
