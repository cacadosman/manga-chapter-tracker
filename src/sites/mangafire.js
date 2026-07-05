// MangaFire.to site adapter. Loaded after src/content/tracker.js in the manifest.
// Registers itself with the generic tracker via window.MangaChapterTracker.
(() => {
  'use strict';

  // Two reader URL patterns exist on mangafire.to:
  // 1. /read/{slug}.{id}/{lang}/chapter-{number}  (chapter number in URL)
  // 2. /title/{id}-{slug}/{chapterId}              (chapter number only in page title)
  const READ_RE = /^\/read\/([^/]+)\/([^/]+)\/chapter-([^/?#]+)/;
  const TITLE_RE = /^\/title\/([^/]+)\/(\d+)/;

  const SOURCE = 'mangafire.to';

  // Convert a slug segment to a human-readable title.
  // "one-piece" -> "One Piece", "convenience-store-worker" -> "Convenience Store Worker"
  function titleFromSlug(slug) {
    return slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // Extract sourceId from a manga segment.
  // Pattern 1 (dot-separated): "one-piece.1n2k"  -> sourceId = "1n2k", slug = "one-piece"
  // Pattern 2 (dash-separated): "e07wg-convenience-store-worker" -> sourceId = "e07wg", slug = "convenience-store-worker"
  function parseSegment(mangaSegment) {
    if (mangaSegment.includes('.')) {
      const dotIdx = mangaSegment.lastIndexOf('.');
      return { sourceId: mangaSegment.slice(dotIdx + 1), slug: mangaSegment.slice(0, dotIdx) };
    }
    const dashIdx = mangaSegment.indexOf('-');
    if (dashIdx > 0) {
      return { sourceId: mangaSegment.slice(0, dashIdx), slug: mangaSegment.slice(dashIdx + 1) };
    }
    return { sourceId: mangaSegment, slug: mangaSegment };
  }

  // Try to extract the manga title from the rendered DOM.
  function titleFromDOM(mangaSegment) {
    try {
      const link = document.querySelector(`a[href*="/manga/${mangaSegment}"],a[href*="/title/${mangaSegment}"]`);
      if (link) {
        const text = link.textContent.trim();
        if (text && text.length > 1) return text;
      }
    } catch (e) {}
    return null;
  }

  // Fallback title from document.title.
  // Pattern 1 title format: "Title · Ch.N" (comix-style, but some manga don't update the title)
  // Pattern 2 title format: "Title - Chapter N" (mangafire's own reader)
  function titleFromDocTitle() {
    const t = (document.title || '').trim();
    // "Convenience Store Worker From Another World - Chapter 15"
    const chapterIdx = t.lastIndexOf(' - Chapter ');
    if (chapterIdx > 0) return t.slice(0, chapterIdx).trim();
    // "Title · Ch.1"
    const dotIdx = t.lastIndexOf(' \u00b7 Ch.');
    if (dotIdx > 0) return t.slice(0, dotIdx).trim();
    return null;
  }

  // Extract chapter number from document.title for Pattern 2.
  function chapterFromDocTitle() {
    const t = (document.title || '').trim();
    const chapterIdx = t.lastIndexOf(' - Chapter ');
    if (chapterIdx > 0) {
      const num = parseFloat(t.slice(chapterIdx + 11));
      if (isFinite(num)) return num;
    }
    return null;
  }

  const mangafireAdapter = {
    source: SOURCE,

    matchReader(pathname) {
      return READ_RE.test(pathname) || TITLE_RE.test(pathname);
    },

    extract() {
      // Try Pattern 1 first (/read/...)
      let m = location.pathname.match(READ_RE);
      if (m) {
        const mangaSegment = m[1];
        const numStr = m[3];
        const { sourceId, slug } = parseSegment(mangaSegment);
        let chapterNumber = parseFloat(numStr);
        if (!isFinite(chapterNumber)) chapterNumber = 0;
        const title = titleFromDOM(mangaSegment) || titleFromDocTitle() || titleFromSlug(slug);
        const chapterId = sourceId + ':' + numStr;

        return {
          source: SOURCE,
          sourceId,
          title,
          chapterId,
          chapterNumber,
          chapterNumberStr: numStr,
          malId: null, malUrl: null, poster: null,
          mangaUrl: '/manga/' + mangaSegment,
          detectedAt: Date.now(),
        };
      }

      // Try Pattern 2 (/title/..., no chapter number in URL)
      m = location.pathname.match(TITLE_RE);
      if (m) {
        const mangaSegment = m[1];
        const chapterIdNum = m[2];
        const { sourceId, slug } = parseSegment(mangaSegment);
        const docTitle = titleFromDocTitle();
        const title = titleFromDOM(mangaSegment) || docTitle || titleFromSlug(slug);
        const chapFromTitle = chapterFromDocTitle();
        const chapterNumber = chapFromTitle != null ? chapFromTitle : 0;
        const numStr = chapFromTitle != null ? String(chapFromTitle) : '0';
        const chapterId = sourceId + ':' + chapterIdNum;

        return {
          source: SOURCE,
          sourceId,
          title,
          chapterId,
          chapterNumber,
          chapterNumberStr: numStr,
          malId: null, malUrl: null, poster: null,
          mangaUrl: '/title/' + mangaSegment,
          detectedAt: Date.now(),
        };
      }

      return null;
    },
  };

  window.MangaChapterTracker.run(mangafireAdapter);

  // Node.js test exports (module is undefined in browser === no-op).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { READ_RE, TITLE_RE, parseSegment, titleFromSlug, titleFromDOM, titleFromDocTitle, chapterFromDocTitle, mangafireAdapter };
  }
})();
