"use client";

import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { supabase } from "@/lib/supabase/client";
import ProfileAnalysisUserView from "./ProfileAnalysisUserView";
import {
  DEFAULT_SCOPE_MATURITY_THRESHOLDS,
  buildScopeBreakdownEntry,
  getScopeMaturityLabel,
} from "../statistics/lib/scopeReadiness";
import {
  buildFilmProfilePromptRows,
  buildFilmScopeProfilePrompt,
  type FilmPromptMediaType,
} from "@/lib/profile-analysis/film";
import type {
  FilmProfileAnalysisResult,
  FilmProfileSystemLayer,
  FilmProfileUserLayer,
} from "@/lib/profile-analysis/types";
import type {
  ScopeBreakdownEntry,
  ScopeMaturityStatus,
} from "../statistics/statisticsTypes";
import ProfilePromptPreviewModal from "./ProfilePromptPreviewModal";
import styles from "../statistics/StatisticsPage.module.css";

type FilmMediaType = "movie" | "tv";

type RawFilmRow = {
  created_at: string | null;
  is_viewed: boolean | null;
  rating: number | null;
  view_percent: number | null;
  items:
    | {
        actors?: string | null;
        genres?: string | null;
        year?: number | null;
        director?: string | null;
        title?: string | null;
        film_media_type?: "movie" | "tv" | null;
        type?: string | null;
      }
    | Array<{
        actors?: string | null;
        genres?: string | null;
        year?: number | null;
        director?: string | null;
        title?: string | null;
        film_media_type?: "movie" | "tv" | null;
        type?: string | null;
      }>
    | null;
};

type FilmProfileRow = {
  title: string;
  year: string;
  director: string;
  genres: string;
  actors: string;
  createdAt: string | null;
  isViewed: boolean;
  rating: number | null;
  viewPercent: number;
  mediaType: FilmMediaType;
};

type PreviewModalState = {
  title: string;
  content: string;
};

type FilmAnalysisState = {
  userProfile: FilmProfileUserLayer;
  systemProfile: FilmProfileSystemLayer;
  sourceTitlesCount: number;
  analyzedAt: string;
};

type RawFilmAnalysisRow = {
  scope_value: string;
  user_profile: FilmProfileUserLayer;
  system_profile: FilmProfileSystemLayer;
  source_titles_count: number | null;
  analyzed_at: string;
};

const buildFilmAnalysisState = (
  analysis: {
    userProfile: FilmProfileUserLayer;
    systemProfile: FilmProfileSystemLayer;
    sourceTitlesCount: number;
    analyzedAt: string;
  } | null,
  savedRow: RawFilmAnalysisRow | null,
): FilmAnalysisState | null => {
  if (savedRow) {
    return {
      userProfile: savedRow.user_profile,
      systemProfile: savedRow.system_profile,
      sourceTitlesCount: savedRow.source_titles_count ?? analysis?.sourceTitlesCount ?? 0,
      analyzedAt: savedRow.analyzed_at,
    };
  }

  if (!analysis) {
    return null;
  }

  return {
    userProfile: analysis.userProfile,
    systemProfile: analysis.systemProfile,
    sourceTitlesCount: analysis.sourceTitlesCount,
    analyzedAt: analysis.analyzedAt,
  };
};

const getFilmScopeLabel = (mediaType: FilmMediaType) =>
  mediaType === "tv" ? "Серіали" : "Кіно";

const normalizeFilmMediaType = (value?: string | null): FilmMediaType =>
  value === "tv" ? "tv" : "movie";

const getMediaTypeByScopeLabel = (scopeLabel: string): FilmPromptMediaType =>
  scopeLabel === "Серіали" ? "tv" : "movie";

const isAddedInLast30Days = (value: string | null, now: Date) => {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return now.getTime() - parsed.getTime() <= 30 * 24 * 60 * 60 * 1000;
};

const getStatusBadgeClassName = (status: ScopeMaturityStatus) =>
  `${styles.statusBadge} ${
    status === "working"
      ? styles.statusBadgeWorking
      : status === "exploratory"
        ? styles.statusBadgeExploratory
        : styles.statusBadgeInsufficient
  }`;

const getProfileSufficiencyLabel = (status: ScopeMaturityStatus) => {
  if (status === "working") return "Висока";
  if (status === "exploratory") return "Середня";
  return "Низька";
};

