export const SHISHKA_FIT_LABELS = [
  "Навряд",
  "Слабко",
  "Можливо",
  "Схоже",
  "Явно",
] as const;

export type ShishkaFitLabel = (typeof SHISHKA_FIT_LABELS)[number];

export type ShishkaFitAssessment = {
  label: ShishkaFitLabel;
  reason: string;
  profileAnalyzedAt: string;
  scopeValue: string;
};

const FIT_ASSESSMENT_PREFIX = "Вірогідність сподобатись:";
const LEGACY_FIT_ASSESSMENT_PREFIX = "Шишка:";

export const isShishkaFitLabel = (value: string): value is ShishkaFitLabel =>
  SHISHKA_FIT_LABELS.includes(value as ShishkaFitLabel);

export const formatShishkaAssessmentComment = ({
  label,
  reason,
}: Pick<ShishkaFitAssessment, "label" | "reason">) =>
  `${FIT_ASSESSMENT_PREFIX} ${label}\n${reason.trim()}`;

export const mergeShishkaAssessmentIntoComment = (
  currentComment: string,
  nextAssessment: Pick<ShishkaFitAssessment, "label" | "reason">,
  previousAssessment?: Pick<ShishkaFitAssessment, "label" | "reason"> | null,
) => {
  const nextBlock = formatShishkaAssessmentComment(nextAssessment);
  const previousBlock = previousAssessment
    ? formatShishkaAssessmentComment(previousAssessment)
    : "";
  const previousLegacyBlock = previousAssessment
    ? `${LEGACY_FIT_ASSESSMENT_PREFIX} ${previousAssessment.label}\n${previousAssessment.reason.trim()}`
    : "";

  let remainder = currentComment.trim();

  if (previousBlock) {
    remainder = remainder.replace(previousBlock, "").trim();
  }

  if (previousLegacyBlock) {
    remainder = remainder.replace(previousLegacyBlock, "").trim();
  }

  if (remainder === nextBlock) {
    return nextBlock;
  }

  if (!remainder) {
    return nextBlock;
  }

  if (remainder.includes(nextBlock)) {
    return remainder;
  }

  return `${nextBlock}\n\n${remainder}`;
};
