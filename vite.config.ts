import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const DB_FILE_PATH = path.resolve(process.cwd(), 'public/data/graduation-db.json');

function jsonDatabasePlugin(): Plugin {
  return {
    name: 'graduation-json-db-middleware',
    configureServer(server) {
      server.middlewares.use('/api/db', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        if (req.method === 'GET') {
          try {
            const raw = await fs.readFile(DB_FILE_PATH, 'utf-8');
            res.statusCode = 200;
            res.end(raw);
          } catch {
            const fallback = JSON.stringify(
              {
                guestList: [],
                rsvpEntries: [],
                updatedAt: new Date().toISOString(),
              },
              null,
              2,
            );
            res.statusCode = 200;
            res.end(fallback);
          }
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
              guestList?: unknown;
              rsvpEntries?: unknown;
            };

            const safePayload = {
              guestList: Array.isArray(parsed.guestList)
                ? parsed.guestList
                    .map((g) => String(g).trim())
                    .filter((g) => g.length > 0)
                : [],
              rsvpEntries: Array.isArray(parsed.rsvpEntries)
                ? parsed.rsvpEntries
                : [],
              updatedAt: new Date().toISOString(),
            };

            await fs.mkdir(path.dirname(DB_FILE_PATH), { recursive: true });
            await fs.writeFile(
              DB_FILE_PATH,
              JSON.stringify(safePayload, null, 2),
              'utf-8',
            );

            res.statusCode = 200;
            res.end(JSON.stringify(safePayload));
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
