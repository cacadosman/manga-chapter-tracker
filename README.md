# Manga Chapter Tracker

A Chrome extension that automatically tracks manga, manhwa, and manhua chapters as you read them, then exports your list to a [MyAnimeList](https://myanimelist.net/)-compatible manga list XML for easy import.

## Why?

Manga reading sites can go down or disappear overnight, taking your reading progress with them. If you forgot to back up from the website before it's gone, that data is lost. This extension keeps a local copy of every title and chapter you read, so your progress is always safe and exportable &mdash; no matter what happens to the source site.

## Features

- **Automatic tracking** — Detects when you open a chapter and records the title + chapter number. Handles both full page loads and single-page-app (SPA) navigation (e.g. clicking "Next chapter").
- **Manual chapter edit & rollback** — Accidentally clicked too far ahead? Open any manga's detail panel and roll the chapter back. Higher chapters are deleted from history so your export stays accurate.
- **Chapter history** — Each manga remembers up to 10 recently-read chapters with timestamps. Click "set" on any history entry to restore.
- **MyAnimeList XML export** — Generates a `mangalist.xml` file matching the MyAnimeList manga list import schema. When a manga has a known MAL link, its database ID is included for direct matching. All entries have `update_on_import=1` so MAL actually processes them.
- **JSON backup & restore** — Download a full backup of your tracked data and restore it on any machine.
- **Multi-site support** — Tracks manga across multiple sites. Entries sharing the same MyAnimeList ID are automatically merged into one, combining reading history from all sources. Designed to add more sites easily via the adapter pattern.
- **MyAnimeList ID lookup** — When a manga from MangaFire or other sites without embedded MAL links is first tracked, the extension optionally queries the free [Jikan API](https://jikan.moe) to find its MyAnimeList ID. Can be disabled in settings.
- **Paginated list** — Shows 5 manga per page with prev/next navigation, so the popup stays fast even with hundreds of tracked titles.
- **100% local storage** — All reading data lives in your browser via `chrome.storage.local`. No accounts or servers.

## Supported sites

| Site | URL | MAL link |
|------|-----|----------|
| Comix.to | `https://comix.to/` | Embedded in page data |
| MangaFire | `https://mangafire.to/` | Jikan API lookup |

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome (or any Chromium browser).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder.
5. The extension icon appears in your toolbar. Open a chapter on a supported site and it will be tracked automatically.

## Usage

### Automatic tracking
Just read. When you open any chapter page, the extension extracts the manga title and chapter number and saves it. A badge on the extension icon shows how many manga you're tracking. Toggle auto-tracking off via the switch in the popup header if you want to pause.

### View & edit history
Click the extension icon to open the popup. The list shows 5 manga per page &mdash; use the **Prev/Next** buttons or the search box to navigate. Click any manga card to expand its detail panel:
- **Set current chapter** — Type a number and hit Save to roll back. Any chapters above that number are removed from history.
- **History** — Up to 10 recently-read chapters with timestamps. Click "set" on any entry to jump back to that chapter. Useful when you accidentally skip ahead (e.g. you were on chapter 10, misclicked chapter 30, and want to pick up from 10 again) or when you want to re-read a specific chapter.

### Export to MyAnimeList
1. Click **Export MAL XML**.
2. Save the `.xml` file.
3. Go to MyAnimeList → [Import Data](https://myanimelist.net/import.php) → choose "MyAnimeList XML".
4. Upload the file. Entries with a known MAL ID will update your list directly.

> **Note:** Manga without a MyAnimeList link on the source site export with `manga_mangadb_id=0`. MyAnimeList will skip those entries on import.

### Backup & restore
- **Backup JSON** downloads a complete copy of your tracker data.
- **Restore** uploads a previously-saved backup, replacing current data.

## Architecture

The extension uses a **site adapter pattern** so that adding a new site requires only one new file and one manifest entry — no changes to the core logic.

```
manifest.json
icons/                      Extension icons (16/48/128px PNG)
tools/gen-icons.js          Dependency-free icon generator (node tools/gen-icons.js)
src/
  background.js             Service worker (ES module) — message router + badge
  shared/
    constants.js            Message types, storage key, site registry
    storage.js              Persistent storage (chrome.storage.local) + migration
    mal-export.js           MyAnimeList XML builder
    util.js                 Shared helpers (escaping, date formatting, etc.)
  content/
    tracker.js              Generic tracker: SPA poll loop, auto-track check
  sites/
    comix.js                Comix.to adapter: URL regex + metadata extraction
popup/
  popup.html                Popup UI
  popup.css                 Popup styles
  popup.js                  Popup logic (ES module, imports shared/)
```

### How site adapters work

Each site adapter (`src/sites/<site>.js`) exposes two methods consumed by the generic tracker (`src/content/tracker.js`):

- `matchReader(pathname)` — returns `true` if the current URL is a chapter reader page.
- `extract()` — returns `{ source, sourceId, title, chapterId, chapterNumber, malId, ... }` from the page's DOM/ embedded data, or `null` if not on a reader page.

The generic tracker handles the rest: checking the auto-track setting, deduplicating, detecting SPA navigation, and sending the data to the background service worker for storage.

### Data model

Each tracked manga is stored under a composite key `source:sourceId` (e.g. `comix.to:nxy5`):

```js
{
  source: 'comix.to',
  sourceId: 'nxy5',
  title: 'Jujutsu Kaisen Modulo',
  malId: 186597,          // MyAnimeList database ID (if known)
  malLookedUp: true,     // whether Jikan lookup has been attempted
  maxChapter: 24,         // Highest chapter read (drives MAL export)
  readChapters: { '5499060': 1, '5498894': 3, ... },
  history: [{ chapterId, number, readAt }, ...],  // newest-first, capped at 10
  firstReadAt: 1752000000000,
  lastReadAt: 1752005000000,
}
```

## Privacy

This extension:
- Stores all reading data locally in your browser (`chrome.storage.local`).
- Makes **optional** title-only lookups to the free [Jikan API](https://jikan.moe) (`api.jikan.moe`) to find MyAnimeList IDs for manga tracked from sites that don't embed MAL links. Only manga titles are sent — no reading history or personal data. This can be disabled in the popup settings.
- Collects **no analytics, telemetry, or tracking data**.
- Only runs on sites granted host permissions in the manifest.

Uninstalling the extension clears all stored data.

## Development

### Regenerate icons
```bash
node tools/gen-icons.js
```

### Add a new site
1. Create `src/sites/<site-id>.js` following the adapter contract (see `comix.js` as a template). It should call `window.MangaChapterTracker.run(adapter)`.
2. Add the site to the `SITES` array in `src/shared/constants.js`.
3. Add a `content_scripts` entry in `manifest.json` with the site's `matches` pattern.
4. Add the site's host to `host_permissions` in `manifest.json`.

No other files need to change.

## License

[MIT](LICENSE)
