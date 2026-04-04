"use client";

import { useMemo, useState } from "react";
import CloseIconButton from "@/components/ui/CloseIconButton";
import styles from "@/components/catalog/CatalogSearch.module.css";

type TrailerViewerItem = {
  name?: string;
  url: string;
};

type TrailerViewerModalProps = {
  trailers: TrailerViewerItem[];
  initialIndex: number;
  baseTitle: string;
  onClose: () => void;
};

const toEmbedUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const videoId = parsed.searchParams.get("v");
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    }
    if (parsed.hostname === "youtu.be") {
      const videoId = parsed.pathname.replace("/", "").trim();
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    }
  } catch {
    return url;
  }
  return url;
};

export default function TrailerViewerModal({
  trailers,
  initialIndex,
  baseTitle,
  onClose,
}: TrailerViewerModalProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  const currentTrailer = useMemo(() => trailers[activeIndex], [activeIndex, trailers]);

  if (!currentTrailer) {
    return null;
  }

  return (
    <div className={styles.trailerOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.trailerModal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.trailerHeader}>
          <h3 className={styles.trailerTitle}>
            {currentTrailer.name?.trim() ? currentTrailer.name : baseTitle}
          </h3>
          <CloseIconButton className={styles.trailerCloseButton} onClick={onClose} />
        </div>
        <div className={styles.trailerBody}>
          <iframe
            className={styles.trailerFrame}
            src={`${toEmbedUrl(currentTrailer.url)}?autoplay=1`}
            title={currentTrailer.name?.trim() ? currentTrailer.name : baseTitle}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          {trailers.length > 1 ? (
            <>
              <button
                type="button"
                className={`${styles.trailerNavButton} ${styles.trailerNavLeft}`}
                onClick={() =>
                  setActiveIndex((prev) => (prev - 1 + trailers.length) % trailers.length)
                }
                aria-label="Попередній трейлер"
              >
                ←
              </button>
              <button
                type="button"
                className={`${styles.trailerNavButton} ${styles.trailerNavRight}`}
                onClick={() => setActiveIndex((prev) => (prev + 1) % trailers.length)}
                aria-label="Наступний трейлер"
              >
                →
              </button>
              <div className={styles.trailerCounter}>
                {activeIndex + 1} / {trailers.length}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
