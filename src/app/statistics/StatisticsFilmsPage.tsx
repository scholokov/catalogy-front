"use client";

import { useCallback, useEffect, useState } from "react";
import { downloadCsvFile } from "@/lib/csv/downloadCsv";
import { getCsvTimestamp } from "@/lib/csv/getCsvTimestamp";
import StatisticsLoadingState from "./StatisticsLoadingState";
import StatisticsMonthlyList from "./StatisticsMonthlyList";
import styles from "./StatisticsPage.module.css";
import StatisticsRankedList from "./StatisticsRankedList";
import { fetchStatisticsPayload } from "./lib/fetchStatisticsPayload";
import type {
  FilmStatisticsPayload,
  StatisticsSnapshotResponse,
  StatisticsSnapshotState,
} from "./statisticsTypes";

type StatisticsFilmsPageProps = {
  onTotalChange: (count: number) => void;
  onExportReady?: (handler: (() => void) | null) => void;
};

const formatNullableMetric = (value: number | null) => {
  if (value === null) return "—";
  return value.toFixed(2);
};

const formatShare = (count: number, total: number) => {
  if (total <= 0) return "0%";
  return `${Math.round((count / total) * 100)}%`;
};

export default function StatisticsFilmsPage({
  onTotalChange,
  onExportReady,
}: StatisticsFilmsPageProps) {
  const [payload, setPayload] = useState<FilmStatisticsPayload | null>(null);
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
          StatisticsSnapshotResponse<FilmStatisticsPayload>
        >(
          "/api/statistics/films",
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
              : "Не вдалося завантажити статистику.",
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
      "Режисер",
      "Переглянуто у відсотках",
      "Особистий рейтинг",
      "Дата перегляду",
    ];

    const rowsForCsv = payload.exportRows.map((row) => [
      row.title,
      row.director ?? "",
      String(row.viewPercent),
      row.rating == null ? "" : String(row.rating),
      row.viewedAt ? row.viewedAt.slice(0, 10) : "",
    ]);

    downloadCsvFile(
      `films_export_${getCsvTimestamp()}.csv`,
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
        subject="фільмів"
        stage={loadingStage}
        isSlow={isSlowLoad}
      />
    );
  }

  if (errorMessage) {
    return <p className={styles.message}>{errorMessage}</p>;
  }

  if (!payload || payload.summary.totalTitles === 0) {
    return <p className={styles.message}>Додайте фільми до бібліотеки, щоб побачити статистику.</p>;
  }

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
          <span className={styles.kpiLabel}>Переглянуто</span>
          <strong className={styles.kpiValue}>
            {payload.summary.watchedTitles}{" "}
            <span className={styles.kpiValueMuted}>
              ({formatShare(payload.summary.watchedTitles, payload.summary.totalTitles)})
            </span>
          </strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Кинуто</span>
          <strong className={styles.kpiValue}>
            {payload.summary.partialTitles}{" "}
            <span className={styles.kpiValueMuted}>
              ({formatShare(payload.summary.partialTitles, payload.summary.totalTitles)})
            </span>
          </strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Не переглянуто</span>
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
          {payload.scopeEntries.length === 0 ? (
            <div className={styles.emptyBox}>
              Додайте фільми й серіали до бібліотеки, щоб сформувати окрему статистику за форматами.
            </div>
          ) : (
            <div className={styles.list}>
              {payload.scopeEntries.map((entry) => (
                <details
                  key={entry.mediaType}
                  className={styles.nestedCard}
                  open={entry.maturityStatus === "working"}
                >
                  <summary className={styles.accordionSummary}>
                    <span className={styles.accordionSummaryInner}>
                      <h3 className={styles.nestedTitle}>{entry.label}</h3>
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
                        <span className={styles.kpiLabel}>Переглянуто</span>
                        <strong className={styles.kpiValue}>
                          {entry.watchedTitles}{" "}
                          <span className={styles.kpiValueMuted}>
                            ({formatShare(entry.watchedTitles, entry.totalTitles)})
                          </span>
                        </strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Кинуто</span>
                        <strong className={styles.kpiValue}>
                          {entry.partialTitles}{" "}
                          <span className={styles.kpiValueMuted}>
                            ({formatShare(entry.partialTitles, entry.totalTitles)})
                          </span>
                        </strong>
                      </div>
                      <div className={styles.kpiCard}>
                        <span className={styles.kpiLabel}>Не переглянуто</span>
                        <strong className={styles.kpiValue}>
                          {entry.plannedTitles}{" "}
                          <span className={styles.kpiValueMuted}>
                            ({formatShare(entry.plannedTitles, entry.totalTitles)})
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
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ жанрів, які сподобались</h3>
                        <StatisticsRankedList
                          entries={entry.topLikedGenres}
                          valueLabel="points"
                          emptyMessage="Поставте більше оцінок, щоб побачити смакову статистику."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ жанрів, які не зайшли</h3>
                        <StatisticsRankedList
                          entries={entry.topDislikedGenres}
                          valueLabel="points"
                          emptyMessage="Поки немає достатньо низьких оцінок по жанрах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ жанрів, які кинуто</h3>
                        <StatisticsRankedList
                          entries={entry.topDroppedGenres}
                          valueLabel="films"
                          emptyMessage="Поки немає достатньо частково переглянутих позицій по жанрах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ режисерів, які сподобались</h3>
                        <StatisticsRankedList
                          entries={entry.topLikedDirectors}
                          valueLabel="points"
                          emptyMessage="Поставте більше оцінок, щоб побачити смакову статистику."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ режисерів, які не зайшли</h3>
                        <StatisticsRankedList
                          entries={entry.topDislikedDirectors}
                          valueLabel="points"
                          emptyMessage="Поки немає достатньо низьких оцінок по режисерах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ режисерів, яких кинуто</h3>
                        <StatisticsRankedList
                          entries={entry.topDroppedDirectors}
                          valueLabel="films"
                          emptyMessage="Поки немає достатньо частково переглянутих позицій по режисерах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ сценаристів, які сподобались</h3>
                        <StatisticsRankedList
                          entries={entry.topLikedWriters}
                          valueLabel="points"
                          emptyMessage="Поставте більше оцінок, щоб побачити смакову статистику."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ сценаристів, які не зайшли</h3>
                        <StatisticsRankedList
                          entries={entry.topDislikedWriters}
                          valueLabel="points"
                          emptyMessage="Поки немає достатньо низьких оцінок по сценаристах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ сценаристів, яких кинуто</h3>
                        <StatisticsRankedList
                          entries={entry.topDroppedWriters}
                          valueLabel="films"
                          emptyMessage="Поки немає достатньо частково переглянутих позицій по сценаристах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ акторів, які сподобались</h3>
                        <StatisticsRankedList
                          entries={entry.topLikedActors}
                          valueLabel="points"
                          emptyMessage="Поставте більше оцінок, щоб побачити смакову статистику."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ акторів, які не зайшли</h3>
                        <StatisticsRankedList
                          entries={entry.topDislikedActors}
                          valueLabel="points"
                          emptyMessage="Поки немає достатньо низьких оцінок по акторах."
                        />
                      </section>
                      <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Топ акторів, яких кинуто</h3>
                        <StatisticsRankedList
                          entries={entry.topDroppedActors}
                          valueLabel="films"
                          emptyMessage="Поки немає достатньо частково переглянутих позицій по акторах."
                        />
                      </section>
                      <section className={`${styles.section} ${styles.sectionFull}`}>
                        <h3 className={styles.sectionTitle}>Перегляди по місяцях</h3>
                        <StatisticsMonthlyList entries={entry.monthlyEntries} initialLimit={5} />
                      </section>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>

        <section className={`${styles.section} ${styles.sectionFull}`}>
          <details>
            <summary className={styles.sectionTitle}>Пояснення</summary>
            <div className={styles.list}>
              <p className={styles.sectionText}>
                Статистика розділяється на два формати: «Кіно» для записів з типом movie і
                «Серіали» для записів з типом tv.
              </p>
              <p className={styles.sectionText}>
                Формат вважається готовим для рекомендацій лише тоді, коли має достатньо даних:
                щонайменше 50 позицій, 20 оцінених позицій і 15 переглянутих позицій.
              </p>
              <p className={styles.sectionText}>
                Якщо формат ще не дотягує до цих порогів, він не вважається придатним для
                рекомендацій, а акордеон лишається закритим.
              </p>
              <p className={styles.sectionText}>
                Лейба «Недостатньо даних» означає, що для цього формату поки замало історії
                переглядів або оцінок, щоб робити стабільні висновки.
              </p>
              <p className={styles.sectionText}>
                «Переглянуто» означає, що увімкнена галочка перегляду незалежно від відсотка
                прогресу.
              </p>
              <p className={styles.sectionText}>
                «Кинуто» означає, що є позначка перегляду, але прогрес перегляду менший за 100%.
              </p>
              <p className={styles.sectionText}>
                «Не переглянуто» означає, що позначка перегляду відсутня.
              </p>
              <p className={styles.sectionText}>
                «Додано за 30 днів» рахує кількість карток, створених за останні 30 днів від
                поточного моменту.
              </p>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
