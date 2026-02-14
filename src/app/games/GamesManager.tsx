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
  updated_at: string;
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
  availabilityAll: boolean;
  query: string;
  viewAll: boolean;
  viewed: boolean;
  planned: boolean;
  yearRange: [number, number];
  availability: string[];
  genres: string;
  externalRatingRange: [number, number];
  personalRatingRange: [number, number];
  favoriteAll: boolean;
  recommendSimilarOnly: boolean;
  viewedDateFrom: string;
  viewedDateTo: string;
};

const MIN_YEAR = 1950;
const MAX_YEAR = new Date().getFullYear();
const EXTERNAL_MIN = 0;
const EXTERNAL_MAX = 5;
const PERSONAL_MIN = -3;
const PERSONAL_MAX = 3;
const GAME_PLATFORM_OPTIONS = ["PS", "Steam", "PC", "Android", "iOS", "Xbox"];
const AVAILABILITY_OPTIONS = [
  "В колекції",
  "Тимчасовий доступ",
  "У друзів",
  "Відсутній",
];
const PAGE_SIZE = 20;
const LOAD_AHEAD_PX = 700;
const DEFAULT_FILTERS: Filters = {
  availabilityAll: true,
  query: "",
  viewAll: true,
  viewed: true,
  planned: true,
  yearRange: [MIN_YEAR, MAX_YEAR],
  availability: [],
  genres: "",
  externalRatingRange: [EXTERNAL_MIN, EXTERNAL_MAX],
  personalRatingRange: [PERSONAL_MIN, PERSONAL_MAX],
  favoriteAll: true,
  recommendSimilarOnly: false,
  viewedDateFrom: "",
  viewedDateTo: "",
};

const clampRange = (range: [number, number], bounds: [number, number]) => {
  const [min, max] = bounds;
  const start = Math.min(Math.max(range[0], min), max);
  const end = Math.max(Math.min(range[1], max), min);
  return start <= end ? ([start, end] as [number, number]) : ([min, max] as [number, number]);
};

