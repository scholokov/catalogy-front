"use client";

import {
  useCallback,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import styles from "@/components/catalog/CatalogSearch.module.css";

function ModalDescription({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflow, setIsOverflow] = useState(false);
  const descriptionRef = useCallback(
    (node: HTMLParagraphElement | null) => {
      if (!node) {
        return;
      }

      setIsOverflow(node.scrollHeight > node.clientHeight + 1);
    },
    [],
  );

  const handleExpand = (event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsExpanded(true);
  };

  return (
    <div className={styles.plotBlock}>
      <p
        ref={descriptionRef}
        className={`${styles.resultPlot} ${isExpanded ? "" : styles.modalPlotClamp}`}
      >
        {text}
      </p>
      {!isExpanded && isOverflow ? (
        <span
          className={styles.plotToggle}
          role="button"
          tabIndex={0}
          onClick={handleExpand}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              handleExpand(event);
            }
          }}
        >
          Детальніше
        </span>
      ) : null}
    </div>
  );
}

export const getExternalRatingLabel = (
  source?: "igdb" | "rawg",
  value?: number | string | null,
) => {
  if (source === "igdb") return "IGDB";
  if (source === "rawg") return "RAWG";
  const numeric =
    typeof value === "string" ? Number.parseFloat(value) : value ?? null;
  if (typeof numeric === "number" && Number.isFinite(numeric) && numeric > 5) {
    return "IGDB";
  }
  return "RAWG";
};

type GameMetadataContentProps = {
  externalRating?: number | string | null;
  externalRatingSource?: "igdb" | "rawg";
  personalRating?: string | null;
  fitBadge?: ReactNode | null;
  year?: string | null;
  genres?: ReactNode | null;
  description?: string | null;
  message?: ReactNode | null;
};

export default function GameMetadataContent({
  externalRating,
  externalRatingSource,
  personalRating,
  fitBadge,
  year,
  genres,
  description,
  message,
}: GameMetadataContentProps) {
  const resolvedGenres = typeof genres === "string" ? genres.trim() : genres;
  const resolvedYear = (year ?? "").trim();

  return (
    <div className={styles.resultContent}>
      <div className={styles.titleRow}>
        <span className={styles.resultRating}>
          {getExternalRatingLabel(externalRatingSource, externalRating)}: {externalRating ?? "—"}
        </span>
        {fitBadge}
        <span className={styles.resultRating}>Мій: {personalRating ?? "—"}</span>
      </div>
      {resolvedYear ? <p className={styles.resultMeta}>Рік: {resolvedYear}</p> : null}
      {resolvedGenres ? <p className={styles.resultMeta}>Жанри: {resolvedGenres}</p> : null}
      {description ? (
        <ModalDescription text={description} />
      ) : (
        <p className={styles.resultPlot}>Опис недоступний.</p>
      )}
      {message}
    </div>
  );
}