const formatMissingRequirement = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} ${one}`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} ${few}`;
  }

  return `${count} ${many}`;
};

const joinMissingRequirements = (requirements: string[]) => {
  if (requirements.length === 0) return "";
  if (requirements.length === 1) return requirements[0];
  if (requirements.length === 2) return `${requirements[0]} і ${requirements[1]}`;
  return `${requirements.slice(0, -1).join(", ")} і ${requirements[requirements.length - 1]}`;
};

const getProfileSufficiencyReason = (entry: ScopeBreakdownEntry) => {
  if (entry.maturityStatus === "working") {
    return "Даних достатньо для побудови профілю";
  }

  const missingTitlesForExploratory = Math.max(
    0,
    DEFAULT_SCOPE_MATURITY_THRESHOLDS.exploratoryMinTitles - entry.totalTitles,
  );
  const missingTitlesForWorking = Math.max(
    0,
    DEFAULT_SCOPE_MATURITY_THRESHOLDS.workingTotalTitles - entry.totalTitles,
  );
  const missingRatingsForWorking = Math.max(
    0,
    DEFAULT_SCOPE_MATURITY_THRESHOLDS.workingRatedTitles - entry.ratedTitles,
  );
  const missingEngagedForWorking = Math.max(
    0,
    DEFAULT_SCOPE_MATURITY_THRESHOLDS.workingEngagedTitles - entry.engagedTitles,
  );
  const missingRequirementsForWorking = [
    missingTitlesForWorking > 0
      ? formatMissingRequirement(missingTitlesForWorking, "тайтл", "тайтли", "тайтлів")
      : null,
    missingRatingsForWorking > 0
      ? formatMissingRequirement(missingRatingsForWorking, "оцінка", "оцінки", "оцінок")
      : null,
    missingEngagedForWorking > 0
      ? formatMissingRequirement(
          missingEngagedForWorking,
          "переглянута позиція",
          "переглянуті позиції",
          "переглянутих позицій",
        )
      : null,
  ].filter((value): value is string => Boolean(value));

  if (entry.maturityStatus === "exploratory") {
    return `Профіль уже можна показувати, але для рівня «Висока» ще потрібно: ${joinMissingRequirements(missingRequirementsForWorking)}.`;
  }

  return `Щоб профіль з’явився, потрібно ще щонайменше ${formatMissingRequirement(missingTitlesForExploratory, "тайтл", "тайтли", "тайтлів")}. Для Високої достатності ще потрібно: ${joinMissingRequirements(missingRequirementsForWorking)}.`;
};

const formatAnalysisDate = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("uk-UA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getNewFilmViewsAfterAnalysis = (
  rows: FilmProfileRow[],
  analyzedAt: string,
  mediaType: FilmPromptMediaType,
) => {
  const analyzedAtTime = new Date(analyzedAt).getTime();
  if (Number.isNaN(analyzedAtTime)) return 0;
  return rows.filter((row) => {
    if (row.mediaType !== mediaType || !row.isViewed || !row.createdAt) {
      return false;
    }
    const createdAtTime = new Date(row.createdAt).getTime();
    return !Number.isNaN(createdAtTime) && createdAtTime > analyzedAtTime;
  }).length;
};

const getNewViewsSharePercent = (newViewsCount: number, sourceTitlesCount: number) => {
  if (sourceTitlesCount <= 0) return 0;
  return Math.round((newViewsCount / sourceTitlesCount) * 100);
};

const formatNewViewsMetric = (newViewsCount: number, sourceTitlesCount: number) =>
  `${newViewsCount} (${getNewViewsSharePercent(newViewsCount, sourceTitlesCount)}%)`;

const getProfileFreshnessLabel = (
  analysis: FilmAnalysisState | undefined,
  newViewsCount: number,
  sourceTitlesCount: number,
) => {
  if (!analysis) return "Потребує аналізу";

  const analyzedAtTime = new Date(analysis.analyzedAt).getTime();
  if (Number.isNaN(analyzedAtTime)) return "Потребує оновлення";

  const ageDays = (Date.now() - analyzedAtTime) / (24 * 60 * 60 * 1000);
  const newViewsSharePercent = getNewViewsSharePercent(newViewsCount, sourceTitlesCount);

  if (newViewsSharePercent > 10 && ageDays > 90) {
    return "Потребує оновлення";
  }

  if (newViewsSharePercent > 5 && ageDays > 30) {
    return "Рекомендується оновлення";
  }

  return "Актуальний";
};

