export type PromptBullet =
  | string
  | {
      text: string;
      children: string[];
    };

type BuildProfileAnalysisPromptParams = {
  introduction: string;
  scopeNotice?: string;
  interpretationRules: PromptBullet[];
  interpretationPriorities: PromptBullet[];
  importantRulesExtra?: string[];
  behavioralRulesExtra?: PromptBullet[];
  higherLevelPatternRules: PromptBullet[];
  clusterSeparationRules: PromptBullet[];
  tasteAxisValueRules: PromptBullet[];
  practicalGuidance: PromptBullet[];
  jsonStructure: string;
  additionalOutputConstraints?: PromptBullet[];
  csvData: string;
};

type CommonHigherLevelPatternRulesParams = {
  splitExamples: string[];
  latentClusterExamples: string[];
  uncertainGroupingRule: string;
};

type CommonClusterSeparationRulesParams = {
  exampleClusters: string;
  adaptationMergeTargets: string;
};

type CommonTasteAxisValueRulesParams = {
  preferredAxisNames: string[];
  avoidAxisNames: string[];
  explanationTargets: string;
};

type CommonPracticalGuidanceParams = {
  selectiveGenreLine: string;
  mixedSignalLine: string;
};

export const BASE_IMPORTANT_RULES = [
  "Use ONLY factual signals from the CSV.",
  "Do NOT infer preferences from planned, generated, suggested, or hypothetical titles.",
  "Do NOT invent psychological traits, emotional narratives, or poetic interpretations.",
  "Every important conclusion must be grounded in patterns visible in the data.",
  "If the data is insufficient, mixed, or contradictory, say so explicitly.",
  "Do NOT overclaim certainty.",
  "Focus only on patterns that are useful later for recommendation quality.",
  "Do NOT infer a stable preference or aversion from a single title unless the signal is extremely strong and clearly supported by rating or dropped status.",
];

export const BASE_BEHAVIORAL_RULES: PromptBullet[] = [
  "Do not treat a title as liked only because it was not dropped",
  "Do not treat a title as disliked only because rating is moderate",
  "Ratings around 3.0-3.5 should usually be treated as mixed, moderate, or context-dependent signals unless reinforced by broader patterns",
  "Distinguish strong likes, moderate likes, neutral or mixed cases, and strong dislikes",
  "Pay attention to repeated patterns across highly rated titles and separately across dropped or low-rated titles",
  "If the dataset contains conflicting signals, reflect that in the output",
  "Do not merely restate metadata fields; infer meaningful but grounded taste patterns",
  "Avoid niche, handcrafted, or overly personalized labels unless they are strongly supported by multiple titles",
  "Do not produce fake precision",
];

export const BASE_REPRESENTATIVE_TITLE_RULES: PromptBullet[] = [
  "Representative likes should be selected not only by high rating, but by how well they represent repeated taste patterns",
  "Prefer titles that exemplify the strongest recurring clusters over isolated high-rated outliers",
  "A title with rating 5 is not automatically representative if it does not represent a repeated preference pattern",
  "A representative dislike should illustrate a repeated negative or high-risk pattern, not just be an isolated low-rated title",
  "Keep representative titles useful for future recommendations",
];

export const BASE_CONFIDENCE_RULES: PromptBullet[] = [
  "Do not downgrade overall confidence only because some genres or clusters are selective or mixed",
  "If the dataset is large and repeated patterns are clear, confidence should remain high for broad cluster-level conclusions",
  "Use medium confidence only when the dataset is small, signals are sparse, or the main conclusions themselves are unstable",
];

export const BASE_RECOMMENDATION_USEFULNESS_RULES: PromptBullet[] = [
  "When describing a higher-level pattern, make clear what it means for future recommendations",
  "Explain what should be favored and what should be avoided",
  "Do not use vague labels such as generic, formulaic, or mass-market unless you also clarify what repeated feature actually makes the titles fail",
  "A vague label is acceptable only if a more concrete repeated split cannot be grounded reliably",
  "Prefer specific, reusable explanations that would help a later recommendation model choose better candidates",
];

export const BASE_EVIDENCE_FIELD_RULES: PromptBullet[] = [
  "In evidence.positive_titles, evidence.negative_titles, and evidence.mixed_titles, include only actual titles from the CSV",
  "Do not include cluster names, genre names, category names, or descriptive labels in evidence title arrays",
  "Do not include placeholders like Source:, citation markers, or unfinished source labels inside any JSON value",
  "Every evidence title must be a real title from the provided CSV",
];

