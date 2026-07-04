import { MSG } from './shared/constants.js';
import * as storage from './shared/storage.js';

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
        case MSG.SAVE_CHAPTER:
          await storage.saveChapter(msg.data);
          await refreshBadge();
          sendResponse({ ok: true });
          break;
        case MSG.GET_STATE:
          sendResponse({ ok: true, tracker: await storage.getState() });
          break;
        case MSG.SET_CHAPTER:
          await storage.setChapter(msg.key, msg.chapterNumber);
          sendResponse({ ok: true });
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
