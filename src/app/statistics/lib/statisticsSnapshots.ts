import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  FilmStatisticsPayload,
  GameStatisticsPayload,
  StatisticsSnapshotResponse,
  StatisticsSnapshotState,
} from "../statisticsTypes";
import { loadFilmStatistics } from "./filmStatisticsServer";
import { loadGameStatistics } from "./gameStatisticsServer";

export type StatisticsMediaKind = "film" | "game";

type StatisticsPayloadByKind = {
  film: FilmStatisticsPayload;
  game: GameStatisticsPayload;
};

type StatisticsSnapshotRow = {
  payload: unknown;
  is_stale: boolean | null;
  last_built_at: string | null;
  last_invalidated_at: string | null;
  last_rebuild_started_at: string | null;
};

type SnapshotReadResult<T> = StatisticsSnapshotResponse<T> & {
  shouldRefreshInBackground: boolean;
};

const REBUILD_LOCK_MS = 90 * 1000;

const isRebuildLockActive = (value: string | null) => {
  if (!value) {
    return false;
  }

  const startedAt = new Date(value);
  if (Number.isNaN(startedAt.getTime())) {
    return false;
  }

  return Date.now() - startedAt.getTime() < REBUILD_LOCK_MS;
};

const buildSnapshotState = (row: StatisticsSnapshotRow | null): StatisticsSnapshotState => ({
  isStale: Boolean(row?.is_stale ?? true),
  builtAt: row?.last_built_at ?? null,
  invalidatedAt: row?.last_invalidated_at ?? null,
});

const loadPayload = async <T>(mediaKind: StatisticsMediaKind, userId: string): Promise<T> => {
  if (mediaKind === "film") {
    return (await loadFilmStatistics(userId)) as T;
  }

  return (await loadGameStatistics(userId)) as T;
};

const persistStatisticsSnapshot = async <T>(
  userId: string,
  mediaKind: StatisticsMediaKind,
  payload: T,
  expectedInvalidatedAt?: string | null,
) => {
  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: current, error: currentError } = await supabaseAdmin
    .from("statistics_snapshots")
    .select("last_invalidated_at")
    .eq("user_id", userId)
    .eq("media_kind", mediaKind)
    .maybeSingle();

  if (currentError) {
    throw new Error(currentError.message || "Не вдалося перевірити snapshot статистики.");
  }

  const currentInvalidatedAt =
    ((current ?? null) as { last_invalidated_at?: string | null } | null)?.last_invalidated_at ??
    null;
  const keepStale =
    expectedInvalidatedAt !== undefined &&
    currentInvalidatedAt !== expectedInvalidatedAt;

  const { error } = await supabaseAdmin.from("statistics_snapshots").upsert(
    {
      user_id: userId,
      media_kind: mediaKind,
      payload,
      is_stale: keepStale,
      last_built_at: now,
      last_rebuild_started_at: null,
      updated_at: now,
    },
    {
      onConflict: "user_id,media_kind",
    },
  );

  if (error) {
    throw new Error(error.message || "Не вдалося зберегти snapshot статистики.");
  }

  return {
    builtAt: now,
    isStale: keepStale,
    invalidatedAt: currentInvalidatedAt,
  };
};

export async function readStatisticsSnapshot<T extends StatisticsMediaKind>(
  userId: string,
  mediaKind: T,
): Promise<SnapshotReadResult<StatisticsPayloadByKind[T]>> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("statistics_snapshots")
    .select("payload, is_stale, last_built_at, last_invalidated_at, last_rebuild_started_at")
    .eq("user_id", userId)
    .eq("media_kind", mediaKind)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Не вдалося завантажити snapshot статистики.");
  }

  const row = (data ?? null) as StatisticsSnapshotRow | null;
  const snapshotState = buildSnapshotState(row);
  const hasPayload = row?.payload !== null && row?.payload !== undefined;

  if (!hasPayload) {
    const payload = await loadPayload<StatisticsPayloadByKind[T]>(mediaKind, userId);
    const persisted = await persistStatisticsSnapshot(
      userId,
      mediaKind,
      payload,
      row?.last_invalidated_at ?? null,
    );
    return {
      data: payload,
      snapshot: {
        isStale: persisted.isStale,
        builtAt: persisted.builtAt,
        invalidatedAt: persisted.invalidatedAt,
      },
      shouldRefreshInBackground: persisted.isStale,
    };
  }

  return {
    data: row.payload as StatisticsPayloadByKind[T],
    snapshot: snapshotState,
    shouldRefreshInBackground:
      snapshotState.isStale && !isRebuildLockActive(row?.last_rebuild_started_at ?? null),
  };
}

export async function rebuildStatisticsSnapshot<T extends StatisticsMediaKind>(
  userId: string,
  mediaKind: T,
  options?: {
    expectedInvalidatedAt?: string | null;
  },
): Promise<StatisticsPayloadByKind[T]> {
  const payload = await loadPayload<StatisticsPayloadByKind[T]>(mediaKind, userId);
  await persistStatisticsSnapshot(
    userId,
    mediaKind,
    payload,
    options?.expectedInvalidatedAt,
  );

  return payload;
}

export async function refreshStatisticsSnapshotIfNeeded(
  userId: string,
  mediaKind: StatisticsMediaKind,
) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("statistics_snapshots")
    .select("is_stale, last_rebuild_started_at")
    .eq("user_id", userId)
    .eq("media_kind", mediaKind)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Не вдалося перевірити стан snapshot статистики.");
  }

  const row = (data ?? null) as Pick<
    StatisticsSnapshotRow,
    "is_stale" | "last_rebuild_started_at" | "last_invalidated_at"
  > | null;

  if (!row?.is_stale || isRebuildLockActive(row.last_rebuild_started_at ?? null)) {
    return;
  }

  const rebuildStartedAt = new Date().toISOString();
  const { error: markStartedError } = await supabaseAdmin
    .from("statistics_snapshots")
    .update({
      last_rebuild_started_at: rebuildStartedAt,
      updated_at: rebuildStartedAt,
    })
    .eq("user_id", userId)
    .eq("media_kind", mediaKind);

  if (markStartedError) {
    throw new Error(markStartedError.message || "Не вдалося запустити оновлення snapshot.");
  }

  await rebuildStatisticsSnapshot(userId, mediaKind, {
    expectedInvalidatedAt: row.last_invalidated_at ?? null,
  });
}
