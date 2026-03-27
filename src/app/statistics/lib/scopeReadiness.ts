import type {
  ProfileInterpretation,
  RecommendationReadiness,
  ScopeBreakdownEntry,
  ScopeMaturityStatus,
  ScopeType,
} from "../statisticsTypes";

type ScopeMaturityThresholds = {
  workingTotalTitles: number;
  workingRatedTitles: number;
  workingEngagedTitles: number;
  exploratoryMinTitles: number;
};

export const DEFAULT_SCOPE_MATURITY_THRESHOLDS: ScopeMaturityThresholds = {
  workingTotalTitles: 50,
  workingRatedTitles: 20,
  workingEngagedTitles: 15,
  exploratoryMinTitles: 20,
};

const roundMetric = (value: number) => Math.round(value * 100) / 100;

export const calculateMedian = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return roundMetric((sorted[middle - 1] + sorted[middle]) / 2);
  }
  return roundMetric(sorted[middle]);
};

export const formatNullableMetric = (value: number | null, digits = 2) => {
  if (value === null) return "—";
  return value.toFixed(digits);
};

export const formatNullablePercent = (value: number | null) => {
  if (value === null) return "—";
  return `${Math.round(value)}%`;
};

export const getScopeMaturityLabel = (status: ScopeMaturityStatus) => {
  if (status === "working") return "Для рекомендацій";
  if (status === "exploratory") return "Попередній профіль";
  return "Недостатньо даних";
};

export const getRecommendationReadinessLabel = (readiness: RecommendationReadiness) => {
  if (readiness === "single_scope_ready") return "Готово для одного scope";
  if (readiness === "multi_scope_ready") return "Готово для кількох scope";
  return "Ще не готово";
};

export const deriveScopeMaturityStatus = (
  entry: Pick<
    ScopeBreakdownEntry,
    "totalTitles" | "ratedTitles" | "engagedTitles" | "plannedTitles"
  >,
  thresholds: ScopeMaturityThresholds = DEFAULT_SCOPE_MATURITY_THRESHOLDS,
): ScopeMaturityStatus => {
  if (entry.totalTitles < thresholds.exploratoryMinTitles) {
    return "insufficient";
  }

  if (
    entry.totalTitles >= thresholds.workingTotalTitles &&
    entry.ratedTitles >= thresholds.workingRatedTitles &&
    entry.engagedTitles >= thresholds.workingEngagedTitles
  ) {
    return "working";
  }

  const plannedRatio = entry.totalTitles > 0 ? entry.plannedTitles / entry.totalTitles : 0;
  if (plannedRatio >= 0.8 && entry.engagedTitles < Math.max(5, thresholds.workingEngagedTitles / 2)) {
    return "insufficient";
  }

  return "exploratory";
};

const calculateDefaultScopeScore = ({
  totalTitles,
  ratedTitles,
  engagedTitles,
}: Pick<ScopeBreakdownEntry, "totalTitles" | "ratedTitles" | "engagedTitles">) =>
  engagedTitles * 1_000_000 + ratedTitles * 1_000 + totalTitles;

