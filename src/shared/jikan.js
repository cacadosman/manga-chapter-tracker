// Jikan API client for looking up MyAnimeList IDs by manga title.
// Jikan is a free, no-auth REST API: https://jikan.moe
// Rate limit: 3 req/sec, 60 req/min.

const JIKAN_BASE = 'https://api.jikan.moe/v4';

async function fetchManga(url, fetchRef) {
  let resp;
  try {
    resp = await fetchRef(url);
  } catch (e) {
    return null;
  }

  if (resp.status === 429) return { retry: true };
  if (!resp.ok) return null;

  let json;
  try {
    json = await resp.json();
  } catch (e) {
    return null;
  }

  if (!json.data || Array.isArray(json.data) && !json.data.length) return null;
  return Array.isArray(json.data) ? json.data[0] : json.data;
}

function toLookupResult(m, fallbackMalId = null) {
  if (!m) return null;
  const image = m.images && m.images.jpg;
  return {
    malId: m.mal_id || fallbackMalId,
    malUrl: m.url || (fallbackMalId ? 'https://myanimelist.net/manga/' + fallbackMalId : null),
    poster: (image && (image.large_image_url || image.image_url)) || null,
    title: m.title_english || m.title || null,
  };
}

export async function lookupByTitle(title, fetchFn) {
  const fetchRef = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchRef || !title) return null;

  const url = `${JIKAN_BASE}/manga?q=${encodeURIComponent(title)}&limit=1&sfw=true`;
  const manga = await fetchManga(url, fetchRef);
  if (manga && manga.retry) return manga;
  return toLookupResult(manga);
}

export async function lookupByMalId(malId, fetchFn) {
  const fetchRef = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchRef || !malId) return null;

  const url = `${JIKAN_BASE}/manga/${encodeURIComponent(malId)}`;
  const manga = await fetchManga(url, fetchRef);
  if (manga && manga.retry) return manga;
  return toLookupResult(manga, malId);
}
