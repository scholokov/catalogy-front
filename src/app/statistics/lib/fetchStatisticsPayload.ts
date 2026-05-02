"use client";

import { supabase } from "@/lib/supabase/client";

type FetchStatisticsStage = "auth" | "request";

export async function fetchStatisticsPayload<T>(
  input: string,
  options?: {
    signal?: AbortSignal;
    onStageChange?: (stage: FetchStatisticsStage) => void;
  },
): Promise<T> {
  options?.onStageChange?.("auth");
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Потрібна авторизація.");
  }

  options?.onStageChange?.("request");
  const response = await fetch(input, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    cache: "no-store",
    signal: options?.signal,
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error || "Не вдалося завантажити статистику.");
  }

  return payload as T;
}
