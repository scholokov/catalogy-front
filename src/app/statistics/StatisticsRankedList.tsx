"use client";

import type { RankedEntry } from "./statisticsTypes";
import styles from "./StatisticsPage.module.css";

type StatisticsRankedListProps = {
  entries: RankedEntry[];
  valueLabel: "films" | "games" | "points";
  emptyMessage: string;
};

export default function StatisticsRankedList({
  entries,
  valueLabel,
  emptyMessage,
}: StatisticsRankedListProps) {
  const maxValue = Math.max(...entries.map((entry) => entry.value), 0);

  if (entries.length === 0) {
    return <div className={styles.emptyBox}>{emptyMessage}</div>;
  }

  return (
    <div className={styles.list}>
      {entries.map((entry) => (
        <div key={entry.label} className={styles.listItem}>
          <div className={styles.listRow}>
            <span className={styles.listLabel}>{entry.label}</span>
            <span className={styles.listValue}>
              {entry.value}{" "}
              {valueLabel === "points"
                ? "бал."
                : valueLabel === "games"
                  ? "ігр."
                  : "фільм."}
            </span>
          </div>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{ width: `${maxValue > 0 ? (entry.value / maxValue) * 100 : 0}%` }}
            />
          </div>
          <div className={styles.listMeta}>{entry.itemCount} записів</div>
        </div>
      ))}
    </div>
  );
}
