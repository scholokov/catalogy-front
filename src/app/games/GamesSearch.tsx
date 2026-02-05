"use client";

import CatalogSearch from "@/components/catalog/CatalogSearch";
import styles from "@/components/catalog/CatalogSearch.module.css";

type GameResult = {
  id: string;
  title: string;
  cover?: string;
  summary?: string;
};

export default function GamesSearch() {
  const handleSearch = async () => {
    return [] as GameResult[];
  };

  return (
    <CatalogSearch
      onSearch={handleSearch}
      emptyResultsMessage="Пошук ігор поки не підключений."
      getKey={(game) => game.id}
      getTitle={(game) => game.title}
      getPoster={(game) => game.cover}
      renderCardContent={(game) => (
        <>
          <div className={styles.posterWrapper}>
            {game.cover ? (
              <img
                className={styles.poster}
                src={game.cover}
                alt={`Обкладинка ${game.title}`}
                loading="lazy"
              />
            ) : (
              <div className={styles.posterPlaceholder}>No image</div>
            )}
          </div>
          <div className={styles.resultContent}>
            <div className={styles.titleRow}>
              <h2 className={styles.resultTitle}>{game.title}</h2>
            </div>
            {game.summary ? (
              <p className={styles.resultPlot}>{game.summary}</p>
            ) : (
              <p className={styles.resultPlot}>Опис недоступний.</p>
            )}
          </div>
        </>
      )}
      renderModalContent={(game) => (
        <div className={styles.resultContent}>
          <div className={styles.titleRow}>
            <h2 className={styles.resultTitle}>{game.title}</h2>
          </div>
          {game.summary ? (
            <p className={styles.resultPlot}>{game.summary}</p>
          ) : (
            <p className={styles.resultPlot}>Опис недоступний.</p>
          )}
        </div>
      )}
    />
  );
}
