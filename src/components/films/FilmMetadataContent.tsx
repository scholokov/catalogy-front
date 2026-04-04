"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import styles from "@/components/catalog/CatalogSearch.module.css";

const normalizeFilmMediaType = (value?: string | null): "movie" | "tv" | null => {
  if (value === "movie" || value === "tv") return value;
  return null;
};

const formatFilmMediaType = (value?: string | null) =>
  normalizeFilmMediaType(value) === "tv" ? "Серіал" : "Фільм";

function ModalDescription({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflow, setIsOverflow] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const node = descriptionRef.current;
    if (!node) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      setIsOverflow(node.scrollHeight > node.clientHeight + 1);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isExpanded, text]);

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

type FilmMetadataContentProps = {
  imdbRating?: string | null;
  personalRating?: string | null;
  year?: string | number | null;
  mediaType?: string | null;
  originalTitle?: ReactNode | null;
  englishTitle?: string | null;
  director?: ReactNode | null;
  writers?: ReactNode | null;
  producers?: ReactNode | null;
  actors?: ReactNode | null;
  genres?: ReactNode | null;
  description?: string | null;
  message?: ReactNode | null;
};

export default function FilmMetadataContent({
  imdbRating,
  personalRating,
  year,
  mediaType,
  originalTitle,
  englishTitle,
  director,
  writers,
  producers,
  actors,
  genres,
  description,
  message,
}: FilmMetadataContentProps) {
  const resolvedYear =
    typeof year === "number" ? String(year) : (year ?? "").trim();

  const resolvedOriginalTitle =
    typeof originalTitle === "string" ? originalTitle.trim() : originalTitle;
  const resolvedGenres = typeof genres === "string" ? genres.trim() : genres;

  const shouldShowEnglishTitle =
    Boolean(englishTitle) &&
    Boolean(resolvedOriginalTitle) &&
    englishTitle !== resolvedOriginalTitle;

  return (
    <div className={styles.resultContent}>
      {imdbRating || personalRating ? (
        <div className={styles.titleRow}>
          {imdbRating ? <span className={styles.resultRating}>IMDb: {imdbRating}</span> : null}
          {personalRating ? <span className={styles.resultRating}>Мій: {personalRating}</span> : null}
        </div>
      ) : null}
      {resolvedOriginalTitle ? (
        <p className={styles.resultMeta}>Оригінальна назва: {resolvedOriginalTitle}</p>
      ) : null}
      {shouldShowEnglishTitle ? (
        <p className={styles.resultMeta}>Англійська назва: {englishTitle}</p>
      ) : null}
      {resolvedYear ? <p className={styles.resultMeta}>Рік: {resolvedYear}</p> : null}
      <p className={styles.resultMeta}>Тип: {formatFilmMediaType(mediaType)}</p>
      {director ? <p className={styles.resultMeta}>Режисер: {director}</p> : null}
      {writers ? <p className={styles.resultMeta}>Сценарист: {writers}</p> : null}
      {producers ? <p className={styles.resultMeta}>Продюсер: {producers}</p> : null}
      {actors ? <p className={styles.resultMeta}>Актори: {actors}</p> : null}
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
