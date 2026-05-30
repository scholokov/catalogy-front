"use client";

export const CATALOG_SCREEN_SNAPSHOT_VERSION = 1;

const CATALOG_SCREEN_STORAGE_KEY_PREFIX = "catalog-screen-context:";

type CatalogScreenName = "games" | "films";

type BuildCatalogScreenKeyParams = {
  screen: CatalogScreenName;
  ownerUserId?: string;
  readOnly?: boolean;
};

export type CatalogScreenSnapshot<TFilters, TViewMode extends string> = {
  version: typeof CATALOG_SCREEN_SNAPSHOT_VERSION;
  appliedFilters: TFilters;
  pendingFilters: TFilters;
  toolbarQueryDraft: string;
  hasApplied: boolean;
  viewMode: TViewMode;
  page: number;
  scrollY: number;
  updatedAt: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getStorageKey = (screenKey: string) =>
  `${CATALOG_SCREEN_STORAGE_KEY_PREFIX}${screenKey}`;

export const buildCatalogScreenKey = ({
  screen,
  ownerUserId,
  readOnly = false,
}: BuildCatalogScreenKeyParams) =>
  readOnly && ownerUserId
    ? `catalog-screen:${screen}:friend:${ownerUserId}`
    : `catalog-screen:${screen}:self`;

export const loadCatalogScreenSnapshot = <TFilters, TViewMode extends string>(
  screenKey: string,
): CatalogScreenSnapshot<TFilters, TViewMode> | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(getStorageKey(screenKey));
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    if (parsed.version !== CATALOG_SCREEN_SNAPSHOT_VERSION) {
      return null;
    }

    if (
      typeof parsed.toolbarQueryDraft !== "string" ||
      typeof parsed.hasApplied !== "boolean" ||
      typeof parsed.viewMode !== "string" ||
      typeof parsed.page !== "number" ||
      typeof parsed.scrollY !== "number" ||
      typeof parsed.updatedAt !== "number" ||
      !("appliedFilters" in parsed) ||
      !("pendingFilters" in parsed)
    ) {
      return null;
    }

    return parsed as CatalogScreenSnapshot<TFilters, TViewMode>;
  } catch {
    return null;
  }
};

export const saveCatalogScreenSnapshot = <TFilters, TViewMode extends string>(
  screenKey: string,
  snapshot: CatalogScreenSnapshot<TFilters, TViewMode>,
) => {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(getStorageKey(screenKey), JSON.stringify(snapshot));
};

export const clearCatalogScreenSnapshot = (screenKey: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(getStorageKey(screenKey));
};