export const BASE_OUTPUT_CONSTRAINTS: PromptBullet[] = [
  "The Ukrainian layer is for direct UI display",
  "The English layer is for system reuse in later recommendation prompts",
  "Keep the English layer compact and reusable",
  "Do not add any fields outside the required JSON",
  "Do not wrap the JSON in markdown",
  "Do not output any commentary before or after the JSON",
  "Use the existing JSON fields to express deeper patterns; do not invent extra fields",
  "Keep the human-facing Ukrainian layer readable and grounded",
  "Keep the system-facing English layer compact, structured, and recommendation-oriented",
  'In the Ukrainian user-facing layer, avoid overly technical terms when possible, but preserve useful distinctions such as "вибірковий", "змішаний", "сильний виняток", "слабкий кластер", or "працює лише в певному режимі"',
  "In the English system-facing layer, prioritize terms that are reusable for later recommendation prompts",
];

export const COMMON_IMPORTANT_RULES_EXTRA = [
  "Your job is not only to summarize explicit fields, but also to detect repeated latent taste patterns that emerge across multiple titles with similar rating or dropped behavior.",
  "A latent taste pattern may be narrower and more useful than a broad genre label.",
  "Only include higher-level patterns if they are clearly supported by repeated evidence and improve recommendation usefulness.",
  "Do NOT invent niche, decorative, or overly poetic labels. Prefer simple, reusable, recommendation-friendly names.",
];

export const COMMON_STABLE_PATTERN_SPLIT: PromptBullet = {
  text: "Distinguish between:",
  children: [
    "stable positive patterns",
    "stable negative patterns",
    "mixed/selective patterns",
  ],
};

export const COMMON_MEDIUM_IS_NOT_SAFE_CLUSTER_RULE =
  'Do not treat "medium" as a safe recommendation signal unless the evidence contains repeated positive ratings, not only tolerable or moderate ratings';

export const buildCommonHigherLevelPatternRules = ({
  splitExamples,
  latentClusterExamples,
  uncertainGroupingRule,
}: CommonHigherLevelPatternRulesParams): PromptBullet[] => [
  "Do not stop at broad genre summaries if a narrower repeated pattern better explains the user's positive and negative signals",
  "When a broad genre contains both strong positives and strong negatives, try to identify what repeatedly separates the successful titles from the weak or dropped ones",
  {
    text: "Prefer grounded repeated splits such as:",
    children: splitExamples,
  },
  "Use such splits only when clearly supported by repeated evidence",
  COMMON_STABLE_PATTERN_SPLIT,
  "If the evidence suggests the user responds inconsistently within a recurring cluster, label it as mixed or selective rather than forcing a stable like or dislike conclusion",
  "You may detect repeated latent clusters when they are clearly visible across multiple titles, even if they are not explicitly encoded as fields",
  {
    text: "Such latent clusters may include:",
    children: latentClusterExamples,
  },
  "Only surface such clusters if they are supported by multiple titles and clearly help explain the user's taste better than broad genres alone",
  "If such a pattern is weak, uncertain, or inconsistent, either omit it or describe it cautiously as mixed or selective",
  uncertainGroupingRule,
];

export const buildCommonClusterSeparationRules = ({
  exampleClusters,
  adaptationMergeTargets,
}: CommonClusterSeparationRulesParams): PromptBullet[] => [
  "Do not merge different latent clusters into one broad negative pattern if they show different behavior",
  `For example, ${exampleClusters} should be checked separately when enough title evidence exists`,
  "If one cluster is clearly weak and another is mixed or selective, describe them separately rather than collapsing them into one broad dislike",
  `If adaptation-like titles are visible, do not automatically merge them with ${adaptationMergeTargets}`,
  "Check whether adaptation-like titles form their own positive, mixed, selective, or negative cluster",
  "When a higher-level pattern appears negative, check whether there are clear positive or mixed exceptions inside the same pattern",
  "If exceptions exist, describe the pattern as selective or mixed rather than simply negative",
  "When a cluster contains mostly moderate or low ratings with a few strong exceptions, describe it as weak or mixed with exceptions rather than medium affinity",
  COMMON_MEDIUM_IS_NOT_SAFE_CLUSTER_RULE,
  "If a cluster is mostly tolerated but rarely strongly liked, describe it as low-priority or weak or mixed rather than a true preference",
];

