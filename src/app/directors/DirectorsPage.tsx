"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import searchStyles from "@/components/catalog/CatalogSearch.module.css";
import styles from "@/app/actors/ActorsPage.module.css";

type DirectorSearchResult = {
  id: string;
  name: string;
  originalName: string;
  knownForDepartment: string;
  popularity: number | null;
  profileUrl: string;
  filmographyCount: number;
  knownForTitles: string[];
};

const isDirectingDepartment = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("direct") || normalized.includes("режис");
};

export default function DirectorsPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectorSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(
    "Знайди режисера, щоб перейти до його сторінки та побачити фільмографію з розділенням на наявне і відсутнє в колекції.",
  );

  const filteredResults = useMemo(() => {
    const directors = results.filter((person) =>
      isDirectingDepartment(person.knownForDepartment),
    );
    return directors.length > 0 ? directors : results;
  }, [results]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) {
      setResults([]);
      setMessage("Введи ім’я режисера для пошуку.");
      return;
    }

    setIsLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/tmdb/person-search?q=${encodeURIComponent(nextQuery)}`,
      );
      const data = (await response.json()) as {
        results?: DirectorSearchResult[];
        error?: string;
      };

      if (!response.ok) {
        setResults([]);
        setMessage(data.error ?? "Не вдалося виконати пошук режисерів.");
        return;
      }

      const nextResults = data.results ?? [];
      setResults(nextResults);
      setMessage(
        nextResults.length > 0
          ? ""
          : "Нічого не знайдено. Спробуй інше ім’я або англійське написання.",
      );
    } catch (error) {
      setResults([]);
      setMessage(
        error instanceof Error ? error.message : "Не вдалося виконати пошук режисерів.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CatalogLayout
      title="Режисери"
      description="Пошук по TMDB і перехід до director page з фільмографією та перетином із твоєю колекцією."
    >
      <div className={styles.content}>
        <form className={styles.searchForm} onSubmit={handleSubmit}>
          <input
            className={styles.searchInput}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Наприклад: Denis Villeneuve"
            aria-label="Пошук режисера"
          />
          <button
            type="submit"
            className="btnBase btnPrimary"
            disabled={isLoading}
          >
            {isLoading ? "Пошук..." : "Знайти"}
          </button>
        </form>

        {message ? <p className={styles.message}>{message}</p> : null}

        {filteredResults.length > 0 ? (
          <div className={styles.results}>
            {filteredResults.map((director) => (
              <Link
                key={director.id}
                href={`/directors/${director.id}`}
                className={`${searchStyles.resultItem} ${searchStyles.resultButton} ${searchStyles.collectionItem} ${styles.personCard}`}
              >
                <div className={searchStyles.resultHeader}>
                  <div className={searchStyles.titleRow}>
                    <h2 className={searchStyles.resultTitle}>{director.name}</h2>
                    {director.knownForDepartment ? (
                      <div className={searchStyles.ratingRow}>
                        <span className={searchStyles.resultMeta}>
                          {director.knownForDepartment}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className={searchStyles.posterWrapper}>
                  {director.profileUrl ? (
                    <Image
                      src={director.profileUrl}
                      alt={director.name}
                      width={180}
                      height={270}
                      className={searchStyles.poster}
                    />
                  ) : (
                    <div className={searchStyles.posterPlaceholder}>Фото недоступне</div>
                  )}
                </div>
                <div className={searchStyles.resultContent}>
                  {director.originalName && director.originalName !== director.name ? (
                    <p className={searchStyles.resultMeta}>
                      Оригінальне ім’я: {director.originalName}
                    </p>
                  ) : null}
                  <p className={searchStyles.resultMeta}>
                    Всього в filmography: {director.filmographyCount}
                  </p>
                  {director.knownForTitles.length > 0 ? (
                    <p className={searchStyles.resultMeta}>
                      Відомий за: {director.knownForTitles.join("; ")}
                    </p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </CatalogLayout>
  );
}
