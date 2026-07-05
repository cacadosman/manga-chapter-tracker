import { MSG } from './shared/constants.js';
import * as storage from './shared/storage.js';
import * as jikan from './shared/jikan.js';
import { importFromMal } from './shared/mal-import.js';

async function refreshBadge() {
  const tracker = await storage.getState();
  const count = Object.keys(tracker.manga).length;
  try {
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
  } catch (e) {
    // action API unavailable in some contexts; ignore.
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || !msg.type) {
        sendResponse({ ok: false });
        return;
      }

      switch (msg.type) {
        case MSG.SAVE_CHAPTER: {
          const { isNew, entry } = await storage.saveChapter(msg.data);
          await refreshBadge();
          sendResponse({ ok: true });
          // If this is a new entry without a MAL ID, try Jikan lookup.
          if (isNew && !entry.malId && (entry.malLookedUp !== true)) {
            const tracker = await storage.getState();
            const lookupEnabled = tracker.settings.lookupMalIds !== false;
            if (lookupEnabled) {
              try {
                const result = await jikan.lookupByTitle(entry.title);
                if (result && !result.retry && result.malId) {
                  await storage.setMalId(entry.key, result.malId, result.malUrl, result.poster);
                } else if (result && result.retry) {
                  // Rate limited; leave malLookedUp=false for retry next time.
                } else {
                  await storage.markLookedUp(entry.key);
                }
              } catch (e) {
                // Jikan unavailable; leave malLookedUp=false for retry next time.
              }
            }
          }
          break;
        }
        case MSG.GET_STATE:
          sendResponse({ ok: true, tracker: await storage.getState() });
          break;
        case MSG.SET_CHAPTER:
          await storage.setChapter(msg.key, msg.chapterNumber);
          sendResponse({ ok: true });
          break;
        case MSG.SET_MAL_ID:
          await storage.setMalId(msg.key, msg.malId, msg.malUrl);
          sendResponse({ ok: true });
          break;
        case MSG.IMPORT_MAL:
          if (!msg.entries || !Array.isArray(msg.entries)) {
            sendResponse({ ok: false, error: 'invalid_entries' });
          } else {
            const stats = await importFromMal(msg.entries);
            await refreshBadge();
            sendResponse({ ok: true, stats });
          }
          break;
        case MSG.DELETE_MANGA:
          await storage.deleteManga(msg.key);
          await refreshBadge();
          sendResponse({ ok: true });
          break;
        case MSG.CLEAR_ALL:
          await storage.clearAll();
          await refreshBadge();
          sendResponse({ ok: true });
          break;
        case MSG.SET_SETTING:
          await storage.setSetting(msg.key, msg.value);
          sendResponse({ ok: true });
          break;
        case MSG.REPLACE_STATE:
          await storage.replaceState(msg.tracker);
          await refreshBadge();
          sendResponse({ ok: true });
          break;
        default:
          sendResponse({ ok: false, error: 'unknown_type' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // keep the message channel open for async sendResponse
});

chrome.runtime.onInstalled.addListener(async () => {
  await refreshBadge();
});
