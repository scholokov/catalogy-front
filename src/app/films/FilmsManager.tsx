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
import CloseIconButton from "@/components/ui/CloseIconButton";
import { supabase } from "@/lib/supabase/client";
import { readDisplayPreferences } from "@/lib/settings/displayPreferences";
import { getDisplayName } from "@/lib/users/displayName";
import styles from "@/components/catalog/CatalogSearch.module.css";

type FilmResult = {
  id: string;
  title: string;
  originalTitle?: string;
  year: string;
  poster: string;
  imageUrls?: string[];
  plot: string;
  genres: string;
  director: string;
  actors: string;
  imdbRating: string;
  mediaType?: "movie" | "tv";
  source: "tmdb";
  inCollection?: boolean;
  existingViewId?: string;
};

type FilmCollectionItem = {
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
  items: {
    id: string;
    title: string;
    title_original: string | null;
    description: string | null;
    genres: string | null;
    director: string | null;
    actors: string | null;
    poster_url: string | null;
    external_id: string | null;
    imdb_rating: string | null;
    year?: number | null;
    type: string;
  };
};

type FilmItemDraft = {
  title_original: string | null;
  poster_url: string | null;
  year: number | null;
  imdb_rating: string | null;
  description: string | null;
  genres: string | null;
  director: string | null;
  actors: string | null;
  external_id: string | null;
};

type ContactOption = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  disabledReason?: string;
};

type FilmsManagerProps = {
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
  director: string;
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

type FilmsViewMode = "default" | "directors" | "cards";
const FILMS_VIEW_MODES: FilmsViewMode[] = ["cards", "default", "directors"];

const MIN_YEAR = 1950;
const MAX_YEAR = new Date().getFullYear();
const EXTERNAL_MIN = 0;
const EXTERNAL_MAX = 10;
const PERSONAL_MIN = 1;
const PERSONAL_MAX = 5;
const PERSONAL_STEP = 0.5;
const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: "created_at", label: "Дата додавання" },
  { value: "title", label: "Ім'я" },
  { value: "rating", label: "Особистий рейтинг" },
  { value: "year", label: "Рік релізу" },
];
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
  director: "",
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

