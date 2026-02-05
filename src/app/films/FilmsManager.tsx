"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import CatalogModal from "@/components/catalog/CatalogModal";
import CatalogSearchModal from "@/components/catalog/CatalogSearchModal";
import RecommendModal from "@/components/recommendations/RecommendModal";
import Search from "@/components/search/Search";
import { supabase } from "@/lib/supabase/client";
import styles from "@/components/catalog/CatalogSearch.module.css";

type FilmResult = {
  id: string;
  title: string;
  year: string;
  poster: string;
  imageUrls?: string[];
  plot: string;
  genres: string;
  director: string;
  actors: string;
  imdbRating: string;
  source: "tmdb";
};

type FilmCollectionItem = {
  id: string;
  viewed_at: string;
  rating: number | null;
  comment: string | null;
  view_percent: number;
  recommend_similar: boolean;
  is_viewed: boolean;
  items: {
    id: string;
    title: string;
    description: string | null;
    poster_url: string | null;
    external_id: string | null;
    imdb_rating: string | null;
    type: string;
  };
};

type ContactOption = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

export default function FilmsManager() {
  const [collection, setCollection] = useState<FilmCollectionItem[]>([]);
  const [filterQuery, setFilterQuery] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedFilm, setSelectedFilm] = useState<FilmResult | null>(null);
  const [selectedView, setSelectedView] = useState<FilmCollectionItem | null>(
    null,
  );
  const [recommendItem, setRecommendItem] = useState<{
    itemId: string;
    title: string;
  } | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  const loadCollection = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setCollection([]);
      setMessage("Потрібна авторизація.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("user_views")
      .select(
        "id, viewed_at, rating, comment, view_percent, recommend_similar, is_viewed, items:items!inner (id, title, description, poster_url, external_id, imdb_rating, type)",
      )
      .eq("items.type", "film")
      .order("viewed_at", { ascending: false });

    if (error) {
      setMessage("Не вдалося завантажити колекцію.");
      setCollection([]);
    } else {
      setCollection((data as unknown as FilmCollectionItem[]) ?? []);
      if (!data || data.length === 0) {
        setMessage("Колекція порожня.");
      }
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCollection();
  }, [loadCollection]);

  const filteredCollection = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    if (!query) return collection;
    return collection.filter((item) => {
      const title = item.items.title?.toLowerCase() ?? "";
      const description = item.items.description?.toLowerCase() ?? "";
      return title.includes(query) || description.includes(query);
    });
  }, [collection, filterQuery]);

  const existingExternalIds = useMemo(() => {
    return new Set(
      collection
        .map((item) => item.items.external_id)
        .filter((id): id is string => Boolean(id)),
    );
  }, [collection]);

  const handleSearch = async (query: string) => {
    setFilterQuery(query);
  };

  const loadContacts = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setContacts([]);
      return;
    }

    const { data: contactRows } = await supabase
      .from("contacts")
      .select("other_user_id, status")
      .eq("user_id", user.id)
      .eq("status", "accepted");

    const ids =
      contactRows?.map((contact) => contact.other_user_id).filter(Boolean) ?? [];
    if (ids.length === 0) {
      setContacts([]);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", ids);

    const mapped =
      profiles?.map((profile) => ({
        id: profile.id,
        name: profile.username ?? profile.id.slice(0, 8),
        avatarUrl: profile.avatar_url,
      })) ?? [];

    setContacts(mapped);
  };

  const openRecommend = async (itemId: string, title: string) => {
    await loadContacts();
    setRecommendItem({ itemId, title });
  };

  const handleSendRecommendation = async (
    contactIds: string[],
    comment: string,
  ) => {
    if (!recommendItem) return 0;

    const { data, error } = await supabase.rpc("send_recommendation", {
      to_user_ids: contactIds,
      item_id: recommendItem.itemId,
      comment,
    });

    if (error) {
      throw new Error(error.message);
    }

    setMessage("Рекомендацію надіслано.");
    return (data as number) ?? 0;
  };

  const handleAddFilm = async (
    film: FilmResult,
    payload: {
    viewedAt: string;
    comment: string;
    recommendSimilar: boolean;
    isViewed: boolean;
    rating: number | null;
    viewPercent: number;
    },
  ) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Потрібна авторизація.");
    }

    const imdbRatingValue =
      film.imdbRating && film.imdbRating !== "N/A" ? film.imdbRating : null;

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
          imdb_rating: imdbRatingValue,
        })
        .select("id")
        .single();

      if (createError) {
        throw new Error("Не вдалося створити запис у каталозі.");
      }

      itemId = createdItem.id;
    }

    if (itemId && imdbRatingValue) {
      const { error: updateError } = await supabase
        .from("items")
        .update({ imdb_rating: imdbRatingValue })
        .eq("id", itemId);

      if (updateError) {
        throw new Error("Не вдалося оновити рейтинг IMDb.");
      }
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

    await loadCollection();
  };

  const handleUpdateView = async (
    viewId: string,
    payload: {
      viewedAt: string;
      comment: string;
      recommendSimilar: boolean;
      isViewed: boolean;
      rating: number | null;
      viewPercent: number;
    },
  ) => {
    const { error } = await supabase
      .from("user_views")
      .update({
        rating: payload.rating,
        comment: payload.comment,
        viewed_at: payload.viewedAt,
        is_viewed: payload.isViewed,
        view_percent: payload.viewPercent,
        recommend_similar: payload.recommendSimilar,
      })
      .eq("id", viewId);

    if (error) {
      throw new Error("Не вдалося оновити запис.");
    }

    await loadCollection();
  };

  const handleDeleteView = async (viewId: string) => {
    const { error } = await supabase.from("user_views").delete().eq("id", viewId);

    if (error) {
      throw new Error("Не вдалося видалити запис.");
    }

    await loadCollection();
  };

  const handleTmdbSearch = async (query: string) => {
    const response = await fetch(`/api/tmdb?q=${encodeURIComponent(query)}`);
    const data = (await response.json()) as {
      results?: FilmResult[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error ?? "Не вдалося виконати пошук.");
    }

    return data.results ?? [];
  };

  const handleFilmSearch = async (query: string) => {
    const tmdbResults = await handleTmdbSearch(query);
    return tmdbResults.filter((item) => !existingExternalIds.has(item.id));
  };

  return (
    <div className={styles.searchBlock}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarSearch}>
          <Search
            onSearch={handleSearch}
            mode="instant"
            label=""
            placeholder="Фільтр"
            showButton={false}
          />
        </div>
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className="btnBase btnPrimary"
            onClick={() => setIsAddOpen(true)}
          >
            Додати
          </button>
        </div>
      </div>

      {message ? <p className={styles.message}>{message}</p> : null}
      {isLoading ? <p className={styles.message}>Завантаження...</p> : null}

      <div className={styles.results}>
        {filteredCollection.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.resultItem} ${styles.resultButton}`}
            onClick={() => setSelectedView(item)}
          >
            <div className={styles.posterWrapper}>
              {item.items.poster_url ? (
                <Image
                  className={styles.poster}
                  src={item.items.poster_url}
                  alt={`Постер ${item.items.title}`}
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
                <h2 className={styles.resultTitle}>{item.items.title}</h2>
                <div className={styles.ratingRow}>
                  <span className={styles.resultRating}>
                    Загальний: {item.items.imdb_rating ?? "—"}
                  </span>
                  <span className={styles.resultRating}>
                    Мій: {item.rating ?? "—"}
                  </span>
                </div>
              </div>
              {item.items.description ? (
                <p className={styles.resultPlot}>{item.items.description}</p>
              ) : (
                <p className={styles.resultPlot}>Опис недоступний.</p>
              )}
              <div className={styles.userMeta}>
                <span>Переглянуто: {item.viewed_at.slice(0, 10)}</span>
                <span>Відсоток: {item.view_percent}%</span>
                <span>Рекомендації: {item.recommend_similar ? "так" : "ні"}</span>
                {item.comment ? <span>Коментар: {item.comment}</span> : null}
              </div>
            </div>
          </button>
        ))}
      </div>

      {isAddOpen ? (
        <CatalogSearchModal
          title="Додати фільм"
          onSearch={handleFilmSearch}
          getKey={(film) => film.id}
          onSelect={async (film) => {
            try {
              const detailResponse = await fetch(`/api/tmdb/${film.id}`);
              if (detailResponse.ok) {
                const detail = (await detailResponse.json()) as FilmResult;
                setSelectedFilm(detail);
                setIsAddOpen(false);
                return;
              }
            } catch {
              // fallback to search data
            }

            setSelectedFilm(film);
            setIsAddOpen(false);
          }}
          onClose={() => setIsAddOpen(false)}
          renderItem={(film) => (
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
                      Загальний: {film.imdbRating}
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
        />
      ) : null}

      {selectedFilm ? (
        <CatalogModal
          title={selectedFilm.title}
          posterUrl={selectedFilm.poster}
          imageUrls={selectedFilm.imageUrls}
          onClose={() => setSelectedFilm(null)}
          onAdd={(payload) => handleAddFilm(selectedFilm, payload)}
        >
          <div className={styles.resultContent}>
            <div className={styles.titleRow}>
              <h2 className={styles.resultTitle}>
                {selectedFilm.title}{" "}
                <span className={styles.resultYear}>({selectedFilm.year})</span>
              </h2>
              {selectedFilm.imdbRating ? (
                <span className={styles.resultRating}>
                  Загальний: {selectedFilm.imdbRating}
                </span>
              ) : null}
            </div>
            {selectedFilm.genres ? (
              <p className={styles.resultMeta}>{selectedFilm.genres}</p>
            ) : null}
            {selectedFilm.director ? (
              <p className={styles.resultMeta}>
                Режисер: {selectedFilm.director}
              </p>
            ) : null}
            {selectedFilm.actors ? (
              <p className={styles.resultMeta}>Актори: {selectedFilm.actors}</p>
            ) : null}
            <p className={styles.resultPlot}>
              {selectedFilm.plot ? selectedFilm.plot : "Опис недоступний."}
            </p>
          </div>
        </CatalogModal>
      ) : null}

      {selectedView ? (
        <CatalogModal
          title={selectedView.items.title}
          posterUrl={selectedView.items.poster_url ?? undefined}
          imageUrls={
            selectedView.items.poster_url ? [selectedView.items.poster_url] : []
          }
          onClose={() => setSelectedView(null)}
          submitLabel="Зберегти"
          extraActions={
            <button
              type="button"
              className="btnBase btnSecondary"
              onClick={() =>
                openRecommend(selectedView.items.id, selectedView.items.title)
              }
            >
              Порекомендувати другу
            </button>
          }
          initialValues={{
            viewedAt: selectedView.viewed_at,
            comment: selectedView.comment,
            recommendSimilar: selectedView.recommend_similar,
            isViewed: selectedView.is_viewed,
            rating: selectedView.rating,
            viewPercent: selectedView.view_percent,
          }}
          onAdd={(payload) => handleUpdateView(selectedView.id, payload)}
          onDelete={() => handleDeleteView(selectedView.id)}
        >
          <div className={styles.resultContent}>
            <div className={styles.titleRow}>
              <h2 className={styles.resultTitle}>{selectedView.items.title}</h2>
            </div>
            {selectedView.items.description ? (
              <p className={styles.resultPlot}>{selectedView.items.description}</p>
            ) : (
              <p className={styles.resultPlot}>Опис недоступний.</p>
            )}
          </div>
        </CatalogModal>
      ) : null}

      {recommendItem ? (
        <RecommendModal
          title={recommendItem.title}
          contacts={contacts}
          onClose={() => setRecommendItem(null)}
          onSend={handleSendRecommendation}
        />
      ) : null}
    </div>
  );
}
