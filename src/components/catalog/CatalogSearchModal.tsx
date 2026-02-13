"use client";

import { useCallback, useEffect, useState } from "react";
import Search from "@/components/search/Search";
import listStyles from "@/components/catalog/CatalogSearch.module.css";
import styles from "./CatalogSearchModal.module.css";

type CatalogSearchModalProps<T> = {
  title: string;
  onSearch: (query: string) => Promise<T[]>;
  renderItem: (item: T) => React.ReactNode;
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  onClose: () => void;
  initialQuery?: string;
  emptyQueryMessage?: string;
  emptyResultsMessage?: string;
  errorMessage?: string;
};

export default function CatalogSearchModal<T>({
  title,
  onSearch,
  renderItem,
  getKey,
  onSelect,
  onClose,
  initialQuery,
  emptyQueryMessage = "Введіть запит для пошуку.",
  emptyResultsMessage = "Нічого не знайдено.",
  errorMessage = "Не вдалося виконати пошук.",
}: CatalogSearchModalProps<T>) {
  const [results, setResults] = useState<T[]>([]);
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = useCallback(
    async (query: string) => {
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
    },
    [emptyQueryMessage, emptyResultsMessage, errorMessage, onSearch],
  );

  useEffect(() => {
    const trimmed = initialQuery?.trim();
    if (!trimmed) return;
    void handleSearch(trimmed);
  }, [initialQuery, handleSearch]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={`${styles.closeButton} btnSecondary`}
            onClick={onClose}
            aria-label="Закрити"
          >
            ✕
          </button>
        </div>
        <div className={styles.body}>
          <Search
            onSearch={handleSearch}
            isLoading={isLoading}
            initialValue={initialQuery}
          />
          {message ? <p className={listStyles.message}>{message}</p> : null}
          <div className={`${listStyles.results} ${styles.results}`}>
            {results.map((item) => (
              <button
                key={getKey(item)}
                type="button"
                className={`${listStyles.resultItem} ${listStyles.resultButton}`}
                onClick={() => onSelect(item)}
              >
                {renderItem(item)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
