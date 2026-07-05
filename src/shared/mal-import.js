import { getState, setState } from './storage.js';

// Parse a MyAnimeList manga list XML export and return an array of entries.
// Uses DOMParser — available in popup and service worker (Chrome 69+).
export function parseMalXml(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  const error = doc.querySelector('parsererror');
  if (error) throw new Error('Invalid XML: ' + error.textContent.slice(0, 100));

  const entries = [];
  for (const el of doc.querySelectorAll('myanimelist > manga, manga')) {
    const malId = parseInt(el.querySelector('manga_mangadb_id')?.textContent, 10);
    const title = el.querySelector('manga_title')?.textContent?.trim() || null;
    const readChapters = parseInt(el.querySelector('my_read_chapters')?.textContent, 10) || 0;
    const startDate = el.querySelector('my_start_date')?.textContent?.trim() || null;
    const status = el.querySelector('my_status')?.textContent?.trim() || null;

    if (!malId || !title) continue;
    entries.push({
      malId,
      title,
      readChapters,
      startDate: startDate && startDate !== '0000-00-00' ? startDate : null,
      status,
    });
  }
  return entries;
}

// Import MAL entries into the tracker, merging with existing data.
// Returns counts of added and updated entries.
export async function importFromMal(entries) {
  const tracker = await getState();
  let added = 0;
  let updated = 0;

  for (const e of entries) {
    if (!e.malId || !e.title || e.readChapters <= 0) continue;

    // Find existing entry by malId.
    const existing = Object.values(tracker.manga).find((m) => m.malId === e.malId);

    if (existing) {
      // Merge: keep higher chapter count. Never lose tracker progress.
      if (e.readChapters > (existing.maxChapter || 0)) {
        existing.maxChapter = e.readChapters;
        existing.lastChapter = e.readChapters;
      }
      if (e.title && (!existing.title || existing.title.length < 3)) {
        existing.title = e.title;
      }
      existing.malUrl = existing.malUrl || ('https://myanimelist.net/manga/' + e.malId + '/');
      existing.malLookedUp = true;
      existing.updatedAt = Date.now();
      updated++;
    } else {
      const key = 'mal:' + e.malId;
      const firstReadAt = e.startDate ? new Date(e.startDate + 'T00:00:00Z').getTime() : Date.now();
      tracker.manga[key] = {
        key,
        source: 'myanimelist',
        sourceId: String(e.malId),
        sources: [],
        title: e.title,
        malId: e.malId,
        malUrl: 'https://myanimelist.net/manga/' + e.malId + '/',
        maxChapter: e.readChapters,
        lastChapter: e.readChapters,
        readChapters: {},
        history: [],
        firstReadAt,
        createdAt: Date.now(),
        malLookedUp: true,
      };
      added++;
    }
  }

  await setState(tracker);
  return { added, updated, total: entries.length };
}
