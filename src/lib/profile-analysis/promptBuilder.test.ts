import { describe, expect, it } from "vitest";
import { buildProfileAnalysisPrompt } from "@/lib/profile-analysis/promptBuilder";

describe("buildProfileAnalysisPrompt", () => {
  it("renders core sections, optional scope notice, nested bullets, and csv block", () => {
    const prompt = buildProfileAnalysisPrompt({
      introduction: "Intro text.",
      scopeNotice: "Scope text.",
      interpretationRules: ['"title" = item title'],
      interpretationPriorities: ["rating is strongest"],
      higherLevelPatternRules: [
        {
          text: "Prefer splits such as:",
          children: ["grounded vs spectacle"],
        },
      ],
      clusterSeparationRules: ["Keep clusters separate"],
      tasteAxisValueRules: ['The "value" field inside "taste_axes" only allows: low | medium | high'],
      practicalGuidance: ["Prefer strong recurring patterns"],
      jsonStructure: '{"ok":true}',
      additionalOutputConstraints: ["Extra output rule"],
      csvData: '"title"\n"Heat"',
    });

    expect(prompt).toContain("Intro text.");
    expect(prompt).toContain("Scope text.");
    expect(prompt).toContain("Important rules:");
    expect(prompt).toContain("- Prefer splits such as:");
    expect(prompt).toContain("  - grounded vs spectacle");
    expect(prompt).toContain('Return ONLY valid JSON with exactly this structure:\n\n{"ok":true}');
    expect(prompt).toContain('CSV data:\n"title"\n"Heat"');
    expect(prompt).toContain("Extra output rule");
  });

  it("omits empty scope notice sections", () => {
    const prompt = buildProfileAnalysisPrompt({
      introduction: "Intro only.",
      interpretationRules: ['"title" = item title'],
      interpretationPriorities: ["rating is strongest"],
      higherLevelPatternRules: ["Use narrow patterns"],
      clusterSeparationRules: ["Keep clusters separate"],
      tasteAxisValueRules: ['The "value" field inside "taste_axes" only allows: low | medium | high'],
      practicalGuidance: ["Prefer strong recurring patterns"],
      jsonStructure: '{"ok":true}',
      csvData: '"title"\n"Heat"',
    });

    expect(prompt).toContain("Intro only.");
    expect(prompt).not.toContain("undefined");
  });
});
