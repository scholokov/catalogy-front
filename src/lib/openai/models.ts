export const DEFAULT_OPENAI_RECOMMENDATION_MODEL = "gpt-4.1-mini";
export const DEFAULT_OPENAI_PROFILE_ANALYSIS_MODEL = "gpt-4.1";

export const getOpenAiRecommendationModel = () =>
  process.env.OPENAI_RECOMMENDATION_MODEL || DEFAULT_OPENAI_RECOMMENDATION_MODEL;

export const getOpenAiProfileAnalysisModel = () =>
  process.env.OPENAI_PROFILE_MODEL || DEFAULT_OPENAI_PROFILE_ANALYSIS_MODEL;
