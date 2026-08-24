// MangaFire.to site adapter. Loaded after src/content/tracker.js in the manifest.
// Registers itself with the generic tracker via window.MangaChapterTracker.
(() => {
  'use strict';

  // MangaFire currently exposes both the legacy reader URL and title-based
  // chapter URLs. Keep the legacy form for existing bookmarks.
  const READ_RE = /^\/read\/([^/]+)\/([^/]+)\/chapter-([^/?#]+)/;
  const TITLE_RE = /^\/title\/([^/]+)\/(\d+)(?:-chapter-([^/?#]+))?(?:\/|$)/;
  const TITLE_CHAPTER_RE = /^\/title\/([^/]+)\/chapter\/(\d+)(?:\/|$)/;

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

  // Common navigation/breadcrumb labels that are never manga titles.
  const GENERIC_WORDS = new Set([
    'series', 'manga', 'home', 'browse', 'reader', 'chapter', 'chapters',
    'search', 'sign in', 'login', 'register', 'trending', 'latest', 'popular',
    'new', 'hot', 'filter', 'az', 'list', 'page', 'next', 'prev', 'previous',
    'all', 'top', 'read', 'info',
  ]);

  function isValidTitle(text) {
    if (!text || text.length < 3) return false;
    const lower = text.toLowerCase();
    // Reject single generic words.
    if (GENERIC_WORDS.has(lower)) return false;
    if (lower.startsWith('chapter ') || lower.startsWith('vol ') || lower.startsWith('volume ')) return false;
    return true;
  }

  // Try to extract the manga title from the rendered DOM.
  function titleFromDOM(mangaSegment) {
    try {
      const links = document.querySelectorAll(
        `a[href*="/manga/${mangaSegment}"],a[href*="/title/${mangaSegment}"]`
      );
      for (const link of links) {
        const text = link.textContent.trim();
        if (isValidTitle(text)) return text;
      }
    } catch (e) {}
    return null;
  }

  // Try to find the manga poster/cover image from the DOM.
  function posterFromDOM(mangaSegment) {
    try {
      const link = document.querySelector(
        `a[href*="/manga/${mangaSegment}"] img,a[href*="/title/${mangaSegment}"] img`
      );
      if (link && link.src && !link.src.includes('data:')) return link.src;
    } catch (e) {}
    return null;
  }

  function parseChapterNumber(value) {
    const match = String(value || '').match(/^(?:\d+(?:\.\d+)?|\.\d+)/);
    if (!match) return null;
    const number = parseFloat(match[0]);
    return isFinite(number) ? number : null;
  }

  function chapterNumberFromText(text) {
    const match = String(text || '').match(/(?:chapter|ch\.?|episode|ep\.?)\s*([0-9]+(?:\.[0-9]+)?)/i);
    return match ? parseChapterNumber(match[1]) : null;
  }

  // Fallback title from document.title.
  // Supports both the old "Title · Ch.N" form and the current
  // "Title - Chapter N" form.
  function titleFromDocTitle() {
    const t = (document.title || '').trim();
    const match = t.match(/^(.*?)\s+(?:-|·)\s*(?:chapter|ch\.?|episode|ep\.?)\s*[0-9]+(?:\.[0-9]+)?(?:\s.*)?$/i);
    return match && match[1].trim() ? match[1].trim() : null;
  }

  // Extract chapter number from document.title for routes that do not encode
  // the number, such as /title/{id-slug}/chapter/{chapterId}.
  function chapterFromDocTitle() {
    return chapterNumberFromText(document.title || '');
  }

  // Some MangaFire pages keep the chapter number in a heading instead of the
  // document title. Restrict the scan to likely chapter elements to avoid
  // accidentally reading a number from an unrelated manga link.
  function chapterFromDOM() {
    try {
      const nodes = document.querySelectorAll('h1,h2,h3,[class*="chapter"],[id*="chapter"]');
      for (const node of nodes) {
        const number = chapterNumberFromText(node.textContent || '');
        if (number != null) return number;
      }
    } catch (e) {}
    return null;
  }

  function chapterNumberString(number) {
    return number == null ? '0' : String(number);
  }

  const mangafireAdapter = {
    source: SOURCE,

    matchReader(pathname) {
      return READ_RE.test(pathname) || TITLE_RE.test(pathname) || TITLE_CHAPTER_RE.test(pathname);
    },

    extract() {
      // Legacy reader: /read/.../chapter-N
      let m = location.pathname.match(READ_RE);
      if (m) {
        const mangaSegment = m[1];
        const numStr = m[3];
        const { sourceId, slug } = parseSegment(mangaSegment);
        const chapterNumber = parseChapterNumber(numStr) || 0;
        const title = titleFromDOM(mangaSegment) || titleFromDocTitle() || titleFromSlug(slug);
        const chapterId = sourceId + ':' + numStr;

        return {
          source: SOURCE,
          sourceId,
          title,
          chapterId,
          chapterNumber,
          chapterNumberStr: numStr,
          malId: null, malUrl: null,
          poster: posterFromDOM(mangaSegment) || null,
          mangaUrl: '/manga/' + mangaSegment,
          detectedAt: Date.now(),
        };
      }

      // Current canonical reader: /title/{id-slug}/chapter/{chapterId}
      m = location.pathname.match(TITLE_CHAPTER_RE);
      if (m) {
        const mangaSegment = m[1];
        const chapterIdNum = m[2];
        const { sourceId, slug } = parseSegment(mangaSegment);
        const title = titleFromDOM(mangaSegment) || titleFromDocTitle() || titleFromSlug(slug);
        const chapterNumber = chapterFromDocTitle() ?? chapterFromDOM() ?? 0;

        return {
          source: SOURCE,
          sourceId,
          title,
          chapterId: sourceId + ':' + chapterIdNum,
          chapterNumber,
          chapterNumberStr: chapterNumberString(chapterNumber),
          malId: null, malUrl: null,
          poster: posterFromDOM(mangaSegment) || null,
          mangaUrl: '/title/' + mangaSegment,
          detectedAt: Date.now(),
        };
      }

      // Title-based reader. The chapter number may be encoded as
      // {chapterId}-chapter-{number}-{language}, or omitted in older URLs.
      m = location.pathname.match(TITLE_RE);
      if (m) {
        const mangaSegment = m[1];
        const chapterIdNum = m[2];
        const { sourceId, slug } = parseSegment(mangaSegment);
        const pathNumber = parseChapterNumber(m[3]);
        const chapterNumber = pathNumber ?? chapterFromDocTitle() ?? chapterFromDOM() ?? 0;
        const title = titleFromDOM(mangaSegment) || titleFromDocTitle() || titleFromSlug(slug);

        return {
          source: SOURCE,
          sourceId,
          title,
          chapterId: sourceId + ':' + chapterIdNum,
          chapterNumber,
          chapterNumberStr: pathNumber != null ? String(pathNumber) : chapterNumberString(chapterNumber),
          malId: null, malUrl: null,
          poster: posterFromDOM(mangaSegment) || null,
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
    module.exports = {
      READ_RE,
      TITLE_RE,
      TITLE_CHAPTER_RE,
      parseSegment,
      parseChapterNumber,
      titleFromSlug,
      titleFromDOM,
      titleFromDocTitle,
      chapterFromDocTitle,
      chapterFromDOM,
      isValidTitle,
      posterFromDOM,
      mangafireAdapter,
    };
  }
})();
