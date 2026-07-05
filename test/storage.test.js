import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createChromeMock } from './helpers/chrome-mock.js';
import fs from 'fs';
import path from 'path';

const storageSrc = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'shared', 'storage.js'), 'utf8');

// Load storage module with chrome mock injected.
function loadStorage(chrome) {
  const code = storageSrc
    .replace(/^import .*$/m, 'const STORE_KEY="tracker"; const HISTORY_CAP=10;')
    .replace(/export /g, '');
  const fn = new Function('chrome', code + '\nreturn { getState, setState, mangaKey, saveChapter, setChapter, setMalId, markLookedUp, deleteManga, clearAll, setSetting, replaceState };');
  return fn(chrome);
}

const ts = (n) => 1700000000000 + n * 1000;

function seedOldFormat(mem) {
  mem.tracker = {
    manga: {
      'nxy5': { hid: 'nxy5', title: 'Old JJK', maxChapter: 5, readChapters: { c1: 1, c5: 5 }, history: [
        { chapterId: 'c5', number: 5, readAt: ts(5) },
        { chapterId: 'c1', number: 1, readAt: ts(1) },
      ], firstReadAt: ts(1), lastReadAt: ts(5) },
      'abc': { hid: 'abc', title: 'Old ABC', maxChapter: 3, readChapters: { c3: 3 }, history: [], firstReadAt: ts(1), lastReadAt: ts(2) },
    },
    settings: { autoTrack: false },
  };
}

function countItems(S) {
  const m = S._mem?.tracker?.manga || {};
  return Object.keys(m).length;
}

