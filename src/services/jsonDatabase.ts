import type { RsvpEntry } from '../types';

export interface GraduationJsonDatabase {
  guestList: string[];
  rsvpEntries: RsvpEntry[];
  updatedAt: string;
}

const LOCAL_CACHE_KEY = 'ngoc_thoa_graduation_json_db_v4';
const DELETED_RSVP_IDS_KEY = 'ngoc_thoa_graduation_deleted_rsvp_ids_v4';
const BROADCAST_CHANNEL_NAME = 'ngoc_thoa_graduation_db_sync';

let syncChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    syncChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  }
} catch {
  syncChannel = null;
}

function getDeletedRsvpIds(): Set<string> {
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

function addDeletedRsvpId(id: string): void {
  try {
    const set = getDeletedRsvpIds();
    set.add(id);
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
  deletedIds: Set<string> = getDeletedRsvpIds(),
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

export async function loadGraduationDatabase(): Promise<GraduationJsonDatabase> {
  const localCache = loadLocalCache();
  const deletedIds = getDeletedRsvpIds();

  // 1. Try live JSON API endpoint (/api/db -> public/data/graduation-db.json)
  try {
    const res = await fetch('/api/db', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const serverData = (await res.json()) as Partial<GraduationJsonDatabase>;
      const serverGuests = Array.isArray(serverData.guestList)
        ? serverData.guestList
        : [];
      const serverRsvps = Array.isArray(serverData.rsvpEntries)
        ? serverData.rsvpEntries
        : [];

      const mergedRsvps = mergeUniqueRsvpEntries(
        serverRsvps,
        localCache.rsvpEntries,
        deletedIds,
      );

      const normalized: GraduationJsonDatabase = {
        guestList:
          serverGuests.length > 0 ? serverGuests : localCache.guestList,
        rsvpEntries: mergedRsvps,
        updatedAt: serverData.updatedAt || new Date().toISOString(),
      };

      // If localCache had newer RSVP entries not yet on server, push them up
      if (mergedRsvps.length > serverRsvps.length) {
        void fetch('/api/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized),
        }).catch(() => {});
      }

      saveLocalCache(normalized);
      return normalized;
    }
  } catch {
    // Fallback to static JSON + localStorage
  }

  // 2. Fallback for static hosting (e.g., Vercel static /data/graduation-db.json + localStorage)
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

      const merged: GraduationJsonDatabase = {
        guestList:
          localCache.guestList.length > 0 ? localCache.guestList : staticGuests,
        rsvpEntries: mergeUniqueRsvpEntries(
          localCache.rsvpEntries,
          staticRsvps,
          deletedIds,
        ),
        updatedAt: localCache.updatedAt || data.updatedAt || new Date().toISOString(),
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
 * Atomically prepends the entry to the central JSON database without touching guestList.
 */
export async function submitGuestRsvpEntry(
  entry: RsvpEntry,
): Promise<GraduationJsonDatabase> {
  const current = await loadGraduationDatabase();
  const filtered = current.rsvpEntries.filter((e) => e.id !== entry.id);
  const optimistic: GraduationJsonDatabase = {
    guestList: current.guestList,
    rsvpEntries: [entry, ...filtered],
    updatedAt: new Date().toISOString(),
  };

  saveLocalCache(optimistic);
  notifyAllTabs(optimistic);

  try {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit_rsvp',
        entry,
      }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const saved = (await res.json()) as GraduationJsonDatabase;
      saveLocalCache(saved);
      notifyAllTabs(saved);
      return saved;
    }
  } catch {
    // Static fallback already saved in localCache and broadcasted
  }

  return optimistic;
}

/**
 * Dedicated Admin function to delete a specific RSVP entry by ID.
 */
export async function deleteRsvpEntryFromDatabase(
  entryId: string,
): Promise<GraduationJsonDatabase> {
  addDeletedRsvpId(entryId);
  const current = await loadGraduationDatabase();
  const optimistic: GraduationJsonDatabase = {
    guestList: current.guestList,
    rsvpEntries: current.rsvpEntries.filter((e) => e.id !== entryId),
    updatedAt: new Date().toISOString(),
  };

  saveLocalCache(optimistic);
  notifyAllTabs(optimistic);

  try {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_rsvp',
        entryId,
      }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const saved = (await res.json()) as GraduationJsonDatabase;
      saveLocalCache(saved);
      notifyAllTabs(saved);
      return saved;
    }
  } catch {
    // Fallback handled
  }

  return optimistic;
}

/**
 * Dedicated Admin function to update the Guest List while preserving all RSVP entries.
 */
export async function saveAdminGuestList(
  guestList: string[],
): Promise<GraduationJsonDatabase> {
  const current = await loadGraduationDatabase();
  const optimistic: GraduationJsonDatabase = {
    guestList,
    rsvpEntries: current.rsvpEntries,
    updatedAt: new Date().toISOString(),
  };

  saveLocalCache(optimistic);
  notifyAllTabs(optimistic);

  try {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_guest_list',
        guestList,
      }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const saved = (await res.json()) as GraduationJsonDatabase;
      const merged: GraduationJsonDatabase = {
        guestList: saved.guestList,
        rsvpEntries: mergeUniqueRsvpEntries(
          saved.rsvpEntries,
          current.rsvpEntries,
        ),
        updatedAt: saved.updatedAt,
      };
      saveLocalCache(merged);
      notifyAllTabs(merged);
      return merged;
    }
  } catch {
    // Fallback handled
  }

  return optimistic;
}

/**
 * Full database save (used when importing a full JSON backup file).
 */
export async function saveGraduationDatabase(
  db: GraduationJsonDatabase,
  overwriteRsvp: boolean = false,
): Promise<GraduationJsonDatabase> {
  const current = loadLocalCache();
  const payload: GraduationJsonDatabase = {
    guestList: db.guestList,
    rsvpEntries: overwriteRsvp
      ? db.rsvpEntries
      : mergeUniqueRsvpEntries(db.rsvpEntries, current.rsvpEntries),
    updatedAt: new Date().toISOString(),
  };

  saveLocalCache(payload);
  notifyAllTabs(payload);

  try {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        overwriteRsvp,
      }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const saved = (await res.json()) as GraduationJsonDatabase;
      saveLocalCache(saved);
      notifyAllTabs(saved);
      return saved;
    }
  } catch {
    // Offline or static fallback uses localCache
  }

  return payload;
}

/**
 * Subscribes to real-time database updates across browser tabs (BroadcastChannel + storage)
 * and server polling so the Admin dashboard immediately receives new Guest RSVP entries.
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
  }, 3500);

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
        rsvpEntries: Array.isArray(parsed.rsvpEntries) ? parsed.rsvpEntries : [],
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // Ignore
  }
  return {
    guestList: [],
    rsvpEntries: [],
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
