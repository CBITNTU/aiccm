import { getPlatformSettingsByKeys, upsertPlatformSetting } from "@/lib/db/queries";

const KEY_LAST_FINISHED = "tender_sync_last_finished_at";
const KEY_NEXT_SCHEDULED = "tender_sync_next_scheduled_at";

export interface TenderSyncSchedule {
  lastSyncFinishedAt: string | null;
  nextSyncScheduledAt: string | null;
}

export async function getTenderSyncSchedule(): Promise<TenderSyncSchedule> {
  const fallback: TenderSyncSchedule = {
    lastSyncFinishedAt: null,
    nextSyncScheduledAt: null,
  };
  try {
    const rows = await getPlatformSettingsByKeys([KEY_LAST_FINISHED, KEY_NEXT_SCHEDULED]);
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      lastSyncFinishedAt: map.get(KEY_LAST_FINISHED) || null,
      nextSyncScheduledAt: map.get(KEY_NEXT_SCHEDULED) || null,
    };
  } catch (e) {
    console.warn("getTenderSyncSchedule error:", e);
    return fallback;
  }
}

export async function setTenderSyncSchedule(updates: {
  lastSyncFinishedAt?: string;
  nextSyncScheduledAt?: string;
}): Promise<void> {
  if (updates.lastSyncFinishedAt !== undefined) {
    await upsertPlatformSetting(KEY_LAST_FINISHED, updates.lastSyncFinishedAt);
  }
  if (updates.nextSyncScheduledAt !== undefined) {
    await upsertPlatformSetting(KEY_NEXT_SCHEDULED, updates.nextSyncScheduledAt);
  }
}
