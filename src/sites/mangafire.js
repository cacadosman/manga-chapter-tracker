// MangaFire.to site adapter. Loaded after src/content/tracker.js in the manifest.
// Registers itself with the generic tracker via window.MangaChapterTracker.
(() => {
  'use strict';

  // Matches reader URLs: /read/{slug}.{id}/{lang}/chapter-{number}
  // number may be decimal (e.g. 11.25). slug contains the manga name + dot + id.
  const READER_RE = /^\/read\/([^/]+)\/([^/]+)\/chapter-([^/?#]+)/;

  const SOURCE = 'mangafire.to';

  // Convert a slug segment to a human-readable title.
  // "one-piece" -> "One Piece", "manga-no-tsukurikataa" -> "Manga No Tsukurikataa"
  function titleFromSlug(mangaSegment) {
    const slug = mangaSegment.split('.')[0];
    return slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // Try to extract the manga title from the rendered DOM.
  // The SPA renders links to /manga/{slug.id} whose text is the title.
  function titleFromDOM(mangaSegment) {
    try {
      const link = document.querySelector(`a[href*="/manga/${mangaSegment}"]`);
      if (link) {
        const text = link.textContent.trim();
        if (text && text.length > 1) return text;
      }
    } catch (e) {}
    return null;
  }

  const mangafireAdapter = {
    source: SOURCE,

    matchReader(pathname) {
      return READER_RE.test(pathname);
    },

    extract() {
      const m = location.pathname.match(READER_RE);
      if (!m) return null;
      const mangaSegment = m[1];
      const numStr = m[3];
      const sourceId = mangaSegment.split('.').pop();
      let chapterNumber = parseFloat(numStr);
      if (!isFinite(chapterNumber)) chapterNumber = 0;

      const title = titleFromDOM(mangaSegment) || titleFromSlug(mangaSegment);
      const chapterId = sourceId + ':' + numStr;

      return {
        source: SOURCE,
        sourceId,
        title,
        chapterId,
        chapterNumber,
        chapterNumberStr: numStr,
        malId: null,
        malUrl: null,
        poster: null,
        mangaUrl: '/manga/' + mangaSegment,
        detectedAt: Date.now(),
      };
    },
  };

  window.MangaChapterTracker.run(mangafireAdapter);

  // Node.js test exports (module is undefined in browser === no-op).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { READER_RE, titleFromSlug, titleFromDOM, mangafireAdapter };
  }
})();
