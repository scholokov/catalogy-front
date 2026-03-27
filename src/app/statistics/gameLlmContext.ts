export type GameLlmExportRow = {
  itemId: string;
  externalId: string;
  title: string;
  year: string;
  isViewed?: boolean;
  progress: number;
  rating: number | null;
  genres: string[];
  platforms: string[];
};

type ContextRow = [string, string, string, string];

const POSITIVE_THRESHOLD = 4;
const NEGATIVE_THRESHOLD = 3;

const normalizeStatus = (progress: number) => {
  if (progress >= 100) return "completed";
  if (progress <= 0) return "planned";
  return "dropped";
};

const joinList = (values: string[]) => values.join("|");

const getShare = (count: number, total: number) =>
  total > 0 ? `${Math.round((count / total) * 100)}%` : "";

const buildCountMap = (
  rows: GameLlmExportRow[],
  getter: (row: GameLlmExportRow) => string[],
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

const getKnownTitles = (rows: GameLlmExportRow[]) =>
  Array.from(
    new Set(rows.map((row) => (row.year ? `${row.title} (${row.year})` : row.title))),
  ).sort((left, right) => left.localeCompare(right, "uk"));

const hasKeyword = (values: string[], keywords: string[]) =>
  values.some((value) => keywords.some((keyword) => value.toLowerCase().includes(keyword)));

const pickGameplayTraits = (row: GameLlmExportRow) => {
  const traits: string[] = [];
  if (hasKeyword(row.genres, ["rpg", "role-playing", "action rpg", "souls"])) {
    traits.push("build freedom", "progression depth");
  }
  if (hasKeyword(row.genres, ["roguelike", "roguelite", "deckbuilder"])) {
    traits.push("replayable build variation");
  }
  if (hasKeyword(row.genres, ["strategy", "tactical", "turn-based", "simulation"])) {
    traits.push("tactical control", "meaningful decision cost");
  }
  if (hasKeyword(row.genres, ["action", "shooter", "fighting", "platformer"])) {
    traits.push("fast feedback", "skill expression");
  }
  if (hasKeyword(row.genres, ["adventure", "exploration", "metroidvania", "open world"])) {
    traits.push("high-value exploration");
  }
  if (hasKeyword(row.genres, ["survival", "horror", "stealth"])) {
    traits.push("pressure", "system tension");
  }
  if (traits.length === 0) {
    traits.push("clear mechanical identity", "rewarding mastery");
  }
  return Array.from(new Set(traits)).slice(0, 4);
};

const describePositiveAnchor = (row: GameLlmExportRow) => pickGameplayTraits(row).join(", ");

const describeNegativeAnchor = (row: GameLlmExportRow) => {
  if (hasKeyword(row.genres, ["narrative", "story", "visual novel", "adventure"])) {
    return "narrative-first appeal over mechanical engagement";
  }
  if (hasKeyword(row.genres, ["stealth"])) {
    return "stealth-first pacing without enough systemic payoff";
  }
  if (hasKeyword(row.genres, ["open world", "sandbox"])) {
    return "sprawling structure without tight mechanical identity";
  }
  if (hasKeyword(row.genres, ["strategy", "simulation"])) {
    return "slow, dry, low-feedback control loop";
  }
  if (hasKeyword(row.genres, ["mmo", "online", "moba"])) {
    return "repetitive loop instead of mastery-driven payoff";
  }
  return "engagement loop weaker than the user's taste core";
};

export const buildKnownTitlesForGamesLlm = (rows: GameLlmExportRow[]) => getKnownTitles(rows);

export const buildGameTasteProfileRows = (rows: GameLlmExportRow[]) => {
  const completedRows = rows.filter((row) => normalizeStatus(row.progress) === "completed");
  const plannedRows = rows.filter((row) => normalizeStatus(row.progress) === "planned");
  const droppedRows = rows.filter((row) => normalizeStatus(row.progress) === "dropped");
  const positiveRows = completedRows.filter(
    (row) => row.rating !== null && row.rating >= POSITIVE_THRESHOLD,
  );
  const negativeRows = rows.filter(
    (row) =>
      normalizeStatus(row.progress) === "dropped" ||
      (normalizeStatus(row.progress) === "completed" &&
        row.rating !== null &&
        row.rating < NEGATIVE_THRESHOLD),
  );

  const topPositiveGenres = mapToSortedEntries(buildCountMap(positiveRows, (row) => row.genres));
  const topNegativeGenres = mapToSortedEntries(buildCountMap(negativeRows, (row) => row.genres));
  const topPositivePlatforms = mapToSortedEntries(
    buildCountMap(positiveRows, (row) => row.platforms),
  );
  const topNegativePlatforms = mapToSortedEntries(buildCountMap(negativeRows, (row) => row.platforms));

  const gameplayAxes = [
    {
      key: "gameplay_1",
      value: "rpg progression and build depth matter more than presentation",
      enabled: positiveRows.some((row) =>
        hasKeyword(row.genres, ["rpg", "role-playing", "action rpg", "souls"]),
      ),
    },
    {
      key: "gameplay_2",
      value: "tactical or strategic control with meaningful decision cost",
      enabled: positiveRows.some((row) =>
        hasKeyword(row.genres, ["strategy", "tactical", "turn-based", "simulation"]),
      ),
    },
    {
      key: "gameplay_3",
      value: "fast feedback loops and visible skill expression",
      enabled: positiveRows.some((row) =>
        hasKeyword(row.genres, ["action", "shooter", "fighting", "platformer"]),
      ),
    },
    {
      key: "gameplay_4",
      value: "build experimentation and replayable systemic variation",
      enabled: positiveRows.some((row) =>
        hasKeyword(row.genres, ["roguelike", "roguelite", "deckbuilder", "rpg"]),
      ),
    },
    {
      key: "gameplay_5",
      value: "high-value exploration only when paired with pressure or payoff",
      enabled: positiveRows.some((row) =>
        hasKeyword(row.genres, ["adventure", "exploration", "metroidvania", "open world"]),
      ),
    },
    {
      key: "gameplay_6",
      value: "mechanical identity over cinematic prestige",
      enabled: positiveRows.length > 0,
    },
  ]
    .filter((entry) => entry.enabled)
    .map<ContextRow>((entry) => ["gameplay_axes", entry.key, entry.value, ""]);

  const experienceAxes = [
    {
      key: "experience_1",
      value: "pressure-heavy but rewarding play feel",
      enabled: positiveRows.some((row) =>
        hasKeyword(row.genres, ["survival", "horror", "souls", "stealth", "shooter"]),
      ),
    },
    {
      key: "experience_2",
      value: "strong single-player focus and self-contained engagement",
      enabled: positiveRows.length > 0,
    },
    {
      key: "experience_3",
      value: "harsh or dark atmosphere only when it supports mechanical tension",
      enabled: positiveRows.some((row) =>
        hasKeyword(row.genres, ["horror", "survival", "action", "stealth"]),
      ),
    },
    {
      key: "experience_4",
      value: "mastery satisfaction over passive consumption",
      enabled: positiveRows.length > 0,
    },
    {
      key: "experience_5",
      value: "clear feedback and momentum over dry friction",
      enabled: positiveRows.length > 0,
    },
  ]
    .filter((entry) => entry.enabled)
    .map<ContextRow>((entry) => ["experience_axes", entry.key, entry.value, ""]);

  const negativeAxes = [
    "avoid games whose appeal is mainly narrative prestige rather than mechanical engagement",
    "avoid slow, dry, low-feedback tactics with weak progression",
    "avoid stealth-first games unless they also provide strong systemic or tactical payoff",
    "avoid sprawling sandbox recommendations without tight mechanical identity",
    "avoid formulaic progression loops that feel repetitive rather than mastery-driven",
    "avoid live-service style repetition when it weakens single-player focus",
  ].map<ContextRow>((value, index) => ["anti_match_axes", String(index + 1), value, ""]);

  const representativePositive = positiveRows
    .slice()
    .sort((left, right) => (right.rating ?? 0) - (left.rating ?? 0))
    .slice(0, 10)
    .map<ContextRow>((row, index) => [
      "representative_positive",
      String(index + 1),
      row.year ? `${row.title} (${row.year})` : row.title,
      describePositiveAnchor(row),
    ]);
  const representativeNegative = negativeRows
    .slice(0, 10)
    .map<ContextRow>((row, index) => [
      "representative_negative",
      String(index + 1),
      row.year ? `${row.title} (${row.year})` : row.title,
      describeNegativeAnchor(row),
    ]);
  const representativePlanned = plannedRows
    .slice(0, 8)
    .map<ContextRow>((row, index) => [
      "representative_planned",
      String(index + 1),
      row.year ? `${row.title} (${row.year})` : row.title,
      describePositiveAnchor(row),
    ]);

  const rowsForProfile: ContextRow[] = [
    ["summary", "total_titles", String(rows.length), ""],
    [
      "summary",
      "completed_titles",
      String(completedRows.length),
      getShare(completedRows.length, rows.length),
    ],
    ["summary", "planned_titles", String(plannedRows.length), getShare(plannedRows.length, rows.length)],
    ["summary", "dropped_titles", String(droppedRows.length), getShare(droppedRows.length, rows.length)],
    ["status_rules", "completed", "progress=100", ""],
    ["status_rules", "planned", "progress=0", ""],
    ["status_rules", "dropped", "progress=1..99", ""],
    ...topPositiveGenres
      .slice(0, 5)
      .map<ContextRow>((entry) => ["top_positive_genres", entry.key, String(entry.value), ""]),
    ...topNegativeGenres
      .slice(0, 5)
      .map<ContextRow>((entry) => ["top_negative_genres", entry.key, String(entry.value), ""]),
    ...topPositivePlatforms
      .slice(0, 5)
      .map<ContextRow>((entry) => ["top_positive_platforms", entry.key, String(entry.value), ""]),
    ...topNegativePlatforms
      .slice(0, 5)
      .map<ContextRow>((entry) => ["top_negative_platforms", entry.key, String(entry.value), ""]),
    ...representativePositive,
    ...representativeNegative,
    ...representativePlanned,
    ...gameplayAxes,
    ...experienceAxes,
    ...negativeAxes,
  ];

  return rowsForProfile;
};

export const buildGameLlmRecoContextText = (
  rows: GameLlmExportRow[],
  options?: { includeKnownTitles?: boolean },
) => {
  const includeKnownTitles = options?.includeKnownTitles ?? true;
  const completedRows = rows.filter((row) => normalizeStatus(row.progress) === "completed");
  const plannedRows = rows.filter((row) => normalizeStatus(row.progress) === "planned");
  const droppedRows = rows.filter((row) => normalizeStatus(row.progress) === "dropped");
  const profileRows = buildGameTasteProfileRows(rows);

  const gameplayAxes = profileRows
    .filter((row) => row[0] === "gameplay_axes")
    .map((row) => row[2])
    .slice(0, 8);
  const experienceAxes = profileRows
    .filter((row) => row[0] === "experience_axes")
    .map((row) => row[2])
    .slice(0, 6);
  const antiMatchAxes = profileRows
    .filter((row) => row[0] === "anti_match_axes")
    .map((row) => row[2])
    .slice(0, 6);
  const representativePositive = profileRows
    .filter((row) => row[0] === "representative_positive")
    .map((row) => `${row[2]} — ${row[3]}`)
    .slice(0, 12);
  const representativeNegative = profileRows
    .filter((row) => row[0] === "representative_negative")
    .map((row) => `${row[2]} — ${row[3]}`)
    .slice(0, 12);
  const representativePlanned = profileRows
    .filter((row) => row[0] === "representative_planned")
    .map((row) => `${row[2]} — ${row[3]}`)
    .slice(0, 5);

  const plannedGenres = mapToSortedEntries(buildCountMap(plannedRows, (row) => row.genres))
    .slice(0, 5)
    .map((entry) => entry.key);
  const plannedPlatforms = mapToSortedEntries(buildCountMap(plannedRows, (row) => row.platforms))
    .slice(0, 4)
    .map((entry) => entry.key);

  const interestVector: string[] = [];
  if (plannedRows.some((row) => hasKeyword(row.genres, ["rpg", "role-playing", "action rpg"]))) {
    interestVector.push("prioritize rpg progression and build depth");
  }
  if (plannedRows.some((row) => hasKeyword(row.genres, ["strategy", "tactical", "simulation"]))) {
    interestVector.push("prioritize tactical or strategic control");
  }
  interestVector.push("prioritize strong single-player focus");
  interestVector.push("prioritize mechanical identity over cinematic presentation");
  if (plannedGenres.length > 0) {
    interestVector.push(`planned genres: ${joinList(plannedGenres)}`);
  }
  if (plannedPlatforms.length > 0) {
    interestVector.push(`planned platforms: ${joinList(plannedPlatforms)}`);
  }
  if (representativePlanned.length > 0) {
    interestVector.push(`planned anchors: ${joinList(representativePlanned)}`);
  }
  if (gameplayAxes.length > 0) {
    interestVector.push(`align with gameplay core: ${joinList(gameplayAxes.slice(0, 3))}`);
  }
  if (antiMatchAxes.length > 0) {
    interestVector.push(`avoid repeats of known negatives: ${joinList(antiMatchAxes.slice(0, 2))}`);
  }

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
    "Gameplay axes:",
    ...gameplayAxes.map((axis) => `- ${axis}`),
    "Experience / emotional axes:",
    ...experienceAxes.map((axis) => `- ${axis}`),
    "Explicit avoid / anti-match axes:",
    ...antiMatchAxes.map((axis) => `- ${axis}`),
    "",
    "REPRESENTATIVE POSITIVE TITLES",
    ...representativePositive.map((title) => `- ${title}`),
    "",
    "REPRESENTATIVE NEGATIVE TITLES",
    ...representativeNegative.map((title) => `- ${title}`),
    "",
    "CURRENT INTEREST VECTOR",
    ...interestVector.slice(0, 10).map((item) => `- ${item}`),
  ];

  if (includeKnownTitles) {
    lines.push("", "KNOWN TITLES", ...getKnownTitles(rows));
  }

  return lines.join("\n");
};
