import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createChromeMock } from './helpers/chrome-mock.js';
import fs from 'fs';
import path from 'path';

const bgSrc = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'background.js'), 'utf8');
const storageSrc = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'shared', 'storage.js'), 'utf8');

function loadBackground(chrome) {
  const inlineStorage = storageSrc
    .replace(/^import .*$/m, 'const STORE_KEY="tracker"; const HISTORY_CAP=10;')
    .replace(/export /g, '')
    .replace(/async function getState/, 'async function getState_background')
    .replace(/getState\(\)/g, 'getState_background()')
    // Avoid name conflicts: rename the top-level functions
    .replace(/async function saveChapter/, 'async function saveChapter_bg')
    .replace(/saveChapter\(/g, 'saveChapter_bg(')
    .replace(/async function setChapter/, 'async function setChapter_bg')
    .replace(/async function deleteManga/, 'async function deleteManga_bg')
    .replace(/deleteManga\(/g, 'deleteManga_bg(')
    .replace(/async function clearAll/, 'async function clearAll_bg')
    .replace(/clearAll\(/g, 'clearAll_bg(')
    .replace(/async function setSetting/, 'async function setSetting_bg')
    .replace(/setSetting\(/g, 'setSetting_bg(')
    .replace(/async function replaceState/, 'async function replaceState_bg')
    .replace(/replaceState\(/g, 'replaceState_bg(')
    .replace(/async function setMalId/, 'async function setMalId_bg')
    .replace(/setMalId\(/g, 'setMalId_bg(')
    .replace(/async function markLookedUp/, 'async function markLookedUp_bg')
    .replace(/markLookedUp\(/g, 'markLookedUp_bg(')
    .replace(/async function setState/, 'async function setState_bg')
    .replace(/setState\(/g, 'setState_bg(')
    .replace(/async function mangaKey/, 'function mangaKey_bg')
    .replace(/mangaKey\(/g, 'mangaKey_bg(');

  const msgDef = 'const MSG = { SAVE_CHAPTER: "SAVE_CHAPTER", GET_STATE: "GET_STATE", SET_CHAPTER: "SET_CHAPTER", SET_MAL_ID: "SET_MAL_ID", DELETE_MANGA: "DELETE_MANGA", CLEAR_ALL: "CLEAR_ALL", SET_SETTING: "SET_SETTING", REPLACE_STATE: "REPLACE_STATE" };';

  const code = bgSrc
    .replace(/^import { MSG }.*$/m, msgDef)
    .replace(/^import \* as storage.*$/m, 'const storage = (() => {\n' + inlineStorage + '\nreturn { getState: getState_background, setState: setState_bg, mangaKey: mangaKey_bg, saveChapter: saveChapter_bg, setChapter: setChapter_bg, setMalId: setMalId_bg, markLookedUp: markLookedUp_bg, deleteManga: deleteManga_bg, clearAll: clearAll_bg, setSetting: setSetting_bg, replaceState: replaceState_bg };\n})();')
    .replace(/^import \* as jikan.*$/m, 'const jikan = { async lookupByTitle() { return null; } };');

  new Function('chrome', code)(chrome);
}

const ts = (n) => 1700000000000 + n * 1000;

describe('background message routing', () => {
  let chrome;

  beforeEach(() => {
    chrome = createChromeMock();
    loadBackground(chrome);
  });

  async function dispatch(type, payload = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, ...payload }, (resp) => resolve(resp));
    });
  }

  it('SAVE_CHAPTER creates manga and returns ok', async () => {
    const resp = await dispatch('SAVE_CHAPTER', { data: { source: 'comix.to', sourceId: 'nxy5', title: 'JJK', chapterId: 'c1', chapterNumber: 1, detectedAt: ts(1) } });
    assert.ok(resp.ok);
    assert.strictEqual(chrome.storage.local._mem.tracker.manga['comix.to:nxy5'].title, 'JJK');
    assert.strictEqual(chrome.action._badgeText(), '1');
  });

  it('GET_STATE returns tracker', async () => {
    const resp = await dispatch('GET_STATE');
    assert.ok(resp.ok);
    assert.deepStrictEqual(resp.tracker.manga, {});
  });

  it('SET_CHAPTER updates maxChapter', async () => {
    await dispatch('SAVE_CHAPTER', { data: { source: 'comix.to', sourceId: 'nxy5', chapterId: 'c10', chapterNumber: 10, detectedAt: ts(10) } });
    await dispatch('SAVE_CHAPTER', { data: { source: 'comix.to', sourceId: 'nxy5', chapterId: 'c30', chapterNumber: 30, detectedAt: ts(30) } });
    const resp = await dispatch('SET_CHAPTER', { key: 'comix.to:nxy5', chapterNumber: 10 });
    assert.ok(resp.ok);
    const mem = chrome.storage.local._mem.tracker;
    assert.strictEqual(mem.manga['comix.to:nxy5'].maxChapter, 10);
    assert.strictEqual('c30' in mem.manga['comix.to:nxy5'].readChapters, false);
  });

  it('DELETE_MANGA removes entry', async () => {
    await dispatch('SAVE_CHAPTER', { data: { source: 'comix.to', sourceId: 'delme', chapterId: 'c1', chapterNumber: 1, detectedAt: ts(1) } });
    // Flush any pending Jikan lookup microtasks before deleting.
    await new Promise((r) => setTimeout(r, 50));
    const resp = await dispatch('DELETE_MANGA', { key: 'comix.to:delme' });
    assert.ok(resp.ok);
    assert.strictEqual(chrome.storage.local._mem.tracker.manga['comix.to:delme'], undefined);
    assert.strictEqual(chrome.action._badgeText(), '');
  });

  it('CLEAR_ALL empties manga', async () => {
    await dispatch('SAVE_CHAPTER', { data: { source: 'comix.to', sourceId: 'a', chapterId: 'c1', chapterNumber: 1, detectedAt: ts(1) } });
    await dispatch('SAVE_CHAPTER', { data: { source: 'comix.to', sourceId: 'b', chapterId: 'c1', chapterNumber: 1, detectedAt: ts(1) } });
    const resp = await dispatch('CLEAR_ALL');
    assert.ok(resp.ok);
    assert.strictEqual(Object.keys(chrome.storage.local._mem.tracker.manga).length, 0);
  });

  it('SET_SETTING stores a value', async () => {
    const resp = await dispatch('SET_SETTING', { key: 'malUserName', value: 'test' });
    assert.ok(resp.ok);
    assert.strictEqual(chrome.storage.local._mem.tracker.settings.malUserName, 'test');
  });

  it('REPLACE_STATE replaces everything', async () => {
    const resp = await dispatch('REPLACE_STATE', { tracker: { manga: { 'x:y': { title: 'R' } }, settings: { autoTrack: false } } });
    assert.ok(resp.ok);
    assert.ok(chrome.storage.local._mem.tracker.manga['x:y']);
    assert.strictEqual(chrome.storage.local._mem.tracker.settings.autoTrack, false);
  });

  it('returns error for unknown message type', async () => {
    const resp = await dispatch('UNKNOWN_TYPE');
    assert.strictEqual(resp.ok, false);
    assert.strictEqual(resp.error, 'unknown_type');
  });

  it('returns error for falsy/null message', async () => {
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage(null, resolve);
    });
    assert.strictEqual(resp.ok, false);
  });

  it('onInstalled fires and badge reflects current state', async () => {
    await dispatch('SAVE_CHAPTER', { data: { source: 'comix.to', sourceId: 'x', chapterId: 'c1', chapterNumber: 1, detectedAt: ts(1) } });
    // Fire the installed listener and wait for it to complete
    await chrome.runtime.onInstalled._fire();
    assert.strictEqual(chrome.action._badgeText(), '1');
  });
});