const sortFilmCollection = (
  items: FilmCollectionItem[],
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

export default function FilmsManager({
  onCountChange,
  ownerUserId,
  readOnly = false,
}: FilmsManagerProps) {
  const [collection, setCollection] = useState<FilmCollectionItem[]>([]);
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
  const [viewMode, setViewMode] = useState<FilmsViewMode>("cards");
  const [isDirectorsHydrating, setIsDirectorsHydrating] = useState(false);
  const [selectedFilm, setSelectedFilm] = useState<FilmResult | null>(null);
  const [selectedView, setSelectedView] = useState<FilmCollectionItem | null>(
    null,
  );
  const [selectedViewItemDraft, setSelectedViewItemDraft] = useState<FilmItemDraft | null>(
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
  const descriptionRefs = useRef<Map<string, HTMLParagraphElement | null>>(
    new Map(),
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const skipNextApplyRef = useRef(false);
  const loadingPagesRef = useRef<Set<number>>(new Set());
  const activeRequestKeyRef = useRef("");
  const yearBoundsRef = useRef<[number, number]>([MIN_YEAR, MAX_YEAR]);
  const viewModeStorageKeyRef = useRef("films:view-mode:v2:guest");
  const isViewModeStorageReadyRef = useRef(false);
  const directorsHydrationRunRef = useRef(0);
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
  const [defaultFilmAvailability, setDefaultFilmAvailability] = useState<string | null>(
    null,
  );
  const [defaultFilmIsViewed, setDefaultFilmIsViewed] = useState<boolean | null>(null);

  useEffect(() => {
    const applyPreferences = () => {
      const prefs = readDisplayPreferences();
      setShowAvailability(prefs.showFilmAvailability);
      setDefaultFilmAvailability(prefs.defaultFilmAvailability);
      setDefaultFilmIsViewed(prefs.defaultFilmIsViewed);
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
    let isCancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (isCancelled) return;
      const storageKey = `films:view-mode:v2:${user?.id ?? "guest"}`;
      viewModeStorageKeyRef.current = storageKey;
      const rawValue = window.localStorage.getItem(storageKey);
      if (rawValue && FILMS_VIEW_MODES.includes(rawValue as FilmsViewMode)) {
        setViewMode(rawValue as FilmsViewMode);
      }
      isViewModeStorageReadyRef.current = true;
    })();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isViewModeStorageReadyRef.current) return;
    window.localStorage.setItem(viewModeStorageKeyRef.current, viewMode);
  }, [viewMode]);

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
        "id, created_at, updated_at, viewed_at, rating, comment, view_percent, recommend_similar, is_viewed, availability, items:items!inner (id, title, title_original, description, genres, director, actors, poster_url, external_id, imdb_rating, year, type)",
      )
      .eq("user_id", effectiveOwnerId)
      .eq("items.type", "film");

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
        .eq("items.type", "film");

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
    let data: FilmCollectionItem[] | null;
    let error: { message: string } | null = null;

    if (needsClientSort) {
      const loaded: FilmCollectionItem[] = [];
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
        const rows = (batch as unknown as FilmCollectionItem[]) ?? [];
        loaded.push(...rows);
        if (rows.length < batchSize) {
          break;
        }
        offset += batchSize;
      }
      data = loaded;
    } else {
      const ranged = await query.range(from, to);
      data = (ranged.data as unknown as FilmCollectionItem[]) ?? [];
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
        ? sortFilmCollection(data ?? [], filters.sortBy, filters.sortDirection)
        : ((data as unknown as FilmCollectionItem[]) ?? []);
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
            filters.genres.trim() ||
            filters.director.trim(),
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
    if (viewMode === "directors") return;
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
    viewMode,
  ]);

  useEffect(() => {
    if (readOnly && ownerUserId && friendAccessState !== "allowed") return;
    if (!hasApplied || viewMode !== "directors" || !hasMore) return;
    const runId = Date.now();
    directorsHydrationRunRef.current = runId;
    setIsDirectorsHydrating(true);
    void (async () => {
      let nextPage = page + 1;
      let canLoadMore = true;
      while (canLoadMore) {
        if (directorsHydrationRunRef.current !== runId) return;
        canLoadMore = await fetchPage(nextPage, appliedFilters);
        if (!canLoadMore) break;
        nextPage += 1;
      }
      if (directorsHydrationRunRef.current === runId) {
        setIsDirectorsHydrating(false);
      }
    })();
    return () => {
      if (directorsHydrationRunRef.current === runId) {
        directorsHydrationRunRef.current = 0;
        setIsDirectorsHydrating(false);
      }
    };
  }, [
    appliedFilters,
    fetchPage,
    friendAccessState,
    hasApplied,
    hasMore,
    ownerUserId,
    page,
    readOnly,
    viewMode,
  ]);

  const displayedCollection = useMemo(() => {
    const genresFilter = appliedFilters.genres.trim().toLowerCase();
    const directorFilter = appliedFilters.director.trim().toLowerCase();
    return (!genresFilter && !directorFilter)
      ? collection
      : collection.filter((item) => {
          const description = item.items.description?.toLowerCase() ?? "";
          const genresText = item.items.genres?.toLowerCase() ?? "";
          const directorText = item.items.director?.toLowerCase() ?? "";
          const genresMatches = genresFilter
            ? genresText.includes(genresFilter) || description.includes(genresFilter)
            : true;
          const directorMatches = directorFilter
            ? directorText.includes(directorFilter) || description.includes(directorFilter)
            : true;

          return genresMatches && directorMatches;
        });
  }, [appliedFilters.director, appliedFilters.genres, collection]);

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
    const hasClientFilters = Boolean(
      appliedFilters.genres.trim() || appliedFilters.director.trim(),
    );
    const countToShow = hasClientFilters ? displayedCollection.length : totalCount;
    onCountChange?.(countToShow);
  }, [
    appliedFilters.director,
    appliedFilters.genres,
    displayedCollection.length,
    onCountChange,
    totalCount,
  ]);

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
    const map = new Map<string, FilmCollectionItem>();
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
          ? `У ${getDisplayName(profile.username, profile.id)} уже є цей фільм у колекції`
          : alreadyRecommended.has(profile.id)
            ? `Ви вже рекомендували ${getDisplayName(profile.username, profile.id)} цей фільм`
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

  const handleAddFilm = async (
    film: FilmResult,
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
          title_original: film.originalTitle || null,
          description: film.plot,
          genres: film.genres || null,
          director: film.director || null,
          actors: film.actors || null,
          poster_url: film.poster,
          external_id: film.id,
          imdb_rating: imdbRatingValue,
          year: yearValue,
        })
        .select("id")
        .single();

      if (createError) {
        if (createError.code === "23505") {
          const { data: conflictedItem, error: conflictedItemError } = await supabase
            .from("items")
            .select("id")
            .eq("type", "film")
            .eq("external_id", film.id)
            .maybeSingle();
          if (conflictedItemError || !conflictedItem?.id) {
            throw new Error("Не вдалося створити запис у каталозі.");
          }
          itemId = conflictedItem.id;
        } else {
          throw new Error("Не вдалося створити запис у каталозі.");
        }
      } else {
        itemId = createdItem.id;
      }
    }

    const itemUpdates: {
      title_original?: string | null;
      imdb_rating?: string | null;
      year?: number | null;
      genres?: string | null;
      director?: string | null;
      actors?: string | null;
    } = {};
    if (imdbRatingValue) {
      itemUpdates.imdb_rating = imdbRatingValue;
    }
    if (film.originalTitle) itemUpdates.title_original = film.originalTitle;
    if (yearValue) {
      itemUpdates.year = yearValue;
    }
    if (film.genres) itemUpdates.genres = film.genres;
    if (film.director) itemUpdates.director = film.director;
    if (film.actors) itemUpdates.actors = film.actors;
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
      availability: payload.availability,
    });

    if (viewError) {
      if (viewError.code === "23505") {
        const { error: updateExistingError } = await supabase
          .from("user_views")
          .update({
            rating: payload.rating,
            comment: payload.comment,
            viewed_at: payload.viewedAt,
            is_viewed: payload.isViewed,
            view_percent: payload.viewPercent,
            recommend_similar: payload.recommendSimilar,
            availability: payload.availability,
          })
          .eq("user_id", user.id)
          .eq("item_id", itemId);

        if (updateExistingError) {
          throw new Error("Не вдалося зберегти у колекцію.");
        }
      } else {
        throw new Error("Не вдалося зберегти у колекцію.");
      }
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
    itemDraft: FilmItemDraft | null,
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
        availability: payload.availability,
      })
      .eq("id", viewId);

    if (error) {
      throw new Error("Не вдалося оновити запис.");
    }

    if (itemDraft) {
      const itemUpdatePayload = {
        title_original: itemDraft.title_original,
        poster_url: itemDraft.poster_url,
        year: itemDraft.year,
        imdb_rating: itemDraft.imdb_rating,
        description: itemDraft.description,
        genres: itemDraft.genres,
        director: itemDraft.director,
        actors: itemDraft.actors,
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
              title_original: itemDraft.title_original,
              poster_url: itemDraft.poster_url,
              year: itemDraft.year,
              imdb_rating: itemDraft.imdb_rating,
              description: itemDraft.description,
              genres: itemDraft.genres,
              director: itemDraft.director,
              actors: itemDraft.actors,
            })
            .eq("id", itemId);
          if (retryError) {
            throw new Error("Не вдалося оновити дані фільму.");
          }
        } else {
          throw new Error("Не вдалося оновити дані фільму.");
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
          availability: payload.availability,
          items: itemDraft
            ? {
                ...item.items,
                title_original: itemDraft.title_original,
                poster_url: itemDraft.poster_url,
                year: itemDraft.year,
                imdb_rating: itemDraft.imdb_rating,
                description: itemDraft.description,
                genres: itemDraft.genres,
                director: itemDraft.director,
                actors: itemDraft.actors,
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
        availability: payload.availability,
        items: itemDraft
          ? {
              ...prev.items,
              title_original: itemDraft.title_original,
              poster_url: itemDraft.poster_url,
              year: itemDraft.year,
              imdb_rating: itemDraft.imdb_rating,
              description: itemDraft.description,
              genres: itemDraft.genres,
              director: itemDraft.director,
              actors: itemDraft.actors,
              external_id: itemDraft.external_id,
            }
          : prev.items,
      };
    });
    setSelectedViewItemDraft(null);
  };

  const applyRefreshedFilmMetadata = async (film: FilmResult) => {
    if (!selectedView) return;

    const detailResponse = await fetch(
      `/api/tmdb/${film.id}?mediaType=${film.mediaType ?? "movie"}`,
    );
    const detail = detailResponse.ok
      ? ((await detailResponse.json()) as FilmResult)
      : film;

    const parsedYear = Number.parseInt(detail.year ?? "", 10);
    setSelectedViewItemDraft({
      title_original: detail.originalTitle?.trim()
        ? detail.originalTitle.trim()
        : selectedView.items.title_original ?? null,
      poster_url: detail.poster?.trim()
        ? detail.poster.trim()
        : selectedView.items.poster_url ?? null,
      year: Number.isFinite(parsedYear) ? parsedYear : selectedView.items.year ?? null,
      imdb_rating: detail.imdbRating?.trim()
        ? detail.imdbRating.trim()
        : selectedView.items.imdb_rating ?? null,
      description: detail.plot?.trim()
        ? detail.plot.trim()
        : selectedView.items.description ?? null,
      genres: detail.genres?.trim() ? detail.genres.trim() : selectedView.items.genres ?? null,
      director: detail.director?.trim()
        ? detail.director.trim()
        : selectedView.items.director ?? null,
      actors: detail.actors?.trim() ? detail.actors.trim() : selectedView.items.actors ?? null,
      external_id: detail.id,
    });
  };

  const handleRefreshSelectedFilmMetadata = async () => {
    if (!selectedView) return;
    const query = selectedView.items.title.trim();
    const results = await handleFilmSearch(query);
    if (results.length === 0) {
      throw new Error("Не знайдено збіг у TMDB.");
    }
    if (results.length === 1) {
      await applyRefreshedFilmMetadata(results[0]);
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
    const next = new Set<string>();
    descriptionRefs.current.forEach((node, id) => {
      if (!node) return;
      if (node.scrollHeight > node.clientHeight + 1) {
        next.add(id);
      }
    });
    setOverflowDescriptions(next);
  }, [expandedDescriptions, collection]);

  const handleFilmSearch = async (query: string) => {
    const tmdbResults = await handleTmdbSearch(query);
    return tmdbResults
      .map((item) => {
        const existingView = existingViewsByExternalId.get(item.id);
        return {
          ...item,
          inCollection: Boolean(existingView),
          existingViewId: existingView?.id,
        };
      })
      .sort((left, right) => {
        const leftYear = Number.parseInt(left.year, 10);
        const rightYear = Number.parseInt(right.year, 10);
        const safeLeftYear = Number.isNaN(leftYear) ? -Infinity : leftYear;
        const safeRightYear = Number.isNaN(rightYear) ? -Infinity : rightYear;
        return safeRightYear - safeLeftYear;
      });
  };

  const groupedByDirector = useMemo(() => {
    const groups = new Map<string, FilmCollectionItem[]>();
    displayedCollection.forEach((item) => {
      const director = item.items.director?.trim() || "Без режисера";
      const bucket = groups.get(director);
      if (bucket) {
        bucket.push(item);
      } else {
        groups.set(director, [item]);
      }
    });
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, "uk"));
  }, [displayedCollection]);

  const renderDefaultFilmItem = (
    item: FilmCollectionItem,
    keyPrefix = "",
  ) => (
    <button
      key={`${keyPrefix}${item.id}`}
      type="button"
      className={`${styles.resultItem} ${styles.resultButton} ${styles.collectionItem}`}
      onClick={() => setSelectedView(item)}
    >
      <div className={styles.resultHeader}>
        <div className={styles.titleRow}>
          <h2 className={styles.resultTitle}>{item.items.title}</h2>
          <div className={styles.ratingRow}>
            <span className={styles.resultRating}>IMDb: {item.items.imdb_rating ?? "—"}</span>
            <span className={styles.resultRating}>Мій: {item.rating ?? "—"}</span>
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
        {item.items.year ? (
          <p className={styles.resultMeta}>Рік: {item.items.year}</p>
        ) : null}
        {item.items.director ? (
          <p className={styles.resultMeta}>Режисер: {item.items.director}</p>
        ) : null}
        {item.items.actors ? (
          <p className={styles.resultMeta}>Актори: {item.items.actors}</p>
        ) : null}
        {item.items.genres ? (
          <p className={styles.resultMeta}>Жанри: {item.items.genres}</p>
        ) : null}
        {item.items.description ? (
          <div className={styles.plotBlock}>
            <p
              className={`${styles.resultPlot} ${
                expandedDescriptions.has(item.id) ? "" : styles.resultPlotClamp
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
            {!expandedDescriptions.has(item.id) && overflowDescriptions.has(item.id) ? (
              <span
                className={styles.plotToggle}
                role="button"
                tabIndex={0}
                onClick={(event) => handleExpandDescription(event, item.id)}
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
            {item.is_viewed ? `${formatViewedDate(item.viewed_at)} (${item.view_percent}%)` : "ні"}
          </span>
          {showAvailability && item.availability ? (
            <span>Наявність: {item.availability}</span>
          ) : null}
          {recommendedItemIds.has(item.items.id) ? <span>Рекомендовано друзям</span> : null}
          {item.comment ? <span>Коментар: {item.comment}</span> : null}
        </div>
      </div>
    </button>
  );

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
        <div className={`${styles.toolbar} ${styles.filmsToolbar}`}>
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
          <div className={styles.toolbarCenter}>
            <div className={styles.viewSwitch}>
              <button
                type="button"
                className={`${styles.viewSwitchButton} ${
                  viewMode === "cards" ? styles.viewSwitchButtonActive : ""
                }`}
                onClick={() => setViewMode("cards")}
              >
                Картки
              </button>
              <button
                type="button"
                className={`${styles.viewSwitchButton} ${
                  viewMode === "default" ? styles.viewSwitchButtonActive : ""
                }`}
                onClick={() => setViewMode("default")}
              >
                Детальний
              </button>
              <button
                type="button"
                className={`${styles.viewSwitchButton} ${
                  viewMode === "directors" ? styles.viewSwitchButtonActive : ""
                }`}
                onClick={() => setViewMode("directors")}
              >
                Режисери
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

      {viewMode === "default" && isFriendAccessAllowed ? (
        <div className={styles.results}>{displayedCollection.map((item) => renderDefaultFilmItem(item))}</div>
      ) : null}
      {viewMode === "directors" && isFriendAccessAllowed ? (
        <div className={styles.directorGroups}>
          {isDirectorsHydrating ? (
            <p className={styles.message}>Підготовка режиму &quot;Режисери&quot;... </p>
          ) : (
            groupedByDirector.map(([director, items]) => (
              <section key={director} className={styles.directorGroup}>
                <h3 className={styles.directorTitle}>{director}</h3>
                <div className={styles.results}>
                  {items.map((item) => renderDefaultFilmItem(item, `${director}-`))}
                </div>
              </section>
            ))
          )}
        </div>
      ) : null}
      {viewMode === "cards" && isFriendAccessAllowed ? (
        <div className={`${styles.results} ${styles.filmCardsGrid}`}>
          {displayedCollection.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.resultButton} ${styles.filmCardViewItem}`}
              onClick={() => setSelectedView(item)}
            >
              <div className={styles.filmCardPosterWrapper}>
                {item.items.poster_url ? (
                  <Image
                    className={styles.poster}
                    src={item.items.poster_url}
                    alt={`Постер ${item.items.title}`}
                    width={270}
                    height={405}
                    sizes="(max-width: 720px) 70vw, 270px"
                    loading="lazy"
                    unoptimized
                  />
                ) : (
                  <div className={styles.posterPlaceholder}>No image</div>
                )}
              </div>
              <div className={styles.filmCardFooter}>
                <div className={styles.filmCardRatingsRow}>
                  <span className={styles.resultRating}>IMDb: {item.items.imdb_rating ?? "—"}</span>
                  <span className={styles.resultRating}>Мій: {item.rating ?? "—"}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
      {hasApplied && hasMore && isFriendAccessAllowed ? (
        <div ref={loadMoreRef} />
      ) : null}
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
                placeholder="Напр. Drama"
                onChange={(event) =>
                  setPendingFilters((prev) => ({
                    ...prev,
                    genres: event.target.value,
                  }))
                }
              />
            </label>
            <label className={styles.filtersField}>
              Режисер
              <input
                className={styles.filtersInput}
                value={pendingFilters.director}
                placeholder="Напр. Nolan"
                onChange={(event) =>
                  setPendingFilters((prev) => ({
                    ...prev,
                    director: event.target.value,
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
                <span>IMDb</span>
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
          title="Додати фільм"
          onSearch={handleFilmSearch}
          getKey={(film) => film.id}
          getResultItemClassName={(film) =>
            film.inCollection ? styles.existingCollectionResult : ""
          }
          initialQuery={appliedFilters.query}
          onSelect={async (film) => {
            if (film.existingViewId) {
              const existingView =
                collection.find((item) => item.id === film.existingViewId) ??
                existingViewsByExternalId.get(film.id);
              if (existingView) {
                setSelectedView(existingView);
                setIsAddOpen(false);
                return;
              }
            }
            try {
              const detailResponse = await fetch(
                `/api/tmdb/${film.id}?mediaType=${film.mediaType ?? "movie"}`,
              );
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
                {film.inCollection ? (
                  <p className={styles.resultMeta}>
                    Вже у колекції — відкриється редагування
                  </p>
                ) : null}
                <p className={styles.resultPlot}>
                  {film.plot ? film.plot : "Опис недоступний."}
                </p>
              </div>
            </>
          )}
        />
      ) : null}

      {isRefreshPickerOpen ? (
        <CatalogSearchModal
          title="Оновити фільм"
          onSearch={handleFilmSearch}
          getKey={(film) => film.id}
          initialQuery={refreshSearchQuery}
          onSelect={async (film) => {
            await applyRefreshedFilmMetadata(film);
            setIsRefreshPickerOpen(false);
          }}
          onClose={() => setIsRefreshPickerOpen(false)}
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
                    {film.title} <span className={styles.resultYear}>({film.year})</span>
                  </h2>
                  {film.imdbRating ? (
                    <span className={styles.resultRating}>IMDb: {film.imdbRating}</span>
                  ) : null}
                </div>
                {film.genres ? <p className={styles.resultMeta}>{film.genres}</p> : null}
                {film.director ? (
                  <p className={styles.resultMeta}>Режисер: {film.director}</p>
                ) : null}
                {film.actors ? <p className={styles.resultMeta}>Актори: {film.actors}</p> : null}
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
          availabilityOptions={showAvailability ? AVAILABILITY_OPTIONS : []}
          initialValues={{
            availability: showAvailability ? defaultFilmAvailability : null,
            isViewed: defaultFilmIsViewed ?? undefined,
          }}
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
            {selectedFilm.plot ? (
              <ModalDescription text={selectedFilm.plot} />
            ) : (
              <p className={styles.resultPlot}>Опис недоступний.</p>
            )}
          </div>
        </CatalogModal>
      ) : null}

      {selectedView ? (
        <CatalogModal
          title={selectedView.items.title}
          posterUrl={
            (selectedViewItemDraft?.poster_url ?? selectedView.items.poster_url) ?? undefined
          }
          imageUrls={
            (selectedViewItemDraft?.poster_url ?? selectedView.items.poster_url)
              ? [selectedViewItemDraft?.poster_url ?? selectedView.items.poster_url ?? ""]
              : []
          }
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
            availability: selectedView.availability,
          }}
          availabilityOptions={showAvailability ? AVAILABILITY_OPTIONS : []}
          onRefresh={readOnly ? undefined : handleRefreshSelectedFilmMetadata}
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
                IMDb:{" "}
                {selectedViewItemDraft?.imdb_rating ??
                  selectedView.items.imdb_rating ??
                  "—"}
              </span>
              <span className={styles.resultRating}>
                Мій: {formatPersonalRating(selectedView.rating)}
              </span>
            </div>
            <p className={styles.resultMeta}>
              Оригінальна назва:{" "}
              {selectedViewItemDraft?.title_original ??
                selectedView.items.title_original ??
                "—"}
            </p>
            {(selectedViewItemDraft?.year ?? selectedView.items.year) ? (
              <p className={styles.resultMeta}>
                Рік: {selectedViewItemDraft?.year ?? selectedView.items.year}
              </p>
            ) : null}
            {(selectedViewItemDraft?.director ?? selectedView.items.director) ? (
              <p className={styles.resultMeta}>
                Режисер: {selectedViewItemDraft?.director ?? selectedView.items.director}
              </p>
            ) : null}
            {(selectedViewItemDraft?.actors ?? selectedView.items.actors) ? (
              <p className={styles.resultMeta}>
                Актори: {selectedViewItemDraft?.actors ?? selectedView.items.actors}
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
