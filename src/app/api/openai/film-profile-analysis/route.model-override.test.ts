import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("film profile analysis route model override", () => {
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

    const { POST } = await import("@/app/api/openai/film-profile-analysis/route");
    const response = await POST(buildRequest({ rows: validRows, mediaType: "movie" }));

    expect(response.status).toBe(200);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as { model: string };

    expect(payload.model).toBe("gpt-custom-profile");
  });
});
