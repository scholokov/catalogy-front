"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import searchStyles from "@/components/catalog/CatalogSearch.module.css";
import styles from "./ActorsPage.module.css";

type ActorSearchResult = {
  id: string;
  name: string;
  originalName: string;
  knownForDepartment: string;
  popularity: number | null;
  profileUrl: string;
  filmographyCount: number;
  knownForTitles: string[];
};

export default function ActorsPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ActorSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(
    "Знайди актора, щоб перейти до його сторінки та побачити фільмографію з розділенням на наявне і відсутнє в колекції.",
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) {
      setResults([]);
      setMessage("Введи ім’я актора для пошуку.");
      return;
    }

    setIsLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/tmdb/person-search?q=${encodeURIComponent(nextQuery)}`,
      );
      const data = (await response.json()) as {
        results?: ActorSearchResult[];
        error?: string;
      };

      if (!response.ok) {
        setResults([]);
        setMessage(data.error ?? "Не вдалося виконати пошук акторів.");
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
        error instanceof Error ? error.message : "Не вдалося виконати пошук акторів.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CatalogLayout
      title="Актори"
      description="Пошук по TMDB і перехід до actor page з фільмографією та перетином із твоєю колекцією."
    >
      <div className={styles.content}>
        <form className={styles.searchForm} onSubmit={handleSubmit}>
          <input
            className={styles.searchInput}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Наприклад: Cillian Murphy"
            aria-label="Пошук актора"
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
            {results.map((actor) => (
              <Link
                key={actor.id}
                href={`/actors/${actor.id}`}
                className={`${searchStyles.resultItem} ${searchStyles.resultButton} ${searchStyles.collectionItem} ${styles.personCard}`}
              >
                <div className={searchStyles.resultHeader}>
                  <div className={searchStyles.titleRow}>
                    <h2 className={searchStyles.resultTitle}>{actor.name}</h2>
                    {actor.knownForDepartment ? (
                      <div className={searchStyles.ratingRow}>
                        <span className={searchStyles.resultMeta}>
                          {actor.knownForDepartment}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className={searchStyles.posterWrapper}>
                  {actor.profileUrl ? (
                    <Image
                      src={actor.profileUrl}
                      alt={actor.name}
                      width={180}
                      height={270}
                      className={searchStyles.poster}
                    />
                  ) : (
                    <div className={searchStyles.posterPlaceholder}>Фото недоступне</div>
                  )}
                </div>
                <div className={searchStyles.resultContent}>
                  {actor.originalName && actor.originalName !== actor.name ? (
                    <p className={searchStyles.resultMeta}>
                      Оригінальне ім’я: {actor.originalName}
                    </p>
                  ) : null}
                  <p className={searchStyles.resultMeta}>
                    Всього в filmography: {actor.filmographyCount}
                  </p>
                  {actor.knownForTitles.length > 0 ? (
                    <p className={searchStyles.resultMeta}>
                      Відомий за: {actor.knownForTitles.join("; ")}
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
