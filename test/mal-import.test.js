import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

// Provide DOMParser for Node (jsdom provides it).
const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;

import { parseMalXml } from '../src/shared/mal-import.js';

function xmlStr(content) {
  return '<?xml version="1.0" encoding="UTF-8" ?>\n<myanimelist>\n' + content + '\n</myanimelist>\n';
}

function mangaEntry(malId, title, readChapters, extra) {
  return '<manga>\n' +
    '\t<manga_mangadb_id>' + malId + '</manga_mangadb_id>\n' +
    '\t<manga_title><![CDATA[' + title + ']]></manga_title>\n' +
    '\t<manga_volumes>0</manga_volumes>\n' +
    '\t<manga_chapters>0</manga_chapters>\n' +
    '\t<my_id>0</my_id>\n' +
    '\t<my_read_volumes>0</my_read_volumes>\n' +
    '\t<my_read_chapters>' + readChapters + '</my_read_chapters>\n' +
    '\t<my_start_date>0000-00-00</my_start_date>\n' +
    '\t<my_finish_date>0000-00-00</my_finish_date>\n' +
    extra + '\n' +
    '</manga>\n';
}

describe('parseMalXml', () => {
  it('parses a single valid entry', () => {
    const xml = xmlStr(mangaEntry(12345, 'One Piece', 42, '<my_status>Reading</my_status>'));
    const entries = parseMalXml(xml);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].malId, 12345);
    assert.strictEqual(entries[0].title, 'One Piece');
    assert.strictEqual(entries[0].readChapters, 42);
    assert.strictEqual(entries[0].startDate, null);
    assert.strictEqual(entries[0].status, 'Reading');
  });

  it('parses multiple entries', () => {
    const xml = xmlStr(
      mangaEntry(1, 'Alpha', 10, '<my_status>Reading</my_status>') +
      mangaEntry(2, 'Beta', 5, '<my_status>Completed</my_status>')
    );
    const entries = parseMalXml(xml);
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[1].title, 'Beta');
    assert.strictEqual(entries[1].readChapters, 5);
    assert.strictEqual(entries[1].status, 'Completed');
  });

  it('skips entries without malId', () => {
    const xml = xmlStr(
      '<manga><manga_mangadb_id></manga_mangadb_id><manga_title>No ID</manga_title><my_read_chapters>1</my_read_chapters></manga>'
    );
    const entries = parseMalXml(xml);
    assert.strictEqual(entries.length, 0);
  });

  it('skips entries without title', () => {
    const xml = xmlStr(
      '<manga><manga_mangadb_id>123</manga_mangadb_id><manga_title></manga_title><my_read_chapters>1</my_read_chapters></manga>'
    );
    const entries = parseMalXml(xml);
    assert.strictEqual(entries.length, 0);
  });

  it('handles readChapters of 0', () => {
    const xml = xmlStr(mangaEntry(99, 'Zero', 0, ''));
    const entries = parseMalXml(xml);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].readChapters, 0);
  });

  it('handles CDATA titles with special characters', () => {
    const xml = xmlStr(mangaEntry(42, 'Evil & <test>', 1, ''));
    const entries = parseMalXml(xml);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].title, 'Evil & <test>');
  });

  it('parses startDate when not 0000-00-00', () => {
    const xml = xmlStr(
      '<manga><manga_mangadb_id>1</manga_mangadb_id><manga_title>T</manga_title><my_read_chapters>1</my_read_chapters><my_start_date>2026-01-15</my_start_date></manga>'
    );
    const entries = parseMalXml(xml);
    assert.strictEqual(entries[0].startDate, '2026-01-15');
  });

  it('handles empty XML gracefully', () => {
    const entries = parseMalXml('<root></root>');
    assert.strictEqual(entries.length, 0);
  });

  it('throws on invalid XML', () => {
    assert.throws(() => parseMalXml('not xml<<>>'));
  });
});
