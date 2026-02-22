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
import CloseIconButton from "@/components/ui/CloseIconButton";
import { supabase } from "@/lib/supabase/client";
import {
  DEFAULT_GAME_PLATFORM_OPTIONS,
  readDisplayPreferences,
} from "@/lib/settings/displayPreferences";
import { getDisplayName } from "@/lib/users/displayName";
import styles from "@/components/catalog/CatalogSearch.module.css";

type GameResult = {
  id: string;
  title: string;
  rating: number | null;
  released: string;
  poster: string;
  genres: string;
  inCollection?: boolean;
  existingViewId?: string;
  isRefreshCurrent?: boolean;
};

type GameCollectionItem = {
  id: string;
  created_at: string;
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
    genres: string | null;
    poster_url: string | null;
    external_id: string | null;
    imdb_rating: string | null;
    year?: number | null;
    type: string;
  };
};

type GameItemDraft = {
  poster_url: string | null;
  year: number | null;
  imdb_rating: string | null;
  description: string | null;
  genres: string | null;
  external_id: string | null;
};

type ContactOption = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  disabledReason?: string;
};

type GamesManagerProps = {
  onCountChange?: (count: number) => void;
  ownerUserId?: string;
  readOnly?: boolean;
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
  sortBy: SortBy;
  sortDirection: SortDirection;
};

type SortBy = "created_at" | "title" | "rating" | "year";
type SortDirection = "asc" | "desc";

const MIN_YEAR = 1950;
const MAX_YEAR = new Date().getFullYear();
const EXTERNAL_MIN = 0;
const EXTERNAL_MAX = 5;
const PERSONAL_MIN = 1;
const PERSONAL_MAX = 5;
const PERSONAL_STEP = 0.5;
const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: "created_at", label: "Дата додавання" },
  { value: "title", label: "Ім'я" },
  { value: "rating", label: "Особистий рейтинг" },
  { value: "year", label: "Рік релізу" },
];
const GAME_PLATFORM_OPTIONS = [...DEFAULT_GAME_PLATFORM_OPTIONS];
const AVAILABILITY_OPTIONS = [
  "В колекції",
  "Тимчасовий доступ",
  "У друзів",
  "Відсутній",
];
const PAGE_SIZE = 20;
const LOAD_AHEAD_PX = 700;
const NICKNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;
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
  sortBy: "created_at",
  sortDirection: "desc",
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

