import fs from 'node:fs/promises';
import path from 'node:path';

const CLOUD_KV_URL =
  'https://kvdb.io/R8ERGvr7PBwaDCQ8Dk4km5/ngoc_thoa_graduation_db_2026';
const TMP_DB_PATH = '/tmp/graduation-db.json';
const PUBLIC_DB_PATH = path.resolve(
  process.cwd(),
  'public/data/graduation-db.json',
);

function mergeRsvpLists(incoming = [], existing = [], deletedSet = new Set()) {
  const map = new Map();
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

async function readSeedOrTmpDb() {
  if (globalThis.__NGOC_THOA_DB__) {
    return globalThis.__NGOC_THOA_DB__;
  }
  try {
    const tmpRaw = await fs.readFile(TMP_DB_PATH, 'utf-8');
    const parsed = JSON.parse(tmpRaw);
    globalThis.__NGOC_THOA_DB__ = parsed;
    return parsed;
  } catch {
    // Fallback to public seed file
  }
  try {
    const seedRaw = await fs.readFile(PUBLIC_DB_PATH, 'utf-8');
    const parsed = JSON.parse(seedRaw);
    globalThis.__NGOC_THOA_DB__ = parsed;
    return parsed;
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

async function fetchCloudDb() {
  try {
    const res = await fetch(CLOUD_KV_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        return data;
      }
    }
  } catch {
    // Ignore cloud fetch error
  }
  return null;
}

async function readCombinedDb() {
  const [localDb, cloudDb] = await Promise.all([
    readSeedOrTmpDb(),
    fetchCloudDb(),
  ]);

  if (!cloudDb) {
    return {
      guestList: Array.isArray(localDb.guestList) ? localDb.guestList : [],
      guestListUpdatedAt: Number(localDb.guestListUpdatedAt || 0),
      rsvpEntries: Array.isArray(localDb.rsvpEntries) ? localDb.rsvpEntries : [],
      deletedRsvpIds: Array.isArray(localDb.deletedRsvpIds)
        ? localDb.deletedRsvpIds
        : [],
      updatedAt: localDb.updatedAt || new Date().toISOString(),
    };
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
    Array.isArray(localDb.rsvpEntries) ? localDb.rsvpEntries : [],
    deletedSet,
  );

  const combined = {
    guestList: chosenGuests,
    guestListUpdatedAt: Math.max(cloudGuestTs, localGuestTs),
    rsvpEntries: mergedRsvps,
    deletedRsvpIds: deletedIds,
    updatedAt: cloudDb.updatedAt || localDb.updatedAt || new Date().toISOString(),
  };

  globalThis.__NGOC_THOA_DB__ = combined;
  return combined;
}

async function writeCombinedDb(nextDb) {
  const payload = {
    guestList: Array.isArray(nextDb.guestList) ? nextDb.guestList : [],
    guestListUpdatedAt: Number(nextDb.guestListUpdatedAt || Date.now()),
    rsvpEntries: Array.isArray(nextDb.rsvpEntries) ? nextDb.rsvpEntries : [],
    deletedRsvpIds: Array.isArray(nextDb.deletedRsvpIds)
      ? nextDb.deletedRsvpIds
      : [],
    updatedAt: new Date().toISOString(),
  };

  globalThis.__NGOC_THOA_DB__ = payload;

  const jsonStr = JSON.stringify(payload, null, 2);

  await Promise.allSettled([
    fs.writeFile(TMP_DB_PATH, jsonStr, 'utf-8'),
    fetch(CLOUD_KV_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: jsonStr,
    }),
  ]);

  return payload;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    const db = await readCombinedDb();
    res.status(200).send(JSON.stringify(db));
    return;
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const parsed =
        typeof req.body === 'string'
          ? JSON.parse(req.body)
          : req.body || {};

      const current = await readCombinedDb();
      const deletedSet = new Set(current.deletedRsvpIds || []);

      if (parsed.action === 'submit_rsvp' && parsed.entry) {
        deletedSet.delete(parsed.entry.id);
        const filtered = current.rsvpEntries.filter(
          (e) => e.id !== parsed.entry.id && !deletedSet.has(e.id),
        );
        const saved = await writeCombinedDb({
          guestList: current.guestList,
          guestListUpdatedAt: current.guestListUpdatedAt,
          rsvpEntries: [parsed.entry, ...filtered],
          deletedRsvpIds: Array.from(deletedSet),
        });
        res.status(200).send(JSON.stringify(saved));
        return;
      }

      if (parsed.action === 'delete_rsvp' && parsed.entryId) {
        deletedSet.add(parsed.entryId);
        const nextEntries = current.rsvpEntries.filter(
          (e) => e.id !== parsed.entryId && !deletedSet.has(e.id),
        );
        const saved = await writeCombinedDb({
          guestList: current.guestList,
          guestListUpdatedAt: current.guestListUpdatedAt,
          rsvpEntries: nextEntries,
          deletedRsvpIds: Array.from(deletedSet),
        });
        res.status(200).send(JSON.stringify(saved));
        return;
      }

      if (parsed.action === 'update_guest_list') {
        const nextGuests = Array.isArray(parsed.guestList)
          ? parsed.guestList.map((g) => String(g).trim()).filter(Boolean)
          : current.guestList;
        const saved = await writeCombinedDb({
          guestList: nextGuests,
          guestListUpdatedAt: Date.now(),
          rsvpEntries: current.rsvpEntries,
          deletedRsvpIds: Array.from(deletedSet),
        });
        res.status(200).send(JSON.stringify(saved));
        return;
      }

      const nextGuests = Array.isArray(parsed.guestList)
        ? parsed.guestList.map((g) => String(g).trim()).filter(Boolean)
        : current.guestList;

      if (Array.isArray(parsed.deletedRsvpIds)) {
        for (const id of parsed.deletedRsvpIds) {
          deletedSet.add(String(id));
        }
      }

      const incomingRsvps = Array.isArray(parsed.rsvpEntries)
        ? parsed.rsvpEntries
        : [];
      const nextRsvps = parsed.overwriteRsvp
        ? incomingRsvps.filter((e) => e && !deletedSet.has(e.id))
        : mergeRsvpLists(incomingRsvps, current.rsvpEntries, deletedSet);

      const saved = await writeCombinedDb({
        guestList: nextGuests,
        guestListUpdatedAt: Date.now(),
        rsvpEntries: nextRsvps,
        deletedRsvpIds: Array.from(deletedSet),
      });

      res.status(200).send(JSON.stringify(saved));
    } catch (err) {
      res.status(400).send(
        JSON.stringify({
          error: err instanceof Error ? err.message : 'Invalid payload',
        }),
      );
    }
    return;
  }

  res.status(405).send(JSON.stringify({ error: 'Method Not Allowed' }));
}
