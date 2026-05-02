export const TASTE_AXIS_VALUES = ["low", "medium", "high"] as const;
export type TasteAxisValue = (typeof TASTE_AXIS_VALUES)[number];

export type ProfileAnalysisStrength = TasteAxisValue;

export const CONFIDENCE_LABELS = ["low", "medium", "high"] as const;
export type ConfidenceLabel = (typeof CONFIDENCE_LABELS)[number];

export const CONFIDENCE_LABELS_UK = ["Низька", "Середня", "Висока"] as const;
export type ConfidenceLabelUk = (typeof CONFIDENCE_LABELS_UK)[number];

export type ProfileAnalysisTasteAxis = {
  axis: string;
  value: TasteAxisValue;
  evidence: string[];
};

export type ProfileAnalysisConfidence = {
  label: ConfidenceLabel;
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
  confidence_label_uk: ConfidenceLabelUk;
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
  confidence_label_uk: ConfidenceLabelUk;
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

const isTasteAxisValue = (value: string): value is TasteAxisValue =>
  TASTE_AXIS_VALUES.includes(value as TasteAxisValue);

const isConfidenceLabel = (value: string): value is ConfidenceLabel =>
  CONFIDENCE_LABELS.includes(value as ConfidenceLabel);

const isConfidenceLabelUk = (value: string): value is ConfidenceLabelUk =>
  CONFIDENCE_LABELS_UK.includes(value as ConfidenceLabelUk);

const asStringArray = (
  value: unknown,
  fieldName: string,
  options?: { required?: boolean },
) => {
  if (value == null) {
    if (options?.required) {
      throw new Error(`Invalid ${fieldName}.`);
    }
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  const invalidEntry = value.find((entry) => typeof entry !== "string");
  if (invalidEntry !== undefined) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return value.map((entry) => entry.trim()).filter(Boolean);
};

const asConfidence = (value: unknown, fieldName: string): ProfileAnalysisConfidence => {
  const object = asObject(value);
  const label = asRequiredString(object.label, `${fieldName}.label`);
  if (!isConfidenceLabel(label)) {
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
    positive_titles: asStringArray(object.positive_titles, "evidence.positive_titles", {
      required: true,
    }),
    negative_titles: asStringArray(object.negative_titles, "evidence.negative_titles", {
      required: true,
    }),
    mixed_titles: asStringArray(object.mixed_titles, "evidence.mixed_titles", {
      required: true,
    }),
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
      const level = asRequiredString(object.value, `${fieldName}.value`);
      if (!isTasteAxisValue(level)) {
        throw new Error(`Invalid ${fieldName}.value.`);
      }
      return {
        axis,
        value: level,
        evidence: asStringArray(object.evidence, `${fieldName}.evidence`, {
          required: true,
        }),
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
      likes: asStringArray(userLayer.likes, "user_profile_uk.likes"),
      dislikes: asStringArray(userLayer.dislikes, "user_profile_uk.dislikes"),
      watching_patterns: asStringArray(
        userLayer.watching_patterns,
        "user_profile_uk.watching_patterns",
      ),
      strong_author_signals: asStringArray(
        userLayer.strong_author_signals,
        "user_profile_uk.strong_author_signals",
      ),
      confidence_label_uk: (() => {
        const label = asRequiredString(
          userLayer.confidence_label_uk,
          "user_profile_uk.confidence_label_uk",
        );
        if (!isConfidenceLabelUk(label)) {
          throw new Error("Invalid user_profile_uk.confidence_label_uk.");
        }
        return label;
      })(),
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
      core_preferences: asStringArray(
        systemLayer.core_preferences,
        "system_profile_en.core_preferences",
      ),
      negative_patterns: asStringArray(
        systemLayer.negative_patterns,
        "system_profile_en.negative_patterns",
      ),
      taste_axes: asTasteAxes(systemLayer.taste_axes, "system_profile_en.taste_axes"),
      strong_creator_affinities: asStringArray(
        systemLayer.strong_creator_affinities,
        "system_profile_en.strong_creator_affinities",
      ),
      creator_signals: asStringArray(
        systemLayer.creator_signals,
        "system_profile_en.creator_signals",
      ),
      actor_signals: asStringArray(systemLayer.actor_signals, "system_profile_en.actor_signals"),
      representative_likes: asStringArray(
        systemLayer.representative_likes,
        "system_profile_en.representative_likes",
      ),
      representative_dislikes: asStringArray(
        systemLayer.representative_dislikes,
        "system_profile_en.representative_dislikes",
      ),
      contradictions: asStringArray(
        systemLayer.contradictions,
        "system_profile_en.contradictions",
      ),
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
      likes: asStringArray(userLayer.likes, "user_profile_uk.likes"),
      dislikes: asStringArray(userLayer.dislikes, "user_profile_uk.dislikes"),
      playing_patterns: asStringArray(
        userLayer.playing_patterns,
        "user_profile_uk.playing_patterns",
      ),
      franchise_signals_uk: asStringArray(
        userLayer.franchise_signals_uk,
        "user_profile_uk.franchise_signals_uk",
      ),
      confidence_label_uk: (() => {
        const label = asRequiredString(
          userLayer.confidence_label_uk,
          "user_profile_uk.confidence_label_uk",
        );
        if (!isConfidenceLabelUk(label)) {
          throw new Error("Invalid user_profile_uk.confidence_label_uk.");
        }
        return label;
      })(),
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
      core_preferences: asStringArray(
        systemLayer.core_preferences,
        "system_profile_en.core_preferences",
      ),
      negative_patterns: asStringArray(
        systemLayer.negative_patterns,
        "system_profile_en.negative_patterns",
      ),
      experience_signals: asStringArray(
        systemLayer.experience_signals,
        "system_profile_en.experience_signals",
      ),
      playstyle_signals: asStringArray(
        systemLayer.playstyle_signals,
        "system_profile_en.playstyle_signals",
      ),
      taste_axes: asTasteAxes(systemLayer.taste_axes, "system_profile_en.taste_axes"),
      genre_signals: asStringArray(systemLayer.genre_signals, "system_profile_en.genre_signals"),
      franchise_affinities: asStringArray(
        systemLayer.franchise_affinities,
        "system_profile_en.franchise_affinities",
      ),
      representative_likes: asStringArray(
        systemLayer.representative_likes,
        "system_profile_en.representative_likes",
      ),
      representative_dislikes: asStringArray(
        systemLayer.representative_dislikes,
        "system_profile_en.representative_dislikes",
      ),
      contradictions: asStringArray(
        systemLayer.contradictions,
        "system_profile_en.contradictions",
      ),
      confidence: asConfidence(systemLayer.confidence, "system_profile_en.confidence"),
      evidence: asEvidence(systemLayer.evidence),
    },
  };
};