const getProfileFreshnessReason = (
  analysis: FilmAnalysisState | undefined,
  newViewsCount: number,
  sourceTitlesCount: number,
  canAnalyzeProfile: boolean,
) => {
  const freshnessLabel = getProfileFreshnessLabel(analysis, newViewsCount, sourceTitlesCount);
  if (freshnessLabel === "Потребує аналізу") {
    return canAnalyzeProfile
      ? "Профіль ще не аналізувався. Натисніть «Проаналізувати профіль», щоб побудувати профіль."
      : "Додайте достатньо тайтлів, щоб провести аналіз";
  }
  if (freshnessLabel === "Рекомендується оновлення") {
    return "Профіль частково застарів";
  }
  if (freshnessLabel === "Потребує оновлення") {
    return "Профіль суттєво застарів і потребує нового аналізу";
  }
  return "Після останнього аналізу змін замало для обов’язкового оновлення";
};

const renderScopeCard = (
  entry: ScopeBreakdownEntry,
  rows: FilmProfileRow[],
  analysis: FilmAnalysisState | undefined,
  isAnalyzing: boolean,
  analysisError: string | undefined,
  onAnalyzeProfile: (entry: ScopeBreakdownEntry) => void,
  onPreviewPrompt: (entry: ScopeBreakdownEntry) => void,
) => (
  (() => {
    const mediaType = getMediaTypeByScopeLabel(entry.scopeValue);
    const promptRows = buildFilmProfilePromptRows(rows, mediaType);
    const sourceTitlesCount = analysis?.sourceTitlesCount ?? promptRows.length;
    const newViewsCount = analysis
      ? getNewFilmViewsAfterAnalysis(rows, analysis.analyzedAt, mediaType)
      : 0;
    const canAnalyzeProfile = entry.maturityStatus === "working" && promptRows.length > 0;
    const analyzeTooltip =
      promptRows.length === 0
        ? "Для аналізу потрібні переглянуті тайтли в цьому scope."
        : entry.maturityStatus !== "working"
          ? "Для аналізу профілю потрібна висока достатність даних."
          : undefined;
    const analyzeButtonLabel = analysis ? "Оновити профіль" : "Проаналізувати профіль";

    return (
      <article key={entry.scopeValue} className={styles.nestedCard}>
        <div className={styles.statusRow}>
          <h4 className={styles.nestedTitle}>{entry.scopeValue}</h4>
          <span className={getStatusBadgeClassName(entry.maturityStatus)}>
            {getScopeMaturityLabel(entry.maturityStatus)}
          </span>
        </div>
        <div className={styles.scopeActionRow}>
          <div className={styles.scopeActionButtons}>
            <span className={styles.tooltipAnchor}>
              <button
                type="button"
                className="btnBase btnSecondary"
                onClick={() => onAnalyzeProfile(entry)}
                disabled={isAnalyzing || !canAnalyzeProfile}
              >
                {isAnalyzing ? "Аналізуємо..." : analyzeButtonLabel}
              </button>
              {!isAnalyzing && analyzeTooltip ? (
                <span className={styles.tooltipBubble} role="tooltip">
                  {analyzeTooltip}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              className="btnBase btnSecondary"
              onClick={() => onPreviewPrompt(entry)}
            >
              Переглянути промпт
            </button>
          </div>
          <span className={styles.scopeActionMeta}>
            Останній аналіз: {formatAnalysisDate(analysis?.analyzedAt)}
          </span>
        </div>
        <div className={styles.metricsGrid}>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Побудовано на основі</span>
            <strong className={styles.metricValue}>
              {sourceTitlesCount} переглянутих тайтлів
            </strong>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Нових переглядів після аналізу</span>
            <strong className={styles.metricValue}>
              {formatNewViewsMetric(newViewsCount, sourceTitlesCount)}
            </strong>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Достатність профілю</span>
            <strong className={styles.metricValue}>
              {getProfileSufficiencyLabel(entry.maturityStatus)}
            </strong>
            <p className={styles.analysisMeta}>
              {getProfileSufficiencyReason(entry)}
            </p>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Актуальність</span>
            <strong className={styles.metricValue}>
              {getProfileFreshnessLabel(analysis, newViewsCount, sourceTitlesCount)}
            </strong>
            <p className={styles.analysisMeta}>
              {getProfileFreshnessReason(
                analysis,
                newViewsCount,
                sourceTitlesCount,
                canAnalyzeProfile,
              )}
            </p>
          </div>
        </div>
        {analysisError ? <div className={styles.emptyBox}>{analysisError}</div> : null}
        {!analysis && promptRows.length === 0 ? (
          <div className={styles.emptyBox}>
            Для аналізу потрібні переглянуті тайтли в цьому scope.
          </div>
        ) : null}
        {analysis ? <ProfileAnalysisUserView mediaKind="film" analysis={analysis.userProfile} /> : null}
      </article>
    );
  })()
);

export default function ProfileFilmsSection() {
  const [rows, setRows] = useState<FilmProfileRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [previewModalState, setPreviewModalState] = useState<PreviewModalState | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [analysisByScope, setAnalysisByScope] = useState<Record<string, FilmAnalysisState>>({});
  const [analysisErrorByScope, setAnalysisErrorByScope] = useState<Record<string, string>>({});
  const [analyzingScope, setAnalyzingScope] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadRows = async () => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          if (!isCancelled) {
            setUserId(null);
            setRows([]);
            setAnalysisByScope({});
            setErrorMessage("Потрібна авторизація.");
          }
          return;
        }

        if (!isCancelled) {
          setUserId(user.id);
        }

        const pageSize = 1000;
        let from = 0;
        const collected: FilmProfileRow[] = [];

        while (true) {
          const { data, error } = await supabase
            .from("user_views")
            .select(
              "created_at, is_viewed, rating, view_percent, items:items!inner(title, year, director, genres, actors, film_media_type, type)",
            )
            .eq("user_id", user.id)
            .eq("items.type", "film")
            .order("created_at", { ascending: false })
            .range(from, from + pageSize - 1);

          if (error) {
            if (!isCancelled) {
              setRows([]);
              setErrorMessage("Не вдалося завантажити профайл кіно.");
            }
            return;
          }

          const chunkRaw = (data ?? []) as RawFilmRow[];
          if (chunkRaw.length === 0) {
            break;
          }

          const chunk = chunkRaw.map((row) => {
            const item = Array.isArray(row.items) ? row.items[0] : row.items;
            return {
              title: item?.title?.trim() || "Без назви",
              year: item?.year == null ? "" : String(item.year),
              director: item?.director?.trim() || "",
              genres: item?.genres?.trim() || "",
              actors: item?.actors?.trim() || "",
              createdAt: row.created_at,
              isViewed: Boolean(row.is_viewed),
              rating: row.rating,
              viewPercent: Math.max(0, Math.min(100, row.view_percent ?? 0)),
              mediaType: normalizeFilmMediaType(item?.film_media_type),
            };
          });

          collected.push(...chunk);
          if (chunkRaw.length < pageSize) {
            break;
          }
          from += pageSize;
        }

        const { data: analysisData, error: analysisError } = await supabase
          .from("profile_analyses")
          .select("scope_value, user_profile, system_profile, source_titles_count, analyzed_at")
          .eq("user_id", user.id)
          .eq("media_kind", "film")
          .eq("scope_type", "format");

        const nextAnalysisByScope = analysisError
          ? {}
          : ((analysisData ?? []) as RawFilmAnalysisRow[]).reduce<Record<string, FilmAnalysisState>>(
              (accumulator, row) => {
                accumulator[row.scope_value] = {
                  userProfile: row.user_profile,
                  systemProfile: row.system_profile,
                  sourceTitlesCount: row.source_titles_count ?? 0,
                  analyzedAt: row.analyzed_at,
                };
                return accumulator;
              },
              {},
            );

        if (!isCancelled) {
          setRows(collected);
          setAnalysisByScope(nextAnalysisByScope);
        }
      } catch (error) {
        if (!isCancelled) {
          setUserId(null);
          setRows([]);
          setAnalysisByScope({});
          setErrorMessage(
            error instanceof Error ? error.message : "Не вдалося завантажити профайл кіно.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadRows();

    return () => {
      isCancelled = true;
    };
  }, []);

  const scopeEntries = useMemo(() => {
    const now = new Date();
    const mediaTypes: FilmMediaType[] = ["movie", "tv"];

    return mediaTypes.map((mediaType) => {
      const scopedRows = rows.filter((row) => row.mediaType === mediaType);
      const ratings = scopedRows
        .map((row) => row.rating)
        .filter((value): value is number => value !== null);
      const ratedTitles = ratings.length;
      const engagedTitles = scopedRows.filter((row) => row.isViewed).length;
      const completedTitles = scopedRows.filter((row) => row.isViewed && row.viewPercent >= 100).length;
      const droppedTitles = scopedRows.filter((row) => row.isViewed && row.viewPercent < 100).length;
      const plannedTitles = scopedRows.filter((row) => !row.isViewed).length;
      const highRatedCount = scopedRows.filter((row) => (row.rating ?? 0) >= 4).length;
      const lowRatedCount = scopedRows.filter(
        (row) => row.rating !== null && row.rating < 3,
      ).length;

      return buildScopeBreakdownEntry({
        scopeType: "format",
        scopeValue: getFilmScopeLabel(mediaType),
        totalTitles: scopedRows.length,
        ratedTitles,
        engagedTitles,
        completedTitles,
        droppedTitles,
        plannedTitles,
        addedLast30Days: scopedRows.filter((row) => isAddedInLast30Days(row.createdAt, now)).length,
        ratings,
        highRatedCount,
        lowRatedCount,
        topLikedGenres: [],
        topDislikedGenres: [],
        topDroppedGenres: [],
        monthlyEntries: [],
      });
    });
  }, [rows]);

  const handlePreviewPrompt = (entry: ScopeBreakdownEntry) => {
    const mediaType = getMediaTypeByScopeLabel(entry.scopeValue);
    setPreviewModalState({
      title: `Preview prompt — ${entry.scopeValue}`,
      content: buildFilmScopeProfilePrompt(buildFilmProfilePromptRows(rows, mediaType), mediaType),
    });
  };

  const handleAnalyzeProfile = async (entry: ScopeBreakdownEntry) => {
    if (!userId) {
      setAnalysisErrorByScope((prev) => ({
        ...prev,
        [entry.scopeValue]: "Потрібна авторизація для аналізу профілю.",
      }));
      return;
    }

    const mediaType = getMediaTypeByScopeLabel(entry.scopeValue);
    const promptRows = buildFilmProfilePromptRows(rows, mediaType);
    if (promptRows.length === 0) {
      setAnalysisErrorByScope((prev) => ({
        ...prev,
        [entry.scopeValue]: "Для аналізу потрібні переглянуті тайтли в цьому scope.",
      }));
      return;
    }

    setAnalyzingScope(entry.scopeValue);
    setAnalysisErrorByScope((prev) => {
      const next = { ...prev };
      delete next[entry.scopeValue];
      return next;
    });

    try {
      const response = await fetch("/api/openai/film-profile-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows: promptRows,
          mediaType,
        }),
      });
      const data = (await response.json()) as
        | (FilmProfileAnalysisResult & {
            error?: string;
          })
        | {
            error?: string;
          };

      if (!response.ok || !("user_profile_uk" in data) || !("system_profile_en" in data)) {
        setAnalysisErrorByScope((prev) => ({
          ...prev,
          [entry.scopeValue]: data.error || "Не вдалося побудувати профіль.",
        }));
        return;
      }

      const optimisticAnalysis: FilmAnalysisState = {
        userProfile: data.user_profile_uk,
        systemProfile: data.system_profile_en,
        sourceTitlesCount: promptRows.length,
        analyzedAt: new Date().toISOString(),
      };

      flushSync(() => {
        setAnalysisByScope((prev) => ({
          ...prev,
          [entry.scopeValue]: optimisticAnalysis,
        }));
      });

      const { data: savedAnalysis, error: saveError } = await supabase
        .from("profile_analyses")
        .upsert(
          {
            user_id: userId,
            media_kind: "film",
            scope_type: "format",
            scope_value: entry.scopeValue,
            user_profile: data.user_profile_uk,
            system_profile: data.system_profile_en,
            source_titles_count: promptRows.length,
            analyzed_at: optimisticAnalysis.analyzedAt,
          },
          {
            onConflict: "user_id,media_kind,scope_type,scope_value",
          },
        )
        .select("scope_value, user_profile, system_profile, source_titles_count, analyzed_at")
        .single();

      const nextAnalysisState = buildFilmAnalysisState(
        optimisticAnalysis,
        saveError ? null : (savedAnalysis as RawFilmAnalysisRow),
      );

      if (nextAnalysisState) {
        setAnalysisByScope((prev) => ({
          ...prev,
          [entry.scopeValue]: nextAnalysisState,
        }));
      }

      if (saveError) {
        setAnalysisErrorByScope((prev) => ({
          ...prev,
          [entry.scopeValue]:
            "Аналіз побудовано локально, але не вдалося зберегти результат у базі.",
        }));
        return;
      }
    } catch (error) {
      setAnalysisErrorByScope((prev) => ({
        ...prev,
        [entry.scopeValue]:
          error instanceof Error ? error.message : "Не вдалося побудувати профіль.",
      }));
    } finally {
      setAnalyzingScope(null);
    }
  };

  const workingScopes = scopeEntries.filter((entry) => entry.maturityStatus === "working");
  const exploratoryScopes = scopeEntries.filter((entry) => entry.maturityStatus === "exploratory");
  const insufficientScopes = scopeEntries.filter((entry) => entry.maturityStatus === "insufficient");

  if (isLoading) {
    return <p className={styles.message}>Завантаження профайлу кіно…</p>;
  }

  if (errorMessage) {
    return <p className={styles.message}>{errorMessage}</p>;
  }

  return (
    <div className={styles.content}>
      <section className={`${styles.section} ${styles.sectionFull}`}>
        <h2 className={styles.sectionTitle}>Профіль кіно та серіалів</h2>
        <p className={styles.sectionText}>
          Профіль відображає окремі смакові патерни для фільмів та серіалів, щоб рекомендації
          були точнішими.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Готові профілі</h3>
        {workingScopes.length > 0 ? (
          <div className={styles.list}>
            {workingScopes.map((entry) =>
              renderScopeCard(
                entry,
                rows,
                analysisByScope[entry.scopeValue],
                analyzingScope === entry.scopeValue,
                analysisErrorByScope[entry.scopeValue],
                handleAnalyzeProfile,
                handlePreviewPrompt,
              ),
            )}
          </div>
        ) : (
          <p className={styles.emptyBox}>Готових scope для кіно/серіалів поки немає.</p>
        )}
      </section>

      {exploratoryScopes.length > 0 ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Попередні scope</h3>
          <div className={styles.list}>
            {exploratoryScopes.map((entry) =>
              renderScopeCard(
                entry,
                rows,
                analysisByScope[entry.scopeValue],
                analyzingScope === entry.scopeValue,
                analysisErrorByScope[entry.scopeValue],
                handleAnalyzeProfile,
                handlePreviewPrompt,
              ),
            )}
          </div>
        </section>
      ) : null}

      {insufficientScopes.length > 0 ? (
        <section className={`${styles.section} ${styles.sectionFull}`}>
          <h3 className={styles.sectionTitle}>Недостатньо даних</h3>
          <div className={styles.sectionGrid}>
            {insufficientScopes.map((entry) =>
              renderScopeCard(
                entry,
                rows,
                analysisByScope[entry.scopeValue],
                analyzingScope === entry.scopeValue,
                analysisErrorByScope[entry.scopeValue],
                handleAnalyzeProfile,
                handlePreviewPrompt,
              ),
            )}
          </div>
        </section>
      ) : null}
      <section className={`${styles.section} ${styles.sectionFull}`}>
        <h3 className={styles.sectionTitle}>Пояснення</h3>
        <p className={styles.sectionText}>
          Профіль з’являється, коли в розділі накопичується достатньо переглянутих тайтлів з
          оцінками.
        </p>
        <p className={styles.sectionText}>
          Щоб відкрити більше профілів, додавайте перегляди та ставте особистий рейтинг.
        </p>
      </section>
      {previewModalState ? (
        <ProfilePromptPreviewModal
          title={previewModalState.title}
          content={previewModalState.content}
          onClose={() => setPreviewModalState(null)}
        />
      ) : null}
    </div>
  );
}
