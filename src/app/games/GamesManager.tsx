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
import CatalogSearchModal from "@/components/catalog/CatalogSearchModal";
import CatalogModal from "@/components/catalog/CatalogModal";
import RecommendModal from "@/components/recommendations/RecommendModal";
import { supabase } from "@/lib/supabase/client";
import styles from "@/components/catalog/CatalogSearch.module.css";

type GameResult = {
  id: string;
  title: string;
  rating: number | null;
  released: string;
  poster: string;
  genres: string;
};

type GameCollectionItem = {
  id: string;
  viewed_at: string;
  rating: number | null;
  comment: string | null;
  view_percent: number;
  recommend_similar: boolean;
  is_viewed: boolean;
  availability: string | null;
  platforms: string[] | null;
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

type GamesManagerProps = {
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
const GAME_PLATFORM_OPTIONS = ["PS", "Steam", "PC", "Android", "iOS", "Xbox"];
const AVAILABILITY_OPTIONS = [
  "В колекції",
  "Тимчасовий доступ",
  "У друзів",
  "Відсутній",
];
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

export default function GamesManager({ onCountChange }: GamesManagerProps) {
  const [collection, setCollection] = useState<GameCollectionItem[]>([]);
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
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);
  const [selectedView, setSelectedView] = useState<GameCollectionItem | null>(
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
  const [gameDetails, setGameDetails] = useState<
    Record<string, { released?: string; genres?: string }>
  >({});
  const [searchDescriptions, setSearchDescriptions] = useState<
    Record<string, string>
  >({});
  const descriptionRefs = useRef<Map<string, HTMLParagraphElement | null>>(
    new Map(),
  );
  const fetchingDetailsRef = useRef<Set<string>>(new Set());
  const fetchingSearchDescRef = useRef<Set<string>>(new Set());
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
        "id, viewed_at, rating, comment, view_percent, recommend_similar, is_viewed, availability, platforms, items:items!inner (id, title, description, poster_url, external_id, imdb_rating, year, type)",
      )
      .eq("items.type", "game")
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
      const nextCollection = (data as unknown as GameCollectionItem[]) ?? [];
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
    void fetchPage(0, appliedFilters);
  }, [appliedFilters, fetchPage, hasApplied]);

  useEffect(() => {
    if (hasApplied) return;
    skipNextApplyRef.current = true;
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
      .eq("type", "game")
      .not("year", "is", null)
      .order("year", { ascending: true })
      .limit(1);
    const { data: maxRows } = await supabase
      .from("items")
      .select("year")
      .eq("type", "game")
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

  const handleAddGame = async (
    game: GameResult,
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
  ) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Потрібна авторизація.");
    }

    const overallRating =
      typeof game.rating === "number" ? game.rating.toFixed(1) : null;
    const parsedYear = game.released ? Number.parseInt(game.released.slice(0, 4), 10) : NaN;
    const yearValue = Number.isNaN(parsedYear) ? null : parsedYear;

    const { data: existingItem, error: findError } = await supabase
      .from("items")
      .select("id")
      .eq("type", "game")
      .eq("external_id", game.id)
      .maybeSingle();

    if (findError) {
      throw new Error("Не вдалося перевірити каталог.");
    }

    let itemId = existingItem?.id;

    if (!itemId) {
      const detailResponse = await fetch(`/api/rawg/${game.id}`);
      const detailData = (await detailResponse.json()) as {
        description?: string;
      };

      const { data: createdItem, error: createError } = await supabase
        .from("items")
        .insert({
          type: "game",
          title: game.title,
          description: detailData.description ?? "",
          poster_url: game.poster,
          external_id: game.id,
          imdb_rating: overallRating,
          year: yearValue,
        })
        .select("id")
        .single();

      if (createError) {
        throw new Error("Не вдалося створити запис у каталозі.");
      }

      itemId = createdItem.id;
    } else {
      const itemUpdates: { imdb_rating?: string | null; year?: number | null } = {};
      if (overallRating) {
        itemUpdates.imdb_rating = overallRating;
      }
      if (yearValue) {
        itemUpdates.year = yearValue;
      }
      if (Object.keys(itemUpdates).length > 0) {
        await supabase.from("items").update(itemUpdates).eq("id", itemId);
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
      platforms: payload.platforms,
      availability: payload.availability,
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
      platforms: string[];
      availability: string | null;
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
        platforms: payload.platforms,
        availability: payload.availability,
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

  const handleGameSearch = async (query: string) => {
    const response = await fetch(`/api/rawg?q=${encodeURIComponent(query)}`);
    const data = (await response.json()) as {
      results?: GameResult[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error ?? "Не вдалося виконати пошук.");
    }

    const results = data.results ?? [];
    return results.filter((item) => !existingExternalIds.has(item.id));
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

  const ModalDescription = ({ text }: { text: string }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isOverflow, setIsOverflow] = useState(false);
    const descriptionRef = useRef<HTMLParagraphElement | null>(null);

    useEffect(() => {
      const node = descriptionRef.current;
      if (!node) {
        setIsOverflow(false);
        return;
      }
      setIsOverflow(node.scrollHeight > node.clientHeight + 1);
    }, [isExpanded, text]);

    const handleExpand = (event: MouseEvent | KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsExpanded(true);
    };

    return (
      <div className={styles.plotBlock}>
        <p
          ref={descriptionRef}
          className={`${styles.resultPlot} ${
            isExpanded ? "" : styles.modalPlotClamp
          }`}
        >
          {text}
        </p>
        {!isExpanded && isOverflow ? (
          <span
            className={styles.plotToggle}
            role="button"
            tabIndex={0}
            onClick={handleExpand}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                handleExpand(event);
              }
            }}
          >
            Детальніше
          </span>
        ) : null}
      </div>
    );
  };

  useEffect(() => {
    collection.forEach((item) => {
      const externalId = item.items.external_id;
      if (!externalId) return;
      if (gameDetails[item.items.id] || fetchingDetailsRef.current.has(item.id)) {
        return;
      }

      fetchingDetailsRef.current.add(item.id);
      void fetch(`/api/rawg?q=${encodeURIComponent(item.items.title)}`)
        .then(async (response) => {
          if (!response.ok) return null;
          const data = (await response.json()) as { results?: GameResult[] };
          return data.results?.find(
            (result) => String(result.id) === String(externalId),
          );
        })
        .then((detail) => {
          if (!detail) return;
          setGameDetails((prev) => ({
            ...prev,
            [item.items.id]: {
              released: detail.released,
              genres: detail.genres,
            },
          }));
          if (!item.items.year && detail.released) {
            const parsedYear = Number.parseInt(detail.released.slice(0, 4), 10);
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
  }, [collection, gameDetails]);

  const ensureSearchDescription = useCallback(async (id: string) => {
    if (searchDescriptions[id] || fetchingSearchDescRef.current.has(id)) {
      return;
    }
    fetchingSearchDescRef.current.add(id);
    try {
      const response = await fetch(`/api/rawg/${id}`);
      if (!response.ok) return;
      const data = (await response.json()) as { description?: string };
      if (!data.description) return;
      setSearchDescriptions((prev) => ({ ...prev, [id]: data.description ?? "" }));
    } finally {
      fetchingSearchDescRef.current.delete(id);
    }
  }, [searchDescriptions]);

  const GameSearchItem = ({ game }: { game: GameResult }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isOverflow, setIsOverflow] = useState(false);
    const descriptionRef = useRef<HTMLParagraphElement | null>(null);

    useEffect(() => {
      void ensureSearchDescription(game.id);
    }, [game.id]);

    const description = searchDescriptions[game.id];

    useEffect(() => {
      const node = descriptionRef.current;
      if (!node || !description) {
        setIsOverflow(false);
        return;
      }
      setIsOverflow(node.scrollHeight > node.clientHeight + 1);
    }, [description, isExpanded]);

    const handleExpandSearchDescription = (
      event: MouseEvent | KeyboardEvent,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setIsExpanded(true);
    };

    return (
      <>
        <div className={`${styles.posterWrapper} ${styles.gameSearchPosterWrapper}`}>
          {game.poster ? (
            <Image
              className={`${styles.poster} ${styles.gameSearchPoster}`}
              src={game.poster}
              alt={`Обкладинка ${game.title}`}
              width={305}
              height={204}
              unoptimized
            />
          ) : (
            <div className={styles.posterPlaceholder}>No image</div>
          )}
        </div>
        <div className={styles.resultContent}>
          <div className={styles.titleRow}>
            <h2 className={styles.resultTitle}>{game.title}</h2>
            <div className={styles.ratingRow}>
              <span className={styles.resultRating}>RAWG: {game.rating ?? "—"}</span>
            </div>
          </div>
          {game.genres ? (
            <p className={styles.resultMeta}>Жанри: {game.genres}</p>
          ) : null}
          {game.released ? (
            <p className={styles.resultMeta}>Реліз: {game.released}</p>
          ) : null}
          {description ? (
            <div className={styles.plotBlock}>
              <p
                ref={descriptionRef}
                className={`${styles.resultPlot} ${
                  isExpanded ? "" : styles.gameSearchPlotClamp
                }`}
              >
                {description}
              </p>
              {!isExpanded && isOverflow ? (
                <span
                  className={styles.plotToggle}
                  role="button"
                  tabIndex={0}
                  onClick={handleExpandSearchDescription}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      handleExpandSearchDescription(event);
                    }
                  }}
                >
                  Детальніше
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </>
    );
  };

  useEffect(() => {
    const next = new Set<string>();
    descriptionRefs.current.forEach((node, id) => {
      if (!node) return;
      if (node.scrollHeight > node.clientHeight + 1) {
        next.add(id);
      }
    });
    setOverflowDescriptions(next);
  }, [expandedDescriptions, collection]);

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
        {collection.map((item) => {
          const details = gameDetails[item.items.id];
          const releasedYear = details?.released ? details.released.slice(0, 4) : "";
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.resultItem} ${styles.resultButton} ${styles.collectionItem} ${styles.gameCollectionItem}`}
              onClick={() => setSelectedView(item)}
            >
              <div className={styles.resultHeader}>
                <div className={styles.titleRow}>
                  <h2 className={styles.resultTitle}>{item.items.title}</h2>
                  <div className={styles.ratingRow}>
                    <span className={styles.resultRating}>
                      RAWG: {item.items.imdb_rating ?? "—"}
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
                    alt={`Обкладинка ${item.items.title}`}
                    width={324}
                    height={180}
                    sizes="(max-width: 600px) 224px, 324px"
                    loading="lazy"
                    unoptimized
                  />
                ) : (
                  <div className={styles.posterPlaceholder}>No image</div>
                )}
              </div>
              <div className={styles.resultContent}>
                {releasedYear ? (
                  <p className={styles.resultMeta}>Рік: {releasedYear}</p>
                ) : null}
                {details?.genres ? (
                  <p className={styles.resultMeta}>Жанри: {details.genres}</p>
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
          );
        })}
      </div>
      {hasApplied && hasMore ? <div ref={loadMoreRef} /> : null}
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
          title="Додати гру"
          onSearch={handleGameSearch}
          getKey={(game) => game.id}
          resultItemClassName={styles.gameSearchResultItem}
          initialQuery={appliedFilters.query}
          onSelect={(game) => {
            setSelectedGame(game);
            setIsAddOpen(false);
          }}
          onClose={() => setIsAddOpen(false)}
          renderItem={(game) => <GameSearchItem game={game} />}
        />
      ) : null}

      {selectedGame ? (
        <CatalogModal
          title={selectedGame.title}
          posterUrl={selectedGame.poster}
          size="wide"
          platformOptions={GAME_PLATFORM_OPTIONS}
          availabilityOptions={AVAILABILITY_OPTIONS}
          onClose={() => setSelectedGame(null)}
          onAdd={(payload) => handleAddGame(selectedGame, payload)}
        >
          <div className={styles.resultContent}>
            <div className={styles.titleRow}>
              <span className={styles.resultRating}>
                RAWG: {selectedGame.rating ?? "—"}
              </span>
            </div>
            {selectedGame.released ? (
              <p className={styles.resultMeta}>
                Рік: {selectedGame.released.slice(0, 4)}
              </p>
            ) : null}
            {selectedGame.genres ? (
              <p className={styles.resultMeta}>Жанри: {selectedGame.genres}</p>
            ) : null}
            {searchDescriptions[selectedGame.id] ? (
              <ModalDescription text={searchDescriptions[selectedGame.id]} />
            ) : null}
          </div>
        </CatalogModal>
      ) : null}

      {selectedView ? (
        <CatalogModal
          title={selectedView.items.title}
          posterUrl={selectedView.items.poster_url ?? undefined}
          size="wide"
          platformOptions={GAME_PLATFORM_OPTIONS}
          availabilityOptions={AVAILABILITY_OPTIONS}
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
            platforms: selectedView.platforms ?? [],
            availability: selectedView.availability,
          }}
          onAdd={(payload) => handleUpdateView(selectedView.id, payload)}
          onDelete={() => handleDeleteView(selectedView.id)}
        >
          <div className={styles.resultContent}>
            <div className={styles.titleRow}>
              <span className={styles.resultRating}>
                RAWG: {selectedView.items.imdb_rating ?? "—"}
              </span>
              <span className={styles.resultRating}>
                Мій: {selectedView.rating ?? "—"}
              </span>
            </div>
            {gameDetails[selectedView.items.id]?.released ? (
              <p className={styles.resultMeta}>
                Рік: {gameDetails[selectedView.items.id]?.released?.slice(0, 4)}
              </p>
            ) : null}
            {gameDetails[selectedView.items.id]?.genres ? (
              <p className={styles.resultMeta}>
                Жанри: {gameDetails[selectedView.items.id]?.genres}
              </p>
            ) : null}
            {selectedView.items.description ? (
              <ModalDescription text={selectedView.items.description} />
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