const reconcileRangeWithNewBounds = (
  range: [number, number],
  prevBounds: [number, number],
  nextBounds: [number, number],
) => {
  let [from, to] = range;
  if (from <= prevBounds[0]) {
    from = nextBounds[0];
  }
  if (to >= prevBounds[1]) {
    to = nextBounds[1];
  }
  return clampRange([from, to], nextBounds);
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
  const [totalCount, setTotalCount] = useState(0);
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
  const yearBoundsRef = useRef<[number, number]>([MIN_YEAR, MAX_YEAR]);
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

  useEffect(() => {
    yearBoundsRef.current = yearBounds;
  }, [yearBounds]);

  const fetchPage = useCallback(async (pageIndex: number, filters: Filters) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setCollection([]);
      setMessage("Потрібна авторизація.");
      setRecommendedItemIds(new Set());
      setTotalCount(0);
      setHasMore(false);
      setIsLoading(false);
      setIsLoadingMore(false);
      loadingPagesRef.current.delete(pageIndex);
      return false;
    }

    const trimmedQuery = filters.query.trim();
    const effectiveViewed = filters.viewAll ? true : filters.viewed;
    const effectivePlanned = filters.viewAll ? true : filters.planned;
    if (!effectiveViewed && !effectivePlanned) {
      if (pageIndex === 0) {
        setCollection([]);
        setHasMore(false);
        setTotalCount(0);
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
        "id, updated_at, viewed_at, rating, comment, view_percent, recommend_similar, is_viewed, availability, platforms, items:items!inner (id, title, description, poster_url, external_id, imdb_rating, year, type)",
      )
      .eq("items.type", "game")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false });

    if (effectiveViewed !== effectivePlanned) {
      query = query.eq("is_viewed", effectiveViewed);
    }

    if (trimmedQuery) {
      const escaped = trimmedQuery.replaceAll("%", "\\%");
      query = query.or(
        `items.title.ilike.%${escaped}%,items.description.ilike.%${escaped}%`,
      );
    }

    if (!filters.availabilityAll && filters.availability.length > 0) {
      query = query.in("availability", filters.availability);
    }

    if (!filters.favoriteAll && filters.recommendSimilarOnly) {
      query = query.eq("recommend_similar", true);
    }

    const [minYear, maxYear] = yearBounds;
    const [fromYear, toYear] = clampRange(filters.yearRange, yearBounds);
    const isYearFilterActive = fromYear !== minYear || toYear !== maxYear;
    if (isYearFilterActive) {
      query = query.gte("items.year", fromYear).lte("items.year", toYear);
    }

    const [externalMin, externalMax] = filters.externalRatingRange;
    const isExternalFilterActive =
      externalMin !== EXTERNAL_MIN || externalMax !== EXTERNAL_MAX;
    if (isExternalFilterActive) {
      query = query
        .gte("items.imdb_rating", String(externalMin))
        .lte("items.imdb_rating", String(externalMax));
    }

    const [personalMin, personalMax] = filters.personalRatingRange;
    const isPersonalFilterActive =
      personalMin !== PERSONAL_MIN || personalMax !== PERSONAL_MAX;
    if (isPersonalFilterActive) {
      query = query.gte("rating", personalMin).lte("rating", personalMax);
    }

    if (filters.viewedDateFrom) {
      query = query.gte("viewed_at", `${filters.viewedDateFrom}T00:00:00.000Z`);
    }
    if (filters.viewedDateTo) {
      query = query.lte("viewed_at", `${filters.viewedDateTo}T23:59:59.999Z`);
    }

    if (pageIndex === 0) {
      let countQuery = supabase
        .from("user_views")
        .select("id, items:items!inner(id)", { count: "exact", head: true })
        .eq("items.type", "game");

      if (effectiveViewed !== effectivePlanned) {
        countQuery = countQuery.eq("is_viewed", effectiveViewed);
      }

      if (trimmedQuery) {
        const escaped = trimmedQuery.replaceAll("%", "\\%");
        countQuery = countQuery.or(
          `items.title.ilike.%${escaped}%,items.description.ilike.%${escaped}%`,
        );
      }

      if (isYearFilterActive) {
        countQuery = countQuery.gte("items.year", fromYear).lte("items.year", toYear);
      }

      if (!filters.availabilityAll && filters.availability.length > 0) {
        countQuery = countQuery.in("availability", filters.availability);
      }

      if (!filters.favoriteAll && filters.recommendSimilarOnly) {
        countQuery = countQuery.eq("recommend_similar", true);
      }

      if (isExternalFilterActive) {
        countQuery = countQuery
          .gte("items.imdb_rating", String(externalMin))
          .lte("items.imdb_rating", String(externalMax));
      }

      if (isPersonalFilterActive) {
        countQuery = countQuery.gte("rating", personalMin).lte("rating", personalMax);
      }

      if (filters.viewedDateFrom) {
        countQuery = countQuery.gte(
          "viewed_at",
          `${filters.viewedDateFrom}T00:00:00.000Z`,
        );
      }
      if (filters.viewedDateTo) {
        countQuery = countQuery.lte(
          "viewed_at",
          `${filters.viewedDateTo}T23:59:59.999Z`,
        );
      }

      const { count, error: countError } = await countQuery;
      setTotalCount(countError ? 0 : (count ?? 0));
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
    const prevBounds = yearBoundsRef.current;
    setYearBounds(bounds);
    setPendingFilters((prev) => {
      const nextRange = reconcileRangeWithNewBounds(prev.yearRange, prevBounds, bounds);
      if (
        nextRange[0] === prev.yearRange[0] &&
        nextRange[1] === prev.yearRange[1]
      ) {
        return prev;
      }
      return { ...prev, yearRange: nextRange };
    });
    setAppliedFilters((prev) => {
      const nextRange = reconcileRangeWithNewBounds(prev.yearRange, prevBounds, bounds);
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
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        void fetchPage(page + 1, appliedFilters);
      },
      {
        root: null,
        rootMargin: `0px 0px ${LOAD_AHEAD_PX}px 0px`,
        threshold: 0,
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [appliedFilters, fetchPage, hasApplied, hasMore, isLoading, isLoadingMore, page]);

  const displayedCollection = useMemo(() => {
    const genresFilter = appliedFilters.genres.trim().toLowerCase();
    const filtered = !genresFilter
      ? collection
      : collection.filter((item) => {
          const genres = gameDetails[item.items.id]?.genres?.toLowerCase();
          if (genres) return genres.includes(genresFilter);
          const description = item.items.description?.toLowerCase() ?? "";
          return description.includes(genresFilter);
        });

    return [...filtered].sort(
      (left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at),
    );
  }, [appliedFilters.genres, collection, gameDetails]);

  useEffect(() => {
    const countToShow = appliedFilters.genres.trim() ? displayedCollection.length : totalCount;
    onCountChange?.(countToShow);
  }, [appliedFilters.genres, displayedCollection.length, onCountChange, totalCount]);

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

    setHasApplied(true);
    void (async () => {
      await loadYearBounds();
      await fetchPage(0, appliedFilters);
    })();
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
    void fetchPage(0, appliedFilters);
  };

  const handleDeleteView = async (viewId: string) => {
    const { error } = await supabase.from("user_views").delete().eq("id", viewId);

    if (error) {
      throw new Error("Не вдалося видалити запис.");
    }

    setHasApplied(true);
    void fetchPage(0, appliedFilters);
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
    return results
      .filter((item) => !existingExternalIds.has(item.id))
      .sort((left, right) => {
        const leftYear = Number.parseInt(left.released?.slice(0, 4) ?? "", 10);
        const rightYear = Number.parseInt(right.released?.slice(0, 4) ?? "", 10);
        const safeLeftYear = Number.isNaN(leftYear) ? -Infinity : leftYear;
        const safeRightYear = Number.isNaN(rightYear) ? -Infinity : rightYear;
        return safeRightYear - safeLeftYear;
      });
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

      <div className={styles.results}>
        {displayedCollection.map((item) => {
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
      {isLoading ? (
        <div className={styles.loadingOverlay} aria-live="polite">
          <span className={styles.loadingOverlayText}>Завантаження...</span>
        </div>
      ) : null}
      {isLoadingMore && !isLoading ? (
        <p className={styles.message} aria-live="polite">
          Підвантаження...
        </p>
      ) : null}

      {isFiltersOpen ? (
        <div
          className={styles.filtersOverlay}
          role="dialog"
          aria-modal="true"
          onClick={() => setIsFiltersOpen(false)}
        >
          <form
            className={styles.filtersModal}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedFilters(pendingFilters);
              setHasApplied(true);
              setIsFiltersOpen(false);
            }}
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
                autoFocus
                value={pendingFilters.query}
                onChange={(event) =>
                  setPendingFilters((prev) => ({
                    ...prev,
                    query: event.target.value,
                  }))
                }
              />
            </label>
            <label className={styles.filtersField}>
              Жанри
              <input
                className={styles.filtersInput}
                value={pendingFilters.genres}
                placeholder="Напр. Action"
                onChange={(event) =>
                  setPendingFilters((prev) => ({
                    ...prev,
                    genres: event.target.value,
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
            <div className={styles.rangeBlock}>
              <div className={styles.rangeHeader}>
                <span>RAWG</span>
                <span className={styles.rangeValues}>
                  {pendingFilters.externalRatingRange[0]}–
                  {pendingFilters.externalRatingRange[1]}
                </span>
              </div>
              <Range
                values={pendingFilters.externalRatingRange}
                step={1}
                min={EXTERNAL_MIN}
                max={EXTERNAL_MAX}
                onChange={(values) =>
                  setPendingFilters((prev) => ({
                    ...prev,
                    externalRatingRange: values as [number, number],
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
                          values: pendingFilters.externalRatingRange,
                          colors: [
                            "var(--color-border)",
                            "var(--color-accent)",
                            "var(--color-border)",
                          ],
                          min: EXTERNAL_MIN,
                          max: EXTERNAL_MAX,
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
            </div>
            <div className={styles.rangeBlock}>
              <div className={styles.rangeHeader}>
                <span>Мій рейтинг</span>
                <span className={styles.rangeValues}>
                  {pendingFilters.personalRatingRange[0]}–
                  {pendingFilters.personalRatingRange[1]}
                </span>
              </div>
              <Range
                values={pendingFilters.personalRatingRange}
                step={1}
                min={PERSONAL_MIN}
                max={PERSONAL_MAX}
                onChange={(values) =>
                  setPendingFilters((prev) => ({
                    ...prev,
                    personalRatingRange: values as [number, number],
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
                          values: pendingFilters.personalRatingRange,
                          colors: [
                            "var(--color-border)",
                            "var(--color-accent)",
                            "var(--color-border)",
                          ],
                          min: PERSONAL_MIN,
                          max: PERSONAL_MAX,
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
            </div>
            <div className={styles.filtersDates}>
              <label className={styles.filtersField}>
                Дата перегляду: від
                <input
                  className={styles.filtersInput}
                  type="date"
                  value={pendingFilters.viewedDateFrom}
                  onChange={(event) =>
                    setPendingFilters((prev) => ({
                      ...prev,
                      viewedDateFrom: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filtersField}>
                до
                <input
                  className={styles.filtersInput}
                  type="date"
                  value={pendingFilters.viewedDateTo}
                  onChange={(event) =>
                    setPendingFilters((prev) => ({
                      ...prev,
                      viewedDateTo: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className={styles.filtersGroup}>
              <p className={styles.filtersGroupTitle}>Доступність</p>
              <div className={styles.filtersControls}>
                <label className={styles.filtersOption}>
                  <input
                    className={styles.filtersCheckbox}
                    type="checkbox"
                    checked={pendingFilters.availabilityAll}
                    onChange={(event) =>
                      setPendingFilters((prev) => ({
                        ...prev,
                        availabilityAll: event.target.checked,
                      }))
                    }
                  />
                  Все
                </label>
                {AVAILABILITY_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className={`${styles.filtersOption} ${
                      pendingFilters.availabilityAll ? styles.filtersOptionDisabled : ""
                    }`}
                  >
                    <input
                      className={styles.filtersCheckbox}
                      type="checkbox"
                      checked={pendingFilters.availability.includes(option)}
                      disabled={pendingFilters.availabilityAll}
                      onChange={(event) =>
                        setPendingFilters((prev) => ({
                          ...prev,
                          availabilityAll: false,
                          availability: event.target.checked
                            ? [...prev.availability, option]
                            : prev.availability.filter((value) => value !== option),
                        }))
                      }
                    />
                    {option}
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.filtersGroup}>
              <p className={styles.filtersGroupTitle}>Перегляд</p>
              <div className={styles.filtersControls}>
                <label className={styles.filtersOption}>
                  <input
                    className={styles.filtersCheckbox}
                    type="checkbox"
                    checked={pendingFilters.viewAll}
                    onChange={(event) =>
                      setPendingFilters((prev) => ({
                        ...prev,
                        viewAll: event.target.checked,
                        viewed: event.target.checked ? true : prev.viewed,
                        planned: event.target.checked ? true : prev.planned,
                      }))
                    }
                  />
                  Все
                </label>
                <label
                  className={`${styles.filtersOption} ${
                    pendingFilters.viewAll ? styles.filtersOptionDisabled : ""
                  }`}
                >
                  <input
                    className={styles.filtersCheckbox}
                    type="checkbox"
                    checked={pendingFilters.viewed}
                    disabled={pendingFilters.viewAll}
                    onChange={(event) =>
                      setPendingFilters((prev) => ({
                        ...prev,
                        viewAll: false,
                        viewed: event.target.checked,
                      }))
                    }
                  />
                  Переглянуто
                </label>
                <label
                  className={`${styles.filtersOption} ${
                    pendingFilters.viewAll ? styles.filtersOptionDisabled : ""
                  }`}
                >
                  <input
                    className={styles.filtersCheckbox}
                    type="checkbox"
                    checked={pendingFilters.planned}
                    disabled={pendingFilters.viewAll}
                    onChange={(event) =>
                      setPendingFilters((prev) => ({
                        ...prev,
                        viewAll: false,
                        planned: event.target.checked,
                      }))
                    }
                  />
                  Заплановано
                </label>
              </div>
            </div>
            <div className={styles.filtersGroup}>
              <p className={styles.filtersGroupTitle}>Улюблене</p>
              <div className={styles.filtersControls}>
                <label className={styles.filtersOption}>
                  <input
                    className={styles.filtersCheckbox}
                    type="checkbox"
                    checked={pendingFilters.favoriteAll}
                    onChange={(event) =>
                      setPendingFilters((prev) => ({
                        ...prev,
                        favoriteAll: event.target.checked,
                        recommendSimilarOnly: event.target.checked
                          ? false
                          : prev.recommendSimilarOnly,
                      }))
                    }
                  />
                  Все
                </label>
                <label
                  className={`${styles.filtersOption} ${
                    pendingFilters.favoriteAll ? styles.filtersOptionDisabled : ""
                  }`}
                >
                  <input
                    className={styles.filtersCheckbox}
                    type="checkbox"
                    checked={pendingFilters.recommendSimilarOnly}
                    disabled={pendingFilters.favoriteAll}
                    onChange={(event) =>
                      setPendingFilters((prev) => ({
                        ...prev,
                        favoriteAll: false,
                        recommendSimilarOnly: event.target.checked,
                      }))
                    }
                  />
                  Рекомендувати подібне
                </label>
              </div>
            </div>
            <div className={styles.filtersActions}>
              <button
                type="button"
                className="btnBase btnSecondary"
                onClick={() =>
                  setPendingFilters({
                    ...DEFAULT_FILTERS,
                    yearRange: clampRange(DEFAULT_FILTERS.yearRange, yearBounds),
                  })
                }
              >
                Очищення
              </button>
              <button
                type="button"
                className="btnBase btnSecondary"
                onClick={() => setIsFiltersOpen(false)}
              >
                Скасувати
              </button>
              <button type="submit" className="btnBase btnPrimary">
                Відобразити
              </button>
            </div>
          </form>
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
