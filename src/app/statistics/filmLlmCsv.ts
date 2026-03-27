export type FilmLlmExportRow = {
  itemId: string;
  externalId: string;
  title: string;
  titleUk: string;
  titleEn: string;
  titleOriginal: string;
  year: string;
  type: string;
  mediaType?: "movie" | "tv";
  isViewed?: boolean;
  progress: number;
  rating: number | null;
  genres: string[];
  directors: string[];
};

type TasteProfileRow = [string, string, string, string];
type CountEntry = { key: string; value: number };
type TasteAxis = {
  key: string;
  value: string;
  notes: string;
  enabled: boolean;
};

const POSITIVE_THRESHOLD = 4;
const NEGATIVE_THRESHOLD = 3;
const MAX_TOP_ITEMS = 8;
const REPRESENTATIVE_LIMIT = 15;
const PLANNED_LIMIT = 12;

const GENRE_GROUPS = {
  crime: ["crime", "кримінал"],
  thriller: ["thriller", "трилер"],
  drama: ["drama", "драма"],
  mystery: ["mystery", "містер", "детектив"],
  comedy: ["comedy", "комедія"],
  horror: ["horror", "жах"],
  history: ["history", "істор"],
  war: ["war", "війна", "воєн"],
  biography: ["biography", "біограф"],
  documentary: ["documentary", "документ"],
  action: ["action", "бойовик", "екшн"],
  scienceFiction: ["science fiction", "sci-fi", "science-fiction", "фантаст"],
  fantasy: ["fantasy", "фентез"],
  romance: ["romance", "роман"],
  family: ["family", "сімейн"],
  music: ["music", "музик"],
  sport: ["sport", "спорт"],
  adventure: ["adventure", "пригод"],
} as const;