const formatPersonalRating = (value: number | null) => {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const getDefaultSortDirection = (sortBy: SortBy): SortDirection => {
  if (sortBy === "title") return "asc";
  return "desc";
};

const getFiltersRequestKey = (filters: Filters) => JSON.stringify(filters);

const sortGameCollection = (
  items: GameCollectionItem[],
  sortBy: SortBy,
  sortDirection: SortDirection,
) => {
  const sorted = [...items];
  const dir = sortDirection === "asc" ? 1 : -1;
  sorted.sort((left, right) => {
    if (sortBy === "title") {
      const cmp = left.items.title.localeCompare(right.items.title, "uk", {
        sensitivity: "base",
      });
      if (cmp !== 0) return cmp * dir;
    } else if (sortBy === "year") {
      const leftYear = left.items.year ?? null;
      const rightYear = right.items.year ?? null;
      if (leftYear === null && rightYear !== null) return 1;
      if (leftYear !== null && rightYear === null) return -1;
      if (leftYear !== null && rightYear !== null && leftYear !== rightYear) {
        return (leftYear - rightYear) * dir;
      }
    }
    const createdDiff = Date.parse(right.created_at) - Date.parse(left.created_at);
    if (createdDiff !== 0) return createdDiff;
    return right.id.localeCompare(left.id);
  });
  return sorted;
};

export default function GamesManager({
  onCountChange,
  ownerUserId,
  readOnly = false,
}: GamesManagerProps) {
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
  const [selectedViewItemDraft, setSelectedViewItemDraft] = useState<GameItemDraft | null>(
    null,
  );
  const [isRefreshPickerOpen, setIsRefreshPickerOpen] = useState(false);
  const [refreshSearchQuery, setRefreshSearchQuery] = useState("");
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(
    new Set(),
  );
  const [overflowDescriptions, setOverflowDescriptions] = useState<Set<string>>(
    new Set(),
  );
  const [recommendedItemIds, setRecommendedItemIds] = useState<Set<string>>(
    new Set(),
  );
  const [searchDescriptions, setSearchDescriptions] = useState<
    Record<string, string>
  >({});
  const descriptionRefs = useRef<Map<string, HTMLParagraphElement | null>>(
    new Map(),
  );
  const fetchingSearchDescRef = useRef<Set<string>>(new Set());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const skipNextApplyRef = useRef(false);
  const loadingPagesRef = useRef<Set<number>>(new Set());
  const activeRequestKeyRef = useRef("");
  const yearBoundsRef = useRef<[number, number]>([MIN_YEAR, MAX_YEAR]);
  const [recommendItem, setRecommendItem] = useState<{
    itemId: string;
    title: string;
  } | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [nicknameValue, setNicknameValue] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [pendingRecommendItem, setPendingRecommendItem] = useState<{
    itemId: string;
    title: string;
  } | null>(null);
  const [friendAccessState, setFriendAccessState] = useState<
    "checking" | "allowed" | "unauthenticated" | "not_friends" | "closed"
  >(readOnly && ownerUserId ? "checking" : "allowed");
  const [friendOwnerName, setFriendOwnerName] = useState("");
  const [showAvailability, setShowAvailability] = useState(true);
  const [defaultGamePlatform, setDefaultGamePlatform] = useState<string | null>(
    null,
  );
  const [defaultGameAvailability, setDefaultGameAvailability] = useState<string | null>(
    null,
  );
  const [defaultGameIsViewed, setDefaultGameIsViewed] = useState<boolean | null>(
    null,
  );
  const [visiblePlatforms, setVisiblePlatforms] = useState<string[]>([
    ...GAME_PLATFORM_OPTIONS,
  ]);

  useEffect(() => {
    const applyPreferences = () => {
      const prefs = readDisplayPreferences();
      setShowAvailability(prefs.showGameAvailability);
      setVisiblePlatforms(prefs.visibleGamePlatforms);
      setDefaultGamePlatform(prefs.defaultGamePlatform);
      setDefaultGameAvailability(prefs.defaultGameAvailability);
      setDefaultGameIsViewed(prefs.defaultGameIsViewed);
    };
    applyPreferences();
    return undefined;
  }, []);

  useEffect(() => {
    setSelectedViewItemDraft(null);
    setIsRefreshPickerOpen(false);
    setRefreshSearchQuery("");
  }, [selectedView?.id]);

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

  useEffect(() => {
    if (!readOnly || !ownerUserId) {
      setFriendAccessState("allowed");
      setFriendOwnerName("");
      return;
    }
    let isCancelled = false;
    setFriendAccessState("checking");
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (isCancelled) return;
      if (!user) {
        setFriendAccessState("unauthenticated");
        return;
      }
      if (user.id === ownerUserId) {
        setFriendAccessState("allowed");
        return;
      }
      const [{ data: ownerProfile }, { data: contact }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, views_visible_to_friends")
          .eq("id", ownerUserId)
          .maybeSingle(),
        supabase
          .from("contacts")
          .select("other_user_id")
          .eq("user_id", user.id)
          .eq("other_user_id", ownerUserId)
          .eq("status", "accepted")
          .maybeSingle(),
      ]);
      if (isCancelled) return;
      setFriendOwnerName(getDisplayName(ownerProfile?.username ?? null, ownerUserId));
      if (!contact?.other_user_id) {
        setFriendAccessState("not_friends");
        return;
      }
      if (!ownerProfile?.views_visible_to_friends) {
        setFriendAccessState("closed");
        return;
      }
      setFriendAccessState("allowed");
    })();
    return () => {
      isCancelled = true;
    };
  }, [ownerUserId, readOnly]);

  const fetchPage = useCallback(async (pageIndex: number, filters: Filters) => {
    const requestKey = getFiltersRequestKey(filters);
    if (pageIndex === 0) {
      activeRequestKeyRef.current = requestKey;
    }

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

    if (readOnly && ownerUserId && friendAccessState !== "allowed") {
      setCollection([]);
      setHasMore(false);
      setTotalCount(0);
      setIsLoading(false);
      setIsLoadingMore(false);
      loadingPagesRef.current.delete(pageIndex);
      return false;
    }
    const effectiveOwnerId = ownerUserId ?? user.id;

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
    const needsClientSort = filters.sortBy === "title" || filters.sortBy === "year";
    if (needsClientSort && pageIndex > 0) {
      loadingPagesRef.current.delete(pageIndex);
      return false;
    }

    if (pageIndex === 0) {
      setIsLoading(true);
      setMessage("");
    } else {
      setIsLoadingMore(true);
    }

    let query = supabase
      .from("user_views")
      .select(
        "id, created_at, updated_at, viewed_at, rating, comment, view_percent, recommend_similar, is_viewed, availability, platforms, items:items!inner (id, title, description, genres, poster_url, external_id, imdb_rating, year, type)",
      )
      .eq("user_id", effectiveOwnerId)
      .eq("items.type", "game");

    if (effectiveViewed !== effectivePlanned) {
      query = query.eq("is_viewed", effectiveViewed);
    }

    if (trimmedQuery) {
      const escaped = trimmedQuery.replaceAll("%", "\\%");
      query = query.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`, {
        foreignTable: "items",
      });
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

    const sortAscending = filters.sortDirection === "asc";
    if (filters.sortBy === "title") {
      query = query.order("title", {
        foreignTable: "items",
        ascending: sortAscending,
      });
    } else if (filters.sortBy === "rating") {
      query = query.order("rating", {
        ascending: sortAscending,
        nullsFirst: false,
      });
    } else if (filters.sortBy === "year") {
      query = query.order("year", {
        foreignTable: "items",
        ascending: sortAscending,
        nullsFirst: false,
      });
    } else {
      query = query.order("created_at", { ascending: sortAscending });
    }
    if (filters.sortBy !== "created_at") {
      query = query.order("created_at", { ascending: false });
    }
    query = query.order("id", { ascending: false });

    if (pageIndex === 0) {
      let countQuery = supabase
        .from("user_views")
        .select("id, items:items!inner(id)", { count: "exact", head: true })
        .eq("user_id", effectiveOwnerId)
        .eq("items.type", "game");

      if (effectiveViewed !== effectivePlanned) {
        countQuery = countQuery.eq("is_viewed", effectiveViewed);
      }

      if (trimmedQuery) {
        const escaped = trimmedQuery.replaceAll("%", "\\%");
        countQuery = countQuery.or(
          `title.ilike.%${escaped}%,description.ilike.%${escaped}%`,
          {
            foreignTable: "items",
          },
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
      if (requestKey === activeRequestKeyRef.current) {
        setTotalCount(countError ? 0 : (count ?? 0));
      }
    }

    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let data: GameCollectionItem[] | null;
    let error: { message: string } | null = null;

    if (needsClientSort) {
      const loaded: GameCollectionItem[] = [];
      let offset = 0;
      const batchSize = 500;
      while (true) {
        const { data: batch, error: batchError } = await query.range(
          offset,
          offset + batchSize - 1,
        );
        if (batchError) {
          error = batchError;
          break;
        }
        const rows = (batch as unknown as GameCollectionItem[]) ?? [];
        loaded.push(...rows);
        if (rows.length < batchSize) {
          break;
        }
        offset += batchSize;
      }
      data = loaded;
    } else {
      const ranged = await query.range(from, to);
      data = (ranged.data as unknown as GameCollectionItem[]) ?? [];
      error = ranged.error as { message: string } | null;
    }

    if (requestKey !== activeRequestKeyRef.current) {
      loadingPagesRef.current.delete(pageIndex);
      return false;
    }

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
      const nextCollection = needsClientSort
        ? sortGameCollection(data ?? [], filters.sortBy, filters.sortDirection)
        : ((data as unknown as GameCollectionItem[]) ?? []);
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
      setHasMore(needsClientSort ? false : nextHasMore);
      setPage(pageIndex);
      if (pageIndex === 0 && nextCollection.length === 0) {
        const hasActiveFilters = Boolean(
          trimmedQuery ||
            effectiveViewed !== effectivePlanned ||
            !filters.availabilityAll ||
            (!filters.favoriteAll && filters.recommendSimilarOnly) ||
            isYearFilterActive ||
            isExternalFilterActive ||
            isPersonalFilterActive ||
            filters.viewedDateFrom ||
            filters.viewedDateTo ||
            filters.genres.trim(),
        );
        setMessage(
          hasActiveFilters
            ? "Нічого не знайдено за вашим запитом"
            : "Колекція порожня.",
        );
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
  }, [friendAccessState, loadRecommendations, ownerUserId, readOnly, yearBounds]);

  useEffect(() => {
    if (readOnly && ownerUserId && friendAccessState !== "allowed") return;
    if (!hasApplied) return;
    if (skipNextApplyRef.current) {
      skipNextApplyRef.current = false;
      return;
    }
    void fetchPage(0, appliedFilters);
  }, [appliedFilters, fetchPage, friendAccessState, hasApplied, ownerUserId, readOnly]);

  useEffect(() => {
    if (readOnly && ownerUserId && friendAccessState !== "allowed") return;
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
  }, [fetchPage, friendAccessState, hasApplied, ownerUserId, readOnly]);

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
    if (readOnly && ownerUserId && friendAccessState !== "allowed") return;
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
  }, [
    appliedFilters,
    fetchPage,
    friendAccessState,
    hasApplied,
    hasMore,
    isLoading,
    isLoadingMore,
    ownerUserId,
    page,
    readOnly,
  ]);

  const displayedCollection = useMemo(() => {
    const genresFilter = appliedFilters.genres.trim().toLowerCase();
    return !genresFilter
      ? collection
      : collection.filter((item) => {
          const description = item.items.description?.toLowerCase() ?? "";
          return description.includes(genresFilter);
        });
  }, [appliedFilters.genres, collection]);

  const visiblePlatformsSet = useMemo(
    () => new Set(visiblePlatforms),
    [visiblePlatforms],
  );

  const handleSortByChange = (value: SortBy) => {
    const defaultDirection = getDefaultSortDirection(value);
    setAppliedFilters((prev) => ({
      ...prev,
      sortBy: value,
      sortDirection: defaultDirection,
    }));
    setPendingFilters((prev) => ({
      ...prev,
      sortBy: value,
      sortDirection: defaultDirection,
    }));
    setHasApplied(true);
  };

  const handleToggleSortDirection = () => {
    setAppliedFilters((prev) => {
      const nextDirection: SortDirection = prev.sortDirection === "asc" ? "desc" : "asc";
      return { ...prev, sortDirection: nextDirection };
    });
    setPendingFilters((prev) => {
      const nextDirection: SortDirection = prev.sortDirection === "asc" ? "desc" : "asc";
      return { ...prev, sortDirection: nextDirection };
    });
    setHasApplied(true);
  };

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

  const existingViewsByExternalId = useMemo(() => {
    const map = new Map<string, GameCollectionItem>();
    collection.forEach((item) => {
      if (item.items.external_id) {
        map.set(item.items.external_id, item);
      }
    });
    return map;
  }, [collection]);

  const loadContacts = async (itemIdForCheck?: string) => {
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

    let ownedByFriend = new Set<string>();
    let alreadyRecommended = new Set<string>();
    if (itemIdForCheck) {
      const [{ data: ownedRows }, { data: sentRows }] = await Promise.all([
        supabase
          .from("user_views")
          .select("user_id")
          .eq("item_id", itemIdForCheck)
          .in("user_id", ids),
        supabase
          .from("recommendations")
          .select("to_user_id")
          .eq("from_user_id", user.id)
          .eq("item_id", itemIdForCheck)
          .in("to_user_id", ids),
      ]);
      ownedByFriend = new Set((ownedRows ?? []).map((row) => row.user_id));
      alreadyRecommended = new Set((sentRows ?? []).map((row) => row.to_user_id));
    }

    const mapped =
      profiles?.map((profile) => ({
        id: profile.id,
        name: getDisplayName(profile.username, profile.id),
        avatarUrl: profile.avatar_url,
        disabledReason: ownedByFriend.has(profile.id)
          ? `У ${getDisplayName(profile.username, profile.id)} уже є ця гра у колекції`
          : alreadyRecommended.has(profile.id)
            ? `Ви вже рекомендували ${getDisplayName(profile.username, profile.id)} цю гру`
            : undefined,
      })) ?? [];

    setContacts(mapped);
  };

  const ensureNickname = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Потрібна авторизація.");
      return { ok: false as const, requiresNickname: false };
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    const username = profile?.username?.trim() ?? "";
    if (username) {
      return { ok: true as const, requiresNickname: false };
    }
    setNicknameValue("");
    setNicknameError("");
    setIsNicknameModalOpen(true);
    return { ok: false as const, requiresNickname: true };
  };

  const saveNicknameAndContinue = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setNicknameError("Потрібна авторизація.");
      return;
    }
    const normalized = nicknameValue.trim();
    if (!NICKNAME_PATTERN.test(normalized)) {
      setNicknameError("3-24 символи: літери, цифри, _, -");
      return;
    }
    setIsSavingNickname(true);
    setNicknameError("");
    const { error } = await supabase
      .from("profiles")
      .update({ username: normalized })
      .eq("id", user.id);
    setIsSavingNickname(false);
    if (error) {
      if (error.code === "23505") {
        setNicknameError("Нікнейм зайнятий.");
      } else {
        setNicknameError("Не вдалося зберегти.");
      }
      return;
    }
    setIsNicknameModalOpen(false);
    setMessage("Нікнейм збережено.");
    if (pendingRecommendItem) {
      await loadContacts(pendingRecommendItem.itemId);
      setRecommendItem(pendingRecommendItem);
      setPendingRecommendItem(null);
    }
  };

  const openRecommend = async (itemId: string, title: string) => {
    if (readOnly) return;
    setPendingRecommendItem({ itemId, title });
    const check = await ensureNickname();
    if (!check.ok) {
      if (!check.requiresNickname) {
        setPendingRecommendItem(null);
      }
      return;
    }
    await loadContacts(itemId);
    setRecommendItem({ itemId, title });
    setPendingRecommendItem(null);
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
      const descriptionFromSearch = searchDescriptions[game.id] ?? "";
      const { data: createdItem, error: createError } = await supabase
        .from("items")
        .insert({
          type: "game",
          title: game.title,
          description: descriptionFromSearch,
          genres: game.genres || null,
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
      if (!descriptionFromSearch) {
        void fetch(`/api/rawg/${game.id}`)
          .then(async (response) => {
            if (!response.ok) return null;
            return (await response.json()) as { description?: string };
          })
          .then((detailData) => {
            if (!detailData?.description) return;
            void supabase
              .from("items")
              .update({ description: detailData.description })
              .eq("id", createdItem.id);
          });
      }
    } else {
      const itemUpdates: {
        imdb_rating?: string | null;
        year?: number | null;
        genres?: string | null;
      } = {};
      if (overallRating) {
        itemUpdates.imdb_rating = overallRating;
      }
      if (yearValue) {
        itemUpdates.year = yearValue;
      }
      if (game.genres) {
        itemUpdates.genres = game.genres;
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
    itemId: string,
    itemDraft: GameItemDraft | null,
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

    if (itemDraft) {
      const itemUpdatePayload = {
        poster_url: itemDraft.poster_url,
        year: itemDraft.year,
        imdb_rating: itemDraft.imdb_rating,
        description: itemDraft.description,
        genres: itemDraft.genres,
        external_id: itemDraft.external_id,
      };
      const { error: updateItemError } = await supabase
        .from("items")
        .update(itemUpdatePayload)
        .eq("id", itemId);
      if (updateItemError) {
        if (updateItemError.code === "23505") {
          const { error: retryError } = await supabase
            .from("items")
            .update({
              poster_url: itemDraft.poster_url,
              year: itemDraft.year,
              imdb_rating: itemDraft.imdb_rating,
              description: itemDraft.description,
              genres: itemDraft.genres,
            })
            .eq("id", itemId);
          if (retryError) {
            throw new Error("Не вдалося оновити дані гри.");
          }
        } else {
          throw new Error("Не вдалося оновити дані гри.");
        }
      }
    }
    setCollection((prev) =>
      prev.map((item) => {
        if (item.id !== viewId) return item;
        return {
          ...item,
          viewed_at: payload.viewedAt,
          rating: payload.rating,
          comment: payload.comment,
          recommend_similar: payload.recommendSimilar,
          is_viewed: payload.isViewed,
          view_percent: payload.viewPercent,
          platforms: payload.platforms,
          availability: payload.availability,
          items: itemDraft
            ? {
                ...item.items,
                poster_url: itemDraft.poster_url,
                year: itemDraft.year,
                imdb_rating: itemDraft.imdb_rating,
              genres: itemDraft.genres,
                description: itemDraft.description,
                external_id: itemDraft.external_id,
              }
            : item.items,
        };
      }),
    );
    setSelectedView((prev) => {
      if (!prev || prev.id !== viewId) return prev;
      return {
        ...prev,
        viewed_at: payload.viewedAt,
        rating: payload.rating,
        comment: payload.comment,
        recommend_similar: payload.recommendSimilar,
        is_viewed: payload.isViewed,
        view_percent: payload.viewPercent,
        platforms: payload.platforms,
        availability: payload.availability,
        items: itemDraft
          ? {
              ...prev.items,
              poster_url: itemDraft.poster_url,
              year: itemDraft.year,
              imdb_rating: itemDraft.imdb_rating,
              genres: itemDraft.genres,
              description: itemDraft.description,
              external_id: itemDraft.external_id,
            }
          : prev.items,
      };
    });
    setSelectedViewItemDraft(null);
  };

  const applyRefreshedGameMetadata = async (game: GameResult) => {
    if (!selectedView) return;
    const detailResponse = await fetch(`/api/rawg/${game.id}`);
    const detailData = detailResponse.ok
      ? ((await detailResponse.json()) as {
          description?: string;
          rating?: number | null;
          released?: string;
          poster?: string;
        })
      : null;

    const released =
      detailData?.released && detailData.released.trim()
        ? detailData.released
        : game.released;
    const parsedYear = Number.parseInt(released?.slice(0, 4) ?? "", 10);
    const rawRating =
      typeof detailData?.rating === "number" && Number.isFinite(detailData.rating)
        ? detailData.rating
        : game.rating;
    const poster =
      detailData?.poster && detailData.poster.trim()
        ? detailData.poster.trim()
        : game.poster;
    const genres = game.genres?.trim()
      ? game.genres.trim()
      : selectedView.items.genres ?? null;
    const description =
      detailData?.description && detailData.description.trim()
        ? detailData.description.trim()
        : selectedView.items.description ?? null;

    setSelectedViewItemDraft({
      poster_url: poster?.trim() ? poster.trim() : selectedView.items.poster_url ?? null,
      year: Number.isFinite(parsedYear) ? parsedYear : selectedView.items.year ?? null,
      imdb_rating:
        typeof rawRating === "number" && Number.isFinite(rawRating)
          ? rawRating.toFixed(1)
          : selectedView.items.imdb_rating ?? null,
      genres,
      description,
      external_id: game.id,
    });
  };

  const handleRefreshSelectedGameMetadata = async () => {
    if (!selectedView) return;
    const query = selectedView.items.title.trim();
    const results = await handleGameSearch(query);
    if (results.length === 0) {
      throw new Error("Не знайдено збіг у RAWG.");
    }
    if (results.length === 1) {
      await applyRefreshedGameMetadata(results[0]);
      return;
    }
    setRefreshSearchQuery(query);
    setIsRefreshPickerOpen(true);
  };

  const handleDeleteView = async (viewId: string) => {
    const { error } = await supabase.from("user_views").delete().eq("id", viewId);

    if (error) {
      throw new Error("Не вдалося видалити запис.");
    }

    setHasApplied(true);
    void fetchPage(0, appliedFilters);
  };

  const handleAddToOwnCollection = async (itemId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Потрібна авторизація.");
    }

    const { data: existing } = await supabase
      .from("user_views")
      .select("id")
      .eq("user_id", user.id)
      .eq("item_id", itemId)
      .maybeSingle();

    if (existing?.id) {
      throw new Error("Вже у твоїй колекції.");
    }

    const { error } = await supabase.from("user_views").insert({
      user_id: user.id,
      item_id: itemId,
      is_viewed: false,
      view_percent: 0,
      rating: null,
    });

    if (error) {
      if (error.code === "23505") {
        throw new Error("Вже у твоїй колекції.");
      }
      throw new Error("Не вдалося додати у колекцію.");
    }

    setMessage("Додано до твоєї колекції.");
  };

  const handleGameSearch = useCallback(
    async (query: string) => {
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
        .map((item) => {
          const existingView = existingViewsByExternalId.get(item.id);
          return {
            ...item,
            inCollection: Boolean(existingView),
            existingViewId: existingView?.id,
          };
        })
        .sort((left, right) => {
          const leftYear = Number.parseInt(left.released?.slice(0, 4) ?? "", 10);
          const rightYear = Number.parseInt(right.released?.slice(0, 4) ?? "", 10);
          const safeLeftYear = Number.isNaN(leftYear) ? -Infinity : leftYear;
          const safeRightYear = Number.isNaN(rightYear) ? -Infinity : rightYear;
          return safeRightYear - safeLeftYear;
        });
    },
    [existingViewsByExternalId],
  );

  const handleRefreshGameSearch = useCallback(
    async (query: string) => {
      const results = await handleGameSearch(query);
      const currentExternalId = selectedView?.items.external_id ?? null;
      if (!currentExternalId) {
        return results.map((item) => ({ ...item, isRefreshCurrent: false }));
      }

      return results
        .map((item) => ({
          ...item,
          isRefreshCurrent: item.id === currentExternalId,
        }))
        .sort((left, right) => {
          if (left.isRefreshCurrent && !right.isRefreshCurrent) return -1;
          if (!left.isRefreshCurrent && right.isRefreshCurrent) return 1;
          return 0;
        });
    },
    [handleGameSearch, selectedView?.items.external_id],
  );

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

  const GameSearchItem = ({
    game,
    hideInCollectionHint = false,
  }: {
    game: GameResult;
    hideInCollectionHint?: boolean;
  }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isOverflow, setIsOverflow] = useState(false);
    const descriptionRef = useRef<HTMLParagraphElement | null>(null);

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
      if (!description) {
        void ensureSearchDescription(game.id);
      }
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
          {game.inCollection && !hideInCollectionHint ? (
            <p className={styles.resultMeta}>
              Вже у колекції — відкриється редагування
            </p>
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
          ) : (
            <div className={styles.plotBlock}>
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
            </div>
          )}
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

  const isFriendView = Boolean(readOnly && ownerUserId);
  const isFriendAccessAllowed = !isFriendView || friendAccessState === "allowed";
  const friendAccessMessage = isFriendView
    ? {
        allowed: "",
        checking: "Перевіряємо доступ до бібліотеки...",
        unauthenticated: "Потрібна авторизація для перегляду бібліотеки друга.",
        not_friends: "Доступ лише для друзів.",
        closed: `${friendOwnerName || "Користувач"} закрив доступ до бібліотеки.`,
      }[friendAccessState]
    : "";

  return (
    <div className={styles.searchBlock}>
      <div className={styles.filtersWrapper}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarSearch}>
            <div className={styles.sortControls}>
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
              <label className={styles.sortField}>
                <span className={styles.sortLabel}>Сортування</span>
                <select
                  className={styles.sortSelect}
                  value={appliedFilters.sortBy}
                  onChange={(event) => handleSortByChange(event.target.value as SortBy)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={`btnBase btnSecondary ${styles.sortDirectionButton}`}
                onClick={handleToggleSortDirection}
                aria-label={
                  appliedFilters.sortDirection === "asc"
                    ? "Змінити порядок на спадання"
                    : "Змінити порядок на зростання"
                }
                title={
                  appliedFilters.sortDirection === "asc" ? "Зростання" : "Спадання"
                }
              >
                {appliedFilters.sortDirection === "asc" ? "↑" : "↓"}
              </button>
            </div>
          </div>
          <div className={styles.toolbarActions}>
            {!readOnly ? (
              <button
                type="button"
                className="btnBase btnPrimary"
                onClick={() => setIsAddOpen(true)}
              >
                Додати
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {!hasApplied && isFriendAccessAllowed ? (
        <p className={styles.message}>
          Оберіть фільтри та натисніть &quot;Відобразити&quot;.
        </p>
      ) : null}
      {friendAccessMessage && !isFriendAccessAllowed ? (
        <p className={styles.message}>{friendAccessMessage}</p>
      ) : null}
      {message ? <p className={styles.message}>{message}</p> : null}

      {isFriendAccessAllowed ? <div className={styles.results}>
        {displayedCollection.map((item) => {
          const releasedYear = item.items.year ? String(item.items.year) : "";
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
                      Мій: {item.rating != null ? formatPersonalRating(item.rating) : "—"}
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
                {item.items.genres ? (
                  <p className={styles.resultMeta}>Жанри: {item.items.genres}</p>
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
                  {(item.platforms ?? []).filter((platform) => visiblePlatformsSet.has(platform))
                    .length > 0 ? (
                      <span>
                        Платформи:{" "}
                        {(item.platforms ?? [])
                          .filter((platform) => visiblePlatformsSet.has(platform))
                          .join(", ")}
                      </span>
                    ) : null}
                  {recommendedItemIds.has(item.items.id) ? (
                    <span>Рекомендовано друзям</span>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div> : null}
      {hasApplied && hasMore && isFriendAccessAllowed ? <div ref={loadMoreRef} /> : null}
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
              <CloseIconButton onClick={() => setIsFiltersOpen(false)} />
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
                      style={props.style}
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
                    style={props.style}
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
                  {formatPersonalRating(pendingFilters.personalRatingRange[0])}–
                  {formatPersonalRating(pendingFilters.personalRatingRange[1])}
                </span>
              </div>
              <Range
                values={pendingFilters.personalRatingRange}
                step={PERSONAL_STEP}
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
                    style={props.style}
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
                    yearRange: yearBounds,
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
          getResultItemClassName={(game) =>
            game.inCollection ? styles.existingCollectionResult : ""
          }
          initialQuery={appliedFilters.query}
          onSelect={(game) => {
            if (game.existingViewId) {
              const existingView =
                collection.find((item) => item.id === game.existingViewId) ??
                existingViewsByExternalId.get(game.id);
              if (existingView) {
                setSelectedView(existingView);
                setIsAddOpen(false);
                return;
              }
            }
            setSelectedGame(game);
            setIsAddOpen(false);
          }}
          onClose={() => setIsAddOpen(false)}
          renderItem={(game) => <GameSearchItem game={game} />}
        />
      ) : null}

      {isRefreshPickerOpen ? (
        <CatalogSearchModal
          title="Оновити гру"
          onSearch={handleRefreshGameSearch}
          getKey={(game) => game.id}
          resultItemClassName={styles.gameSearchResultItem}
          getResultItemClassName={(game) =>
            game.isRefreshCurrent ? styles.existingCollectionResult : ""
          }
          initialQuery={refreshSearchQuery}
          onSelect={async (game) => {
            await applyRefreshedGameMetadata(game);
            setIsRefreshPickerOpen(false);
          }}
          onClose={() => setIsRefreshPickerOpen(false)}
          renderItem={(game) => <GameSearchItem game={game} hideInCollectionHint />}
        />
      ) : null}

      {selectedGame ? (
        <CatalogModal
          title={selectedGame.title}
          posterUrl={selectedGame.poster}
          size="wide"
          platformOptions={visiblePlatforms}
          availabilityOptions={showAvailability ? AVAILABILITY_OPTIONS : []}
          initialValues={
            {
              platforms: defaultGamePlatform ? [defaultGamePlatform] : [],
              availability: showAvailability ? defaultGameAvailability : null,
              isViewed: defaultGameIsViewed ?? undefined,
            }
          }
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
          posterUrl={
            (selectedViewItemDraft?.poster_url ?? selectedView.items.poster_url) ?? undefined
          }
          size="wide"
          platformOptions={visiblePlatforms}
          availabilityOptions={showAvailability ? AVAILABILITY_OPTIONS : []}
          onClose={() => setSelectedView(null)}
          readOnly={readOnly}
          submitLabel={readOnly ? "Додати собі у колекцію" : "Зберегти"}
          onReadOnlyPrimaryAction={() => handleAddToOwnCollection(selectedView.items.id)}
          extraActions={
            readOnly ? null : (
              <button
                type="button"
                className="btnBase btnSecondary"
                onClick={() =>
                  openRecommend(selectedView.items.id, selectedView.items.title)
                }
              >
                Порекомендувати другу
              </button>
            )
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
          onRefresh={readOnly ? undefined : handleRefreshSelectedGameMetadata}
          onAdd={
            readOnly
              ? undefined
              : (payload) =>
                  handleUpdateView(
                    selectedView.id,
                    selectedView.items.id,
                    selectedViewItemDraft,
                    payload,
                  )
          }
          onDelete={readOnly ? undefined : () => handleDeleteView(selectedView.id)}
        >
          <div className={styles.resultContent}>
            <div className={styles.titleRow}>
              <span className={styles.resultRating}>
                RAWG:{" "}
                {selectedViewItemDraft?.imdb_rating ??
                  selectedView.items.imdb_rating ??
                  "—"}
              </span>
              <span className={styles.resultRating}>
                Мій: {formatPersonalRating(selectedView.rating)}
              </span>
            </div>
            {(selectedViewItemDraft?.year ?? selectedView.items.year) ? (
              <p className={styles.resultMeta}>
                Рік: {selectedViewItemDraft?.year ?? selectedView.items.year}
              </p>
            ) : null}
            {(selectedViewItemDraft?.genres ?? selectedView.items.genres) ? (
              <p className={styles.resultMeta}>
                Жанри: {selectedViewItemDraft?.genres ?? selectedView.items.genres}
              </p>
            ) : null}
            {(selectedViewItemDraft?.description ?? selectedView.items.description) ? (
              <ModalDescription
                text={
                  selectedViewItemDraft?.description ??
                  selectedView.items.description ??
                  ""
                }
              />
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

      {isNicknameModalOpen ? (
        <div
          className={styles.filtersOverlay}
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!isSavingNickname) {
              setIsNicknameModalOpen(false);
              setPendingRecommendItem(null);
            }
          }}
        >
          <div className={styles.filtersModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.filtersHeader}>
              <h2 className={styles.filtersTitle}>Задайте нікнейм перед відправкою</h2>
            </div>
            <label className={styles.filtersField}>
              Нікнейм
              <input
                className={styles.filtersInput}
                value={nicknameValue}
                maxLength={24}
                onChange={(event) => setNicknameValue(event.target.value)}
                disabled={isSavingNickname}
                autoFocus
              />
            </label>
            <p className={styles.message}>3-24 символи: літери, цифри, _, -</p>
            {nicknameError ? <p className={styles.errorText}>{nicknameError}</p> : null}
            <div className={styles.filtersActions}>
              <button
                type="button"
                className="btnBase btnSecondary"
                onClick={() => {
                  setIsNicknameModalOpen(false);
                  setPendingRecommendItem(null);
                }}
                disabled={isSavingNickname}
              >
                Скасувати
              </button>
              <button
                type="button"
                className="btnBase btnPrimary"
                onClick={() => void saveNicknameAndContinue()}
                disabled={isSavingNickname}
              >
                {isSavingNickname ? "Збереження..." : "Зберегти і продовжити"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
