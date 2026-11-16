import type { RsvpEntry } from '../types';

export interface GraduationJsonDatabase {
  guestList: string[];
  rsvpEntries: RsvpEntry[];
  updatedAt: string;
}

const LOCAL_CACHE_KEY = 'ngoc_thoa_graduation_json_db_v3';

export async function loadGraduationDatabase(): Promise<GraduationJsonDatabase> {
  try {
    const res = await fetch('/api/db', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = (await res.json()) as Partial<GraduationJsonDatabase>;
      const normalized: GraduationJsonDatabase = {
        guestList: Array.isArray(data.guestList) ? data.guestList : [],
        rsvpEntries: Array.isArray(data.rsvpEntries) ? data.rsvpEntries : [],
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
      saveLocalCache(normalized);
      return normalized;
    }
  } catch {
    // Fallback to static JSON file or localStorage
  }

  try {
    const staticRes = await fetch('/data/graduation-db.json', {
      cache: 'no-store',
    });
    if (staticRes.ok) {
      const data = (await staticRes.json()) as Partial<GraduationJsonDatabase>;
      const cached = loadLocalCache();
      return {
        guestList:
          cached.guestList.length > 0
            ? cached.guestList
            : Array.isArray(data.guestList)
              ? data.guestList
              : [],
        rsvpEntries:
          cached.rsvpEntries.length > 0
            ? cached.rsvpEntries
            : Array.isArray(data.rsvpEntries)
              ? data.rsvpEntries
              : [],
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // Ignore
  }

  return loadLocalCache();
}

export async function saveGraduationDatabase(
  db: GraduationJsonDatabase,
): Promise<GraduationJsonDatabase> {
  const payload: GraduationJsonDatabase = {
    guestList: db.guestList,
    rsvpEntries: db.rsvpEntries,
    updatedAt: new Date().toISOString(),
  };

  saveLocalCache(payload);

  try {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return (await res.json()) as GraduationJsonDatabase;
    }
  } catch {
    // Offline or static environment fallback uses localCache
  }

  return payload;
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
