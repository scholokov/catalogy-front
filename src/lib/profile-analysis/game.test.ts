import { describe, expect, it } from "vitest";
import {
  buildGameProfilePromptRows,
  buildPlatformScopeProfilePrompt,
} from "@/lib/profile-analysis/game";

describe("game profile analysis prompt helpers", () => {
  it("filters prompt rows by platform and marks dropped items", () => {
    const rows = buildGameProfilePromptRows(
      [
        {
          title: "Mass Effect 2",
          year: "2010",
          genres: "RPG, Shooter",
          isViewed: true,
          viewPercent: 100,
          rating: 5,
          platforms: ["PC", "Xbox 360"],
        },
        {
          title: "Anthem",
          year: "2019",
          genres: "Action RPG",
          isViewed: true,
          viewPercent: 45,
          rating: 2.5,
          platforms: ["PC"],
        },
        {
          title: "Halo 3",
          year: "2007",
          genres: "Shooter",
          isViewed: true,
          viewPercent: 100,
          rating: 4,
          platforms: ["Xbox 360"],
        },
      ],
      "PC",
    );

    expect(rows).toEqual([
      {
        title: "Mass Effect 2",
        year: "2010",
        genres: "RPG, Shooter",
        dropped: "false",
        rating: "5",
      },
      {
        title: "Anthem",
        year: "2019",
        genres: "Action RPG",
        dropped: "true",
        rating: "2.5",
      },
    ]);
  });

  it("builds a game prompt with platform-specific and game-specific sections", () => {
    const prompt = buildPlatformScopeProfilePrompt(
      [
        {
          title: "Mass Effect 2",
          year: "2010",
          genres: "RPG, Shooter",
          dropped: "false",
          rating: "5",
        },
      ],
      "PC",
    );

    expect(prompt).toContain("platform-specific profile for PC play behavior");
    expect(prompt).toContain('"experience_signals"');
    expect(prompt).toContain('"playstyle_signals"');
    expect(prompt).toContain("RPG selectivity");
    expect(prompt).toContain('"title","year","genres","dropped","rating"');
    expect(prompt).toContain('"Mass Effect 2","2010","RPG, Shooter","false","5"');
  });
});