const formatNumber = (value: number | null) => {
  if (value === null) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const normalizeStatus = (progress: number) => {
  if (progress >= 100) return "completed";
  if (progress <= 0) return "planned";
  return "dropped";
};

const joinList = (values: string[]) => values.join("|");

const safeString = (value?: string | null) => value?.trim() ?? "";

const pickTitleLocal = (row: FilmLlmExportRow) =>
  safeString(row.titleUk) ||
  safeString(row.title) ||
  safeString(row.titleEn) ||
  safeString(row.titleOriginal);

const pickTitleOriginal = (row: FilmLlmExportRow) =>
  safeString(row.titleOriginal) ||
  safeString(row.titleEn) ||
  safeString(row.title) ||
  safeString(row.titleUk);

const getTitleId = (row: FilmLlmExportRow) =>
  row.externalId ? `tmdb:${row.externalId}` : `item:${row.itemId}`;

const buildCountMap = (
  rows: FilmLlmExportRow[],
  getter: (row: FilmLlmExportRow) => string[],
) => {
  const aggregate = new Map<string, number>();

  rows.forEach((row) => {
    getter(row).forEach((label) => {
      aggregate.set(label, (aggregate.get(label) ?? 0) + 1);
    });
  });

  return aggregate;
};

const mapToSortedEntries = (aggregate: Map<string, number>) =>
  Array.from(aggregate.entries())
    .map(([key, value]) => ({ key, value }))
    .sort((left, right) => {
      if (right.value !== left.value) return right.value - left.value;
      return left.key.localeCompare(right.key, "uk");
    });

const getCount = (aggregate: Map<string, number>, key: string) => aggregate.get(key) ?? 0;

const lowerGenres = (row: FilmLlmExportRow) => row.genres.map((genre) => genre.toLowerCase());

const hasKeyword = (values: string[], keywords: readonly string[]) =>
  values.some((value) => keywords.some((keyword) => value.includes(keyword)));

const hasAnyGenreGroup = (
  row: FilmLlmExportRow,
  groups: Array<readonly string[]>,
) => {
  const values = lowerGenres(row);
  return groups.some((group) => hasKeyword(values, group));
};

const hasAllGenreGroups = (
  row: FilmLlmExportRow,
  groups: Array<readonly string[]>,
) => {
  const values = lowerGenres(row);
  return groups.every((group) => hasKeyword(values, group));
};

const isFranchiseTitle = (row: FilmLlmExportRow) => {
  const title = pickTitleOriginal(row);
  return /[:\-]\s|\b[2-9]\b|\bii\b|\biii\b|\biv\b|\bv\b|\bpart\b|\bchapter\b|\bepisode\b|\breturns\b/i.test(
    title,
  );
};

const buildRepresentativeRows = (
  section: "representative_positive" | "representative_negative" | "representative_planned",
  rows: FilmLlmExportRow[],
  buckets: Array<{ key: string; matcher: (row: FilmLlmExportRow) => boolean }>,
  limit: number,
): TasteProfileRow[] => {
  const selected = new Set<string>();
  const result: TasteProfileRow[] = [];

  buckets.forEach((bucket) => {
    const match = rows.find((row) => !selected.has(row.itemId) && bucket.matcher(row));
    if (!match) return;
    selected.add(match.itemId);
    result.push([
      section,
      bucket.key,
      pickTitleOriginal(match),
      [
        pickTitleLocal(match),
        match.year,
        match.rating === null ? "" : formatNumber(match.rating),
        joinList(match.genres.slice(0, 3)),
      ]
        .filter(Boolean)
        .join("|"),
    ]);
  });

  rows.forEach((row) => {
    if (result.length >= limit || selected.has(row.itemId)) return;
    selected.add(row.itemId);
    result.push([
      section,
      `${section}_${result.length + 1}`,
      pickTitleOriginal(row),
      [
        pickTitleLocal(row),
        row.year,
        row.rating === null ? "" : formatNumber(row.rating),
        joinList(row.genres.slice(0, 3)),
      ]
        .filter(Boolean)
        .join("|"),
    ]);
  });

  return result.slice(0, limit);
};

const getShare = (count: number, total: number) =>
  total > 0 ? `${Math.round((count / total) * 100)}%` : "";

const getNetNotes = (
  key: string,
  positiveMap: Map<string, number>,
  negativeMap: Map<string, number>,
) => {
  const positiveCount = getCount(positiveMap, key);
  const negativeCount = getCount(negativeMap, key);
  return `positive_count=${positiveCount}|negative_count=${negativeCount}|net=${
    positiveCount - negativeCount
  }`;
};

const buildContextualTopRows = (
  section: string,
  primaryEntries: CountEntry[],
  positiveMap: Map<string, number>,
  negativeMap: Map<string, number>,
  sortMode: "positive" | "negative",
): TasteProfileRow[] =>
  primaryEntries
    .sort((left, right) => {
      if (right.value !== left.value) return right.value - left.value;
      const leftNet = getCount(positiveMap, left.key) - getCount(negativeMap, left.key);
      const rightNet = getCount(positiveMap, right.key) - getCount(negativeMap, right.key);
      if (sortMode === "positive" && rightNet !== leftNet) return rightNet - leftNet;
      if (sortMode === "negative" && leftNet !== rightNet) return leftNet - rightNet;
      return left.key.localeCompare(right.key, "uk");
    })
    .slice(0, MAX_TOP_ITEMS)
    .map<TasteProfileRow>((entry) => [
      section,
      entry.key,
      String(entry.value),
      getNetNotes(entry.key, positiveMap, negativeMap),
    ]);

const buildDroppedTopRows = (
  section: string,
  droppedRows: FilmLlmExportRow[],
  getter: (row: FilmLlmExportRow) => string[],
): TasteProfileRow[] => {
  const countMap = buildCountMap(droppedRows, getter);
  const progressMap = new Map<string, { total: number; count: number }>();

  droppedRows.forEach((row) => {
    getter(row).forEach((label) => {
      const current = progressMap.get(label) ?? { total: 0, count: 0 };
      progressMap.set(label, { total: current.total + row.progress, count: current.count + 1 });
    });
  });

  return mapToSortedEntries(countMap)
    .slice(0, MAX_TOP_ITEMS)
    .map<TasteProfileRow>((entry) => {
      const progress = progressMap.get(entry.key) ?? { total: 0, count: 0 };
      const avgProgress =
        progress.count > 0 ? String(Math.round(progress.total / progress.count)) : "";
      return [section, entry.key, String(entry.value), `drop_count=${entry.value}|avg_progress=${avgProgress}`];
    });
};

const bucketProgress = (progress: number) => {
  if (progress <= 20) return "1_20";
  if (progress <= 50) return "21_50";
  if (progress <= 80) return "51_80";
  return "81_99";
};

const pickExamples = (rows: FilmLlmExportRow[], count: number) =>
  joinList(rows.slice(0, count).map((row) => pickTitleOriginal(row)));

export const buildTitlesCatalogForLlmCsv = (rows: FilmLlmExportRow[]) => ({
  headers: [
    "title_id",
    "title_local",
    "title_original",
    "year",
    "type",
    "status",
    "progress",
    "rating",
    "platform_or_source",
    "primary_genres",
    "primary_directors",
  ],
  rows: [...rows]
    .sort((left, right) => {
      const titleCompare = pickTitleOriginal(left).localeCompare(pickTitleOriginal(right), "uk");
      if (titleCompare !== 0) return titleCompare;
      return left.year.localeCompare(right.year, "uk");
    })
    .map((row) => [
      getTitleId(row),
      pickTitleLocal(row),
      pickTitleOriginal(row),
      row.year,
      row.type || "film",
      normalizeStatus(row.progress),
      String(row.progress),
      row.rating === null ? "" : formatNumber(row.rating),
      row.externalId ? "tmdb" : "manual",
      joinList(row.genres),
      joinList(row.directors),
    ]),
});

export const buildTitlesBlacklistForLlmCsv = (rows: FilmLlmExportRow[]) => ({
  headers: ["title_original", "title_local", "year", "status"],
  rows: [...rows]
    .sort((left, right) => {
      const titleCompare = pickTitleOriginal(left).localeCompare(pickTitleOriginal(right), "uk");
      if (titleCompare !== 0) return titleCompare;
      return left.year.localeCompare(right.year, "uk");
    })
    .map((row) => [
      pickTitleOriginal(row),
      pickTitleLocal(row),
      row.year,
      normalizeStatus(row.progress),
    ]),
});

export const buildTasteProfileForLlmCsv = (rows: FilmLlmExportRow[]) => {
  const completedRows = rows.filter((row) => normalizeStatus(row.progress) === "completed");
  const plannedRows = rows.filter((row) => normalizeStatus(row.progress) === "planned");
  const droppedRows = rows.filter((row) => normalizeStatus(row.progress) === "dropped");
  const neutralRows = completedRows.filter(
    (row) => row.rating !== null && row.rating >= NEGATIVE_THRESHOLD && row.rating < POSITIVE_THRESHOLD,
  );
  const positiveRows = completedRows
    .filter((row) => row.rating !== null && row.rating >= POSITIVE_THRESHOLD)
    .sort((left, right) => {
      if ((right.rating ?? 0) !== (left.rating ?? 0)) return (right.rating ?? 0) - (left.rating ?? 0);
      if (right.progress !== left.progress) return right.progress - left.progress;
      return pickTitleOriginal(left).localeCompare(pickTitleOriginal(right), "uk");
    });
  const negativeRows = rows
    .filter(
      (row) =>
        normalizeStatus(row.progress) === "dropped" ||
        (normalizeStatus(row.progress) === "completed" &&
          row.rating !== null &&
          row.rating < NEGATIVE_THRESHOLD),
    )
    .sort((left, right) => {
      const leftDropped = normalizeStatus(left.progress) === "dropped" ? 0 : 1;
      const rightDropped = normalizeStatus(right.progress) === "dropped" ? 0 : 1;
      if (leftDropped !== rightDropped) return leftDropped - rightDropped;
      if ((left.rating ?? 0) !== (right.rating ?? 0)) return (left.rating ?? 0) - (right.rating ?? 0);
      return left.progress - right.progress;
    });

  const positiveGenreMap = buildCountMap(positiveRows, (row) => row.genres);
  const negativeGenreMap = buildCountMap(negativeRows, (row) => row.genres);
  const positiveDirectorMap = buildCountMap(positiveRows, (row) => row.directors);
  const negativeDirectorMap = buildCountMap(negativeRows, (row) => row.directors);
  const topPositiveGenres = buildContextualTopRows(
    "top_positive_genres",
    mapToSortedEntries(positiveGenreMap),
    positiveGenreMap,
    negativeGenreMap,
    "positive",
  );
  const topNegativeGenres = buildContextualTopRows(
    "top_negative_genres",
    mapToSortedEntries(negativeGenreMap),
    positiveGenreMap,
    negativeGenreMap,
    "negative",
  );
  const topPositiveDirectors = buildContextualTopRows(
    "top_positive_directors",
    mapToSortedEntries(positiveDirectorMap),
    positiveDirectorMap,
    negativeDirectorMap,
    "positive",
  );
  const topNegativeDirectors = buildContextualTopRows(
    "top_negative_directors",
    mapToSortedEntries(negativeDirectorMap),
    positiveDirectorMap,
    negativeDirectorMap,
    "negative",
  );

  const positiveRepresentativeBuckets = [
    {
      key: "authorial_crime",
      matcher: (row: FilmLlmExportRow) =>
        hasAnyGenreGroup(row, [GENRE_GROUPS.crime]) &&
        hasAnyGenreGroup(row, [GENRE_GROUPS.thriller, GENRE_GROUPS.drama, GENRE_GROUPS.mystery]),
    },
    {
      key: "dark_fatalistic_crime",
      matcher: (row: FilmLlmExportRow) =>
        hasAllGenreGroups(row, [GENRE_GROUPS.crime, GENRE_GROUPS.drama]) ||
        hasAllGenreGroups(row, [GENRE_GROUPS.thriller, GENRE_GROUPS.drama]),
    },
    {
      key: "black_absurdity",
      matcher: (row: FilmLlmExportRow) =>
        hasAnyGenreGroup(row, [GENRE_GROUPS.comedy]) &&
        hasAnyGenreGroup(row, [GENRE_GROUPS.crime, GENRE_GROUPS.drama]),
    },
    {
      key: "conscious_outrageous_trash",
      matcher: (row: FilmLlmExportRow) =>
        hasAnyGenreGroup(row, [GENRE_GROUPS.action, GENRE_GROUPS.horror, GENRE_GROUPS.scienceFiction]) &&
        (row.rating ?? 0) >= 4,
    },
    {
      key: "historical_contextual_weight",
      matcher: (row: FilmLlmExportRow) =>
        hasAnyGenreGroup(row, [
          GENRE_GROUPS.history,
          GENRE_GROUPS.war,
          GENRE_GROUPS.biography,
          GENRE_GROUPS.documentary,
        ]),
    },
    {
      key: "competence_under_pressure",
      matcher: (row: FilmLlmExportRow) =>
        hasAnyGenreGroup(row, [GENRE_GROUPS.action, GENRE_GROUPS.thriller, GENRE_GROUPS.crime]) &&
        !hasAnyGenreGroup(row, [GENRE_GROUPS.romance]),
    },
  ];

  const negativeRepresentativeBuckets = [
    {
      key: "slow_prestige_without_hook",
      matcher: (row: FilmLlmExportRow) =>
        row.progress <= 50 &&
        hasAnyGenreGroup(row, [GENRE_GROUPS.drama, GENRE_GROUPS.history, GENRE_GROUPS.biography]),
    },
    {
      key: "early_prestige_rejection",
      matcher: (row: FilmLlmExportRow) =>
        row.progress <= 20 &&
        hasAnyGenreGroup(row, [GENRE_GROUPS.drama, GENRE_GROUPS.history, GENRE_GROUPS.documentary]),
    },
    {
      key: "franchise_formula_reject",
      matcher: (row: FilmLlmExportRow) =>
        isFranchiseTitle(row) &&
        hasAnyGenreGroup(row, [GENRE_GROUPS.action, GENRE_GROUPS.adventure, GENRE_GROUPS.scienceFiction]),
    },
    {
      key: "concept_over_engagement",
      matcher: (row: FilmLlmExportRow) =>
        hasAnyGenreGroup(row, [GENRE_GROUPS.scienceFiction, GENRE_GROUPS.fantasy, GENRE_GROUPS.mystery]) &&
        row.progress < 100,
    },
    {
      key: "romantic_motivational_catharsis_reject",
      matcher: (row: FilmLlmExportRow) =>
        hasAnyGenreGroup(row, [
          GENRE_GROUPS.romance,
          GENRE_GROUPS.family,
          GENRE_GROUPS.music,
          GENRE_GROUPS.sport,
        ]),
    },
  ];

  const plannedRepresentativeBuckets = [
    {
      key: "planned_crime_thriller",
      matcher: (row: FilmLlmExportRow) =>
        hasAnyGenreGroup(row, [GENRE_GROUPS.crime, GENRE_GROUPS.thriller]),
    },
    {
      key: "planned_historical_weight",
      matcher: (row: FilmLlmExportRow) =>
        hasAnyGenreGroup(row, [GENRE_GROUPS.history, GENRE_GROUPS.war, GENRE_GROUPS.biography]),
    },
    {
      key: "planned_dark_mystery",
      matcher: (row: FilmLlmExportRow) =>
        hasAnyGenreGroup(row, [GENRE_GROUPS.mystery, GENRE_GROUPS.horror, GENRE_GROUPS.thriller]),
    },
    {
      key: "planned_stylized_action",
      matcher: (row: FilmLlmExportRow) =>
        hasAnyGenreGroup(row, [GENRE_GROUPS.action, GENRE_GROUPS.scienceFiction, GENRE_GROUPS.adventure]),
    },
    {
      key: "planned_black_comedy",
      matcher: (row: FilmLlmExportRow) =>
        hasAnyGenreGroup(row, [GENRE_GROUPS.comedy]) &&
        hasAnyGenreGroup(row, [GENRE_GROUPS.crime, GENRE_GROUPS.drama]),
    },
  ];

  const dropProgressMap = new Map<string, number>();
  droppedRows.forEach((row) => {
    const bucket = bucketProgress(row.progress);
    dropProgressMap.set(bucket, (dropProgressMap.get(bucket) ?? 0) + 1);
  });

  const positiveExampleRows = buildRepresentativeRows(
    "representative_positive",
    positiveRows,
    positiveRepresentativeBuckets,
    REPRESENTATIVE_LIMIT,
  );
  const negativeExampleRows = buildRepresentativeRows(
    "representative_negative",
    negativeRows,
    negativeRepresentativeBuckets,
    REPRESENTATIVE_LIMIT,
  );
  const plannedExampleRows = buildRepresentativeRows(
    "representative_planned",
    plannedRows,
    plannedRepresentativeBuckets,
    PLANNED_LIMIT,
  );

  const positiveTopGenreKeys = topPositiveGenres.map((row) => row[1]);
  const negativeTopGenreKeys = topNegativeGenres.map((row) => row[1]);
  const topPositiveDirectorKeys = topPositiveDirectors.map((row) => row[1]);

  const positiveAxes: TasteAxis[] = [
    {
      key: "positive_1",
      value: "authorial crime/thriller with strong tone",
      notes: [joinList(positiveTopGenreKeys.filter((key) => /крим|crime|thriller|трилер|mystery|детектив/i.test(key)).slice(0, 4)), pickExamples(positiveRows.filter((row) => positiveRepresentativeBuckets[0].matcher(row)), 3)]
        .filter(Boolean)
        .join("|"),
      enabled:
        positiveRows.some((row) => positiveRepresentativeBuckets[0].matcher(row)) ||
        positiveTopGenreKeys.some((key) => /крим|crime|thriller|трилер|mystery|детектив/i.test(key)),
    },
    {
      key: "positive_2",
      value: "dark atmosphere as pressure",
      notes: [pickExamples(positiveRows.filter((row) => positiveRepresentativeBuckets[1].matcher(row)), 3), joinList(positiveTopGenreKeys.filter((key) => /drama|драма|thriller|трилер|horror|жах/i.test(key)).slice(0, 4))]
        .filter(Boolean)
        .join("|"),
      enabled: positiveRows.some((row) => positiveRepresentativeBuckets[1].matcher(row)),
    },
    {
      key: "positive_3",
      value: "black absurdity with weight",
      notes: [pickExamples(positiveRows.filter((row) => positiveRepresentativeBuckets[2].matcher(row)), 3), joinList(positiveTopGenreKeys.filter((key) => /comedy|комедія/i.test(key)).slice(0, 3))]
        .filter(Boolean)
        .join("|"),
      enabled: positiveRows.some((row) => positiveRepresentativeBuckets[2].matcher(row)),
    },
    {
      key: "positive_4",
      value: "stylized genre confidence",
      notes: [joinList(topPositiveDirectorKeys.slice(0, 4)), pickExamples(positiveRows.filter((row) => positiveRepresentativeBuckets[3].matcher(row)), 3)]
        .filter(Boolean)
        .join("|"),
      enabled:
        topPositiveDirectorKeys.length > 0 &&
        positiveRows.some((row) =>
          hasAnyGenreGroup(row, [GENRE_GROUPS.action, GENRE_GROUPS.thriller, GENRE_GROUPS.scienceFiction]),
        ),
    },
    {
      key: "positive_5",
      value: "historical/contextual weight",
      notes: [pickExamples(positiveRows.filter((row) => positiveRepresentativeBuckets[4].matcher(row)), 3), joinList(positiveTopGenreKeys.filter((key) => /history|істор|war|війна|biography|біограф|documentary|документ/i.test(key)).slice(0, 4))]
        .filter(Boolean)
        .join("|"),
      enabled: positiveRows.some((row) => positiveRepresentativeBuckets[4].matcher(row)),
    },
    {
      key: "positive_6",
      value: "competent characters under pressure",
      notes: [pickExamples(positiveRows.filter((row) => positiveRepresentativeBuckets[5].matcher(row)), 3), joinList(topPositiveDirectorKeys.slice(0, 3))]
        .filter(Boolean)
        .join("|"),
      enabled: positiveRows.some((row) => positiveRepresentativeBuckets[5].matcher(row)),
    },
    {
      key: "positive_7",
      value: "conscious outrageous trash as separate value scale",
      notes: pickExamples(positiveRows.filter((row) => positiveRepresentativeBuckets[3].matcher(row)), 3),
      enabled: positiveRows.some((row) => positiveRepresentativeBuckets[3].matcher(row)),
    },
  ];

  const negativeAxes: TasteAxis[] = [
    {
      key: "negative_1",
      value: "prestige pacing without early hook",
      notes: [
        pickExamples(negativeRows.filter((row) => negativeRepresentativeBuckets[0].matcher(row)), 3),
        `1_20=${dropProgressMap.get("1_20") ?? 0}`,
      ]
        .filter(Boolean)
        .join("|"),
      enabled:
        negativeRows.some((row) => negativeRepresentativeBuckets[0].matcher(row)) ||
        (dropProgressMap.get("1_20") ?? 0) > 0,
    },
    {
      key: "negative_2",
      value: "early prestige rejection",
      notes: pickExamples(negativeRows.filter((row) => negativeRepresentativeBuckets[1].matcher(row)), 3),
      enabled: negativeRows.some((row) => negativeRepresentativeBuckets[1].matcher(row)),
    },
    {
      key: "negative_3",
      value: "sterile formulaic action",
      notes: [
        pickExamples(
          negativeRows.filter((row) =>
            hasAnyGenreGroup(row, [GENRE_GROUPS.action, GENRE_GROUPS.adventure, GENRE_GROUPS.scienceFiction]),
          ),
          3,
        ),
        joinList(negativeTopGenreKeys.filter((key) => /action|бойовик|екшн|adventure|пригод|science/i.test(key)).slice(0, 4)),
      ]
        .filter(Boolean)
        .join("|"),
      enabled: negativeRows.some((row) =>
        hasAnyGenreGroup(row, [GENRE_GROUPS.action, GENRE_GROUPS.adventure, GENRE_GROUPS.scienceFiction]),
      ),
    },
    {
      key: "negative_4",
      value: "concept over engagement",
      notes: pickExamples(negativeRows.filter((row) => negativeRepresentativeBuckets[3].matcher(row)), 3),
      enabled: negativeRows.some((row) => negativeRepresentativeBuckets[3].matcher(row)),
    },
    {
      key: "negative_5",
      value: "romantic or motivational catharsis",
      notes: pickExamples(negativeRows.filter((row) => negativeRepresentativeBuckets[4].matcher(row)), 3),
      enabled: negativeRows.some((row) => negativeRepresentativeBuckets[4].matcher(row)),
    },
    {
      key: "negative_6",
      value: "franchise autopilot",
      notes: pickExamples(negativeRows.filter((row) => negativeRepresentativeBuckets[2].matcher(row)), 3),
      enabled: negativeRows.some((row) => negativeRepresentativeBuckets[2].matcher(row)),
    },
  ];

  const rowsForCsv: TasteProfileRow[] = [
    ["summary", "total_titles", String(rows.length), ""],
    ["summary", "completed_titles", String(completedRows.length), getShare(completedRows.length, rows.length)],
    ["summary", "planned_titles", String(plannedRows.length), getShare(plannedRows.length, rows.length)],
    ["summary", "dropped_titles", String(droppedRows.length), getShare(droppedRows.length, rows.length)],
    ["summary", "positive_titles", String(positiveRows.length), ""],
    ["summary", "negative_titles", String(negativeRows.length), ""],
    ["summary", "neutral_titles", String(neutralRows.length), ""],
    ["status_rules", "completed", "progress=100", ""],
    ["status_rules", "planned", "progress=0", ""],
    ["status_rules", "dropped", "progress=1..99", ""],
    ["threshold_rules", "positive_rule", "completed_and_rating_gte", String(POSITIVE_THRESHOLD)],
    ["threshold_rules", "negative_rule", "dropped_or_completed_rating_lt", String(NEGATIVE_THRESHOLD)],
    ["threshold_rules", "neutral_rule", "completed_and_rating_between", "3..3.5"],
    ...topPositiveGenres,
    ...topNegativeGenres,
    ...topPositiveDirectors,
    ...topNegativeDirectors,
    ...buildDroppedTopRows("top_dropped_genres", droppedRows, (row) => row.genres),
    ...buildDroppedTopRows("top_dropped_directors", droppedRows, (row) => row.directors),
    (["drop_progress_buckets", "1_20", String(dropProgressMap.get("1_20") ?? 0), getShare(dropProgressMap.get("1_20") ?? 0, droppedRows.length)]),
    (["drop_progress_buckets", "21_50", String(dropProgressMap.get("21_50") ?? 0), getShare(dropProgressMap.get("21_50") ?? 0, droppedRows.length)]),
    (["drop_progress_buckets", "51_80", String(dropProgressMap.get("51_80") ?? 0), getShare(dropProgressMap.get("51_80") ?? 0, droppedRows.length)]),
    (["drop_progress_buckets", "81_99", String(dropProgressMap.get("81_99") ?? 0), getShare(dropProgressMap.get("81_99") ?? 0, droppedRows.length)]),
    ...positiveExampleRows,
    ...negativeExampleRows,
    ...plannedExampleRows,
    ...positiveAxes
      .filter((axis) => axis.enabled)
      .slice(0, 8)
      .map<TasteProfileRow>((axis) => ["inferred_axes", axis.key, axis.value, axis.notes]),
    ...negativeAxes
      .filter((axis) => axis.enabled)
      .slice(0, 6)
      .map<TasteProfileRow>((axis) => ["inferred_axes", axis.key, axis.value, axis.notes]),
  ];

  return {
    headers: ["section", "key", "value", "notes"],
    rows: rowsForCsv,
  };
};

export const buildKnownTitlesForLlm = (rows: FilmLlmExportRow[]) =>
  Array.from(
    new Set(
      rows.map((row) => {
        const title = pickTitleOriginal(row) || pickTitleLocal(row);
        return row.year ? `${title} (${row.year})` : title;
      }),
    ),
  ).sort((left, right) => left.localeCompare(right, "uk"));

export const buildLlmRecoContextText = (
  rows: FilmLlmExportRow[],
  options?: { includeKnownTitles?: boolean },
) => {
  const includeKnownTitles = options?.includeKnownTitles ?? true;
  const statusOf = (row: FilmLlmExportRow) => normalizeStatus(row.progress);
  const completedRows = rows.filter((row) => statusOf(row) === "completed");
  const plannedRows = rows.filter((row) => statusOf(row) === "planned");
  const droppedRows = rows.filter((row) => statusOf(row) === "dropped");

  const tasteProfileRows = buildTasteProfileForLlmCsv(rows).rows;
  const positiveAxes = tasteProfileRows
    .filter((row) => row[0] === "inferred_axes" && row[1].startsWith("positive_"))
    .map((row) => row[2])
    .slice(0, 8);
  const negativeAxes = tasteProfileRows
    .filter((row) => row[0] === "inferred_axes" && row[1].startsWith("negative_"))
    .map((row) => row[2])
    .slice(0, 6);
  const representativePositive = tasteProfileRows
    .filter((row) => row[0] === "representative_positive")
    .map((row) => row[2])
    .slice(0, 12);
  const representativeNegative = tasteProfileRows
    .filter((row) => row[0] === "representative_negative")
    .map((row) => row[2])
    .slice(0, 12);
  const representativePlanned = tasteProfileRows
    .filter((row) => row[0] === "representative_planned")
    .map((row) => row[2])
    .slice(0, 6);

  const plannedGenreKeys = mapToSortedEntries(buildCountMap(plannedRows, (row) => row.genres))
    .slice(0, 5)
    .map((entry) => entry.key);
  const plannedDirectorKeys = mapToSortedEntries(buildCountMap(plannedRows, (row) => row.directors))
    .slice(0, 3)
    .map((entry) => entry.key);

  const interestVector: string[] = [];

  if (plannedRows.some((row) => hasAnyGenreGroup(row, [GENRE_GROUPS.crime, GENRE_GROUPS.thriller]))) {
    interestVector.push("planned queue leans toward crime/thriller pressure stories");
  }
  if (
    plannedRows.some((row) =>
      hasAnyGenreGroup(row, [GENRE_GROUPS.history, GENRE_GROUPS.war, GENRE_GROUPS.biography]),
    )
  ) {
    interestVector.push("planned queue keeps historical/contextual weight in play");
  }
  if (plannedRows.some((row) => hasAnyGenreGroup(row, [GENRE_GROUPS.mystery, GENRE_GROUPS.horror]))) {
    interestVector.push("planned queue keeps dark mystery and unease in play");
  }
  if (
    plannedRows.some((row) =>
      hasAnyGenreGroup(row, [GENRE_GROUPS.action, GENRE_GROUPS.scienceFiction, GENRE_GROUPS.adventure]),
    )
  ) {
    interestVector.push("planned queue leaves room for stylized action and sci-fi");
  }
  if (
    plannedRows.some(
      (row) =>
        hasAnyGenreGroup(row, [GENRE_GROUPS.comedy]) &&
        hasAnyGenreGroup(row, [GENRE_GROUPS.crime, GENRE_GROUPS.drama]),
    )
  ) {
    interestVector.push("planned queue still allows black absurdity");
  }
  if (plannedGenreKeys.length > 0) {
    interestVector.push(`planned genres: ${joinList(plannedGenreKeys)}`);
  }
  if (plannedDirectorKeys.length > 0) {
    interestVector.push(`planned directors: ${joinList(plannedDirectorKeys)}`);
  }
  if (representativePlanned.length > 0) {
    interestVector.push(`planned anchors: ${joinList(representativePlanned.slice(0, 5))}`);
  }
  if (positiveAxes.length > 0) {
    interestVector.push(`align with proven positives: ${joinList(positiveAxes.slice(0, 3))}`);
  }
  if (negativeAxes.length > 0) {
    interestVector.push(`avoid repeats of known negatives: ${joinList(negativeAxes.slice(0, 2))}`);
  }

  const knownTitles = buildKnownTitlesForLlm(rows);

  const lines = [
    "USER COLLECTION RECOMMENDATION CONTEXT",
    "",
    "RULES",
    "- Recommend only titles not present in the user's collection.",
    "- progress=100 means completed.",
    "- progress=1..99 means dropped / not finished.",
    "- progress=0 means planned.",
    "- Any title already present in collection must not be recommended again.",
    "",
    "SUMMARY",
    `- Total titles: ${rows.length}`,
    `- Completed: ${completedRows.length}`,
    `- Dropped: ${droppedRows.length}`,
    `- Planned: ${plannedRows.length}`,
    "",
    "TASTE PROFILE",
    "Positive axes:",
    ...positiveAxes.map((axis) => `- ${axis}`),
    "Negative axes:",
    ...negativeAxes.map((axis) => `- ${axis}`),
    "",
    "REPRESENTATIVE POSITIVE TITLES",
    ...representativePositive.slice(0, 12).map((title) => `- ${title}`),
    "",
    "REPRESENTATIVE NEGATIVE TITLES",
    ...representativeNegative.slice(0, 12).map((title) => `- ${title}`),
    "",
    "CURRENT INTEREST VECTOR",
    ...interestVector.slice(0, 10).map((item) => `- ${item}`),
  ];

  if (includeKnownTitles) {
    lines.push("", "KNOWN TITLES", ...knownTitles);
  }

  return lines.join("\n");
};
