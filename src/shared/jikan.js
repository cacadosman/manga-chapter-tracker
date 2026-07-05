// Jikan API client for looking up MyAnimeList IDs by manga title.
// Jikan is a free, no-auth REST API: https://jikan.moe
// Rate limit: 3 req/sec, 60 req/min.

const JIKAN_BASE = 'https://api.jikan.moe/v4';

export async function lookupByTitle(title, fetchFn) {
  const fetchRef = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchRef || !title) return null;

  const url = `${JIKAN_BASE}/manga?q=${encodeURIComponent(title)}&limit=1&sfw=true`;

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

  if (!json.data || !json.data.length) return null;
  const m = json.data[0];

  return {
    malId: m.mal_id,
    malUrl: m.url || ('https://myanimelist.net/manga/' + m.mal_id),
    poster: (m.images && m.images.jpg && m.images.jpg.image_url) || null,
    title: m.title_english || m.title || null,
  };
}
