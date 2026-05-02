import { describe, expect, it } from "vitest";
import {
  buildFilmRecommendationProfileContext,
  buildGameRecommendationProfileContext,
} from "@/lib/recommendations/profileAnalysisContext";

describe("profileAnalysisContext", () => {
  it("builds film recommendation context from partial legacy system profile", () => {
    const context = buildFilmRecommendationProfileContext({
      systemProfile: {
        profile_summary: "Grounded thrillers.",
      } as never,
    });

    expect(context).toContain("System profile summary: Grounded thrillers.");
    expect(context).toContain("Core preferences: none");
    expect(context).toContain("Taste axes: none");
  });

  it("builds game recommendation context from partial legacy system profile", () => {
    const context = buildGameRecommendationProfileContext({
      systemProfile: {
        profile_summary: "Cinematic single-player.",
        playstyle_signals: ["Fast feedback loops"],
      } as never,
    });

    expect(context).toContain("System profile summary: Cinematic single-player.");
    expect(context).toContain("Playstyle signals: Fast feedback loops");
    expect(context).toContain("Genre signals: none");
  });
});
