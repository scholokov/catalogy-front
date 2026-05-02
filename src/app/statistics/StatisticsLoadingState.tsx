import styles from "./StatisticsPage.module.css";

type StatisticsLoadingStage = "auth" | "request" | "render";

type StatisticsLoadingStateProps = {
  subject: string;
  stage: StatisticsLoadingStage;
  isSlow: boolean;
};

const stages: Array<{
  key: StatisticsLoadingStage;
  label: string;
  description: string;
}> = [
  {
    key: "auth",
    label: "Перевіряємо доступ",
    description: "Підтверджуємо сесію та готуємо запит.",
  },
  {
    key: "request",
    label: "Завантажуємо дані",
    description: "Сервер збирає бібліотеку та пов'язані дані.",
  },
  {
    key: "render",
    label: "Формуємо сторінку",
    description: "Будуємо підсумки, картки та рейтинги.",
  },
];

export default function StatisticsLoadingState({
  subject,
  stage,
  isSlow,
}: StatisticsLoadingStateProps) {
  const activeIndex = stages.findIndex((entry) => entry.key === stage);

  return (
    <div className={styles.loadingCard} role="status" aria-live="polite">
      <div className={styles.loadingHeader}>
        <h2 className={styles.loadingTitle}>Готуємо статистику {subject}</h2>
        <p className={styles.loadingText}>
          Це може тривати довше, якщо бібліотека велика або мережа нестабільна.
        </p>
      </div>
      <div className={styles.loadingSteps}>
        {stages.map((entry, index) => {
          const state =
            index < activeIndex ? styles.loadingStepDone : index === activeIndex
              ? styles.loadingStepActive
              : styles.loadingStepPending;

          return (
            <div key={entry.key} className={`${styles.loadingStep} ${state}`}>
              <div className={styles.loadingStepMarker}>{index < activeIndex ? "✓" : index + 1}</div>
              <div className={styles.loadingStepBody}>
                <strong className={styles.loadingStepLabel}>{entry.label}</strong>
                <span className={styles.loadingStepDescription}>{entry.description}</span>
              </div>
            </div>
          );
        })}
      </div>
      {isSlow ? (
        <p className={styles.loadingHint}>
          Даних багато, тому сервер усе ще формує зріз. Нічого не зависло.
        </p>
      ) : null}
    </div>
  );
}
