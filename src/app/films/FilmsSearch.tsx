"use client";

import CatalogSearch from "@/components/catalog/CatalogSearch";
import Image from "next/image";
import { addFilmToCollection } from "@/lib/films/collectionFlow";
import { supabase } from "@/lib/supabase/client";
import styles from "@/components/catalog/CatalogSearch.module.css";

type FilmResult = {
  id: string;
  title: string;
  year: string;
  poster: string;
  plot: string;
  genres: string;
  director: string;
  actors: string;
  imdbRating: string;
};

export default function FilmsSearch() {
  const handleSearch = async (query: string) => {
    const response = await fetch(`/api/omdb?q=${encodeURIComponent(query)}`);
    const data = (await response.json()) as {
      results?: FilmResult[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error ?? "Не вдалося виконати пошук.");
    }

    return data.results ?? [];
  };

  return (
    <CatalogSearch
      onSearch={handleSearch}
      getKey={(film) => film.id}
      getTitle={(film) => film.title}
      getPoster={(film) => film.poster}
      onAdd={async (film, payload) => {
        await addFilmToCollection({
          supabase,
          film: {
            id: film.id,
            title: film.title,
            year: film.year,
            poster: film.poster,
            plot: film.plot,
            genres: film.genres,
            director: film.director,
            actors: film.actors,
            imdbRating: film.imdbRating,
            mediaType: "movie",
          },
          payload,
          allowUpdateExistingView: false,
        });
      }}
      renderCardContent={(film) => (
        <>
          <div className={styles.posterWrapper}>
            {film.poster && film.poster !== "N/A" ? (
              <Image
                className={styles.poster}
                src={film.poster}
                alt={`Постер ${film.title}`}
                width={120}
                height={180}
                unoptimized
              />
            ) : (
              <div className={styles.posterPlaceholder}>No image</div>
            )}
          </div>
          <div className={styles.resultContent}>
            <div className={styles.titleRow}>
              <h2 className={styles.resultTitle}>
                {film.title}{" "}
                <span className={styles.resultYear}>({film.year})</span>
              </h2>
              {film.imdbRating ? (
                <span className={styles.resultRating}>
                  IMDb: {film.imdbRating}
                </span>
              ) : null}
            </div>
            {film.genres ? (
              <p className={styles.resultMeta}>{film.genres}</p>
            ) : null}
            {film.director ? (
              <p className={styles.resultMeta}>Режисер: {film.director}</p>
            ) : null}
            {film.actors ? (
              <p className={styles.resultMeta}>Актори: {film.actors}</p>
            ) : null}
            <p className={styles.resultPlot}>
              {film.plot ? film.plot : "Опис недоступний."}
            </p>
          </div>
        </>
      )}
      renderModalContent={(film) => (
        <div className={styles.resultContent}>
          <div className={styles.titleRow}>
            <h2 className={styles.resultTitle}>
              {film.title}{" "}
              <span className={styles.resultYear}>({film.year})</span>
            </h2>
            {film.imdbRating ? (
              <span className={styles.resultRating}>
                IMDb: {film.imdbRating}
              </span>
            ) : null}
          </div>
          {film.genres ? <p className={styles.resultMeta}>{film.genres}</p> : null}
          {film.director ? (
            <p className={styles.resultMeta}>Режисер: {film.director}</p>
          ) : null}
          {film.actors ? (
            <p className={styles.resultMeta}>Актори: {film.actors}</p>
          ) : null}
          <p className={styles.resultPlot}>
            {film.plot ? film.plot : "Опис недоступний."}
          </p>
        </div>
      )}
    />
  );
}
