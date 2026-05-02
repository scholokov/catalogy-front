import { describe, expect, it } from "vitest";
import {
  buildRecommendationFailureMessage,
  filterRecommendationsWithStats,
} from "@/lib/recommendations/diagnostics";

describe("recommendation diagnostics", () => {
  it("tracks known titles and duplicates separately", () => {
    const knownTitles = new Set(["heat", "alien"]);
    const result = filterRecommendationsWithStats(
      [
        { title: "Heat", year: "1995" },
        { title: "Collateral", year: "2004" },
        { title: "Collateral", year: "2004" },
        { title: "Alien", year: "1979" },
      ],
      knownTitles,
      (value) => value.toLowerCase(),
    );

    expect(result.recommendations).toEqual([{ title: "Collateral", year: "2004" }]);
    expect(result.stats).toEqual({
      parsedCount: 4,
      keptCount: 1,
      filteredKnownCount: 2,
      filteredDuplicateCount: 1,
    });
  });

  it("builds a detailed failure message", () => {
    const message = buildRecommendationFailureMessage([
      {
        label: "Спроба 1 (базовий prompt)",
        requestedCount: 4,
        parsedCount: 0,
        keptCount: 0,
        filteredKnownCount: 0,
        filteredDuplicateCount: 0,
      },
      {
        label: "Спроба 2 (retry prompt)",
        requestedCount: 6,
        parsedCount: 3,
        keptCount: 0,
        filteredKnownCount: 2,
        filteredDuplicateCount: 1,
      },
    ]);

    expect(message).toContain("Не вдалося підібрати рекомендації: усі 3 розпізнаних кандидати відсіялися.");
    expect(message).toContain("вже відомі/наявні в колекції: 2");
    expect(message).toContain("дублікати у відповіді моделі: 1");
    expect(message).toContain("Спроба 1 (базовий prompt): модель не повернула жодного коректно розпарсеного кандидата");
  });
});
