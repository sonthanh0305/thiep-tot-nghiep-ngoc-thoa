import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const DB_FILE_PATH = path.resolve(
  process.cwd(),
  'public/data/graduation-db.json',
);
const CLOUD_KV_URL =
  'https://kvdb.io/R8ERGvr7PBwaDCQ8Dk4km5/ngoc_thoa_graduation_db_2026';

interface StoredRsvpEntry {
  id: string;
  guestName: string;
  invitedCardName?: string;
  submittedByRole?: 'admin' | 'guest';
  pronoun: string;
  relation: string;
  attendance: 'attending' | 'after_ceremony' | 'remote_wish';
  partySize: number;
  message: string;
  createdAt: string;
}

interface StoredDatabase {
  guestList: string[];
  guestListUpdatedAt?: number;
  rsvpEntries: StoredRsvpEntry[];
  deletedRsvpIds?: string[];
  updatedAt: string;
}

function mergeRsvpLists(
  incoming: StoredRsvpEntry[],
  existing: StoredRsvpEntry[],
  deletedSet: Set<string> = new Set(),
): StoredRsvpEntry[] {
  const map = new Map<string, StoredRsvpEntry>();
  for (const item of incoming) {
    if (item && typeof item.id === 'string' && !deletedSet.has(item.id)) {
      map.set(item.id, item);
    }
  }
  for (const item of existing) {
    if (
      item &&
      typeof item.id === 'string' &&
      !deletedSet.has(item.id) &&
      !map.has(item.id)
    ) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

async function readLocalFileDb(): Promise<StoredDatabase> {
  try {
    const raw = await fs.readFile(DB_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoredDatabase>;
    return {
      guestList: Array.isArray(parsed.guestList) ? parsed.guestList : [],
      guestListUpdatedAt: Number(parsed.guestListUpdatedAt || 0),
      rsvpEntries: Array.isArray(parsed.rsvpEntries) ? parsed.rsvpEntries : [],
      deletedRsvpIds: Array.isArray(parsed.deletedRsvpIds)
        ? parsed.deletedRsvpIds
        : [],
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      guestList: [],
      guestListUpdatedAt: 0,
      rsvpEntries: [],
      deletedRsvpIds: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

async function fetchCloudDb(): Promise<Partial<StoredDatabase> | null> {
  try {
    const res = await fetch(CLOUD_KV_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json()) as Partial<StoredDatabase>;
      if (data && typeof data === 'object') {
        return data;
      }
    }
  } catch {
    // Ignore network error
  }
  return null;
}

async function readDbFromFile(): Promise<StoredDatabase> {
  const [localDb, cloudDb] = await Promise.all([
    readLocalFileDb(),
    fetchCloudDb(),
  ]);

  if (!cloudDb) {
    return localDb;
  }

  const deletedIds = Array.from(
    new Set([
      ...(Array.isArray(cloudDb.deletedRsvpIds) ? cloudDb.deletedRsvpIds : []),
      ...(Array.isArray(localDb.deletedRsvpIds) ? localDb.deletedRsvpIds : []),
    ]),
  );
  const deletedSet = new Set(deletedIds);

  const cloudGuestTs = Number(cloudDb.guestListUpdatedAt || 0);
  const localGuestTs = Number(localDb.guestListUpdatedAt || 0);
  const cloudGuests = Array.isArray(cloudDb.guestList) ? cloudDb.guestList : [];
  const localGuests = Array.isArray(localDb.guestList) ? localDb.guestList : [];

  const chosenGuests =
    cloudGuestTs >= localGuestTs && cloudGuests.length > 0
      ? cloudGuests
      : localGuests.length > 0
        ? localGuests
        : cloudGuests;

  const mergedRsvps = mergeRsvpLists(
    Array.isArray(cloudDb.rsvpEntries) ? cloudDb.rsvpEntries : [],
    localDb.rsvpEntries,
    deletedSet,
  );

  return {
    guestList: chosenGuests,
    guestListUpdatedAt: Math.max(cloudGuestTs, localGuestTs),
    rsvpEntries: mergedRsvps,
    deletedRsvpIds: deletedIds,
    updatedAt: cloudDb.updatedAt || localDb.updatedAt || new Date().toISOString(),
  };
}

async function writeDbToFile(db: StoredDatabase): Promise<StoredDatabase> {
  const payload: StoredDatabase = {
    guestList: db.guestList,
    guestListUpdatedAt: db.guestListUpdatedAt ?? Date.now(),
    rsvpEntries: db.rsvpEntries,
    deletedRsvpIds: db.deletedRsvpIds ?? [],
    updatedAt: new Date().toISOString(),
  };
  const jsonStr = JSON.stringify(payload, null, 2);

  await fs.mkdir(path.dirname(DB_FILE_PATH), { recursive: true });
  await Promise.allSettled([
    fs.writeFile(DB_FILE_PATH, jsonStr, 'utf-8'),
    fetch(CLOUD_KV_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: jsonStr,
    }),
  ]);

  return payload;
}

function jsonDatabasePlugin(): Plugin {
  return {
    name: 'graduation-json-db-middleware',
    configureServer(server) {
      server.middlewares.use('/api/db', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

        if (req.method === 'GET') {
          const current = await readDbFromFile();
          res.statusCode = 200;
          res.end(JSON.stringify(current, null, 2));
          return;
        }

        if (req.method === 'POST' || req.method === 'PUT') {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const bodyStr = Buffer.concat(chunks).toString('utf-8');
            const parsed = JSON.parse(bodyStr) as {
              action?:
                | 'submit_rsvp'
                | 'delete_rsvp'
                | 'update_guest_list'
                | 'import_json';
              entry?: StoredRsvpEntry;
              entryId?: string;
              guestList?: unknown;
              rsvpEntries?: unknown;
              deletedRsvpIds?: unknown;
              overwriteRsvp?: boolean;
            };

            const current = await readDbFromFile();
            const deletedSet = new Set<string>(current.deletedRsvpIds || []);

            if (parsed.action === 'submit_rsvp' && parsed.entry) {
              deletedSet.delete(parsed.entry.id);
              const filtered = current.rsvpEntries.filter(
                (e) => e.id !== parsed.entry?.id && !deletedSet.has(e.id),
              );
              const nextEntries = [parsed.entry, ...filtered];
              const saved = await writeDbToFile({
                guestList: current.guestList,
                guestListUpdatedAt: current.guestListUpdatedAt,
                rsvpEntries: nextEntries,
                deletedRsvpIds: Array.from(deletedSet),
                updatedAt: new Date().toISOString(),
              });
              res.statusCode = 200;
              res.end(JSON.stringify(saved));
              return;
            }

            if (parsed.action === 'delete_rsvp' && parsed.entryId) {
              deletedSet.add(parsed.entryId);
              const nextEntries = current.rsvpEntries.filter(
                (e) => e.id !== parsed.entryId && !deletedSet.has(e.id),
              );
              const saved = await writeDbToFile({
                guestList: current.guestList,
                guestListUpdatedAt: current.guestListUpdatedAt,
                rsvpEntries: nextEntries,
                deletedRsvpIds: Array.from(deletedSet),
                updatedAt: new Date().toISOString(),
              });
              res.statusCode = 200;
              res.end(JSON.stringify(saved));
              return;
            }

            if (parsed.action === 'update_guest_list') {
              const nextGuests = Array.isArray(parsed.guestList)
                ? parsed.guestList
                    .map((g) => String(g).trim())
                    .filter((g) => g.length > 0)
                : current.guestList;
              const saved = await writeDbToFile({
                guestList: nextGuests,
                guestListUpdatedAt: Date.now(),
                rsvpEntries: current.rsvpEntries,
                deletedRsvpIds: Array.from(deletedSet),
                updatedAt: new Date().toISOString(),
              });
              res.statusCode = 200;
              res.end(JSON.stringify(saved));
              return;
            }

            const nextGuests = Array.isArray(parsed.guestList)
              ? parsed.guestList
                  .map((g) => String(g).trim())
                  .filter((g) => g.length > 0)
              : current.guestList;

            if (Array.isArray(parsed.deletedRsvpIds)) {
              for (const id of parsed.deletedRsvpIds) {
                deletedSet.add(String(id));
              }
            }

            const incomingRsvps = Array.isArray(parsed.rsvpEntries)
              ? (parsed.rsvpEntries as StoredRsvpEntry[])
              : [];

            const nextRsvps = parsed.overwriteRsvp
              ? incomingRsvps.filter((e) => e && !deletedSet.has(e.id))
              : mergeRsvpLists(incomingRsvps, current.rsvpEntries, deletedSet);

            const saved = await writeDbToFile({
              guestList: nextGuests,
              guestListUpdatedAt: Date.now(),
              rsvpEntries: nextRsvps,
              deletedRsvpIds: Array.from(deletedSet),
              updatedAt: new Date().toISOString(),
            });

            res.statusCode = 200;
            res.end(JSON.stringify(saved));
          } catch (err) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({
                error:
                  err instanceof Error ? err.message : 'Invalid JSON payload',
              }),
            );
          }
          return;
        }

        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      });
    },
  };
}

export default defineConfig({
  plugins: [jsonDatabasePlugin()],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
});
