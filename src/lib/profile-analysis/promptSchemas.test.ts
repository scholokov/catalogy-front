import { describe, expect, it } from "vitest";
import {
  FILM_PROFILE_ANALYSIS_JSON_SCHEMA,
  GAME_PROFILE_ANALYSIS_JSON_SCHEMA,
} from "@/lib/profile-analysis/promptSchemas";

describe("profile analysis prompt schemas", () => {
  it("keeps mandatory film schema fields", () => {
    expect(FILM_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"user_profile_uk"');
    expect(FILM_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"system_profile_en"');
    expect(FILM_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"strong_author_signals"');
    expect(FILM_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"taste_axes"');
    expect(FILM_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"confidence_label_uk": "Низька | Середня | Висока"');
    expect(FILM_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"positive_titles"');
    expect(FILM_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"mixed_titles"');
  });

  it("keeps mandatory game schema fields", () => {
    expect(GAME_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"user_profile_uk"');
    expect(GAME_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"system_profile_en"');
    expect(GAME_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"playing_patterns"');
    expect(GAME_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"experience_signals"');
    expect(GAME_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"playstyle_signals"');
    expect(GAME_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"franchise_affinities"');
    expect(GAME_PROFILE_ANALYSIS_JSON_SCHEMA).toContain('"confidence_label_uk": "Низька | Середня | Висока"');
  });
});
