"use client";

import { useCallback, useEffect, useState } from "react";
import Search from "@/components/search/Search";
import CloseIconButton from "@/components/ui/CloseIconButton";
import listStyles from "@/components/catalog/CatalogSearch.module.css";
import styles from "./CatalogSearchModal.module.css";

export type CatalogSearchRequest = {
  query: string;
  year?: string;
  director?: string;
};

type CatalogSearchModalProps<T> = {
  title: string;
  onSearch: (request: CatalogSearchRequest) => Promise<T[]>;
  renderItem: (item: T) => React.ReactNode;
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  onClose: () => void;
  resultItemClassName?: string;
  getResultItemClassName?: (item: T) => string;
  initialQuery?: string;
  initialYear?: string;
  initialDirector?: string;
  showDetailedSearch?: boolean;
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
  resultItemClassName,
  getResultItemClassName,
  initialQuery,
  initialYear,
  initialDirector,
  showDetailedSearch = false,
  emptyQueryMessage = "Введіть запит для пошуку.",
  emptyResultsMessage = "Нічого не знайдено.",
  errorMessage = "Не вдалося виконати пошук.",
}: CatalogSearchModalProps<T>) {
  const [results, setResults] = useState<T[]>([]);
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [year, setYear] = useState(initialYear ?? "");
  const [director, setDirector] = useState(initialDirector ?? "");

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
        const nextResults = await onSearch({
          query: trimmed,
          year: year.trim() || undefined,
          director: director.trim() || undefined,
        });
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
    [director, emptyQueryMessage, emptyResultsMessage, errorMessage, onSearch, year],
  );

  useEffect(() => {
    const trimmed = initialQuery?.trim();
    if (!trimmed) return;
    void handleSearch(trimmed);
  }, [initialQuery, handleSearch]);

  useEffect(() => {
    if (initialYear === undefined) return;
    setYear(initialYear);
  }, [initialYear]);

  useEffect(() => {
    if (initialDirector === undefined) return;
    setDirector(initialDirector);
  }, [initialDirector]);

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
          <CloseIconButton onClick={onClose} />
        </div>
        <div className={styles.body}>
          <Search
            onSearch={handleSearch}
            isLoading={isLoading}
            initialValue={initialQuery}
            label={showDetailedSearch ? "Назва" : undefined}
            placeholder={showDetailedSearch ? "Назва" : undefined}
            autoFocus
          >
            {showDetailedSearch ? (
              <div className={styles.advancedSearch}>
                <div className={styles.advancedFields}>
                  <label className={styles.advancedField}>
                    <span className={styles.advancedLabel}>Рік</span>
                    <input
                      className={styles.advancedInput}
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Наприклад 2021"
                      value={year}
                      onChange={(event) => setYear(event.target.value)}
                    />
                  </label>
                  <label className={styles.advancedField}>
                    <span className={styles.advancedLabel}>Режисер</span>
                    <input
                      className={styles.advancedInput}
                      type="text"
                      placeholder="Наприклад Nolan"
                      value={director}
                      onChange={(event) => setDirector(event.target.value)}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </Search>
          {message ? <p className={listStyles.message}>{message}</p> : null}
          <div className={`${listStyles.results} ${styles.results}`}>
            {results.map((item) => (
              <button
                key={getKey(item)}
                type="button"
                className={`${listStyles.resultItem} ${listStyles.resultButton} ${resultItemClassName ?? ""} ${getResultItemClassName?.(item) ?? ""}`}
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
