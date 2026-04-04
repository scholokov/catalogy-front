export type RankedEntry = {
  key?: string;
  label: string;
  href?: string;
  value: number;
  itemCount: number;
};

export type MonthlyEntry = {
  key: string;
  label: string;
  count: number;
};

export type ScopeType = "platform" | "format";

export type ScopeMaturityStatus = "insufficient" | "exploratory" | "working";

export type ProfileType = "insufficient" | "single_scope" | "multi_scope";

export type RecommendationReadiness =
  | "not_ready"
  | "single_scope_ready"
  | "multi_scope_ready";

export type ScopeBreakdownEntry = {
  scopeType: ScopeType;
  scopeValue: string;
  totalTitles: number;
  ratedTitles: number;
  engagedTitles: number;
  completedTitles: number;
  droppedTitles: number;
  plannedTitles: number;
  addedLast30Days: number;
  averageRating: number | null;
  medianRating: number | null;
  completionRate: number | null;
  dropRate: number | null;
  highRatedShare: number | null;
  lowRatedShare: number | null;
  topLikedGenres: RankedEntry[];
  topDislikedGenres: RankedEntry[];
  topDroppedGenres: RankedEntry[];
  monthlyEntries: MonthlyEntry[];
  maturityStatus: ScopeMaturityStatus;
  recommendationEligible: boolean;
  defaultScopeScore: number;
};

export type RecommendationScopeOption = {
  scopeValue: string;
  score: number;
  isDefault: boolean;
};

export type ProfileInterpretation = {
  scopeType: ScopeType;
  profileType: ProfileType;
  recommendationReadiness: RecommendationReadiness;
  workingScopes: string[];
  exploratoryScopes: string[];
  insufficientScopes: string[];
  recommendationValidScopes: string[];
  ignoredScopes: string[];
  defaultScope: string | null;
  dropdownOptions: RecommendationScopeOption[];
  manualScopeSelectionRequired: boolean;
  averageRatingSpread: number | null;
  completionRateSpread: number | null;
  dropRateSpread: number | null;
  hasDistinctScopeModes: boolean;
  summary: string;
  details: string[];
};

export type GlobalSummary = {
  totalTitles: number;
  ratedTitles: number;
  engagedTitles: number;
  completedTitles: number;
  droppedTitles: number;
  plannedTitles: number;
  addedLast30Days: number;
  averageRating: number | null;
  medianRating: number | null;
  numberOfWorkingScopes: number;
  profileType: ProfileType;
  recommendationReadiness: RecommendationReadiness;
  defaultScope: string | null;
};
