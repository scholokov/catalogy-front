export type ProfileAnalysisStrength = "low" | "medium" | "high";

export type ProfileAnalysisTasteAxis = {
  axis: string;
  value: ProfileAnalysisStrength;
  evidence: string[];
};

export type ProfileAnalysisConfidence = {
  label: ProfileAnalysisStrength;
  reason: string;
};

export type ProfileAnalysisEvidence = {
  positive_titles: string[];
  negative_titles: string[];
  mixed_titles: string[];
};

export type FilmProfilePromptRow = {
  title: string;
  year: string;
  creator: string;
  genres: string;
  actors_top: string;
  dropped: "true" | "false";
  rating: string;
};

export type GameProfilePromptRow = {
  title: string;
  year: string;
  genres: string;
  dropped: "true" | "false";
  rating: string;
};

export type FilmProfileUserLayer = {
  summary: string;
  likes: string[];
  dislikes: string[];
  watching_patterns: string[];
  strong_author_signals: string[];
  confidence_label_uk: string;
  confidence_reason_uk: string;
};

export type FilmProfileSystemLayer = {
  profile_summary: string;
  core_preferences: string[];
  negative_patterns: string[];
  taste_axes: ProfileAnalysisTasteAxis[];
  strong_creator_affinities: string[];
  creator_signals: string[];
  actor_signals: string[];
  representative_likes: string[];
  representative_dislikes: string[];
  contradictions: string[];
  confidence: ProfileAnalysisConfidence;
  evidence: ProfileAnalysisEvidence;
};

export type FilmProfileAnalysisResult = {
  user_profile_uk: FilmProfileUserLayer;
  system_profile_en: FilmProfileSystemLayer;
};

export type GameProfileUserLayer = {
  summary: string;
  likes: string[];
  dislikes: string[];
  playing_patterns: string[];
  franchise_signals_uk: string[];
  confidence_label_uk: string;
  confidence_reason_uk: string;
};

export type GameProfileSystemLayer = {
  profile_summary: string;
  core_preferences: string[];
  negative_patterns: string[];
  experience_signals: string[];
  playstyle_signals: string[];
  taste_axes: ProfileAnalysisTasteAxis[];
  genre_signals: string[];
  franchise_affinities: string[];
  representative_likes: string[];
  representative_dislikes: string[];
  contradictions: string[];
  confidence: ProfileAnalysisConfidence;
  evidence: ProfileAnalysisEvidence;
};

export type GameProfileAnalysisResult = {
  user_profile_uk: GameProfileUserLayer;
  system_profile_en: GameProfileSystemLayer;
};

const asObject = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid JSON object.");
  }
  return value as Record<string, unknown>;
};

