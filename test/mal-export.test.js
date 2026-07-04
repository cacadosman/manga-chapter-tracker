import { describe, it } from 'node:test';
import assert from 'node:assert';

import { buildMalXml } from '../src/shared/mal-export.js';

describe('buildMalXml', () => {
  const stateWithEntry = (maxChapter, malId, title, firstReadAt) => ({
    manga: {
      'comix.to:nxy5': { source: 'comix.to', sourceId: 'nxy5', title, malId, maxChapter, firstReadAt: firstReadAt || (new Date('2026-01-02')).getTime() },
    },
    settings: { autoTrack: true, malUserName: 'testuser' },
  });

  it('wraps title in CDATA', () => {
    const xml = buildMalXml(stateWithEntry(1, null, 'Test Manga'));
    assert.match(xml, /<manga_title><!\[CDATA\[Test Manga\]\]><\/manga_title>/);
  });

  it('sets update_on_import to 1', () => {
    const xml = buildMalXml(stateWithEntry(1, null, 'X'));
    assert.match(xml, /<update_on_import>1<\/update_on_import>/);
  });

  it('includes malId when present', () => {
    const xml = buildMalXml(stateWithEntry(24, 186597, 'JJK'));
    assert.match(xml, /<manga_mangadb_id>186597<\/manga_mangadb_id>/);
  });

  it('uses 0 for missing malId', () => {
    const xml = buildMalXml(stateWithEntry(1, null, 'NoMAL'));
    assert.match(xml, /<manga_mangadb_id>0<\/manga_mangadb_id>/);
  });

  it('floors my_read_chapters to integer', () => {
    const xml = buildMalXml(stateWithEntry(15.5, null, 'Decimal'));
    assert.match(xml, /<my_read_chapters>15<\/my_read_chapters>/);
  });

  it('uses correct my_start_date', () => {
    const xml = buildMalXml(stateWithEntry(5, null, 'Dated', new Date('2025-12-05').getTime()));
    assert.match(xml, /<my_start_date>2025-12-05<\/my_start_date>/);
  });

  it('uses 0000-00-00 when no firstReadAt', () => {
    // Pass 0 as firstReadAt to trigger the falsy path (0 is falsy in malDate).
    const st = {
      manga: { 'a': { title: 'NoDate', maxChapter: 1, firstReadAt: 0 } },
      settings: { malUserName: 'testuser' },
    };
    const xml = buildMalXml(st);
    assert.match(xml, /<my_start_date>0000-00-00<\/my_start_date>/);
  });

  it('escapes CDATA with ]]> inside titles', () => {
    const xml = buildMalXml(stateWithEntry(1, null, 'Evil]]>Title'));
    // escapeCdata replaces ]]> with ]]]]><![CDATA[> so CDATA becomes ...]]]]><![CDATA[>...
    assert.match(xml, /<manga_title><!\[CDATA\[Evil\]\]\]\]><!\[CDATA\[>Title\]\]><\/manga_title>/);
  });

  it('sorts manga by title', () => {
    const state = {
      manga: {
        'a': { title: 'Zen Manga', maxChapter: 1 },
        'b': { title: 'Alpha Manga', maxChapter: 2 },
      },
      settings: {},
    };
    const xml = buildMalXml(state);
    const a = xml.indexOf('Alpha');
    const z = xml.indexOf('Zen');
    assert.ok(a < z, 'Alpha should come before Zen');
  });

  it('handles empty manga list', () => {
    const xml = buildMalXml({ manga: {}, settings: {} });
    assert.match(xml, /<user_total_manga>0<\/user_total_manga>/);
    assert.match(xml, /<user_total_reading>0<\/user_total_reading>/);
    assert.doesNotMatch(xml, /<manga>/);
  });

  it('returns valid XML structure', () => {
    const xml = buildMalXml(stateWithEntry(42, 999, 'Valid Manga'));
    assert.match(xml, /^<\?xml/);
    assert.match(xml, /<myanimelist>/);
    assert.match(xml, /<myinfo>/);
    assert.match(xml, /<\/myanimelist>\n$/);
  });

  it('handles missing settings ', () => {
    const xml = buildMalXml({ manga: { 'a': { title: 'X', maxChapter: 1 } } });
    assert.match(xml, /<user_name><!\[CDATA\[\]\]><\/user_name>/);
  });
});
