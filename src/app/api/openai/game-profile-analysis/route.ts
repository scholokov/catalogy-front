import { NextResponse } from "next/server";
import { getOpenAiProfileAnalysisModel } from "@/lib/openai/models";
import { buildPlatformScopeProfilePrompt } from "@/lib/profile-analysis/game";
import {
  parseGameProfileAnalysis,
  type GameProfilePromptRow,
} from "@/lib/profile-analysis/types";

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

const OPENAI_MODEL = getOpenAiProfileAnalysisModel();

const callOpenAi = async (prompt: string) => {
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
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: prompt,
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
      rows?: GameProfilePromptRow[];
      platform?: string;
      debugPreview?: boolean;
    };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const platform = typeof body.platform === "string" ? body.platform.trim() : "";

    if (rows.length === 0) {
      return NextResponse.json({ error: "Missing game profile rows." }, { status: 400 });
    }

    if (!platform) {
      return NextResponse.json({ error: "Missing platform." }, { status: 400 });
    }

    const prompt = buildPlatformScopeProfilePrompt(rows, platform);

    if (body.debugPreview && process.env.NODE_ENV !== "production") {
      return NextResponse.json({ prompt });
    }

    const content = await callOpenAi(prompt);
    const analysis = parseGameProfileAnalysis(content);

    return NextResponse.json({
      user_profile_uk: analysis.user_profile_uk,
      system_profile_en: analysis.system_profile_en,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не вдалося згенерувати профіль ігор.",
      },
      { status: 500 },
    );
  }
}