const asRequiredString = (value: unknown, fieldName: string) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}.`);
  }
  return value.trim();
};

const asStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const asConfidence = (value: unknown, fieldName: string): ProfileAnalysisConfidence => {
  const object = asObject(value);
  const label = asRequiredString(object.label, `${fieldName}.label`);
  if (label !== "low" && label !== "medium" && label !== "high") {
    throw new Error(`Invalid ${fieldName}.label.`);
  }
  return {
    label,
    reason: asRequiredString(object.reason, `${fieldName}.reason`),
  };
};

const asEvidence = (value: unknown): ProfileAnalysisEvidence => {
  const object = asObject(value);
  return {
    positive_titles: asStringArray(object.positive_titles),
    negative_titles: asStringArray(object.negative_titles),
    mixed_titles: asStringArray(object.mixed_titles),
  };
};

const asTasteAxes = (value: unknown, fieldName: string): ProfileAnalysisTasteAxis[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      const object = asObject(entry);
      const axis = asRequiredString(object.axis, `${fieldName}.axis`);
      const level = asRequiredString(
        object.value,
        `${fieldName}.value`,
      ) as ProfileAnalysisStrength;
      if (level !== "low" && level !== "medium" && level !== "high") {
        throw new Error(`Invalid ${fieldName}.value.`);
      }
      return {
        axis,
        value: level,
        evidence: asStringArray(object.evidence),
      };
    })
    .filter((entry) => entry.axis.length > 0);
};

export const parseFilmProfileAnalysis = (rawText: string): FilmProfileAnalysisResult => {
  const parsed = JSON.parse(rawText) as unknown;
  const root = asObject(parsed);
  const userLayer = asObject(root.user_profile_uk);
  const systemLayer = asObject(root.system_profile_en);

  return {
    user_profile_uk: {
      summary: asRequiredString(userLayer.summary, "user_profile_uk.summary"),
      likes: asStringArray(userLayer.likes),
      dislikes: asStringArray(userLayer.dislikes),
      watching_patterns: asStringArray(userLayer.watching_patterns),
      strong_author_signals: asStringArray(userLayer.strong_author_signals),
      confidence_label_uk: asRequiredString(
        userLayer.confidence_label_uk,
        "user_profile_uk.confidence_label_uk",
      ),
      confidence_reason_uk: asRequiredString(
        userLayer.confidence_reason_uk,
        "user_profile_uk.confidence_reason_uk",
      ),
    },
    system_profile_en: {
      profile_summary: asRequiredString(
        systemLayer.profile_summary,
        "system_profile_en.profile_summary",
      ),
      core_preferences: asStringArray(systemLayer.core_preferences),
      negative_patterns: asStringArray(systemLayer.negative_patterns),
      taste_axes: asTasteAxes(systemLayer.taste_axes, "system_profile_en.taste_axes"),
      strong_creator_affinities: asStringArray(systemLayer.strong_creator_affinities),
      creator_signals: asStringArray(systemLayer.creator_signals),
      actor_signals: asStringArray(systemLayer.actor_signals),
      representative_likes: asStringArray(systemLayer.representative_likes),
      representative_dislikes: asStringArray(systemLayer.representative_dislikes),
      contradictions: asStringArray(systemLayer.contradictions),
      confidence: asConfidence(systemLayer.confidence, "system_profile_en.confidence"),
      evidence: asEvidence(systemLayer.evidence),
    },
  };
};

export const parseGameProfileAnalysis = (rawText: string): GameProfileAnalysisResult => {
  const parsed = JSON.parse(rawText) as unknown;
  const root = asObject(parsed);
  const userLayer = asObject(root.user_profile_uk);
  const systemLayer = asObject(root.system_profile_en);

  return {
    user_profile_uk: {
      summary: asRequiredString(userLayer.summary, "user_profile_uk.summary"),
      likes: asStringArray(userLayer.likes),
      dislikes: asStringArray(userLayer.dislikes),
      playing_patterns: asStringArray(userLayer.playing_patterns),
      franchise_signals_uk: asStringArray(userLayer.franchise_signals_uk),
      confidence_label_uk: asRequiredString(
        userLayer.confidence_label_uk,
        "user_profile_uk.confidence_label_uk",
      ),
      confidence_reason_uk: asRequiredString(
        userLayer.confidence_reason_uk,
        "user_profile_uk.confidence_reason_uk",
      ),
    },
    system_profile_en: {
      profile_summary: asRequiredString(
        systemLayer.profile_summary,
        "system_profile_en.profile_summary",
      ),
      core_preferences: asStringArray(systemLayer.core_preferences),
      negative_patterns: asStringArray(systemLayer.negative_patterns),
      experience_signals: asStringArray(systemLayer.experience_signals),
      playstyle_signals: asStringArray(systemLayer.playstyle_signals),
      taste_axes: asTasteAxes(systemLayer.taste_axes, "system_profile_en.taste_axes"),
      genre_signals: asStringArray(systemLayer.genre_signals),
      franchise_affinities: asStringArray(systemLayer.franchise_affinities),
      representative_likes: asStringArray(systemLayer.representative_likes),
      representative_dislikes: asStringArray(systemLayer.representative_dislikes),
      contradictions: asStringArray(systemLayer.contradictions),
      confidence: asConfidence(systemLayer.confidence, "system_profile_en.confidence"),
      evidence: asEvidence(systemLayer.evidence),
    },
  };
};
