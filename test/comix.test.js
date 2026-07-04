import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'sites', 'comix.js'), 'utf8');

function loadAdapter(pagePath, docTitle, initialData) {
  const html = `<!DOCTYPE html><html><head><title>${docTitle}</title></head><body>
    <div id="app-root"></div>
    <script type="application/json" id="initial-data">${JSON.stringify(initialData)}</script>
  </body></html>`;
  const dom = new JSDOM(html, { url: `https://comix.to${pagePath}` });
  const w = dom.window;
  w.MangaChapterTracker = { run() {} };

  const mod = { exports: {} };
  new Function('window', 'document', 'location', 'module', src)(w, w.document, w.location, mod);
  return mod.exports;
}

describe('comix adapter', () => {
  let mod;

  beforeEach(() => {
    mod = loadAdapter('/title/nxy5-jujutsu-kaisen-modulo/5499060-chapter-1',
      'Jujutsu Kaisen Modulo \u00b7 Ch.1', {
        page: 'read',
        read: { mangaId: 7329, mangaHid: 'nxy5', chapterId: 5499060, chapterNumber: 1 },
        queries: {
          '["manga","detail",7329]': {
            hid: 'nxy5', title: 'Jujutsu Kaisen Modulo',
            links: { mal: 'https://myanimelist.net/manga/186597/' },
            poster: { medium: 'https://static.comix.to/x/i/thumb.jpg' },
          },
        },
      });
  });

  describe('READER_RE', () => {
    const matches = [
      '/title/nxy5-jujutsu-kaisen-modulo/5499060-chapter-1',
      '/title/emrmx-lookism/2830340-chapter-241',
      '/title/793e-arelyn-is-sick-and-tired/10460664-chapter-66',
      '/title/xxx-some-manga/123-chapter-15.5',
      '/title/xxx-some-manga/123-chapter-0',
    ];
    for (const p of matches) {
      it(`matches ${p.split('/').pop()}`, () => {
        assert.ok(mod.READER_RE.test(p));
      });
    }
    const nonMatches = [
      '/title/nxy5-jujutsu-kaisen-modulo',
      '/collections/39484',
      '/home',
    ];
    for (const p of nonMatches) {
      it(`rejects ${p}`, () => {
        assert.strictEqual(mod.READER_RE.test(p), false);
      });
    }
  });

  describe('titleFromDocTitle', () => {
    it('strips · Ch. suffix', () => {
      assert.strictEqual(mod.titleFromDocTitle(), 'Jujutsu Kaisen Modulo');
    });
  });

  describe('readInitialData + findMangaMeta', () => {
    it('parses initial-data JSON', () => {
      const data = mod.readInitialData();
      assert.ok(data);
      assert.strictEqual(data.page, 'read');
    });
    it('finds manga by hid', () => {
      const data = mod.readInitialData();
      const meta = mod.findMangaMeta(data, 'nxy5');
      assert.ok(meta);
      assert.strictEqual(meta.title, 'Jujutsu Kaisen Modulo');
    });
    it('returns null for unknown hid', () => {
      const data = mod.readInitialData();
      assert.strictEqual(mod.findMangaMeta(data, 'zzzz'), null);
    });
  });

  describe('adapter.extract()', () => {
    it('extracts full chapter info', () => {
      const info = mod.comixAdapter.extract();
      assert.ok(info);
      assert.strictEqual(info.source, 'comix.to');
      assert.strictEqual(info.sourceId, 'nxy5');
      assert.strictEqual(info.title, 'Jujutsu Kaisen Modulo');
      assert.strictEqual(info.chapterId, '5499060');
      assert.strictEqual(info.chapterNumber, 1);
      assert.strictEqual(info.malId, 186597);
      assert.strictEqual(info.malUrl, 'https://myanimelist.net/manga/186597/');
      assert.ok(info.poster);
      assert.ok(info.detectedAt > 0);
    });

    it('falls back to doc title without initial-data', () => {
      const m2 = loadAdapter('/title/xxx-manga/123-chapter-15.5', 'Some Manga \u00b7 Ch.15.5', {});
      const info = m2.comixAdapter.extract();
      assert.strictEqual(info.title, 'Some Manga');
      assert.strictEqual(info.chapterNumber, 15.5);
      assert.strictEqual(info.malId, null);
    });

    it('returns null on non-reader page', () => {
      const m3 = loadAdapter('/home', 'Comix', {});
      assert.strictEqual(m3.comixAdapter.extract(), null);
    });
  });
});

describe('MAL link extraction', () => {
  it('parses MAL ID from URL', () => {
    const mm = 'https://myanimelist.net/manga/186597/'.match(/\/manga\/(\d+)/);
    assert.strictEqual(mm[1], '186597');
  });
  it('returns the numeric id for non-MAL URLs too', () => {
    const mm = 'https://anilist.co/manga/198372/'.match(/\/manga\/(\d+)/);
    assert.ok(mm);
    assert.strictEqual(mm[1], '198372');
  });
});
