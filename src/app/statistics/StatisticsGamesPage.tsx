"use client";

import { useCallback, useEffect, useState } from "react";
import { downloadCsvFile } from "@/lib/csv/downloadCsv";
import { getCsvTimestamp } from "@/lib/csv/getCsvTimestamp";
import StatisticsLoadingState from "./StatisticsLoadingState";
import StatisticsMonthlyList from "./StatisticsMonthlyList";
import StatisticsRankedList from "./StatisticsRankedList";
import type {
  GameStatisticsPayload,
  StatisticsSnapshotResponse,
  StatisticsSnapshotState,
} from "./statisticsTypes";
import { fetchStatisticsPayload } from "./lib/fetchStatisticsPayload";
import { formatNullableMetric } from "./lib/scopeReadiness";
import styles from "./StatisticsPage.module.css";

type StatisticsGamesPageProps = {
  onTotalChange: (count: number) => void;
  onExportReady?: (handler: (() => void) | null) => void;
};

const formatShare = (count: number, total: number) => {
  if (total <= 0) return "0%";
  return `${Math.round((count / total) * 100)}%`;
};

export default function StatisticsGamesPage({
  onTotalChange,
  onExportReady,
}: StatisticsGamesPageProps) {
  const [payload, setPayload] = useState<GameStatisticsPayload | null>(null);
  const [snapshotState, setSnapshotState] = useState<StatisticsSnapshotState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingStage, setLoadingStage] = useState<"auth" | "request" | "render">("auth");
  const [isSlowLoad, setIsSlowLoad] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const abortController = new AbortController();
    const slowTimer = window.setTimeout(() => {
      if (!isCancelled) {
        setIsSlowLoad(true);
      }
    }, 4000);
    const timeoutTimer = window.setTimeout(() => {
      abortController.abort();
    }, 45000);

    const loadStatistics = async () => {
      setIsLoading(true);
      setErrorMessage("");
      setIsSlowLoad(false);
      try {
        const nextPayload = await fetchStatisticsPayload<
          StatisticsSnapshotResponse<GameStatisticsPayload>
        >(
          "/api/statistics/games",
          {
            signal: abortController.signal,
            onStageChange: (stage) => {
              if (!isCancelled) {
                setLoadingStage(stage);
              }
            },
          },
        );
        if (!isCancelled) {
          setLoadingStage("render");
          setPayload(nextPayload.data);
          setSnapshotState(nextPayload.snapshot);
          onTotalChange(nextPayload.data.summary.totalTitles);
        }
      } catch (error) {
        if (!isCancelled) {
          setPayload(null);
          setSnapshotState(null);
          onTotalChange(0);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Не вдалося завантажити статистику ігор.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadStatistics();

    return () => {
      isCancelled = true;
      abortController.abort();
      window.clearTimeout(slowTimer);
      window.clearTimeout(timeoutTimer);
    };
  }, [onTotalChange]);

  const handleExportCsv = useCallback(() => {
    if (!payload || payload.exportRows.length === 0) {
      return;
    }
    const csvHeaders = [
      "Назва",
      "Платформа",
      "Переглянуто у відсотках",
      "Особистий рейтинг",
      "Дата перегляду",
    ];

    const rowsForCsv = payload.exportRows.map((row) => [
      row.title,
      row.platforms.join("; "),
      String(row.viewPercent),
      row.rating == null ? "" : String(row.rating),
      row.viewedAt ? row.viewedAt.slice(0, 10) : "",
    ]);

    downloadCsvFile(
      `games_export_${getCsvTimestamp()}.csv`,
      csvHeaders,
      rowsForCsv,
    );
  }, [payload]);

  useEffect(() => {
    onExportReady?.(payload && payload.exportRows.length > 0 ? handleExportCsv : null);
    return () => onExportReady?.(null);
  }, [handleExportCsv, onExportReady, payload]);

  if (isLoading) {
    return (
      <StatisticsLoadingState
        subject="ігор"
        stage={loadingStage}
        isSlow={isSlowLoad}
      />
    );
  }

  if (errorMessage) {
    return <p className={styles.message}>{errorMessage}</p>;
  }

  if (!payload || payload.summary.totalTitles === 0) {
    return <p className={styles.message}>Додайте ігри до бібліотеки, щоб побачити статистику.</p>;
  }

  const platformGroups = [
    {
      title: "Для рекомендацій",
      entries: payload.scopeEntries.filter((entry) => entry.maturityStatus === "working"),
    },
    {
      title: "Попередній профіль",
      entries: payload.scopeEntries.filter((entry) => entry.maturityStatus === "exploratory"),
    },
    {
      title: "Недостатньо даних",
      entries: payload.scopeEntries.filter((entry) => entry.maturityStatus === "insufficient"),
    },
  ].filter((group) => group.entries.length > 0);

  return (
    <div className={styles.content}>
      {snapshotState?.isStale ? (
        <div className={styles.snapshotNotice}>
          <strong className={styles.snapshotNoticeTitle}>Показано останній збережений зріз.</strong>
          <span className={styles.snapshotNoticeText}>
            Оновлюємо статистику після останніх змін у бібліотеці.
          </span>
        </div>
      ) : null}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Усього</span>
          <strong className={styles.kpiValue}>{payload.summary.totalTitles}</strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Частково зіграно</span>
          <strong className={styles.kpiValue}>
            {payload.summary.droppedTitles}{" "}
            <span className={styles.kpiValueMuted}>
              ({formatShare(payload.summary.droppedTitles, payload.summary.totalTitles)})
            </span>
          </strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Повністю зіграно</span>
          <strong className={styles.kpiValue}>
            {payload.summary.completedTitles}{" "}
            <span className={styles.kpiValueMuted}>
              ({formatShare(payload.summary.completedTitles, payload.summary.totalTitles)})
            </span>
          </strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Не зіграно</span>
          <strong className={styles.kpiValue}>
            {payload.summary.plannedTitles}{" "}
            <span className={styles.kpiValueMuted}>
              ({formatShare(payload.summary.plannedTitles, payload.summary.totalTitles)})
            </span>
          </strong>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardWide}`}>
          <span className={styles.kpiLabel}>Середня оцінка</span>
          <strong className={styles.kpiValue}>
            {formatNullableMetric(payload.summary.averageRating)}
          </strong>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardWide}`}>
          <span className={styles.kpiLabel}>Додано за 30 днів</span>
          <strong className={styles.kpiValue}>{payload.summary.addedLast30Days}</strong>
        </div>
      </div>

      <div className={styles.sectionGrid}>
        <section className={`${styles.section} ${styles.sectionFull}`}>
          {platformGroups.length === 0 ? (
            <div className={styles.emptyBox}>
              Додайте платформи до ігор, щоб сформувати шар зрілості платформ.
            </div>
          ) : (
            <div className={styles.list}>
              {platformGroups.map((group) => (
                group.entries.map((entry) => (
                  <details
                    key={entry.scopeValue}
                    className={styles.nestedCard}
                    open={entry.maturityStatus === "working"}
                  >
                    <summary className={styles.accordionSummary}>
                      <span className={styles.accordionSummaryInner}>
                        <h3 className={styles.nestedTitle}>{entry.scopeValue}</h3>
                        {entry.maturityStatus === "insufficient" ? (
                          <span className={styles.accordionMeta}>Недостатньо даних</span>
                        ) : null}
                      </span>
                    </summary>
                    <div className={styles.accordionContent}>
                    <div className={styles.kpiGridCompact}>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Усього</span>
                        <strong className={styles.kpiValue}>{entry.totalTitles}</strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Частково зіграно</span>
                        <strong className={styles.kpiValue}>
                          {entry.droppedTitles}{" "}
                          <span className={styles.kpiValueMuted}>
                            ({formatShare(entry.droppedTitles, entry.totalTitles)})
                          </span>
                        </strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Не зіграно</span>
                        <strong className={styles.kpiValue}>
                          {entry.plannedTitles}{" "}
                          <span className={styles.kpiValueMuted}>
                            ({formatShare(entry.plannedTitles, entry.totalTitles)})
                          </span>
                        </strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Повністю зіграно</span>
                        <strong className={styles.kpiValue}>
                          {entry.completedTitles}{" "}
                          <span className={styles.kpiValueMuted}>
                            ({formatShare(entry.completedTitles, entry.totalTitles)})
                          </span>
                        </strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Середня оцінка</span>
                        <strong className={styles.kpiValue}>
                          {formatNullableMetric(entry.averageRating)}
                        </strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Додано за 30 днів</span>
                        <strong className={styles.kpiValue}>{entry.addedLast30Days}</strong>
                      </div>
                    </div>
                    <div className={styles.statsBlocksGrid}>
                      {entry.topLikedGenres.length > 0 ? (
                        <section className={styles.section}>
                          <h3 className={styles.sectionTitle}>Топ жанрів, які сподобались</h3>
                          <StatisticsRankedList
                            entries={entry.topLikedGenres}
                            valueLabel="games"
                            emptyMessage="Недостатньо даних."
                          />
                        </section>
                      ) : null}
                      {entry.topDislikedGenres.length > 0 ? (
                        <section className={styles.section}>
                          <h3 className={styles.sectionTitle}>Топ жанрів, які не зайшли</h3>
                          <StatisticsRankedList
                            entries={entry.topDislikedGenres}
                            valueLabel="games"
                            emptyMessage="Недостатньо даних."
                          />
                        </section>
                      ) : null}
                      {entry.topDroppedGenres.length > 0 ? (
                        <section className={styles.section}>
                          <h3 className={styles.sectionTitle}>Топ жанрів, які покинуто</h3>
                          <StatisticsRankedList
                            entries={entry.topDroppedGenres}
                            valueLabel="games"
                            emptyMessage="Недостатньо даних."
                          />
                        </section>
                      ) : null}
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Перегляди по місяцях</h3>
                        <StatisticsMonthlyList
                          entries={entry.monthlyEntries}
                          itemLabel="games"
                          initialLimit={5}
                        />
                      </section>
                    </div>
                    {entry.topLikedGenres.length === 0 &&
                    entry.topDislikedGenres.length === 0 &&
                    entry.topDroppedGenres.length === 0 ? (
                      <div className={styles.emptyBox}>Недостатньо даних по жанрах для цієї платформи.</div>
                    ) : null}
                    </div>
                  </details>
                ))
              ))}
            </div>
          )}
        </section>

        <section className={`${styles.section} ${styles.sectionFull}`}>
          <details>
            <summary className={styles.sectionTitle}>Пояснення</summary>
            <div className={styles.list}>
              <p className={styles.sectionText}>
                Платформа вважається готовою для рекомендацій лише тоді, коли по ній уже є
                достатньо історії: щонайменше 50 ігор, 20 оцінених ігор і 15 зіграних ігор.
              </p>
              <p className={styles.sectionText}>
                Якщо платформа ще не дотягує до цих порогів, вона не вважається придатною для
                рекомендацій.
              </p>
              <p className={styles.sectionText}>
                «Попередній профіль» використовується, коли даних уже чимало, але їх ще замало для
                стабільних рекомендацій.
              </p>
              <p className={styles.sectionText}>
                «Недостатньо даних» означає, що для цієї платформи поки замало зіграних або
                оцінених ігор, щоб робити надійні висновки.
              </p>
              <p className={styles.sectionText}>
                Основна платформа обирається так: спершу за кількістю ігор, які ти пробував, потім за кількістю оцінених ігор, а потім за загальною кількістю ігор.
              </p>
              <p className={styles.sectionText}>
                Платформи для рекомендацій:{" "}
                {payload.interpretation.recommendationValidScopes.length > 0
                  ? payload.interpretation.recommendationValidScopes.join(", ")
                  : "немає"}
              </p>
              <p className={styles.sectionText}>
                Попередній профіль:{" "}
                {payload.interpretation.exploratoryScopes.length > 0
                  ? payload.interpretation.exploratoryScopes.join(", ")
                  : "немає"}
              </p>
              <p className={styles.sectionText}>
                Недостатньо даних:{" "}
                {payload.interpretation.insufficientScopes.length > 0
                  ? payload.interpretation.insufficientScopes.join(", ")
                  : "немає"}
              </p>
              <p className={styles.sectionText}>
                Ручний вибір платформи:{" "}
                {payload.interpretation.manualScopeSelectionRequired ? "доступний" : "не потрібен"}
              </p>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
