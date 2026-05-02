import { describe, expect, it } from "vitest";
import {
  parseFilmProfileAnalysis,
  parseGameProfileAnalysis,
} from "@/lib/profile-analysis/types";

const buildValidFilmPayload = () => ({
  user_profile_uk: {
    summary: "Короткий підсумок.",
    likes: ["Напружені трилери"],
    dislikes: [],
    watching_patterns: [],
    strong_author_signals: [],
    confidence_label_uk: "Висока",
    confidence_reason_uk: "Є достатньо даних.",
  },
  system_profile_en: {
    profile_summary: "Grounded thrillers with selective franchise interest.",
    core_preferences: ["Grounded thrillers"],
    negative_patterns: ["Weak franchise spectacle"],
    taste_axes: [
      {
        axis: "Action selectivity",
        value: "medium",
        evidence: ["Heat", "John Wick"],
      },
    ],
    strong_creator_affinities: [],
    creator_signals: [],
    actor_signals: [],
    representative_likes: ["Heat"],
    representative_dislikes: ["Venom"],
    contradictions: [],
    confidence: {
      label: "high",
      reason: "Repeated patterns are clear.",
    },
    evidence: {
      positive_titles: ["Heat"],
      negative_titles: ["Venom"],
      mixed_titles: ["John Wick 4"],
    },
  },
});

const buildValidGamePayload = () => ({
  user_profile_uk: {
    summary: "Короткий підсумок.",
    likes: ["Сюжетні single-player ігри"],
    dislikes: [],
    playing_patterns: [],
    franchise_signals_uk: [],
    confidence_label_uk: "Середня",
    confidence_reason_uk: "Є повтори, але не всюди.",
  },
  system_profile_en: {
    profile_summary: "Cinematic single-player preference with selective RPG interest.",
    core_preferences: ["Cinematic single-player"],
    negative_patterns: ["Live-service grind loops"],
    experience_signals: [],
    playstyle_signals: [],
    taste_axes: [
      {
        axis: "RPG selectivity",
        value: "medium",
        evidence: ["Mass Effect 2", "The Witcher 3"],
      },
    ],
    genre_signals: [],
    franchise_affinities: [],
    representative_likes: ["Mass Effect 2"],
    representative_dislikes: ["Anthem"],
    contradictions: [],
    confidence: {
      label: "medium",
      reason: "Some clusters are selective.",
    },
    evidence: {
      positive_titles: ["Mass Effect 2"],
      negative_titles: ["Anthem"],
      mixed_titles: [],
    },
  },
});

describe("profile analysis parsers", () => {
  it("parses a valid film profile payload and keeps empty arrays", () => {
    const parsed = parseFilmProfileAnalysis(JSON.stringify(buildValidFilmPayload()));

    expect(parsed.user_profile_uk.confidence_label_uk).toBe("Висока");
    expect(parsed.user_profile_uk.dislikes).toEqual([]);
    expect(parsed.system_profile_en.taste_axes[0]).toEqual({
      axis: "Action selectivity",
      value: "medium",
      evidence: ["Heat", "John Wick"],
    });
    expect(parsed.system_profile_en.evidence.mixed_titles).toEqual(["John Wick 4"]);
  });

  it("parses a valid game profile payload", () => {
    const parsed = parseGameProfileAnalysis(JSON.stringify(buildValidGamePayload()));

    expect(parsed.user_profile_uk.confidence_label_uk).toBe("Середня");
    expect(parsed.system_profile_en.confidence.label).toBe("medium");
    expect(parsed.system_profile_en.evidence.positive_titles).toEqual(["Mass Effect 2"]);
  });

  it("rejects unsupported taste axis values", () => {
    const payload = buildValidFilmPayload();
    payload.system_profile_en.taste_axes[0]!.value = "mid";

    expect(() => parseFilmProfileAnalysis(JSON.stringify(payload))).toThrow(
      "Invalid system_profile_en.taste_axes.value.",
    );
  });

  it("rejects unsupported Ukrainian confidence labels", () => {
    const payload = buildValidFilmPayload();
    payload.user_profile_uk.confidence_label_uk = "Впевнена";

    expect(() => parseFilmProfileAnalysis(JSON.stringify(payload))).toThrow(
      "Invalid user_profile_uk.confidence_label_uk.",
    );
  });

  it("rejects non-string evidence arrays", () => {
    const payload = buildValidGamePayload() as Record<string, unknown>;
    const systemProfile = payload.system_profile_en as Record<string, unknown>;
    systemProfile.evidence = {
      positive_titles: "Mass Effect 2",
      negative_titles: ["Anthem"],
      mixed_titles: [],
    };

    expect(() => parseGameProfileAnalysis(JSON.stringify(payload))).toThrow(
      "Invalid evidence.positive_titles.",
    );
  });
});
