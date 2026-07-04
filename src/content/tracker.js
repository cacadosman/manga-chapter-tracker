// Generic content tracker. Loaded first in the manifest content_scripts js
// array. Exposes window.MangaChapterTracker.run(adapter) which the site-
// specific adapter file (loaded after this) invokes.
(() => {
  'use strict';

  window.MangaChapterTracker = {
    run(adapter) {
      let lastPath = location.pathname;
      let timer = null;
      let lastKey = '';

      async function saveIfNeeded() {
        try {
          const { tracker } = await chrome.storage.local.get('tracker');
          const autoTrack = tracker && tracker.settings ? tracker.settings.autoTrack : true;
          if (autoTrack === false) return;

          const info = adapter.extract();
          if (!info) return;

          const key = info.source + '|' + info.sourceId + '|' + info.chapterId;
          if (key === lastKey) return;
          lastKey = key;

          await chrome.runtime.sendMessage({ type: 'SAVE_CHAPTER', data: info });
        } catch (e) {
          // Service worker may be starting up; ignore.
        }
      }

      function onChanged() {
        clearTimeout(timer);
        timer = setTimeout(saveIfNeeded, 300);
      }

      // SPA navigation detection: content scripts cannot reliably monkey-patch
      // history.pushState, so we poll location.pathname instead.
      setInterval(() => {
        if (location.pathname !== lastPath) {
          lastPath = location.pathname;
          onChanged();
        }
      }, 700);

      setTimeout(saveIfNeeded, 500);
    },
  };
})();
