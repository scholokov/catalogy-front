"use client";

import type {
  FilmProfileUserLayer,
  GameProfileUserLayer,
} from "@/lib/profile-analysis/types";
import styles from "../statistics/StatisticsPage.module.css";

type ProfileAnalysisUserViewProps =
  | {
      mediaKind: "film";
      analysis: FilmProfileUserLayer;
    }
  | {
      mediaKind: "game";
      analysis: GameProfileUserLayer;
    };

const renderList = (items: string[]) => (
  <ul className={styles.analysisList}>
    {items.map((item) => (
      <li key={item} className={styles.analysisListItem}>
        {item}
      </li>
    ))}
  </ul>
);

export default function ProfileAnalysisUserView({
  mediaKind,
  analysis,
}: ProfileAnalysisUserViewProps) {
  const patterns =
    mediaKind === "film" ? analysis.watching_patterns : analysis.playing_patterns;
  const extraSignals =
    mediaKind === "film" ? analysis.strong_author_signals : analysis.franchise_signals_uk;
  const patternsLabel =
    mediaKind === "film" ? "Патерни перегляду" : "Патерни гри";
  const extraSignalsLabel =
    mediaKind === "film" ? "Сильні авторські сигнали" : "Франшизні сигнали";

  return (
    <div className={styles.list}>
      <div className={styles.metricItem}>
        <span className={styles.metricLabel}>Підсумок</span>
        <p className={styles.analysisSummary}>{analysis.summary}</p>
      </div>
      {analysis.likes.length > 0 ? (
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Що зазвичай працює</span>
          {renderList(analysis.likes)}
        </div>
      ) : null}
      {analysis.dislikes.length > 0 ? (
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Що частіше не працює</span>
          {renderList(analysis.dislikes)}
        </div>
      ) : null}
      {patterns.length > 0 ? (
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>{patternsLabel}</span>
          {renderList(patterns)}
        </div>
      ) : null}
      {extraSignals.length > 0 ? (
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>{extraSignalsLabel}</span>
          {renderList(extraSignals)}
        </div>
      ) : null}
      <div className={styles.metricItem}>
        <span className={styles.metricLabel}>Надійність профілю</span>
        <strong className={styles.metricValue}>{analysis.confidence_label_uk}</strong>
        <p className={styles.analysisMeta}>{analysis.confidence_reason_uk}</p>
      </div>
    </div>
  );
}
