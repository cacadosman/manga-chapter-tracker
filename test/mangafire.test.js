import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'sites', 'mangafire.js'), 'utf8');

function loadAdapter(pagePath, domBody) {
  const html = `<!DOCTYPE html><html><head><title>MangaFire</title></head><body>
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
  describe('READER_RE', () => {
    let mod;
    beforeEach(() => {
      mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1', '');
    });

    const matches = [
      '/read/one-piece.1n2k/en/chapter-1',
      '/read/gachiakutaa.1n2xq/en/chapter-11.25',
      '/read/manga-no-tsukurikataa.oq9z/ja/chapter-0',
      '/read/sidonia-no-kishi.lmm3/en/chapter-1',
    ];
    for (const p of matches) {
      it(`matches ${p.split('/').pop()}`, () => {
        assert.ok(mod.READER_RE.test(p));
      });
    }

    const nonMatches = [
      '/manga/one-piece.1n2k',
      '/home',
      '/az-list',
      '/read/one-piece.1n2k/en',
      '/read/one-piece.1n2k/en/',
    ];
    for (const p of nonMatches) {
      it(`rejects ${p}`, () => {
        assert.strictEqual(mod.READER_RE.test(p), false);
      });
    }

    it('ignores query params', () => {
      assert.ok(mod.READER_RE.test('/read/one-piece.1n2k/en/chapter-1?cm_id=123'));
    });
  });

  describe('titleFromSlug', () => {
    it('converts one-piece to One Piece', () => {
      const mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1', '');
      assert.strictEqual(mod.titleFromSlug('one-piece.1n2k'), 'One Piece');
    });

    it('converts sidonia-no-kishi to Sidonia No Kishi', () => {
      const mod = loadAdapter('/read/sidonia-no-kishi.lmm3/en/chapter-1', '');
      assert.strictEqual(mod.titleFromSlug('sidonia-no-kishi.lmm3'), 'Sidonia No Kishi');
    });

    it('handles single-word slugs', () => {
      const mod = loadAdapter('/read/berserk.abc/en/chapter-1', '');
      assert.strictEqual(mod.titleFromSlug('berserk.abc'), 'Berserk');
    });

    it('handles slugs with multiple segments', () => {
      const mod = loadAdapter('/read/manga-no-tsukurikataa.oq9z/en/chapter-1', '');
      assert.strictEqual(mod.titleFromSlug('manga-no-tsukurikataa.oq9z'), 'Manga No Tsukurikataa');
    });
  });

  describe('titleFromDOM', () => {
    it('extracts title from manga link in DOM', () => {
      const mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1',
        '<a href="/manga/one-piece.1n2k">One Piece</a>');
      assert.strictEqual(mod.titleFromDOM('one-piece.1n2k'), 'One Piece');
    });

    it('returns null when no link found', () => {
      const mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1', '');
      assert.strictEqual(mod.titleFromDOM('one-piece.1n2k'), null);
    });

    it('returns null for empty link text', () => {
      const mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1',
        '<a href="/manga/one-piece.1n2k"> </a>');
      assert.strictEqual(mod.titleFromDOM('one-piece.1n2k'), null);
    });
  });

  describe('adapter.extract()', () => {
    it('extracts full info from reader with DOM title', () => {
      const mod = loadAdapter('/read/one-piece.1n2k/en/chapter-1',
        '<a href="/manga/one-piece.1n2k">One Piece</a>');
      const info = mod.mangafireAdapter.extract();
      assert.ok(info);
      assert.strictEqual(info.source, 'mangafire.to');
      assert.strictEqual(info.sourceId, '1n2k');
      assert.strictEqual(info.title, 'One Piece');
      assert.strictEqual(info.chapterId, '1n2k:1');
      assert.strictEqual(info.chapterNumber, 1);
      assert.strictEqual(info.chapterNumberStr, '1');
      assert.strictEqual(info.malId, null);
      assert.strictEqual(info.malUrl, null);
      assert.strictEqual(info.mangaUrl, '/manga/one-piece.1n2k');
      assert.ok(info.detectedAt > 0);
    });

    it('falls back to slug title without DOM', () => {
      const mod = loadAdapter('/read/sidonia-no-kishi.lmm3/en/chapter-1', '');
      const info = mod.mangafireAdapter.extract();
      assert.strictEqual(info.title, 'Sidonia No Kishi');
      assert.strictEqual(info.sourceId, 'lmm3');
    });

    it('handles decimal chapter numbers', () => {
      const mod = loadAdapter('/read/gachiakutaa.1n2xq/en/chapter-11.25', '');
      const info = mod.mangafireAdapter.extract();
      assert.strictEqual(info.chapterNumber, 11.25);
      assert.strictEqual(info.chapterNumberStr, '11.25');
      assert.strictEqual(info.chapterId, '1n2xq:11.25');
    });

    it('handles chapter 0', () => {
      const mod = loadAdapter('/read/manga-no-tsukurikataa.oq9z/ja/chapter-0', '');
      const info = mod.mangafireAdapter.extract();
      assert.strictEqual(info.chapterNumber, 0);
      assert.strictEqual(info.chapterId, 'oq9z:0');
    });

    it('returns null on non-reader page', () => {
      const mod = loadAdapter('/manga/one-piece.1n2k', '');
      assert.strictEqual(mod.mangafireAdapter.extract(), null);
    });

    it('returns null on home page', () => {
      const mod = loadAdapter('/home', '');
      assert.strictEqual(mod.mangafireAdapter.extract(), null);
    });

    it('chapterId is unique per chapter', () => {
      const mod1 = loadAdapter('/read/one-piece.1n2k/en/chapter-1', '');
      const mod2 = loadAdapter('/read/one-piece.1n2k/en/chapter-3', '');
      assert.notStrictEqual(
        mod1.mangafireAdapter.extract().chapterId,
        mod2.mangafireAdapter.extract().chapterId
      );
    });
  });
});
