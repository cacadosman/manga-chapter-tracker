import { STORE_KEY, HISTORY_CAP } from './constants.js';

export async function getState() {
  const { tracker } = await chrome.storage.local.get(STORE_KEY);
  if (!tracker || typeof tracker !== 'object') {
    return { manga: {}, settings: { autoTrack: true } };
  }
  if (!tracker.manga || typeof tracker.manga !== 'object') tracker.manga = {};
  if (!tracker.settings || typeof tracker.settings !== 'object') {
    tracker.settings = { autoTrack: true };
  }
  if (typeof tracker.settings.autoTrack === 'undefined') tracker.settings.autoTrack = true;
  if (typeof tracker.settings.siteFilter === 'undefined') tracker.settings.siteFilter = 'all';
  migrate(tracker);
  await startupMerge(tracker);
  return tracker;
}

// Merge any existing duplicate entries by MAL ID on startup.
async function startupMerge(tracker) {
  const seenMalIds = new Set();
  for (const entry of Object.values(tracker.manga)) {
    if (entry.malId && !seenMalIds.has(entry.malId)) {
      seenMalIds.add(entry.malId);
    }
  }
  for (const malId of seenMalIds) {
    await mergeByMalId(tracker, malId);
  }
}

// One-time migration: re-key entries from bare sourceId to composite source:sourceId.
function migrate(tracker) {
  const manga = tracker.manga;
  for (const key of Object.keys(manga)) {
    const entry = manga[key];
    if (!entry) continue;
    const source = entry.source || 'comix.to';
    const sourceId = entry.sourceId || entry.hid || key;
    if (!entry.sourceId) entry.sourceId = sourceId;
    if (!entry.source) entry.source = source;
    const newKey = source + ':' + sourceId;
    entry.key = newKey;
    if (newKey !== key) {
      manga[newKey] = entry;
      delete manga[key];
    }
  }
}

export async function setState(tracker) {
  await chrome.storage.local.set({ [STORE_KEY]: tracker });
}

export function mangaKey(source, sourceId) {
  return (source || 'comix.to') + ':' + sourceId;
}

export async function saveChapter(info) {
  const tracker = await getState();
  const key = mangaKey(info.source, info.sourceId);
  const existing = tracker.manga[key];
  const isNew = !existing;
  const entry = existing || {
    key,
    source: info.source || 'comix.to',
    sourceId: info.sourceId,
    title: info.title,
    malId: info.malId || null,
    malUrl: info.malUrl || null,
    poster: info.poster || null,
    mangaUrl: info.mangaUrl || null,
    readChapters: {},
    history: [],
    malLookedUp: false,
    maxChapter: 0,
    firstReadAt: info.detectedAt,
    createdAt: Date.now(),
  };

  if (typeof entry.malLookedUp === 'undefined') entry.malLookedUp = false;

  if (info.title) entry.title = info.title;
  if (info.malId) { entry.malId = info.malId; entry.malUrl = info.malUrl; }
  if (info.poster) entry.poster = info.poster;
  if (info.mangaUrl) entry.mangaUrl = info.mangaUrl;

  entry.readChapters = entry.readChapters || {};
  entry.readChapters[info.chapterId] = info.chapterNumber;

  entry.history = Array.isArray(entry.history) ? entry.history : [];
  entry.history = entry.history.filter((h) => h.chapterId !== info.chapterId);
  entry.history.unshift({ chapterId: info.chapterId, number: info.chapterNumber, readAt: info.detectedAt });
  if (entry.history.length > HISTORY_CAP) entry.history = entry.history.slice(0, HISTORY_CAP);

  if (info.chapterNumber > (entry.maxChapter || 0)) entry.maxChapter = info.chapterNumber;
  entry.lastChapter = info.chapterNumber;
  entry.lastChapterId = info.chapterId;
  entry.lastReadAt = info.detectedAt;
  entry.updatedAt = Date.now();

  tracker.manga[key] = entry;
  await setState(tracker);

  // If this entry has a MAL ID, merge any duplicates.
  if (entry.malId) await mergeByMalId(tracker, entry.malId);

  return { isNew, entry };
}

