import type { SupabaseClient } from "@supabase/supabase-js";

type RelatedItemsTable = "item_genres" | "item_people";

const RELATION_QUERY_BATCH_SIZE = 150;

export const loadRelatedItemIds = async (
  supabase: SupabaseClient,
  table: RelatedItemsTable,
  itemIds: string[],
) => {
  const relatedItemIds = new Set<string>();

  for (let offset = 0; offset < itemIds.length; offset += RELATION_QUERY_BATCH_SIZE) {
    const chunk = itemIds.slice(offset, offset + RELATION_QUERY_BATCH_SIZE);
    if (chunk.length === 0) {
      continue;
    }

    const { data, error } = await supabase.from(table).select("item_id").in("item_id", chunk);
    if (error) {
      throw error;
    }

    ((data ?? []) as Array<{ item_id?: string | null }>).forEach((row) => {
      if (row.item_id) {
        relatedItemIds.add(row.item_id);
      }
    });
  }

  return relatedItemIds;
};

export const loadRelatedItemCounts = async (
  supabase: SupabaseClient,
  table: RelatedItemsTable,
  itemIds: string[],
) => {
  const relatedItemCounts = new Map<string, number>();

  for (let offset = 0; offset < itemIds.length; offset += RELATION_QUERY_BATCH_SIZE) {
    const chunk = itemIds.slice(offset, offset + RELATION_QUERY_BATCH_SIZE);
    if (chunk.length === 0) {
      continue;
    }

    const { data, error } = await supabase.from(table).select("item_id").in("item_id", chunk);
    if (error) {
      throw error;
    }

    ((data ?? []) as Array<{ item_id?: string | null }>).forEach((row) => {
      if (row.item_id) {
        relatedItemCounts.set(row.item_id, (relatedItemCounts.get(row.item_id) ?? 0) + 1);
      }
    });
  }

  return relatedItemCounts;
};