export const buildScopeBreakdownEntry = ({
  scopeType,
  scopeValue,
  totalTitles,
  ratedTitles,
  engagedTitles,
  completedTitles,
  droppedTitles,
  plannedTitles,
  addedLast30Days,
  ratings,
  highRatedCount,
  lowRatedCount,
  topLikedGenres,
  topDislikedGenres,
  topDroppedGenres,
  monthlyEntries,
}: {
  scopeType: ScopeType;
  scopeValue: string;
  totalTitles: number;
  ratedTitles: number;
  engagedTitles: number;
  completedTitles: number;
  droppedTitles: number;
  plannedTitles: number;
  addedLast30Days: number;
  ratings: number[];
  highRatedCount: number;
  lowRatedCount: number;
  topLikedGenres: ScopeBreakdownEntry["topLikedGenres"];
  topDislikedGenres: ScopeBreakdownEntry["topDislikedGenres"];
  topDroppedGenres: ScopeBreakdownEntry["topDroppedGenres"];
  monthlyEntries: ScopeBreakdownEntry["monthlyEntries"];
}): ScopeBreakdownEntry => {
  const averageRating =
    ratings.length > 0
      ? roundMetric(ratings.reduce((sum, value) => sum + value, 0) / ratings.length)
      : null;
  const medianRating = calculateMedian(ratings);
  const completionRate =
    engagedTitles > 0 ? roundMetric((completedTitles / engagedTitles) * 100) : null;
  const dropRate = engagedTitles > 0 ? roundMetric((droppedTitles / engagedTitles) * 100) : null;
  const highRatedShare =
    ratedTitles > 0 ? roundMetric((highRatedCount / ratedTitles) * 100) : null;
  const lowRatedShare =
    ratedTitles > 0 ? roundMetric((lowRatedCount / ratedTitles) * 100) : null;
  const maturityStatus = deriveScopeMaturityStatus({
    totalTitles,
    ratedTitles,
    engagedTitles,
    plannedTitles,
  });
  const recommendationEligible = maturityStatus === "working";
  const defaultScopeScore = calculateDefaultScopeScore({
    totalTitles,
    ratedTitles,
    engagedTitles,
  });

  return {
    scopeType,
    scopeValue,
    totalTitles,
    ratedTitles,
    engagedTitles,
    completedTitles,
    droppedTitles,
    plannedTitles,
    addedLast30Days,
    averageRating,
    medianRating,
    completionRate,
    dropRate,
    highRatedShare,
    lowRatedShare,
    topLikedGenres,
    topDislikedGenres,
    topDroppedGenres,
    monthlyEntries,
    maturityStatus,
    recommendationEligible,
    defaultScopeScore,
  };
};

const getMetricSpread = (values: Array<number | null>) => {
  const filtered = values.filter((value): value is number => value !== null);
  if (filtered.length < 2) return null;
  return roundMetric(Math.max(...filtered) - Math.min(...filtered));
};

const getScopeProfileType = (workingScopesCount: number) => {
  if (workingScopesCount === 0) return "insufficient" as const;
  if (workingScopesCount === 1) return "single_scope" as const;
  return "multi_scope" as const;
};

const getRecommendationReadiness = (workingScopesCount: number): RecommendationReadiness => {
  if (workingScopesCount === 0) return "not_ready";
  if (workingScopesCount === 1) return "single_scope_ready";
  return "multi_scope_ready";
};

