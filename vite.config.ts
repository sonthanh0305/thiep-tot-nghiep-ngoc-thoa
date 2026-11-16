import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const DB_FILE_PATH = path.resolve(process.cwd(), 'public/data/graduation-db.json');

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
  rsvpEntries: StoredRsvpEntry[];
  updatedAt: string;
}

async function readDbFromFile(): Promise<StoredDatabase> {
  try {
    const raw = await fs.readFile(DB_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoredDatabase>;
    return {
      guestList: Array.isArray(parsed.guestList) ? parsed.guestList : [],
      rsvpEntries: Array.isArray(parsed.rsvpEntries) ? parsed.rsvpEntries : [],
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      guestList: [],
      rsvpEntries: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

async function writeDbToFile(db: StoredDatabase): Promise<StoredDatabase> {
  const payload: StoredDatabase = {
    guestList: db.guestList,
    rsvpEntries: db.rsvpEntries,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(DB_FILE_PATH), { recursive: true });
  await fs.writeFile(DB_FILE_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
}

function mergeRsvpLists(
  incoming: StoredRsvpEntry[],
  existing: StoredRsvpEntry[],
): StoredRsvpEntry[] {
  const map = new Map<string, StoredRsvpEntry>();
  for (const item of incoming) {
    if (item && typeof item.id === 'string') {
      map.set(item.id, item);
    }
  }
  for (const item of existing) {
    if (item && typeof item.id === 'string' && !map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
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
              overwriteRsvp?: boolean;
            };

            const current = await readDbFromFile();

            if (parsed.action === 'submit_rsvp' && parsed.entry) {
              const filtered = current.rsvpEntries.filter(
                (e) => e.id !== parsed.entry?.id,
              );
              const nextEntries = [parsed.entry, ...filtered];
              const saved = await writeDbToFile({
                guestList: current.guestList,
                rsvpEntries: nextEntries,
                updatedAt: new Date().toISOString(),
              });
              res.statusCode = 200;
              res.end(JSON.stringify(saved));
              return;
            }

            if (parsed.action === 'delete_rsvp' && parsed.entryId) {
              const nextEntries = current.rsvpEntries.filter(
                (e) => e.id !== parsed.entryId,
              );
              const saved = await writeDbToFile({
                guestList: current.guestList,
                rsvpEntries: nextEntries,
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
                rsvpEntries: current.rsvpEntries,
                updatedAt: new Date().toISOString(),
              });
              res.statusCode = 200;
              res.end(JSON.stringify(saved));
              return;
            }

            // Full sync / import_json fallback (merges RSVP entries unless overwriteRsvp is true)
            const nextGuests = Array.isArray(parsed.guestList)
              ? parsed.guestList
                  .map((g) => String(g).trim())
                  .filter((g) => g.length > 0)
              : current.guestList;

            const incomingRsvps = Array.isArray(parsed.rsvpEntries)
              ? (parsed.rsvpEntries as StoredRsvpEntry[])
              : [];

            const nextRsvps = parsed.overwriteRsvp
              ? incomingRsvps
              : mergeRsvpLists(incomingRsvps, current.rsvpEntries);

            const saved = await writeDbToFile({
              guestList: nextGuests,
              rsvpEntries: nextRsvps,
              updatedAt: new Date().toISOString(),
            });

            res.statusCode = 200;
            res.end(JSON.stringify(saved));
          } catch (err) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : 'Invalid JSON payload',
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
