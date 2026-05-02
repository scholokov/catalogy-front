import { after, NextResponse } from "next/server";
import {
  readStatisticsSnapshot,
  refreshStatisticsSnapshotIfNeeded,
} from "@/app/statistics/lib/statisticsSnapshots";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authorization.slice(7).trim();
};

export async function GET(request: Request) {
  try {
    const accessToken = getBearerToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseServer.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const payload = await readStatisticsSnapshot(user.id, "film");

    if (payload.shouldRefreshInBackground) {
      after(async () => {
        await refreshStatisticsSnapshotIfNeeded(user.id, "film");
      });
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося завантажити статистику фільмів.",
      },
      { status: 500 },
    );
  }
}
