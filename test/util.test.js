import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  escapeCdata, malDate, timeAgo, formatNum,
  escapeHtml, escapeAttr, stamp
} from '../src/shared/util.js';

describe('escapeCdata', () => {
  it('passes plain text unchanged', () => {
    assert.strictEqual(escapeCdata('Hello World'), 'Hello World');
  });
  it('handles null/undefined', () => {
    assert.strictEqual(escapeCdata(null), '');
    assert.strictEqual(escapeCdata(undefined), '');
  });
  it('escapes ]]>', () => {
    assert.strictEqual(escapeCdata('foo]]>bar'), 'foo]]]]><![CDATA[>bar');
  });
  it('handles empty string', () => {
    assert.strictEqual(escapeCdata(''), '');
  });
  it('coerces numbers to string', () => {
    assert.strictEqual(escapeCdata(42), '42');
  });
});

describe('malDate', () => {
  it('returns 0000-00-00 for falsy values', () => {
    assert.strictEqual(malDate(0), '0000-00-00');
    assert.strictEqual(malDate(null), '0000-00-00');
    assert.strictEqual(malDate(undefined), '0000-00-00');
  });
  it('returns 0000-00-00 for non-finite timestamps', () => {
    assert.strictEqual(malDate('invalid'), '0000-00-00');
    assert.strictEqual(malDate(NaN), '0000-00-00');
  });
  it('formats dates correctly', () => {
    // Jan 2, 2026
    assert.strictEqual(malDate(new Date('2026-01-02T00:00:00Z').getTime()), '2026-01-02');
    // Single-digit month and day: Dec 5, 2025
    const dec5 = new Date('2025-12-05T12:00:00Z').getTime();
    assert.strictEqual(malDate(dec5), '2025-12-05');
  });
});

describe('timeAgo', () => {
  it('returns empty for falsy', () => {
    assert.strictEqual(timeAgo(0), '');
    assert.strictEqual(timeAgo(null), '');
  });
  it('returns "just now" for < 60s', () => {
    assert.strictEqual(timeAgo(Date.now() - 30000), 'just now');
  });
  it('returns minutes', () => {
    assert.strictEqual(timeAgo(Date.now() - 120000), '2m ago');
  });
  it('returns hours', () => {
    assert.strictEqual(timeAgo(Date.now() - 3600000), '1h ago');
    assert.strictEqual(timeAgo(Date.now() - 7200000), '2h ago');
  });
  it('returns days', () => {
    assert.strictEqual(timeAgo(Date.now() - 86400000), '1d ago');
  });
  it('returns months', () => {
    assert.strictEqual(timeAgo(Date.now() - 86400000 * 35), '1mo ago');
  });
  it('returns years', () => {
    assert.strictEqual(timeAgo(Date.now() - 86400000 * 400), '1y ago');
  });
});

describe('formatNum', () => {
  it('formats integers as strings', () => {
    assert.strictEqual(formatNum(1), '1');
    assert.strictEqual(formatNum(42), '42');
    assert.strictEqual(formatNum(0), '0');
  });
  it('formats floats as strings', () => {
    assert.strictEqual(formatNum(15.5), '15.5');
  });
  it('returns "0" for NaN and Infinity', () => {
    assert.strictEqual(formatNum(NaN), '0');
    assert.strictEqual(formatNum(Infinity), '0');
    assert.strictEqual(formatNum(null), '0');
  });
});

describe('escapeHtml', () => {
  it('escapes all special chars', () => {
    assert.strictEqual(escapeHtml('<b>"x" & y\'s</b>'),
      '&lt;b&gt;&quot;x&quot; &amp; y&#39;s&lt;/b&gt;');
  });
  it('passes plain text', () => {
    assert.strictEqual(escapeHtml('Hello'), 'Hello');
  });
});

describe('escapeAttr', () => {
  it('is an alias for escapeHtml', () => {
    assert.strictEqual(escapeAttr('<">'), escapeHtml('<">'));
  });
});

describe('stamp', () => {
  it('returns YYYY-MM-DD', () => {
    const s = stamp();
    assert.match(s, /^\d{4}-\d{2}-\d{2}$/);
  });
});
