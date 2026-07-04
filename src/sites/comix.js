// Comix.to site adapter. Loaded after src/content/tracker.js in the manifest.
// Registers itself with the generic tracker via window.MangaChapterTracker.
(() => {
  'use strict';

  // Matches reader URLs: /title/{hid-slug}/{chapterId}-chapter-{number}
  // number may be decimal (e.g. 15.5). chapterId is always numeric.
  const READER_RE = /^\/title\/([^/]+)\/(\d+)-chapter-([^/?#]+)/;

  const SOURCE = 'comix.to';

  function readInitialData() {
    try {
      const el = document.getElementById('initial-data');
      if (!el || !el.textContent) return null;
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  function findMangaMeta(data, hid) {
    if (!data || !data.queries) return null;
    try {
      for (const k of Object.keys(data.queries)) {
        const v = data.queries[k];
        if (v && typeof v === 'object' && v.hid === hid && v.title) return v;
      }
    } catch (e) {}
    return null;
  }

  function titleFromDocTitle() {
    const t = (document.title || '').trim();
    const idx = t.lastIndexOf(' \u00b7 Ch.');
    if (idx > 0) return t.slice(0, idx).trim();
    return t;
  }

  const comixAdapter = {
    source: SOURCE,

    matchReader(pathname) {
      return READER_RE.test(pathname);
    },

    extract() {
      const m = location.pathname.match(READER_RE);
      if (!m) return null;
      const mangaSegment = m[1];
      const chapterId = m[2];
      const numStr = m[3];
      const hid = mangaSegment.split('-')[0];
      let chapterNumber = parseFloat(numStr);
      if (!isFinite(chapterNumber)) chapterNumber = 0;

      // initial-data is authoritative for title + MAL link, but only on a
      // full page load (it goes stale during SPA navigation). It is constant
      // per manga, so reading it whenever it matches the current hid is safe.
      const data = readInitialData();
      const meta = findMangaMeta(data, hid);
      const title = (meta && meta.title) ? meta.title : titleFromDocTitle();

      let malId = null;
      let malUrl = null;
      let poster = null;
      if (meta) {
        if (meta.links && meta.links.mal) {
          malUrl = meta.links.mal;
          const mm = malUrl.match(/\/manga\/(\d+)/);
          if (mm) malId = parseInt(mm[1], 10);
        }
        if (meta.poster && meta.poster.medium) poster = meta.poster.medium;
      }

      return {
        source: SOURCE,
        sourceId: hid,
        title,
        chapterId,
        chapterNumber,
        chapterNumberStr: numStr,
        malId,
        malUrl,
        poster,
        mangaUrl: '/title/' + mangaSegment,
        detectedAt: Date.now(),
      };
    },
  };

  window.MangaChapterTracker.run(comixAdapter);
})();
