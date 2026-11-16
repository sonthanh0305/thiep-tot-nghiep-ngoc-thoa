import type { RsvpEntry } from '../types';

export interface GraduationJsonDatabase {
  guestList: string[];
  guestListUpdatedAt?: number;
  rsvpEntries: RsvpEntry[];
  deletedRsvpIds?: string[];
  updatedAt: string;
}

const CLOUD_KV_URL =
  'https://kvdb.io/R8ERGvr7PBwaDCQ8Dk4km5/ngoc_thoa_graduation_db_2026';
const LOCAL_CACHE_KEY = 'ngoc_thoa_graduation_json_db_v5';
const DELETED_RSVP_IDS_KEY = 'ngoc_thoa_graduation_deleted_rsvp_ids_v5';
const BROADCAST_CHANNEL_NAME = 'ngoc_thoa_graduation_db_sync';

let syncChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    syncChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  }
} catch {
  syncChannel = null;
}

function getLocalDeletedRsvpIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DELETED_RSVP_IDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        return new Set(arr.map((x) => String(x)));
      }
    }
  } catch {
    // Ignore
  }
  return new Set<string>();
}

function addLocalDeletedRsvpIds(ids: string[]): void {
  try {
    const set = getLocalDeletedRsvpIds();
    for (const id of ids) {
      if (id) set.add(String(id));
    }
    window.localStorage.setItem(
      DELETED_RSVP_IDS_KEY,
      JSON.stringify(Array.from(set)),
    );
  } catch {
    // Ignore
  }
}