describe('storage', () => {
  let chrome, S;

  beforeEach(() => {
    chrome = createChromeMock();
    S = loadStorage(chrome);
  });

  describe('mangaKey', () => {
    it('builds composite key', () => {
      assert.strictEqual(S.mangaKey('comix.to', 'nxy5'), 'comix.to:nxy5');
    });
  });

  describe('getState defaults', () => {
    it('returns default state when empty', async () => {
      const st = await S.getState();
      assert.deepStrictEqual(st.settings, { autoTrack: true });
      assert.deepStrictEqual(st.manga, {});
    });
  });

  describe('migration', () => {
    it('re-keys old bare-hid entries to source:sourceId', async () => {
      seedOldFormat(chrome.storage.local._mem);
      const st = await S.getState();
      assert.ok(st.manga['comix.to:nxy5']);
      assert.ok(st.manga['comix.to:abc']);
      assert.strictEqual(Object.keys(st.manga).length, 2);
      // Old keys are gone
      assert.strictEqual(st.manga['nxy5'], undefined);
      assert.strictEqual(st.manga['abc'], undefined);
      // Fields are populated
      assert.strictEqual(st.manga['comix.to:nxy5'].sourceId, 'nxy5');
      assert.strictEqual(st.manga['comix.to:nxy5'].source, 'comix.to');
      assert.strictEqual(st.manga['comix.to:nxy5'].key, 'comix.to:nxy5');
      assert.strictEqual(st.manga['comix.to:abc'].sourceId, 'abc');
      assert.strictEqual(st.manga['comix.to:abc'].source, 'comix.to');
    });

    it('defaults source when missing', async () => {
      chrome.storage.local._mem.tracker = {
        manga: { 'nxy5': { hid: 'nxy5' } },
        settings: {},
      };
      const st = await S.getState();
      assert.strictEqual(st.manga['comix.to:nxy5'].source, 'comix.to');
    });
  });

  describe('saveChapter', () => {
    it('creates a new manga entry', async () => {
      await S.saveChapter({
        source: 'comix.to', sourceId: 'nxy5', title: 'JJK', chapterId: 'c1',
        chapterNumber: 1, detectedAt: ts(1), malId: 186597, malUrl: 'https://myanimelist.net/manga/186597/',
        poster: 'img.jpg', mangaUrl: '/title/nxy5-jjk',
      });
      const st = await S.getState();
      const m = st.manga['comix.to:nxy5'];
      assert.ok(m);
      assert.strictEqual(m.title, 'JJK');
      assert.strictEqual(m.malId, 186597);
      assert.strictEqual(m.poster, 'img.jpg');
      assert.strictEqual(m.maxChapter, 1);
      assert.strictEqual(m.lastChapter, 1);
      assert.strictEqual(m.readChapters['c1'], 1);
    });

    it('updates existing entry metadata', async () => {
      chrome.storage.local._mem.tracker = {
        manga: { 'comix.to:nxy5': { source: 'comix.to', sourceId: 'nxy5', title: 'Old', maxChapter: 1, readChapters: {}, history: [] } },
        settings: { autoTrack: true },
      };
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', title: 'New Title', chapterId: 'c2', chapterNumber: 2, detectedAt: ts(2) });
      const st = await S.getState();
      assert.strictEqual(st.manga['comix.to:nxy5'].title, 'New Title');
      assert.strictEqual(st.manga['comix.to:nxy5'].maxChapter, 2);
    });

    it('deduplicates by chapterId (re-read moves to front)', async () => {
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c1', chapterNumber: 1, detectedAt: ts(1) });
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c1', chapterNumber: 1, detectedAt: ts(99) });
      const st = await S.getState();
      const h = st.manga['comix.to:nxy5'].history;
      assert.strictEqual(h.length, 1, 'should be 1 after re-read');
      assert.strictEqual(h[0].readAt, ts(99), 'should be moved to front with new timestamp');
    });

    it('caps history at 10 entries', async () => {
      for (let i = 1; i <= 15; i++) {
        await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c' + i, chapterNumber: i, detectedAt: ts(i) });
      }
      const st = await S.getState();
      const h = st.manga['comix.to:nxy5'].history;
      assert.strictEqual(h.length, 10, 'history should be capped at 10');
      assert.strictEqual(h[0].number, 15, 'newest entry should be at front');
    });

    it('only increases maxChapter (not decreases)', async () => {
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c5', chapterNumber: 5, detectedAt: ts(5) });
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c2', chapterNumber: 2, detectedAt: ts(2) });
      const st = await S.getState();
      assert.strictEqual(st.manga['comix.to:nxy5'].maxChapter, 5);
    });
  });

  describe('setChapter (rollback)', () => {
    it('lowers maxChapter', async () => {
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c10', chapterNumber: 10, detectedAt: ts(10) });
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c30', chapterNumber: 30, detectedAt: ts(30) });
      await S.setChapter('comix.to:nxy5', 10);
      const st = await S.getState();
      assert.strictEqual(st.manga['comix.to:nxy5'].maxChapter, 10);
    });

    it('deletes readChapters above new value', async () => {
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c5', chapterNumber: 5, detectedAt: ts(5) });
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c30', chapterNumber: 30, detectedAt: ts(30) });
      await S.setChapter('comix.to:nxy5', 5);
      const st = await S.getState();
      assert.strictEqual('c30' in st.manga['comix.to:nxy5'].readChapters, false);
      assert.ok('c5' in st.manga['comix.to:nxy5'].readChapters);
    });

    it('deletes history entries above new value', async () => {
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c10', chapterNumber: 10, detectedAt: ts(10) });
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c30', chapterNumber: 30, detectedAt: ts(30) });
      await S.setChapter('comix.to:nxy5', 10);
      const st = await S.getState();
      const h = st.manga['comix.to:nxy5'].history;
      assert.strictEqual(h.some(e => e.number === 30), false);
      assert.ok(h.some(e => e.number === 10));
    });

    it('returns null for unknown manga', async () => {
      const result = await S.setChapter('comix.to:ghost', 5);
      assert.strictEqual(result, null);
    });
  });

  describe('deleteManga', () => {
    it('removes entry', async () => {
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c1', chapterNumber: 1, detectedAt: ts(1) });
      await S.deleteManga('comix.to:nxy5');
      const st = await S.getState();
      assert.strictEqual(st.manga['comix.to:nxy5'], undefined);
    });
  });

  describe('clearAll', () => {
    it('empties manga', async () => {
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c1', chapterNumber: 1, detectedAt: ts(1) });
      await S.clearAll();
      const st = await S.getState();
      assert.strictEqual(Object.keys(st.manga).length, 0);
    });
  });

  describe('setSetting', () => {
    it('stores a setting value', async () => {
      await S.setSetting('malUserName', 'testuser');
      const st = await S.getState();
      assert.strictEqual(st.settings.malUserName, 'testuser');
    });
  });

  describe('replaceState', () => {
    it('replaces entire state', async () => {
      await S.saveChapter({ source: 'comix.to', sourceId: 'nxy5', chapterId: 'c1', chapterNumber: 1, detectedAt: ts(1) });
      await S.replaceState({ manga: { 'x:y': { source: 'x', sourceId: 'y', title: 'R' } }, settings: { autoTrack: false } });
      const st = await S.getState();
      assert.strictEqual(Object.keys(st.manga).length, 1);
      assert.ok(st.manga['x:y']);
      assert.strictEqual(st.settings.autoTrack, false);
    });

    it('fills defaults for missing fields', async () => {
      await S.replaceState({ manga: {} });
      const st = await S.getState();
      assert.strictEqual(st.settings.autoTrack, true);
    });
  });

  describe('mergeByMalId', () => {
    it('startup merge combines duplicate malIds', async () => {
      // Seed two entries with same malId from different sources
      const mem = chrome.storage.local._mem;
      mem.tracker = {
        manga: {
          'comix.to:nxy5': {
            key: 'comix.to:nxy5', source: 'comix.to', sourceId: 'nxy5', title: 'JJK',
            malId: 186597, malUrl: 'https://myanimelist.net/manga/186597/',
            readChapters: { c1: 1, c5: 5 }, history: [{ chapterId: 'c5', number: 5, readAt: ts(5) }],
            maxChapter: 5, poster: 'img-comix.jpg', createdAt: ts(1), firstReadAt: ts(1), lastReadAt: ts(5),
          },
          'mangafire.to:e07wg': {
            key: 'mangafire.to:e07wg', source: 'mangafire.to', sourceId: 'e07wg', title: 'JJK (MF)',
            malId: 186597, malUrl: null,
            readChapters: { c10: 10 }, history: [{ chapterId: 'c10', number: 10, readAt: ts(10) }],
            maxChapter: 10, poster: null, createdAt: ts(2), firstReadAt: ts(2), lastReadAt: ts(10),
          },
        },
        settings: { autoTrack: true },
      };
      const st = await S.getState();
      const keys = Object.keys(st.manga);
      assert.strictEqual(keys.length, 1, 'should be merged to one entry');
      const m = st.manga[keys[0]];
      assert.strictEqual(m.malId, 186597);
      assert.ok(m.sources.includes('comix.to'));
      assert.ok(m.sources.includes('mangafire.to'));
      assert.strictEqual(m.maxChapter, 10); // max across both
      assert.strictEqual(m.poster, 'img-comix.jpg'); // first source's poster kept
      assert.strictEqual(m.title, 'JJK'); // longer title wins
    });

    it('setMalId triggers merge when two entries get same malId', async () => {
      await S.saveChapter({ source: 'comix.to', sourceId: 'a', chapterId: 'c1', chapterNumber: 1, detectedAt: ts(1) });
      await S.saveChapter({ source: 'mangafire.to', sourceId: 'b', chapterId: 'c10', chapterNumber: 10, detectedAt: ts(10) });
      // Set same malId on both — second call triggers merge
      await S.setMalId('comix.to:a', 42);
      await S.setMalId('mangafire.to:b', 42);
      const st = await S.getState();
      const keys = Object.keys(st.manga);
      assert.strictEqual(keys.length, 1);
      assert.ok(st.manga[keys[0]].sources.includes('comix.to'));
      assert.ok(st.manga[keys[0]].sources.includes('mangafire.to'));
      assert.strictEqual(st.manga[keys[0]].maxChapter, 10);
    });

    it('entries with different malIds are not merged', async () => {
      await S.saveChapter({ source: 'comix.to', sourceId: 'a', chapterId: 'c1', chapterNumber: 1, malId: 1, detectedAt: ts(1) });
      await S.saveChapter({ source: 'comix.to', sourceId: 'b', chapterId: 'c1', chapterNumber: 1, malId: 2, detectedAt: ts(1) });
      const st = await S.getState();
      assert.strictEqual(Object.keys(st.manga).length, 2);
    });

    it('entries with null malId are not merged', async () => {
      await S.saveChapter({ source: 'comix.to', sourceId: 'a', chapterId: 'c1', chapterNumber: 1, detectedAt: ts(1) });
      await S.saveChapter({ source: 'mangafire.to', sourceId: 'a', chapterId: 'c1', chapterNumber: 1, detectedAt: ts(1) });
      const st = await S.getState();
      assert.strictEqual(Object.keys(st.manga).length, 2);
    });

    it('startup merge: three entries become one', async () => {
      const mem = chrome.storage.local._mem;
      mem.tracker = {
        manga: {
          'comix.to:a': { key: 'comix.to:a', source: 'comix.to', sourceId: 'a', malId: 99, createdAt: ts(1), firstReadAt: ts(1), lastReadAt: ts(5), maxChapter: 5, readChapters: { c1: 1, c5: 5 }, history: [], title: 'X' },
          'mangafire.to:a': { key: 'mangafire.to:a', source: 'mangafire.to', sourceId: 'a', malId: 99, createdAt: ts(2), firstReadAt: ts(2), lastReadAt: ts(10), maxChapter: 10, readChapters: { c10: 10 }, history: [], title: 'X' },
          'mangafire.to:b': { key: 'mangafire.to:b', source: 'mangafire.to', sourceId: 'b', malId: 99, createdAt: ts(3), firstReadAt: ts(3), lastReadAt: ts(12), maxChapter: 12, readChapters: { c12: 12 }, history: [], title: 'X from MF2' },
        },
        settings: {},
      };
      const st = await S.getState();
      assert.strictEqual(Object.keys(st.manga).length, 1);
    });

    it('history is deduped and capped at 10 after merge', async () => {
      const mem = chrome.storage.local._mem;
      mem.tracker = {
        manga: {
          'comix.to:a': { key: 'comix.to:a', source: 'comix.to', sourceId: 'a', malId: 1, createdAt: ts(1), firstReadAt: ts(1), lastReadAt: ts(3), maxChapter: 5, readChapters: { c1: 1 }, history: [
            { chapterId: 'c3', number: 3, readAt: ts(3) }, { chapterId: 'c1', number: 1, readAt: ts(1) },
          ], title: 'X' },
          'mangafire.to:a': { key: 'mangafire.to:a', source: 'mangafire.to', sourceId: 'a', malId: 1, createdAt: ts(2), firstReadAt: ts(2), lastReadAt: ts(5), maxChapter: 5, readChapters: { c5: 5 }, history: [
            { chapterId: 'c5', number: 5, readAt: ts(5) }, { chapterId: 'c3', number: 3, readAt: ts(4) },
          ], title: 'X' },
        },
        settings: {},
      };
      const st = await S.getState();
      const m = Object.values(st.manga)[0];
      assert.strictEqual(m.history.length, 3); // c5, c3, c1; c3 deduped
      assert.strictEqual(m.history[0].chapterId, 'c5');
      assert.strictEqual(m.history[2].chapterId, 'c1');
    });
  });
});
