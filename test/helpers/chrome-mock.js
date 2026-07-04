// Shared mock for chrome.* APIs used by storage, background, content tracker, and popup tests.
// Everything is in-memory.

export function createChromeMock() {
  const mem = {};

  const storageLocal = {
    async get(keys) {
      const out = {};
      for (const k of [].concat(keys)) {
        out[k] = mem[k] !== undefined ? structuredClone(mem[k]) : undefined;
      }
      return out;
    },
    async set(items) {
      Object.assign(mem, structuredClone(items));
    },
    async remove(keys) { for (const k of [].concat(keys)) delete mem[k]; },
    async clear() { for (const k of Object.keys(mem)) delete mem[k]; },
    _mem: mem,
    _reset() { for (const k of Object.keys(mem)) delete mem[k]; },
  };

  let onMessageFn = null;
  let onInstalledFn = null;

  const runtime = {
    onMessage: {
      addListener(fn) { onMessageFn = fn; },
    },
    sendMessage(msg, cb) {
      if (!onMessageFn) {
        if (cb) cb({ ok: false, error: 'no listener' });
        return;
      }
      // onMessageFn returns true for async; the callback (sendResponse) is called later.
      // Some messages call sendResponse synchronously from the listener,
      // some call it asynchronously. We simulate by resolving on microtask.
      onMessageFn(msg, null, (resp) => {
        if (cb) cb(resp);
      });
    },
    onInstalled: {
      addListener(fn) { onInstalledFn = fn; },
      async _fire() {
        if (onInstalledFn) await onInstalledFn();
      },
    },
  };

  let badgeText = '';
  let badgeColor = '';
  const action = {
    async setBadgeText({ text }) { badgeText = text; },
    async setBadgeBackgroundColor({ color }) { badgeColor = color; },
    _badgeText: () => badgeText,
    _badgeColor: () => badgeColor,
  };

  let downloadArgs = null;
  const downloads = {
    async download(opts) { downloadArgs = opts; return 1; },
    _lastDownload: () => downloadArgs,
  };

  return {
    storage: { local: storageLocal },
    runtime,
    action,
    downloads,
  };
}