export async function setChapter(key, chapterNumber) {
  const tracker = await getState();
  const existing = tracker.manga[key];
  if (!existing) return null;

  existing.readChapters = existing.readChapters || {};
  existing.history = Array.isArray(existing.history) ? existing.history : [];

  const newVal = Number(chapterNumber) || 0;
  for (const cid of Object.keys(existing.readChapters)) {
    if (Number(existing.readChapters[cid]) > newVal) delete existing.readChapters[cid];
  }
  existing.history = existing.history.filter((h) => Number(h.number) <= newVal);

  existing.maxChapter = newVal;
  existing.lastChapter = newVal;
  existing.updatedAt = Date.now();

  tracker.manga[key] = existing;
  await setState(tracker);
  return existing;
}

export async function deleteManga(key) {
  const tracker = await getState();
  delete tracker.manga[key];
  await setState(tracker);
}

export async function clearAll() {
  const tracker = await getState();
  tracker.manga = {};
  await setState(tracker);
}

export async function setSetting(k, v) {
  const tracker = await getState();
  tracker.settings[k] = v;
  await setState(tracker);
}

export async function replaceState(incoming) {
  if (!incoming.manga) incoming.manga = {};
  if (!incoming.settings) incoming.settings = { autoTrack: true };
  await setState(incoming);
}

export async function setMalId(key, malId, malUrl, poster) {
  const tracker = await getState();
  const existing = tracker.manga[key];
  if (!existing) return null;
  existing.malId = malId || null;
  existing.malUrl = malUrl || null;
  if (poster && !existing.poster) existing.poster = poster;
  existing.malLookedUp = true;
  existing.updatedAt = Date.now();
  tracker.manga[key] = existing;
  await setState(tracker);
  if (malId) await mergeByMalId(tracker, malId);
  return existing;
}

export async function markLookedUp(key) {
  const tracker = await getState();
  if (tracker.manga[key]) {
    tracker.manga[key].malLookedUp = true;
    await setState(tracker);
  }
}

// Merge all entries that share the same non-null malId.
// Oldest entry (by createdAt) becomes the survivor. ReadChapters and
// history are combined, metadata picks the best available values.
async function mergeByMalId(tracker, malId) {
  if (!malId) return;
  const entries = Object.entries(tracker.manga).filter(([, e]) => e.malId === malId);
  if (entries.length < 2) return;

  entries.sort(([, a], [, b]) => (a.createdAt || 0) - (b.createdAt || 0));
  const [primaryKey, primary] = entries[0];
  const sources = new Set([primary.source].filter(Boolean));

  for (let i = 1; i < entries.length; i++) {
    const [otherKey, other] = entries[i];
    Object.assign(primary.readChapters, other.readChapters || {});

    const mergedHistory = [...(primary.history || []), ...(other.history || [])];
    const seen = new Set();
    primary.history = mergedHistory
      .sort((a, b) => b.readAt - a.readAt)
      .filter((h) => { const k = h.chapterId; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 10);

    primary.maxChapter = Math.max(primary.maxChapter || 0, other.maxChapter || 0);
    primary.firstReadAt = Math.min(primary.firstReadAt || Infinity, other.firstReadAt || Infinity);
    primary.lastReadAt = Math.max(primary.lastReadAt || 0, other.lastReadAt || 0);
    primary.title = (primary.title && primary.title.length >= 3) ? primary.title : (other.title || primary.title);
    primary.poster = primary.poster || other.poster || null;
    primary.malUrl = primary.malUrl || other.malUrl || null;
    if (other.source) sources.add(other.source);
    delete tracker.manga[otherKey];
  }
  primary.sources = [...sources];
  primary.updatedAt = Date.now();
}
