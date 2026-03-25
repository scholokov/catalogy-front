"use client";

import { useMemo, useState } from "react";
import type { MonthlyEntry } from "./statisticsTypes";
import styles from "./StatisticsPage.module.css";

type StatisticsMonthlyListProps = {
  entries: MonthlyEntry[];
  itemLabel?: "films" | "games";
  initialLimit?: number;
};

export default function StatisticsMonthlyList({
  entries,
  itemLabel = "films",
  initialLimit,
}: StatisticsMonthlyListProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const maxValue = Math.max(...entries.map((entry) => entry.count), 0);
  const visibleEntries = useMemo(() => {
    if (!initialLimit || isExpanded) return entries;
    return entries.slice(0, initialLimit);
  }, [entries, initialLimit, isExpanded]);
  const canExpand = Boolean(initialLimit && entries.length > initialLimit);

  if (entries.length === 0) {
    return (
      <div className={styles.emptyBox}>
        Поки немає {itemLabel === "games" ? "ігор" : "фільмів"} з датою перегляду.
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {visibleEntries.map((entry) => (
        <div key={entry.key} className={styles.listItem}>
          <div className={styles.listRow}>
            <span className={styles.listLabel}>{entry.label}</span>
            <span className={styles.listValue}>
              {entry.count} {itemLabel === "games" ? "ігр." : "фільм."}
            </span>
          </div>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{ width: `${maxValue > 0 ? (entry.count / maxValue) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
      {canExpand ? (
        <button
          type="button"
          className={styles.showMoreButton}
          onClick={() => setIsExpanded((previous) => !previous)}
        >
          {isExpanded ? "Показати менше" : "Відобразити більше"}
        </button>
      ) : null}
    </div>
  );
}
