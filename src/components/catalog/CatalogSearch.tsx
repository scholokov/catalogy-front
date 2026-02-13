"use client";

import { useState } from "react";
import Search from "@/components/search/Search";
import CatalogModal from "@/components/catalog/CatalogModal";
import styles from "./CatalogSearch.module.css";

type CatalogSearchProps<T> = {
  onSearch: (query: string) => Promise<T[]>;
  renderCardContent: (item: T) => React.ReactNode;
  renderModalContent?: (item: T) => React.ReactNode;
  getKey: (item: T) => string;
  getTitle: (item: T) => string;
  getPoster?: (item: T) => string | undefined;
  onAdd?: (
    item: T,
    payload: {
      viewedAt: string;
      comment: string;
      recommendSimilar: boolean;
      isViewed: boolean;
      rating: number | null;
      viewPercent: number;
      platforms: string[];
      availability: string | null;
    },
  ) => Promise<void>;
  emptyQueryMessage?: string;
  emptyResultsMessage?: string;
  errorMessage?: string;
};

export default function CatalogSearch<T>({
  onSearch,
  renderCardContent,
  renderModalContent,
  getKey,
  getTitle,
  getPoster,
  onAdd,
  emptyQueryMessage = "Введіть запит для пошуку.",
  emptyResultsMessage = "Нічого не знайдено.",
  errorMessage = "Не вдалося виконати пошук.",
}: CatalogSearchProps<T>) {
  const [results, setResults] = useState<T[]>([]);
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeItem, setActiveItem] = useState<T | null>(null);

  const handleSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setMessage(emptyQueryMessage);
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const nextResults = await onSearch(trimmed);
      setResults(nextResults);
      setMessage(nextResults.length === 0 ? emptyResultsMessage : "");
    } catch (error) {
      const messageFromError =
        error instanceof Error && error.message ? error.message : errorMessage;
      setResults([]);
      setMessage(messageFromError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.searchBlock}>
      <Search onSearch={handleSearch} isLoading={isLoading} />
      {message ? <p className={styles.message}>{message}</p> : null}
      <div className={styles.results}>
        {results.map((item) => (
          <button
            key={getKey(item)}
            className={`${styles.resultItem} ${styles.resultButton}`}
            type="button"
            onClick={() => setActiveItem(item)}
          >
            {renderCardContent(item)}
          </button>
        ))}
      </div>
      {activeItem ? (
        <CatalogModal
          title={getTitle(activeItem)}
          posterUrl={getPoster ? getPoster(activeItem) : undefined}
          onClose={() => setActiveItem(null)}
          onAdd={
            onAdd
              ? (payload) => onAdd(activeItem, payload)
              : undefined
          }
        >
          {(renderModalContent ?? renderCardContent)(activeItem)}
        </CatalogModal>
      ) : null}
    </div>
  );
}
