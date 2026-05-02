import { afterEach, describe, expect, it, vi } from "vitest";

const buildRequest = (body: unknown) =>
  new Request("http://localhost/api/openai/game-profile-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

const validRows = [
  {
    title: "Mass Effect 2",
    year: "2010",
    genres: "RPG, Shooter",
    dropped: "false" as const,
    rating: "5",
  },
];

describe("game profile analysis route model override", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_PROFILE_MODEL;
  });

  it("uses OPENAI_PROFILE_MODEL in the OpenAI request payload", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_PROFILE_MODEL = "gpt-custom-profile";

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
                  playing_patterns: [],
                  franchise_signals_uk: [],
                  confidence_label_uk: "Середня",
                  confidence_reason_uk: "ok",
                },
                system_profile_en: {
                  profile_summary: "ok",
                  core_preferences: [],
                  negative_patterns: [],
                  experience_signals: [],
                  playstyle_signals: [],
                  taste_axes: [],
                  genre_signals: [],
                  franchise_affinities: [],
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

    const { POST } = await import("@/app/api/openai/game-profile-analysis/route");
    const response = await POST(buildRequest({ rows: validRows, platform: "PC" }));

    expect(response.status).toBe(200);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as { model: string };

    expect(payload.model).toBe("gpt-custom-profile");
  });
});