export function mergeUniqueRsvpEntries(
  primary: RsvpEntry[],
  secondary: RsvpEntry[],
  deletedIds: Set<string> = getLocalDeletedRsvpIds(),
): RsvpEntry[] {
  const map = new Map<string, RsvpEntry>();
  for (const item of primary) {
    if (item && item.id && !deletedIds.has(item.id)) {
      map.set(item.id, item);
    }
  }
  for (const item of secondary) {
    if (item && item.id && !deletedIds.has(item.id) && !map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

function notifyAllTabs(db: GraduationJsonDatabase): void {
  try {
    syncChannel?.postMessage({
      type: 'DB_UPDATED',
      payload: db,
    });
  } catch {
    // Ignore
  }
}

async function fetchFromCloudKv(): Promise<Partial<GraduationJsonDatabase> | null> {
  try {
    const res = await fetch(`${CLOUD_KV_URL}?t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = (await res.json()) as Partial<GraduationJsonDatabase>;
      if (data && typeof data === 'object') {
        return data;
      }
    }
  } catch {
    // Ignore cloud fetch failure
  }
  return null;
}

async function pushToCloudKv(db: GraduationJsonDatabase): Promise<void> {
  try {
    await fetch(CLOUD_KV_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(db),
    });
  } catch {
    // Ignore cloud write failure
  }
}

async function fetchFromApiEndpoint(): Promise<Partial<GraduationJsonDatabase> | null> {
  try {
    const res = await fetch('/api/db', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      return (await res.json()) as Partial<GraduationJsonDatabase>;
    }
  } catch {
    // Ignore if static host without /api/db
  }
  return null;
}

/**
 * Loads the Graduation Database by combining:
 * 1. Direct Cloud JSON Store (works across all phones/laptops on Vercel & anywhere)
 * 2. /api/db (Vercel Serverless Function / Vite Dev Server)
 * 3. Static /data/graduation-db.json + localStorage cache
 */
export async function loadGraduationDatabase(): Promise<GraduationJsonDatabase> {
  const localCache = loadLocalCache();

  const [cloudData, apiData] = await Promise.all([
    fetchFromCloudKv(),
    fetchFromApiEndpoint(),
  ]);

  if (cloudData || apiData) {
    const deletedSet = getLocalDeletedRsvpIds();
    for (const src of [cloudData, apiData, localCache]) {
      if (src && Array.isArray(src.deletedRsvpIds)) {
        for (const id of src.deletedRsvpIds) {
          if (id) deletedSet.add(String(id));
        }
      }
    }
    addLocalDeletedRsvpIds(Array.from(deletedSet));

    const cloudRsvps = Array.isArray(cloudData?.rsvpEntries)
      ? cloudData.rsvpEntries
      : [];
    const apiRsvps = Array.isArray(apiData?.rsvpEntries)
      ? apiData.rsvpEntries
      : [];

    // Cloud & API take priority so edits to existing entries win, while preserving any unsynced local entries
    const mergedRemoteRsvps = mergeUniqueRsvpEntries(
      cloudRsvps,
      apiRsvps,
      deletedSet,
    );
    const mergedAllRsvps = mergeUniqueRsvpEntries(
      mergedRemoteRsvps,
      localCache.rsvpEntries,
      deletedSet,
    );

    const cloudGuestTs = Number(cloudData?.guestListUpdatedAt || 0);
    const apiGuestTs = Number(apiData?.guestListUpdatedAt || 0);
    const localGuestTs = Number(localCache.guestListUpdatedAt || 0);

    const cloudGuests = Array.isArray(cloudData?.guestList)
      ? cloudData.guestList
      : [];
    const apiGuests = Array.isArray(apiData?.guestList)
      ? apiData.guestList
      : [];

    let chosenGuests = localCache.guestList;
    const maxTs = Math.max(cloudGuestTs, apiGuestTs, localGuestTs);

    if (maxTs === cloudGuestTs && cloudGuests.length > 0) {
      chosenGuests = cloudGuests;
    } else if (maxTs === apiGuestTs && apiGuests.length > 0) {
      chosenGuests = apiGuests;
    } else if (localCache.guestList.length > 0) {
      chosenGuests = localCache.guestList;
    } else if (cloudGuests.length > 0) {
      chosenGuests = cloudGuests;
    } else if (apiGuests.length > 0) {
      chosenGuests = apiGuests;
    }

    const normalized: GraduationJsonDatabase = {
      guestList: chosenGuests,
      guestListUpdatedAt: maxTs,
      rsvpEntries: mergedAllRsvps,
      deletedRsvpIds: Array.from(deletedSet),
      updatedAt:
        cloudData?.updatedAt ||
        apiData?.updatedAt ||
        new Date().toISOString(),
    };

    // If local or API had newer RSVPs than Cloud, sync back up automatically
    if (mergedAllRsvps.length > cloudRsvps.length) {
      void pushToCloudKv(normalized);
    }

    saveLocalCache(normalized);
    return normalized;
  }

  // Fallback to static /data/graduation-db.json if offline from cloud
  try {
    const staticRes = await fetch('/data/graduation-db.json', {
      cache: 'no-store',
    });
    const contentType = staticRes.headers.get('content-type') || '';
    if (staticRes.ok && contentType.includes('application/json')) {
      const data = (await staticRes.json()) as Partial<GraduationJsonDatabase>;
      const staticGuests = Array.isArray(data.guestList) ? data.guestList : [];
      const staticRsvps = Array.isArray(data.rsvpEntries)
        ? data.rsvpEntries
        : [];
      const deletedSet = getLocalDeletedRsvpIds();

      const merged: GraduationJsonDatabase = {
        guestList:
          localCache.guestList.length > 0 ? localCache.guestList : staticGuests,
        guestListUpdatedAt: localCache.guestListUpdatedAt || 0,
        rsvpEntries: mergeUniqueRsvpEntries(
          localCache.rsvpEntries,
          staticRsvps,
          deletedSet,
        ),
        deletedRsvpIds: Array.from(deletedSet),
        updatedAt:
          localCache.updatedAt || data.updatedAt || new Date().toISOString(),
      };
      saveLocalCache(merged);
      return merged;
    }
  } catch {
    // Ignore
  }

  return localCache;
}

/**
 * Dedicated function for Guests (or Admin) to submit a new RSVP & Wish entry.
 * Immediately syncs to Cloud JSON Store + /api/db so Admin on Vercel sees it right away.
 */
export async function submitGuestRsvpEntry(
  entry: RsvpEntry,
): Promise<GraduationJsonDatabase> {
  const current = await loadGraduationDatabase();
  const deletedSet = getLocalDeletedRsvpIds();
  deletedSet.delete(entry.id);

  const filtered = current.rsvpEntries.filter(
    (e) => e.id !== entry.id && !deletedSet.has(e.id),
  );
  const nextDb: GraduationJsonDatabase = {
    guestList: current.guestList,
    guestListUpdatedAt: current.guestListUpdatedAt || 0,
    rsvpEntries: [entry, ...filtered],
    deletedRsvpIds: Array.from(deletedSet),
    updatedAt: new Date().toISOString(),
  };

  saveLocalCache(nextDb);
  notifyAllTabs(nextDb);

  await Promise.allSettled([
    pushToCloudKv(nextDb),
    fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit_rsvp',
        entry,
      }),
    }),
  ]);

  return nextDb;
}

/**
 * Dedicated Admin function to delete a specific RSVP entry by ID.
 */
export async function deleteRsvpEntryFromDatabase(
  entryId: string,
): Promise<GraduationJsonDatabase> {
  addLocalDeletedRsvpIds([entryId]);
  const current = await loadGraduationDatabase();
  const deletedSet = getLocalDeletedRsvpIds();
  deletedSet.add(entryId);

  const nextDb: GraduationJsonDatabase = {
    guestList: current.guestList,
    guestListUpdatedAt: current.guestListUpdatedAt || 0,
    rsvpEntries: current.rsvpEntries.filter(
      (e) => e.id !== entryId && !deletedSet.has(e.id),
    ),
    deletedRsvpIds: Array.from(deletedSet),
    updatedAt: new Date().toISOString(),
  };

  saveLocalCache(nextDb);
  notifyAllTabs(nextDb);

  await Promise.allSettled([
    pushToCloudKv(nextDb),
    fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_rsvp',
        entryId,
      }),
    }),
  ]);

  return nextDb;
}

/**
 * Dedicated Admin function to update the Guest List while preserving all RSVP entries.
 */
export async function saveAdminGuestList(
  guestList: string[],
): Promise<GraduationJsonDatabase> {
  const current = await loadGraduationDatabase();
  const nextDb: GraduationJsonDatabase = {
    guestList,
    guestListUpdatedAt: Date.now(),
    rsvpEntries: current.rsvpEntries,
    deletedRsvpIds: current.deletedRsvpIds || Array.from(getLocalDeletedRsvpIds()),
    updatedAt: new Date().toISOString(),
  };

  saveLocalCache(nextDb);
  notifyAllTabs(nextDb);

  await Promise.allSettled([
    pushToCloudKv(nextDb),
    fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_guest_list',
        guestList,
      }),
    }),
  ]);

  return nextDb;
}

/**
 * Full database save (used when editing an RSVP entry, renaming a guest with RSVP, or importing JSON).
 */
export async function saveGraduationDatabase(
  db: GraduationJsonDatabase,
  overwriteRsvp: boolean = false,
): Promise<GraduationJsonDatabase> {
  const current = await loadGraduationDatabase();
  const deletedSet = getLocalDeletedRsvpIds();

  const payload: GraduationJsonDatabase = {
    guestList: db.guestList,
    guestListUpdatedAt: Date.now(),
    rsvpEntries: overwriteRsvp
      ? db.rsvpEntries.filter((e) => e && !deletedSet.has(e.id))
      : mergeUniqueRsvpEntries(db.rsvpEntries, current.rsvpEntries, deletedSet),
    deletedRsvpIds: Array.from(deletedSet),
    updatedAt: new Date().toISOString(),
  };

  saveLocalCache(payload);
  notifyAllTabs(payload);

  await Promise.allSettled([
    pushToCloudKv(payload),
    fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        overwriteRsvp,
      }),
    }),
  ]);

  return payload;
}

/**
 * Subscribes to real-time database updates across browser tabs and cloud polling
 * so the Admin dashboard immediately receives new Guest RSVP entries.
 */
export function subscribeToDatabaseChanges(
  onUpdate: (db: GraduationJsonDatabase) => void,
): () => void {
  const handleChannelMessage = (event: MessageEvent) => {
    const data = event.data as {
      type?: string;
      payload?: GraduationJsonDatabase;
    } | null;
    if (data && data.type === 'DB_UPDATED' && data.payload) {
      saveLocalCache(data.payload);
      onUpdate(data.payload);
    }
  };

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === LOCAL_CACHE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue) as GraduationJsonDatabase;
        onUpdate(parsed);
      } catch {
        // Ignore
      }
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void loadGraduationDatabase().then(onUpdate);
    }
  };

  syncChannel?.addEventListener('message', handleChannelMessage);
  window.addEventListener('storage', handleStorageEvent);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  const pollIntervalId = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      void loadGraduationDatabase().then(onUpdate);
    }
  }, 3000);

  return () => {
    syncChannel?.removeEventListener('message', handleChannelMessage);
    window.removeEventListener('storage', handleStorageEvent);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.clearInterval(pollIntervalId);
  };
}

function loadLocalCache(): GraduationJsonDatabase {
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GraduationJsonDatabase>;
      return {
        guestList: Array.isArray(parsed.guestList) ? parsed.guestList : [],
        guestListUpdatedAt: Number(parsed.guestListUpdatedAt || 0),
        rsvpEntries: Array.isArray(parsed.rsvpEntries) ? parsed.rsvpEntries : [],
        deletedRsvpIds: Array.isArray(parsed.deletedRsvpIds)
          ? parsed.deletedRsvpIds
          : [],
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // Ignore
  }
  return {
    guestList: [],
    guestListUpdatedAt: 0,
    rsvpEntries: [],
    deletedRsvpIds: [],
    updatedAt: new Date().toISOString(),
  };
}

function saveLocalCache(db: GraduationJsonDatabase): void {
  try {
    window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(db));
  } catch {
    // Ignore
  }
}

export function exportDatabaseAsJsonFile(db: GraduationJsonDatabase): void {
  const jsonStr = JSON.stringify(db, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'graduation-db.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
