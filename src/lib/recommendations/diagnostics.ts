export type RecommendationCandidate = {
  title: string;
  year: string;
};

export type RecommendationFilterStats = {
  parsedCount: number;
  keptCount: number;
  filteredKnownCount: number;
  filteredDuplicateCount: number;
};

export type RecommendationAttemptDiagnostics = RecommendationFilterStats & {
  label: string;
  requestedCount: number;
};

export const filterRecommendationsWithStats = <T extends RecommendationCandidate>(
  recommendations: T[],
  knownTitles: Set<string>,
  normalizeTitle: (value: string) => string,
): { recommendations: T[]; stats: RecommendationFilterStats } => {
  const seen = new Set<string>();
  const kept: T[] = [];
  let filteredKnownCount = 0;
  let filteredDuplicateCount = 0;

  recommendations.forEach((entry) => {
    const normalizedTitle = normalizeTitle(entry.title);
    const normalizedWithYear = normalizeTitle(`${entry.title} (${entry.year})`);
    if (knownTitles.has(normalizedTitle) || knownTitles.has(normalizedWithYear)) {
      filteredKnownCount += 1;
      return;
    }
    if (seen.has(normalizedTitle)) {
      filteredDuplicateCount += 1;
      return;
    }
    seen.add(normalizedTitle);
    kept.push(entry);
  });

  return {
    recommendations: kept,
    stats: {
      parsedCount: recommendations.length,
      keptCount: kept.length,
      filteredKnownCount,
      filteredDuplicateCount,
    },
  };
};

const formatAttemptLine = (attempt: RecommendationAttemptDiagnostics) => {
  if (attempt.parsedCount === 0) {
    return `${attempt.label}: модель не повернула жодного коректно розпарсеного кандидата у потрібному форматі.`;
  }

  const details = [
    `коректно розпізнано ${attempt.parsedCount}`,
    attempt.filteredKnownCount > 0
      ? `вже були відомі/у колекції: ${attempt.filteredKnownCount}`
      : null,
    attempt.filteredDuplicateCount > 0
      ? `відсіяно як дублікати всередині відповіді: ${attempt.filteredDuplicateCount}`
      : null,
    attempt.keptCount > 0 ? `придатні кандидати після фільтрації: ${attempt.keptCount}` : null,
  ].filter((value): value is string => Boolean(value));

  return `${attempt.label}: ${details.join(", ")}.`;
};

export const buildRecommendationFailureMessage = (
  attempts: RecommendationAttemptDiagnostics[],
) => {
  const totalParsed = attempts.reduce((sum, attempt) => sum + attempt.parsedCount, 0);
  const totalKnown = attempts.reduce((sum, attempt) => sum + attempt.filteredKnownCount, 0);
  const totalDuplicates = attempts.reduce((sum, attempt) => sum + attempt.filteredDuplicateCount, 0);
  const totalKept = attempts.reduce((sum, attempt) => sum + attempt.keptCount, 0);

  const summary =
    totalParsed === 0
      ? "Не вдалося підібрати рекомендації: модель не повернула жодного кандидата у стабільному очікуваному форматі."
      : totalKept === 0
        ? `Не вдалося підібрати рекомендації: усі ${totalParsed} розпізнаних кандидати відсіялися.`
        : `Не вдалося зібрати достатньо нових рекомендацій: після фільтрації залишилося лише ${totalKept} кандидат(и).`;

  const totals = [
    totalKnown > 0 ? `вже відомі/наявні в колекції: ${totalKnown}` : null,
    totalDuplicates > 0 ? `дублікати у відповіді моделі: ${totalDuplicates}` : null,
  ].filter((value): value is string => Boolean(value));

  return [summary, totals.length > 0 ? `Підсумок фільтрації: ${totals.join(", ")}.` : null, ...attempts.map(formatAttemptLine)]
    .filter(Boolean)
    .join("\n");
};
