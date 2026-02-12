"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import Image from "next/image";
import { Range, getTrackBackground } from "react-range";
import CatalogModal from "@/components/catalog/CatalogModal";
import CatalogSearchModal from "@/components/catalog/CatalogSearchModal";
import RecommendModal from "@/components/recommendations/RecommendModal";
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
    year?: number | null;
    type: string;
  };
};

type ContactOption = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

type FilmsManagerProps = {
  onCountChange?: (count: number) => void;
};

type Filters = {
  query: string;
  viewed: boolean;
  planned: boolean;
  yearRange: [number, number];
};

const MIN_YEAR = 1950;
const MAX_YEAR = new Date().getFullYear();
const PAGE_SIZE = 20;
const DEFAULT_FILTERS: Filters = {
  query: "",
  viewed: true,
  planned: true,
  yearRange: [MIN_YEAR, MAX_YEAR],
};

const clampRange = (range: [number, number], bounds: [number, number]) => {
  const [min, max] = bounds;
  const start = Math.min(Math.max(range[0], min), max);
  const end = Math.max(Math.min(range[1], max), min);
  return start <= end ? ([start, end] as [number, number]) : ([min, max] as [number, number]);
};

export default function FilmsManager({ onCountChange }: FilmsManagerProps) {
  const [collection, setCollection] = useState<FilmCollectionItem[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [pendingFilters, setPendingFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [hasApplied, setHasApplied] = useState(false);
  const [yearBounds, setYearBounds] = useState<[number, number]>([
    MIN_YEAR,
    MAX_YEAR,
  ]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedFilm, setSelectedFilm] = useState<FilmResult | null>(null);
  const [selectedView, setSelectedView] = useState<FilmCollectionItem | null>(
    null,
  );
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(
    new Set(),
  );
  const [overflowDescriptions, setOverflowDescriptions] = useState<Set<string>>(
    new Set(),
  );
  const [recommendedItemIds, setRecommendedItemIds] = useState<Set<string>>(
    new Set(),
  );
  const [filmDetails, setFilmDetails] = useState<
    Record<string, { director?: string; actors?: string; year?: string; genres?: string }>
  >({});
  const descriptionRefs = useRef<Map<string, HTMLParagraphElement | null>>(
    new Map(),
  );
  const fetchingDetailsRef = useRef<Set<string>>(new Set());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const skipNextApplyRef = useRef(false);
  const loadingPagesRef = useRef<Set<number>>(new Set());
  const [recommendItem, setRecommendItem] = useState<{
    itemId: string;
    title: string;
  } | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  const loadRecommendations = useCallback(
    async (itemIds: string[], shouldReset: boolean) => {
      if (itemIds.length === 0) {
        if (shouldReset) setRecommendedItemIds(new Set());
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (shouldReset) setRecommendedItemIds(new Set());
        return;
      }
      const { data: recommendations } = await supabase
        .from("recommendations")
        .select("item_id")
        .eq("from_user_id", user.id)
        .in("item_id", itemIds);
      const ids = (recommendations ?? [])
        .map((row) => row.item_id)
        .filter((id): id is string => Boolean(id));
      setRecommendedItemIds((prev) => {
        if (shouldReset) return new Set(ids);
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
    },
    [],
  );

  const fetchPage = useCallback(async (pageIndex: number, filters: Filters) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setCollection([]);
      setMessage("Потрібна авторизація.");
      setRecommendedItemIds(new Set());
      setHasMore(false);
      setIsLoading(false);
      setIsLoadingMore(false);
      loadingPagesRef.current.delete(pageIndex);
      return false;
    }

    const trimmedQuery = filters.query.trim();
    if (!filters.viewed && !filters.planned) {
      if (pageIndex === 0) {
        setCollection([]);
        setHasMore(false);
        setMessage("Оберіть фільтри.");
      }
      loadingPagesRef.current.delete(pageIndex);
      return false;
    }

    if (loadingPagesRef.current.has(pageIndex)) {
      return false;
    }
    loadingPagesRef.current.add(pageIndex);

    if (pageIndex === 0) {
      setIsLoading(true);
      setMessage("");
    } else {
      setIsLoadingMore(true);
    }

    let query = supabase
      .from("user_views")
      .select(
        "id, viewed_at, rating, comment, view_percent, recommend_similar, is_viewed, items:items!inner (id, title, description, poster_url, external_id, imdb_rating, year, type)",
      )
      .eq("items.type", "film")
      .order("viewed_at", { ascending: false });

    if (filters.viewed !== filters.planned) {
      query = query.eq("is_viewed", filters.viewed);
    }

    if (trimmedQuery) {
      const escaped = trimmedQuery.replaceAll("%", "\\%");
      query = query.or(
        `items.title.ilike.%${escaped}%,items.description.ilike.%${escaped}%`,
      );
    }

    const [minYear, maxYear] = yearBounds;
    const [fromYear, toYear] = clampRange(filters.yearRange, yearBounds);
    const isYearFilterActive = fromYear !== minYear || toYear !== maxYear;
    if (isYearFilterActive) {
      query = query.gte("items.year", fromYear).lte("items.year", toYear);
    }

    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await query.range(from, to);

    if (error) {
      if (pageIndex === 0) {
        setMessage("Не вдалося завантажити колекцію.");
        setCollection([]);
        setHasMore(false);
      }
      setIsLoading(false);
      setIsLoadingMore(false);
      loadingPagesRef.current.delete(pageIndex);
      return false;
    } else {
      const nextCollection = (data as unknown as FilmCollectionItem[]) ?? [];
      setCollection((prev) => {
        if (pageIndex === 0) {
          return nextCollection;
        }
        const existingIds = new Set(prev.map((item) => item.id));
        const merged = [...prev];
        nextCollection.forEach((item) => {
          if (!existingIds.has(item.id)) {
            merged.push(item);
          }
        });
        return merged;
      });
      const nextHasMore = nextCollection.length === PAGE_SIZE;
      setHasMore(nextHasMore);
      setPage(pageIndex);
      if (pageIndex === 0 && nextCollection.length === 0) {
        setMessage("Колекція порожня.");
      }

      const itemIds = nextCollection
        .map((item) => item.items.id)
        .filter(Boolean);
      await loadRecommendations(itemIds, pageIndex === 0);
      setIsLoading(false);
      setIsLoadingMore(false);
      loadingPagesRef.current.delete(pageIndex);
      return nextHasMore;
    }
  }, [loadRecommendations, yearBounds]);

  useEffect(() => {
    if (!hasApplied) return;
    if (skipNextApplyRef.current) {
      skipNextApplyRef.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPage(0, appliedFilters);
  }, [appliedFilters, fetchPage, hasApplied]);

  useEffect(() => {
    if (hasApplied) return;
    skipNextApplyRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAppliedFilters(DEFAULT_FILTERS);
    setHasApplied(true);
    void (async () => {
      const canLoadMore = await fetchPage(0, DEFAULT_FILTERS);
      if (canLoadMore) {
        await fetchPage(1, DEFAULT_FILTERS);
      }
    })();
  }, [fetchPage, hasApplied]);

  const loadYearBounds = useCallback(async () => {
    const { data: minRows } = await supabase
      .from("items")
      .select("year")
      .eq("type", "film")
      .not("year", "is", null)
      .order("year", { ascending: true })
      .limit(1);
    const { data: maxRows } = await supabase
      .from("items")
      .select("year")
      .eq("type", "film")
      .not("year", "is", null)
      .order("year", { ascending: false })
      .limit(1);

    const min = Number(minRows?.[0]?.year);
    const max = Number(maxRows?.[0]?.year);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return;
    }

    const bounds: [number, number] = [min, max];
    setYearBounds(bounds);
    setPendingFilters((prev) => {
      const nextRange = clampRange(prev.yearRange, bounds);
      if (
        nextRange[0] === prev.yearRange[0] &&
        nextRange[1] === prev.yearRange[1]
      ) {
        return prev;
      }
      return { ...prev, yearRange: nextRange };
    });
    setAppliedFilters((prev) => {
      const nextRange = clampRange(prev.yearRange, bounds);
      if (
        nextRange[0] === prev.yearRange[0] &&
        nextRange[1] === prev.yearRange[1]
      ) {
        return prev;
      }
      return { ...prev, yearRange: nextRange };
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadYearBounds();
  }, [loadYearBounds]);

  useEffect(() => {
    if (!hasApplied || isLoading || isLoadingMore || !hasMore) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      void fetchPage(page + 1, appliedFilters);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [appliedFilters, fetchPage, hasApplied, hasMore, isLoading, isLoadingMore, page]);

  useEffect(() => {
    onCountChange?.(collection.length);
  }, [collection.length, onCountChange]);

  useEffect(() => {
    if (!isFiltersOpen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFiltersOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFiltersOpen]);

  const existingExternalIds = useMemo(() => {
    return new Set(
      collection
        .map((item) => item.items.external_id)
        .filter((id): id is string => Boolean(id)),
    );
  }, [collection]);

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
    setRecommendedItemIds((prev) => {
      const next = new Set(prev);
      next.add(recommendItem.itemId);
      return next;
    });
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
    const parsedYear = Number.parseInt(film.year, 10);
    const yearValue = Number.isNaN(parsedYear) ? null : parsedYear;

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
          year: yearValue,
        })
        .select("id")
        .single();

      if (createError) {
        throw new Error("Не вдалося створити запис у каталозі.");
      }

      itemId = createdItem.id;
    }

    const itemUpdates: { imdb_rating?: string | null; year?: number | null } = {};
    if (imdbRatingValue) {
      itemUpdates.imdb_rating = imdbRatingValue;
    }
    if (yearValue) {
      itemUpdates.year = yearValue;
    }
    if (itemId && Object.keys(itemUpdates).length > 0) {
      const { error: updateError } = await supabase
        .from("items")
        .update(itemUpdates)
        .eq("id", itemId);

      if (updateError) {
        throw new Error("Не вдалося оновити дані фільму.");
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

    await loadYearBounds();
    setHasApplied(true);
    await fetchPage(0, appliedFilters);
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

    setHasApplied(true);
    await fetchPage(0, appliedFilters);
  };

  const handleDeleteView = async (viewId: string) => {
    const { error } = await supabase.from("user_views").delete().eq("id", viewId);

    if (error) {
      throw new Error("Не вдалося видалити запис.");
    }

    setHasApplied(true);
    await fetchPage(0, appliedFilters);
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

  const handleExpandDescription = (
    event: MouseEvent | KeyboardEvent,
    id: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setExpandedDescriptions((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const formatViewedDate = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split("-");
    if (!year || !month || !day) return value.slice(0, 10);
    return `${day}.${month}.${year}`;
  };

  useEffect(() => {
    collection.forEach((item) => {
      const externalId = item.items.external_id;
      if (!externalId) return;
      if (filmDetails[item.items.id] || fetchingDetailsRef.current.has(item.id)) {
        return;
      }

      fetchingDetailsRef.current.add(item.id);
      void fetch(`/api/tmdb/${externalId}`)
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as FilmResult;
        })
        .then((detail) => {
          if (!detail) return;
          setFilmDetails((prev) => ({
            ...prev,
            [item.items.id]: {
              director: detail.director,
              actors: detail.actors,
              year: detail.year,
              genres: detail.genres,
            },
          }));
          if (!item.items.year && detail.year) {
            const parsedYear = Number.parseInt(detail.year.slice(0, 4), 10);
            if (!Number.isNaN(parsedYear)) {
              void supabase
                .from("items")
                .update({ year: parsedYear })
                .eq("id", item.items.id);
            }
          }
        })
        .finally(() => {
          fetchingDetailsRef.current.delete(item.id);
        });
    });
  }, [collection, filmDetails]);

  useEffect(() => {
    const next = new Set<string>();
    descriptionRefs.current.forEach((node, id) => {
      if (!node) return;
      if (node.scrollHeight > node.clientHeight + 1) {
        next.add(id);
      }
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverflowDescriptions(next);
  }, [expandedDescriptions, collection]);

  const handleFilmSearch = async (query: string) => {
    const tmdbResults = await handleTmdbSearch(query);
    return tmdbResults.filter((item) => !existingExternalIds.has(item.id));
  };

  return (
    <div className={styles.searchBlock}>
      <div className={styles.filtersWrapper}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarSearch}>
            <button
              type="button"
              className="btnBase btnSecondary"
              onClick={() => {
                setPendingFilters(appliedFilters);
                setIsFiltersOpen(true);
              }}
            >
              Фільтри
            </button>
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
      </div>

      {!hasApplied ? (
        <p className={styles.message}>
          Оберіть фільтри та натисніть &quot;Відобразити&quot;.
        </p>
      ) : null}
      {message ? <p className={styles.message}>{message}</p> : null}
      {isLoading ? <p className={styles.message}>Завантаження...</p> : null}

      <div className={styles.results}>
        {collection.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.resultItem} ${styles.resultButton} ${styles.collectionItem}`}
            onClick={() => setSelectedView(item)}
          >
                  <div className={styles.resultHeader}>
                    <div className={styles.titleRow}>
                      <h2 className={styles.resultTitle}>{item.items.title}</h2>
                      <div className={styles.ratingRow}>
                        <span className={styles.resultRating}>
                          IMDb: {item.items.imdb_rating ?? "—"}
                        </span>
                        <span className={styles.resultRating}>
                          Мій: {item.rating ?? "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.posterWrapper}>
                    {item.items.poster_url ? (
                      <Image
                        className={styles.poster}
                        src={item.items.poster_url}
                        alt={`Постер ${item.items.title}`}
                        width={180}
                        height={270}
                        sizes="(max-width: 600px) 100vw, 120px"
                        loading="lazy"
                        unoptimized
                      />
                    ) : (
                      <div className={styles.posterPlaceholder}>No image</div>
                    )}
                  </div>
                  <div className={styles.resultContent}>
                    {filmDetails[item.items.id]?.year ? (
                      <p className={styles.resultMeta}>
                        Рік: {filmDetails[item.items.id]?.year}
                      </p>
                    ) : null}
                    {filmDetails[item.items.id]?.director ? (
                      <p className={styles.resultMeta}>
                        Режисер: {filmDetails[item.items.id]?.director}
                      </p>
                    ) : null}
                    {filmDetails[item.items.id]?.actors ? (
                      <p className={styles.resultMeta}>
                        Актори: {filmDetails[item.items.id]?.actors}
                      </p>
                    ) : null}
                    {filmDetails[item.items.id]?.genres ? (
                      <p className={styles.resultMeta}>
                        Жанри: {filmDetails[item.items.id]?.genres}
                      </p>
                    ) : null}
                    {item.items.description ? (
                      <div className={styles.plotBlock}>
                        <p
                          className={`${styles.resultPlot} ${
                            expandedDescriptions.has(item.id)
                              ? ""
                              : styles.resultPlotClamp
                          }`}
                          ref={(node) => {
                            if (node) {
                              descriptionRefs.current.set(item.id, node);
                            } else {
                              descriptionRefs.current.delete(item.id);
                            }
                          }}
                        >
                          {item.items.description}
                        </p>
                        {!expandedDescriptions.has(item.id) &&
                        overflowDescriptions.has(item.id) ? (
                          <span
                            className={styles.plotToggle}
                            role="button"
                            tabIndex={0}
                            onClick={(event) =>
                              handleExpandDescription(event, item.id)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                handleExpandDescription(event, item.id);
                              }
                            }}
                          >
                            детальніше...
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <p className={styles.resultPlot}>Опис недоступний.</p>
                    )}
                    <div className={styles.userMeta}>
                      <span>
                        Переглянуто:{" "}
                        {item.is_viewed
                          ? `${formatViewedDate(item.viewed_at)} (${item.view_percent}%)`
                          : "ні"}
                      </span>
                      {recommendedItemIds.has(item.items.id) ? (
                        <span>Рекомендовано друзям</span>
                      ) : null}
                      {item.comment ? <span>Коментар: {item.comment}</span> : null}
                    </div>
                  </div>
          </button>
        ))}
      </div>
      {hasApplied && hasMore ? (
        <div ref={loadMoreRef} />
      ) : null}
      {isLoadingMore ? <p className={styles.message}>Завантаження...</p> : null}

      {isFiltersOpen ? (
        <div
          className={styles.filtersOverlay}
          role="dialog"
          aria-modal="true"
          onClick={() => setIsFiltersOpen(false)}
        >
          <div
            className={styles.filtersModal}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.filtersHeader}>
              <h2 className={styles.filtersTitle}>Фільтри</h2>
              <button
                type="button"
                className={styles.filtersClose}
                onClick={() => setIsFiltersOpen(false)}
                aria-label="Закрити"
              >
                ✕
              </button>
            </div>
            <label className={styles.filtersField}>
              Пошук
              <input
                className={styles.filtersInput}
                value={pendingFilters.query}
                onChange={(event) =>
                  setPendingFilters((prev) => ({
                    ...prev,
                    query: event.target.value,
                  }))
                }
              />
            </label>
            <div className={styles.rangeBlock}>
              <div className={styles.rangeHeader}>
                <span>Рік</span>
                <span className={styles.rangeValues}>
                  {pendingFilters.yearRange[0]}–{pendingFilters.yearRange[1]}
                </span>
              </div>
              {yearBounds[0] === yearBounds[1] ? (
                <div className={styles.rangeTrack}>
                  <div className={styles.rangeTrackInner} />
                </div>
              ) : (
                <Range
                  values={pendingFilters.yearRange}
                  step={1}
                  min={yearBounds[0]}
                  max={yearBounds[1]}
                  onChange={(values) =>
                    setPendingFilters((prev) => ({
                      ...prev,
                      yearRange: values as [number, number],
                    }))
                  }
                  renderTrack={({ props, children }) => (
                    <div
                      onMouseDown={props.onMouseDown}
                      onTouchStart={props.onTouchStart}
                      className={styles.rangeTrack}
                    >
                      <div
                        ref={props.ref}
                        className={styles.rangeTrackInner}
                        style={{
                          background: getTrackBackground({
                            values: pendingFilters.yearRange,
                            colors: [
                              "var(--color-border)",
                              "var(--color-accent)",
                              "var(--color-border)",
                            ],
                            min: yearBounds[0],
                            max: yearBounds[1],
                          }),
                        }}
                      >
                        {children}
                      </div>
                    </div>
                  )}
                  renderThumb={({ props }) => {
                    const { key, ...restProps } = props;
                    return (
                      <div
                        key={key}
                        {...restProps}
                        className={styles.rangeThumb}
                      />
                    );
                  }}
                />
              )}
            </div>
            <div className={styles.filtersControls}>
              <label className={styles.filtersOption}>
                <input
                  className={styles.filtersCheckbox}
                  type="checkbox"
                  checked={pendingFilters.viewed}
                  onChange={(event) =>
                    setPendingFilters((prev) => ({
                      ...prev,
                      viewed: event.target.checked,
                    }))
                  }
                />
                Переглянуто
              </label>
              <label className={styles.filtersOption}>
                <input
                  className={styles.filtersCheckbox}
                  type="checkbox"
                  checked={pendingFilters.planned}
                  onChange={(event) =>
                    setPendingFilters((prev) => ({
                      ...prev,
                      planned: event.target.checked,
                    }))
                  }
                />
                Заплановано
              </label>
            </div>
            <div className={styles.filtersActions}>
              <button
                type="button"
                className="btnBase btnSecondary"
                onClick={() => setIsFiltersOpen(false)}
              >
                Скасувати
              </button>
              <button
                type="button"
                className="btnBase btnPrimary"
                onClick={() => {
                  setAppliedFilters(pendingFilters);
                  setHasApplied(true);
                  setIsFiltersOpen(false);
                }}
              >
                Відобразити
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAddOpen ? (
        <CatalogSearchModal
          title="Додати фільм"
          onSearch={handleFilmSearch}
          getKey={(film) => film.id}
          initialQuery={appliedFilters.query}
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
                        width={180}
                        height={270}
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
              {selectedFilm.imdbRating ? (
                <span className={styles.resultRating}>
                  IMDb: {selectedFilm.imdbRating}
                </span>
              ) : null}
            </div>
            {selectedFilm.year ? (
              <p className={styles.resultMeta}>Рік: {selectedFilm.year}</p>
            ) : null}
            {selectedFilm.director ? (
              <p className={styles.resultMeta}>
                Режисер: {selectedFilm.director}
              </p>
            ) : null}
            {selectedFilm.actors ? (
              <p className={styles.resultMeta}>Актори: {selectedFilm.actors}</p>
            ) : null}
            {selectedFilm.genres ? (
              <p className={styles.resultMeta}>Жанри: {selectedFilm.genres}</p>
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
              <span className={styles.resultRating}>
                IMDb: {selectedView.items.imdb_rating ?? "—"}
              </span>
              <span className={styles.resultRating}>
                Мій: {selectedView.rating ?? "—"}
              </span>
            </div>
            {filmDetails[selectedView.items.id]?.year ? (
              <p className={styles.resultMeta}>
                Рік: {filmDetails[selectedView.items.id]?.year}
              </p>
            ) : null}
            {filmDetails[selectedView.items.id]?.director ? (
              <p className={styles.resultMeta}>
                Режисер: {filmDetails[selectedView.items.id]?.director}
              </p>
            ) : null}
            {filmDetails[selectedView.items.id]?.actors ? (
              <p className={styles.resultMeta}>
                Актори: {filmDetails[selectedView.items.id]?.actors}
              </p>
            ) : null}
            {filmDetails[selectedView.items.id]?.genres ? (
              <p className={styles.resultMeta}>
                Жанри: {filmDetails[selectedView.items.id]?.genres}
              </p>
            ) : null}
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
