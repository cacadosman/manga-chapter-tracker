import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

const jikanSrc = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'shared', 'jikan.js'), 'utf8');

function loadJikan(fetchFn) {
  const code = jikanSrc.replace(/export /g, '');
  const fn = new Function('fetch', code + '\nreturn { lookupByTitle };');
  return fn(fetchFn);
}

describe('jikan lookupByTitle', () => {
  let mockResponses, mockFetch, jikan;

  beforeEach(() => {
    mockResponses = {};

    mockFetch = async (url) => {
      const key = url;
      if (mockResponses[key]) {
        const entry = mockResponses[key];
        if (entry.error) throw new Error(entry.error);
        return {
          ok: entry.ok !== false,
          status: entry.status || 200,
          json: async () => entry.json,
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };

    jikan = loadJikan(mockFetch);
  });

  it('constructs correct URL with encoded title', async () => {
    let capturedUrl;
    mockResponses['*'] = { json: { data: [] } };
    mockFetch = async (url) => { capturedUrl = url; return { ok: true, status: 200, json: async () => ({ data: [] }) }; };
    jikan = loadJikan(mockFetch);
    await jikan.lookupByTitle('One Piece');
    assert.ok(capturedUrl.includes('q=One%20Piece'));
    assert.ok(capturedUrl.includes('limit=1'));
    assert.ok(capturedUrl.includes('sfw=true'));
    assert.ok(capturedUrl.startsWith('https://api.jikan.moe/v4/manga'));
  });

  it('returns malId, malUrl, poster on success', async () => {
    mockResponses['https://api.jikan.moe/v4/manga?q=One%20Piece&limit=1&sfw=true'] = {
      json: {
        data: [{
          mal_id: 13,
          url: 'https://myanimelist.net/manga/13/',
          title_english: 'One Piece',
          images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/manga/3/168738.jpg' } },
        }],
      },
    };
    const result = await jikan.lookupByTitle('One Piece');
    assert.ok(result);
    assert.strictEqual(result.malId, 13);
    assert.strictEqual(result.malUrl, 'https://myanimelist.net/manga/13/');
    assert.ok(result.poster.includes('cdn.myanimelist.net'));
    assert.strictEqual(result.title, 'One Piece');
  });

  it('returns null for empty results', async () => {
    mockResponses['https://api.jikan.moe/v4/manga?q=Nonexistent&limit=1&sfw=true'] = {
      json: { data: [] },
    };
    const result = await jikan.lookupByTitle('Nonexistent');
    assert.strictEqual(result, null);
  });

  it('returns retry on 429 rate limit', async () => {
    mockResponses['https://api.jikan.moe/v4/manga?q=Test&limit=1&sfw=true'] = {
      status: 429,
      json: {},
    };
    const result = await jikan.lookupByTitle('Test');
    assert.ok(result);
    assert.strictEqual(result.retry, true);
  });

  it('returns null on server 500 error', async () => {
    mockResponses['https://api.jikan.moe/v4/manga?q=Test&limit=1&sfw=true'] = {
      ok: false,
      status: 500,
      json: {},
    };
    const result = await jikan.lookupByTitle('Test');
    assert.strictEqual(result, null);
  });

  it('returns null on network error', async () => {
    mockResponses['https://api.jikan.moe/v4/manga?q=Test&limit=1&sfw=true'] = {
      error: 'ENOTFOUND',
    };
    const result = await jikan.lookupByTitle('Test');
    assert.strictEqual(result, null);
  });

  it('returns null for null/empty title', async () => {
    assert.strictEqual(await jikan.lookupByTitle(null), null);
    assert.strictEqual(await jikan.lookupByTitle(''), null);
  });

  it('handles missing images field', async () => {
    mockResponses['https://api.jikan.moe/v4/manga?q=Test&limit=1&sfw=true'] = {
      json: {
        data: [{ mal_id: 42, url: 'https://myanimelist.net/manga/42/', title: 'Test Manga' }],
      },
    };
    const result = await jikan.lookupByTitle('Test');
    assert.strictEqual(result.malId, 42);
    assert.strictEqual(result.poster, null);
  });

  it('falls back to title when title_english is absent', async () => {
    mockResponses['https://api.jikan.moe/v4/manga?q=Test&limit=1&sfw=true'] = {
      json: {
        data: [{ mal_id: 42, url: 'https://myanimelist.net/manga/42/', title: 'Test Manga' }],
      },
    };
    const result = await jikan.lookupByTitle('Test');
    assert.strictEqual(result.title, 'Test Manga');
  });

  it('returns null on invalid JSON response', async () => {
    mockFetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error('Invalid JSON'); } });
    jikan = loadJikan(mockFetch);
    const result = await jikan.lookupByTitle('Test');
    assert.strictEqual(result, null);
  });
});
