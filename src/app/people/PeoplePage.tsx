"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import searchStyles from "@/components/catalog/CatalogSearch.module.css";
import styles from "@/app/actors/ActorsPage.module.css";

type PersonSearchResult = {
  id: string;
  name: string;
  originalName: string;
  englishName?: string;
  knownForDepartment: string;
  popularity: number | null;
  profileUrl: string;
  filmographyCount: number;
  knownForTitles: string[];
};

const getRoleBadge = (department: string) => {
  const normalized = department.trim().toLowerCase();
  const isDirecting = normalized.includes("direct") || normalized.includes("режис");
  const isActing =
    normalized.includes("act") || normalized.includes("actor") || normalized.includes("acting");

  if (isDirecting && isActing) {
    return "Актор • Режисер";
  }
  if (isDirecting) {
    return "Режисер";
  }
  if (isActing) {
    return "Актор";
  }
  return department || "Персона";
};

export default function PeoplePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) {
      setResults([]);
      setMessage("Введи ім’я персони для пошуку.");
      return;
    }

    setIsLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/tmdb/person-search?q=${encodeURIComponent(nextQuery)}`);
      const data = (await response.json()) as {
        results?: PersonSearchResult[];
        error?: string;
      };

      if (!response.ok) {
        setResults([]);
        setMessage(data.error ?? "Не вдалося виконати пошук персон.");
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
        error instanceof Error ? error.message : "Не вдалося виконати пошук персон.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CatalogLayout title="Персони">
      <div className={styles.content}>
        <form className={styles.searchForm} onSubmit={handleSubmit}>
          <input
            className={styles.searchInput}
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Наприклад: Cillian Murphy"
            aria-label="Пошук персони"
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

        {results.length > 0 ? (
          <div className={styles.results}>
            {results.map((person) => (
              <Link
                key={person.id}
                href={`/people/${person.id}`}
                className={`${searchStyles.resultItem} ${searchStyles.resultButton} ${searchStyles.collectionItem} ${styles.personCard}`}
              >
                <div className={searchStyles.resultHeader}>
                  <div className={searchStyles.titleRow}>
                    <h2 className={searchStyles.resultTitle}>{person.name}</h2>
                    <div className={searchStyles.ratingRow}>
                      <span className={searchStyles.resultRating}>
                        {getRoleBadge(person.knownForDepartment)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={searchStyles.posterWrapper}>
                  {person.profileUrl ? (
                    <Image
                      src={person.profileUrl}
                      alt={person.name}
                      width={180}
                      height={270}
                      className={searchStyles.poster}
                    />
                  ) : (
                    <div className={searchStyles.posterPlaceholder}>Фото недоступне</div>
                  )}
                </div>
                <div className={searchStyles.resultContent}>
                  {person.originalName && person.originalName !== person.name ? (
                    <p className={searchStyles.resultMeta}>
                      Оригінальне ім’я: {person.originalName}
                    </p>
                  ) : null}
                  {person.englishName &&
                  person.englishName !== person.originalName &&
                  person.englishName !== person.name ? (
                    <p className={searchStyles.resultMeta}>
                      Англійське ім’я: {person.englishName}
                    </p>
                  ) : null}
                  <div className={searchStyles.userMeta}>
                    <span>Всього у фільмографії: {person.filmographyCount}</span>
                    {person.popularity !== null ? (
                      <span>Популярність: {person.popularity.toFixed(1)}</span>
                    ) : null}
                  </div>
                  <div className={searchStyles.plotBlock}>
                    <p className={`${searchStyles.resultPlot} ${searchStyles.resultPlotClamp}`}>
                      {person.knownForTitles.length > 0
                        ? `Відомий за: ${person.knownForTitles.join("; ")}`
                        : "Відомі роботи недоступні."}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </CatalogLayout>
  );
}
