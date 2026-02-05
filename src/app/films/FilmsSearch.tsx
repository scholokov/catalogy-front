"use client";

import CatalogSearch from "@/components/catalog/CatalogSearch";
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
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          throw new Error("Потрібна авторизація.");
        }

        const { data: existingItem, error: findError } = await supabase
          .from("items")
          .select("id")
          .eq("type", "film")
          .eq("external_id", film.id)
          .maybeSingle();

        if (findError) {
          throw new Error("Не вдалося перевірити каталог.");
        }

        let itemId = existingItem?.id;

        if (!itemId) {
          const { data: createdItem, error: createError } = await supabase
            .from("items")
            .insert({
              type: "film",
              title: film.title,
              description: film.plot,
              poster_url: film.poster,
              external_id: film.id,
            })
            .select("id")
            .single();

          if (createError) {
            throw new Error("Не вдалося створити запис у каталозі.");
          }

          itemId = createdItem.id;
        }

        const { error: viewError } = await supabase.from("user_views").insert({
          user_id: user.id,
          item_id: itemId,
          rating: payload.rating,
          comment: payload.comment,
          viewed_at: payload.viewedAt,
          is_viewed: payload.isViewed,
          view_percent: payload.viewPercent,
          recommend_similar: payload.recommendSimilar,
        });

        if (viewError) {
          throw new Error("Не вдалося зберегти у колекцію.");
        }
      }}
      renderCardContent={(film) => (
        <>
          <div className={styles.posterWrapper}>
            {film.poster && film.poster !== "N/A" ? (
              <img
                className={styles.poster}
                src={film.poster}
                alt={`Постер ${film.title}`}
                loading="lazy"
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
