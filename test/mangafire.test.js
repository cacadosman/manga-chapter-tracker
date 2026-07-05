import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'sites', 'mangafire.js'), 'utf8');

function loadAdapter(pagePath, docTitle, domBody) {
  const html = `<!DOCTYPE html><html><head><title>${docTitle}</title></head><body>
    <div id="app-root">${domBody || ''}</div>
  </body></html>`;
  const dom = new JSDOM(html, { url: `https://mangafire.to${pagePath}` });
  const w = dom.window;
  w.MangaChapterTracker = { run() {} };

  const mod = { exports: {} };
  new Function('window', 'document', 'location', 'module', src)(w, w.document, w.location, mod);
  return mod.exports;
}

describe('mangafire adapter', () => {
  describe('READ_RE — pattern 1 (/read/...)', () => {
    let mod;
    beforeEach(() => {
      mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1', 'One Piece \u00b7 Ch.1', '');
    });

    const matches = [
      '/read/one-piece.1n2k/en/chapter-1',
      '/read/gachiakutaa.1n2xq/en/chapter-11.25',
      '/read/manga-no-tsukurikataa.oq9z/ja/chapter-0',
    ];
    for (const p of matches) {
      it(`matches ${p.split('/').pop()}`, () => { assert.ok(mod.READ_RE.test(p)); });
    }
    const nonMatches = [
      '/manga/one-piece.1n2k', '/home',
      '/title/e07wg-convenience-store-worker/3548274',
    ];
    for (const p of nonMatches) {
      it(`rejects ${p}`, () => { assert.strictEqual(mod.READ_RE.test(p), false); });
    }
  });

  describe('TITLE_RE — pattern 2 (/title/...)', () => {
    let mod;
    beforeEach(() => {
      mod = loadAdapter('/title/e07wg-convenience-store-worker-from-another-worldd/3548274',
        'Convenience Store Worker From Another World - Chapter 15', '');
    });

    const matches = [
      '/title/e07wg-convenience-store-worker-from-another-worldd/3548274',
      '/title/abc-my-manga/12345',
    ];
    for (const p of matches) {
      it(`matches ${p}`, () => { assert.ok(mod.TITLE_RE.test(p)); });
    }
    const nonMatches = [
      '/title/abc-my-manga',
      '/home',
      '/read/one-piece.1n2k/en/chapter-1',
    ];
    for (const p of nonMatches) {
      it(`rejects ${p}`, () => { assert.strictEqual(mod.TITLE_RE.test(p), false); });
    }
  });

  describe('parseSegment', () => {
    let mod;
    beforeEach(() => { mod = loadAdapter('/read/test.1/en/chapter-1', 't', ''); });

    it('dot-separated: one-piece.1n2k → sourceId=1n2k slug=one-piece', () => {
      assert.deepStrictEqual(mod.parseSegment('one-piece.1n2k'), { sourceId: '1n2k', slug: 'one-piece' });
    });
    it('dash-separated: e07wg-convenience-store-worker → sourceId=e07wg slug=convenience-store-worker', () => {
      assert.deepStrictEqual(mod.parseSegment('e07wg-convenience-store-worker'), { sourceId: 'e07wg', slug: 'convenience-store-worker' });
    });
    it('no separator: abc → sourceId=abc slug=abc', () => {
      assert.deepStrictEqual(mod.parseSegment('abc'), { sourceId: 'abc', slug: 'abc' });
    });
  });

  describe('titleFromSlug', () => {
    let mod;
    beforeEach(() => { mod = loadAdapter('/read/test.1/en/chapter-1', 't', ''); });

    it('one-piece → One Piece', () => {
      assert.strictEqual(mod.titleFromSlug('one-piece'), 'One Piece');
    });
  });

  describe('titleFromDOM', () => {
    it('matches /manga/ links', () => {
      const mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1', 'x',
        '<a href="/manga/one-piece.1n2k">One Piece</a>');
      assert.strictEqual(mod.titleFromDOM('one-piece.1n2k'), 'One Piece');
    });
    it('matches /title/ links', () => {
      const mod = loadAdapter('/title/e07wg-convenience-store/3548274', 'x',
        '<a href="/title/e07wg-convenience-store">Convenience Store</a>');
      assert.strictEqual(mod.titleFromDOM('e07wg-convenience-store'), 'Convenience Store');
    });
    it('rejects generic word "Series" (picks next valid link)', () => {
      const mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1', 'x',
        '<a href="/manga/one-piece.1n2k">Series</a><a href="/manga/one-piece.1n2k">One Piece</a>');
      assert.strictEqual(mod.titleFromDOM('one-piece.1n2k'), 'One Piece');
    });
    it('rejects generic word "Manga"', () => {
      const mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1', 'x',
        '<a href="/manga/one-piece.1n2k">Manga</a>');
      assert.strictEqual(mod.titleFromDOM('one-piece.1n2k'), null);
    });
    it('rejects "Chapter 1" prefix', () => {
      const mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1', 'x',
        '<a href="/manga/one-piece.1n2k">Chapter 1</a>');
      assert.strictEqual(mod.titleFromDOM('one-piece.1n2k'), null);
    });
    it('returns null when no link', () => {
      const mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1', 'x', '');
      assert.strictEqual(mod.titleFromDOM('one-piece.1n2k'), null);
    });
  });

  describe('posterFromDOM', () => {
    it('finds poster image from /manga/ link', () => {
      const mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1', 'x',
        '<a href="/manga/one-piece.1n2k"><img src="https://cdn.example/op.jpg" /></a>');
      const poster = mod.posterFromDOM('one-piece.1n2k');
      assert.ok(poster && poster.includes('op.jpg'));
    });
    it('finds poster from /title/ link', () => {
      const mod = loadAdapter('/title/e07wg-test/123', 'x',
        '<a href="/title/e07wg-test"><img src="https://cdn.example/cs.jpg" /></a>');
      const poster = mod.posterFromDOM('e07wg-test');
      assert.ok(poster && poster.includes('cs.jpg'));
    });
    it('returns null when no image', () => {
      const mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1', 'x', '');
      assert.strictEqual(mod.posterFromDOM('one-piece.1n2k'), null);
    });
  });

  describe('titleFromDocTitle', () => {
    it('parses " - Chapter N" format', () => {
      const mod = loadAdapter('/title/e07wg-test/123', 'My Manga - Chapter 15', '');
      assert.strictEqual(mod.titleFromDocTitle(), 'My Manga');
    });
    it('parses " · Ch.N" format', () => {
      const mod = loadAdapter('/read/test.abc/en/chapter-1', 'My Manga \u00b7 Ch.1', '');
      assert.strictEqual(mod.titleFromDocTitle(), 'My Manga');
    });
    it('returns null for unrecognized format', () => {
      const mod = loadAdapter('/read/test.abc/en/chapter-1', 'MangaFire - Read Manga Online Free', '');
      assert.strictEqual(mod.titleFromDocTitle(), null);
    });
  });

  describe('chapterFromDocTitle', () => {
    it('extracts chapter number from " - Chapter N"', () => {
      const mod = loadAdapter('/title/test/123', 'My Manga - Chapter 15', '');
      assert.strictEqual(mod.chapterFromDocTitle(), 15);
    });
    it('returns null for other formats', () => {
      const mod = loadAdapter('/read/test/en/chapter-1', 'My Manga \u00b7 Ch.1', '');
      assert.strictEqual(mod.chapterFromDocTitle(), null);
    });
  });

  describe('adapter.extract()', () => {
    it('Pattern 1: /read/.../chapter-N with DOM title', () => {
      const mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1', 'One Piece \u00b7 Ch.1',
        '<a href="/manga/one-piece.1n2k">One Piece</a>');
      const info = mod.mangafireAdapter.extract();
      assert.ok(info);
      assert.strictEqual(info.sourceId, '1n2k');
      assert.strictEqual(info.title, 'One Piece');
      assert.strictEqual(info.chapterNumber, 1);
      assert.strictEqual(info.chapterId, '1n2k:1');
      assert.strictEqual(info.mangaUrl, '/manga/one-piece.1n2k');
    });

    it('Pattern 1: decimal chapter', () => {
      const mod = loadAdapter('/read/gachiakutaa.1n2xq/en/chapter-11.25', 'Gachiakuta \u00b7 Ch.11.25', '');
      const info = mod.mangafireAdapter.extract();
      assert.strictEqual(info.chapterNumber, 11.25);
      assert.strictEqual(info.chapterNumberStr, '11.25');
    });

    it('Pattern 2: /title/.../chapterId with doc title parsing', () => {
      const mod = loadAdapter('/title/e07wg-convenience-store-worker-from-another-worldd/3548274',
        'Convenience Store Worker From Another World - Chapter 15',
        '<a href="/title/e07wg-convenience-store-worker-from-another-worldd">Convenience Store Worker From Another World</a>');
      const info = mod.mangafireAdapter.extract();
      assert.ok(info);
      assert.strictEqual(info.sourceId, 'e07wg');
      assert.strictEqual(info.title, 'Convenience Store Worker From Another World');
      assert.strictEqual(info.chapterNumber, 15);
      assert.strictEqual(info.chapterNumberStr, '15');
      assert.strictEqual(info.chapterId, 'e07wg:3548274');
      assert.strictEqual(info.mangaUrl, '/title/e07wg-convenience-store-worker-from-another-worldd');
    });

    it('Pattern 2: falls back to slug title without DOM or doc title', () => {
      const mod = loadAdapter('/title/e07wg-convenience-store/3548274',
        'MangaFire - Read Manga Online Free', '');
      const info = mod.mangafireAdapter.extract();
      assert.strictEqual(info.sourceId, 'e07wg');
      assert.strictEqual(info.title, 'Convenience Store');
      assert.strictEqual(info.chapterNumber, 0);
      assert.strictEqual(info.chapterNumberStr, '0');
    });

    it('returns null on non-reader page', () => {
      const mod = loadAdapter('/manga/one-piece.1n2k', '', '');
      assert.strictEqual(mod.mangafireAdapter.extract(), null);
    });

    it('returns null on home page', () => {
      const mod = loadAdapter('/home', '', '');
      assert.strictEqual(mod.mangafireAdapter.extract(), null);
    });
  });
});
