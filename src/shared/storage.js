import { STORE_KEY, HISTORY_CAP } from './constants.js';

export async function getState() {
  const { tracker } = await chrome.storage.local.get(STORE_KEY);
  if (!tracker || typeof tracker !== 'object') {
    return { manga: {}, settings: { autoTrack: true, siteFilter: 'all' } };
  }
  if (!tracker.manga || typeof tracker.manga !== 'object') tracker.manga = {};
  if (!tracker.settings || typeof tracker.settings !== 'object') {
    tracker.settings = { autoTrack: true, siteFilter: 'all' };
  }
  if (typeof tracker.settings.autoTrack === 'undefined') tracker.settings.autoTrack = true;
  if (typeof tracker.settings.siteFilter === 'undefined') tracker.settings.siteFilter = 'all';
  migrate(tracker);
  return tracker;
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
  const existing = tracker.manga[key] || {
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
    maxChapter: 0,
    firstReadAt: info.detectedAt,
    createdAt: Date.now(),
  };

  if (info.title) existing.title = info.title;
  if (info.malId) { existing.malId = info.malId; existing.malUrl = info.malUrl; }
  if (info.poster) existing.poster = info.poster;
  if (info.mangaUrl) existing.mangaUrl = info.mangaUrl;

  existing.readChapters = existing.readChapters || {};
  existing.readChapters[info.chapterId] = info.chapterNumber;

  existing.history = Array.isArray(existing.history) ? existing.history : [];
  existing.history = existing.history.filter((h) => h.chapterId !== info.chapterId);
  existing.history.unshift({ chapterId: info.chapterId, number: info.chapterNumber, readAt: info.detectedAt });
  if (existing.history.length > HISTORY_CAP) existing.history = existing.history.slice(0, HISTORY_CAP);

  if (info.chapterNumber > (existing.maxChapter || 0)) existing.maxChapter = info.chapterNumber;
  existing.lastChapter = info.chapterNumber;
  existing.lastChapterId = info.chapterId;
  existing.lastReadAt = info.detectedAt;
  existing.updatedAt = Date.now();

  tracker.manga[key] = existing;
  await setState(tracker);
  return existing;
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
  if (!incoming.settings) incoming.settings = { autoTrack: true, siteFilter: 'all' };
  await setState(incoming);
}