export const deriveProfileInterpretation = (
  scopeType: ScopeType,
  entries: ScopeBreakdownEntry[],
): ProfileInterpretation => {
  const workingEntries = entries
    .filter((entry) => entry.maturityStatus === "working")
    .sort((left, right) => {
      if (right.engagedTitles !== left.engagedTitles) {
        return right.engagedTitles - left.engagedTitles;
      }
      if (right.ratedTitles !== left.ratedTitles) {
        return right.ratedTitles - left.ratedTitles;
      }
      if (right.totalTitles !== left.totalTitles) {
        return right.totalTitles - left.totalTitles;
      }
      return left.scopeValue.localeCompare(right.scopeValue, "uk");
    });
  const exploratoryEntries = entries.filter((entry) => entry.maturityStatus === "exploratory");
  const insufficientEntries = entries.filter((entry) => entry.maturityStatus === "insufficient");

  const workingScopes = workingEntries.map((entry) => entry.scopeValue);
  const exploratoryScopes = exploratoryEntries.map((entry) => entry.scopeValue);
  const insufficientScopes = insufficientEntries.map((entry) => entry.scopeValue);
  const defaultScope = workingEntries[0]?.scopeValue ?? null;
  const dropdownOptions = workingEntries.map((entry) => ({
    scopeValue: entry.scopeValue,
    score: entry.defaultScopeScore,
    isDefault: entry.scopeValue === defaultScope,
  }));

  const averageRatingSpread = getMetricSpread(entries.map((entry) => entry.averageRating));
  const completionRateSpread = getMetricSpread(entries.map((entry) => entry.completionRate));
  const dropRateSpread = getMetricSpread(entries.map((entry) => entry.dropRate));
  const hasDistinctScopeModes =
    (averageRatingSpread ?? 0) >= 0.75 ||
    (completionRateSpread ?? 0) >= 20 ||
    (dropRateSpread ?? 0) >= 20;

  const profileType = getScopeProfileType(workingScopes.length);
  const recommendationReadiness = getRecommendationReadiness(workingScopes.length);

  if (workingScopes.length === 0) {
    return {
      scopeType,
      profileType,
      recommendationReadiness,
      workingScopes,
      exploratoryScopes,
      insufficientScopes,
      recommendationValidScopes: [],
      ignoredScopes: [...exploratoryScopes, ...insufficientScopes],
      defaultScope: null,
      dropdownOptions: [],
      manualScopeSelectionRequired: false,
      averageRatingSpread,
      completionRateSpread,
      dropRateSpread,
      hasDistinctScopeModes,
      summary: "Недостатньо даних для рекомендацій.",
      details: [
        `Для рекомендацій потрібні платформи зі статусом "Для рекомендацій".`,
        exploratoryScopes.length > 0
          ? `Попередній профіль: ${exploratoryScopes.join(", ")}.`
          : "Платформ зі статусом «Попередній профіль» зараз немає.",
        insufficientScopes.length > 0
          ? `Недостатньо даних: ${insufficientScopes.join(", ")}.`
          : "Платформ зі статусом «Недостатньо даних» зараз немає.",
      ],
    };
  }

  if (workingScopes.length === 1) {
    return {
      scopeType,
      profileType,
      recommendationReadiness,
      workingScopes,
      exploratoryScopes,
      insufficientScopes,
      recommendationValidScopes: workingScopes,
      ignoredScopes: [...exploratoryScopes, ...insufficientScopes],
      defaultScope,
      dropdownOptions,
      manualScopeSelectionRequired: false,
      averageRatingSpread,
      completionRateSpread,
      dropRateSpread,
      hasDistinctScopeModes,
      summary: "Доступні рекомендації для однієї платформи.",
      details: [
        `Основна платформа: ${workingScopes[0]}.`,
        exploratoryScopes.length > 0
          ? `Попередній профіль: ${exploratoryScopes.join(", ")}.`
          : "Платформ зі статусом «Попередній профіль» зараз немає.",
        insufficientScopes.length > 0
          ? `Недостатньо даних: ${insufficientScopes.join(", ")}.`
          : "Платформ зі статусом «Недостатньо даних» зараз немає.",
      ],
    };
  }

  return {
    scopeType,
    profileType,
    recommendationReadiness,
    workingScopes,
    exploratoryScopes,
    insufficientScopes,
    recommendationValidScopes: workingScopes,
    ignoredScopes: [...exploratoryScopes, ...insufficientScopes],
    defaultScope,
    dropdownOptions,
    manualScopeSelectionRequired: true,
    averageRatingSpread,
    completionRateSpread,
    dropRateSpread,
    hasDistinctScopeModes,
    summary: "Доступні рекомендації для кількох платформ.",
    details: [
      defaultScope ? `Основна платформа: ${defaultScope}.` : "Основна платформа ще не визначена.",
      `Платформи для рекомендацій: ${workingScopes.join(", ")}.`,
      exploratoryScopes.length > 0
        ? `Попередній профіль: ${exploratoryScopes.join(", ")}.`
        : "Платформ зі статусом «Попередній профіль» зараз немає.",
      insufficientScopes.length > 0
        ? `Недостатньо даних: ${insufficientScopes.join(", ")}.`
        : "Платформ зі статусом «Недостатньо даних» зараз немає.",
    ],
  };
};