export const buildCommonTasteAxisValueRules = ({
  preferredAxisNames,
  avoidAxisNames,
  explanationTargets,
}: CommonTasteAxisValueRulesParams): PromptBullet[] => [
  'The "value" field inside "taste_axes" only allows: low | medium | high',
  'If a pattern is genuinely mixed or selective but still useful for recommendations, use "medium" only as a technical value',
  'In such cases, make the "axis" name explicitly reflect selectivity or mixed behavior',
  {
    text: "Prefer axis names like:",
    children: preferredAxisNames,
  },
  {
    text: "Avoid misleading axis names like:",
    children: avoidAxisNames,
  },
  "A medium value must not imply that this is a safe positive recommendation area",
  `For mixed or selective axes, explain the risk and the useful split in ${explanationTargets}`,
];

export const buildCommonPracticalGuidance = ({
  selectiveGenreLine,
  mixedSignalLine,
}: CommonPracticalGuidanceParams): PromptBullet[] => [
  "Focus on repeated patterns that would actually improve later recommendations",
  "Prefer a few strong higher-level patterns over many weak ones",
  "Surface only the strongest 3 to 5 higher-level patterns if they clearly add value beyond simple genre summaries",
  selectiveGenreLine,
  mixedSignalLine,
  "If no meaningful higher-level patterns emerge, say so implicitly by staying grounded and conservative",
  "Do not compress several different weak clusters into one broad category just to keep the answer short; keep the most recommendation-relevant distinctions",
];

const formatOrderedList = (items: string[]) =>
  items.map((item, index) => `${index + 1}. ${item}`).join("\n");

const formatBulletList = (items: PromptBullet[]) =>
  items
    .flatMap((item) =>
      typeof item === "string"
        ? [`- ${item}`]
        : [`- ${item.text}`, ...item.children.map((child) => `  - ${child}`)],
    )
    .join("\n");

const formatSection = (title: string, items: PromptBullet[]) => `${title}:\n\n${formatBulletList(items)}`;

export const buildProfileAnalysisPrompt = ({
  introduction,
  scopeNotice,
  interpretationRules,
  interpretationPriorities,
  importantRulesExtra = [],
  behavioralRulesExtra = [],
  higherLevelPatternRules,
  clusterSeparationRules,
  tasteAxisValueRules,
  practicalGuidance,
  jsonStructure,
  additionalOutputConstraints = [],
  csvData,
}: BuildProfileAnalysisPromptParams) =>
  [
    introduction,
    scopeNotice,
    "Your task is to build a reliable taste-profile snapshot from the provided CSV dataset.",
    `Important rules:\n\n${formatOrderedList([...BASE_IMPORTANT_RULES, ...importantRulesExtra])}`,
    formatSection("Interpretation rules for fields", interpretationRules),
    formatSection("Interpretation priorities", interpretationPriorities),
    formatSection("Important behavioral rules", [
      ...BASE_BEHAVIORAL_RULES,
      ...behavioralRulesExtra,
    ]),
    formatSection("Higher-level pattern rules", higherLevelPatternRules),
    formatSection("Cluster separation rules", clusterSeparationRules),
    formatSection("Taste-axis value rules", tasteAxisValueRules),
    formatSection("Representative titles rules", BASE_REPRESENTATIVE_TITLE_RULES),
    formatSection("Confidence rules", BASE_CONFIDENCE_RULES),
    formatSection("Recommendation-usefulness rules", BASE_RECOMMENDATION_USEFULNESS_RULES),
    formatSection("Practical guidance for analysis", practicalGuidance),
    formatSection("Evidence field rules", BASE_EVIDENCE_FIELD_RULES),
    `Return ONLY valid JSON with exactly this structure:\n\n${jsonStructure}`,
    formatSection("Additional output constraints", [
      ...BASE_OUTPUT_CONSTRAINTS,
      ...additionalOutputConstraints,
    ]),
    `CSV data:\n${csvData}`,
  ]
    .filter((section): section is string => typeof section === "string" && section.trim().length > 0)
    .join("\n\n");
