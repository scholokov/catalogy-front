import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/openai/film-profile-analysis/route";
import { DEFAULT_OPENAI_PROFILE_ANALYSIS_MODEL } from "@/lib/openai/models";

const buildRequest = (body: unknown) =>
  new Request("http://localhost/api/openai/film-profile-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

const validRows = [
  {
    title: "Heat",
    year: "1995",
    creator: "Michael Mann",
    genres: "Crime, Thriller",
    actors_top: "Al Pacino, Robert De Niro",
    dropped: "false" as const,
    rating: "5",
  },
];

describe("film profile analysis route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it("returns 400 when rows are missing", async () => {
    const response = await POST(buildRequest({ rows: [] }));
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing film profile rows.");
  });

  it("returns debug prompt without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(
      buildRequest({
        rows: validRows,
        mediaType: "movie",
        debugPreview: true,
      }),
    );
    const data = (await response.json()) as { prompt: string };

    expect(response.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(data.prompt).toContain("ACTUAL taste profile for movies");
  });

  it("returns 500 when model output fails parser validation", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  user_profile_uk: {
                    summary: "ok",
                    likes: [],
                    dislikes: [],
                    watching_patterns: [],
                    strong_author_signals: [],
                    confidence_label_uk: "Wrong",
                    confidence_reason_uk: "ok",
                  },
                  system_profile_en: {
                    profile_summary: "ok",
                    core_preferences: [],
                    negative_patterns: [],
                    taste_axes: [],
                    strong_creator_affinities: [],
                    creator_signals: [],
                    actor_signals: [],
                    representative_likes: [],
                    representative_dislikes: [],
                    contradictions: [],
                    confidence: {
                      label: "high",
                      reason: "ok",
                    },
                    evidence: {
                      positive_titles: [],
                      negative_titles: [],
                      mixed_titles: [],
                    },
                  },
                }),
              },
            },
          ],
        }),
      }),
    );

    const response = await POST(buildRequest({ rows: validRows, mediaType: "movie" }));
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(data.error).toBe("Invalid user_profile_uk.confidence_label_uk.");
  });

  it("sends the expected OpenAI request payload", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                user_profile_uk: {
                  summary: "ok",
                  likes: [],
                  dislikes: [],
                  watching_patterns: [],
                  strong_author_signals: [],
                  confidence_label_uk: "Висока",
                  confidence_reason_uk: "ok",
                },
                system_profile_en: {
                  profile_summary: "ok",
                  core_preferences: [],
                  negative_patterns: [],
                  taste_axes: [],
                  strong_creator_affinities: [],
                  creator_signals: [],
                  actor_signals: [],
                  representative_likes: [],
                  representative_dislikes: [],
                  contradictions: [],
                  confidence: {
                    label: "high",
                    reason: "ok",
                  },
                  evidence: {
                    positive_titles: [],
                    negative_titles: [],
                    mixed_titles: [],
                  },
                },
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(buildRequest({ rows: validRows, mediaType: "movie" }));

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as {
      model: string;
      temperature: number;
      response_format: { type: string };
      messages: Array<{ role: string; content: string }>;
    };

    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
    });
    expect(payload.model).toBe(DEFAULT_OPENAI_PROFILE_ANALYSIS_MODEL);
    expect(payload.temperature).toBe(0.3);
    expect(payload.response_format).toEqual({ type: "json_object" });
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]).toMatchObject({
      role: "user",
    });
    expect(payload.messages[0]?.content).toContain("ACTUAL taste profile for movies");
    expect(payload.messages[0]?.content).toContain('"title","year","creator","genres","actors_top","dropped","rating"');
  });
});
