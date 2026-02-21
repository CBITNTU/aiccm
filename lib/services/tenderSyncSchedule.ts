/* eslint-disable @typescript-eslint/no-explicit-any -- platform_settings not in generated types */
import { createAdminClient } from "@/lib/api";

const KEY_LAST_FINISHED = "tender_sync_last_finished_at";
const KEY_NEXT_SCHEDULED = "tender_sync_next_scheduled_at";

export interface TenderSyncSchedule {
  lastSyncFinishedAt: string | null;
  nextSyncScheduledAt: string | null;
}

export async function getTenderSyncSchedule(): Promise<TenderSyncSchedule> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("platform_settings" as any)
    .select("key, value")
    .in("key", [KEY_LAST_FINISHED, KEY_NEXT_SCHEDULED]);

  if (error) {
    throw new Error(`Failed to read tender sync schedule: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    lastSyncFinishedAt: map.get(KEY_LAST_FINISHED) || null,
    nextSyncScheduledAt: map.get(KEY_NEXT_SCHEDULED) || null,
  };
}

export async function setTenderSyncSchedule(updates: {
  lastSyncFinishedAt?: string;
  nextSyncScheduledAt?: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const rows: { key: string; value: string; updated_at: string }[] = [];
  if (updates.lastSyncFinishedAt !== undefined) {
    rows.push({
      key: KEY_LAST_FINISHED,
      value: updates.lastSyncFinishedAt,
      updated_at: now,
    });
  }
  if (updates.nextSyncScheduledAt !== undefined) {
    rows.push({
      key: KEY_NEXT_SCHEDULED,
      value: updates.nextSyncScheduledAt,
      updated_at: now,
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("platform_settings" as any)
    .upsert(rows, { onConflict: "key" });

  if (error) {
    throw new Error(`Failed to update tender sync schedule: ${error.message}`);
  }
}
