import { describe, it } from 'node:test';
import assert from 'node:assert';

// Pure pagination math extracted from popup.js render() logic.
// These replicate the exact algorithm used in the popup.

const PER_PAGE = 5;

function computePaginated(list, page) {
  const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const clamped = Math.min(Math.max(page, 1), totalPages);
  const start = (clamped - 1) * PER_PAGE;
  const items = list.slice(start, start + PER_PAGE);
  const from = (clamped - 1) * PER_PAGE + 1;
  const to = Math.min(clamped * PER_PAGE, list.length);
  return { items, page: clamped, totalPages, from, to, total: list.length };
}

describe('pagination', () => {
  const makeList = (n) => Array.from({ length: n }, (_, i) => ({ key: 'm' + i, title: 'Item ' + i }));

  describe('basics', () => {
    it('returns 5 items on page 1 from 10 items', () => {
      const r = computePaginated(makeList(10), 1);
      assert.strictEqual(r.items.length, 5);
      assert.strictEqual(r.page, 1);
      assert.strictEqual(r.totalPages, 2);
      assert.strictEqual(r.from, 1);
      assert.strictEqual(r.to, 5);
    });

    it('returns last 5 items on page 2 from 10 items', () => {
      const r = computePaginated(makeList(10), 2);
      assert.strictEqual(r.items.length, 5);
      assert.strictEqual(r.from, 6);
      assert.strictEqual(r.to, 10);
    });

    it('last page has fewer items', () => {
      const r = computePaginated(makeList(7), 2);
      assert.strictEqual(r.items.length, 2);
      assert.strictEqual(r.from, 6);
      assert.strictEqual(r.to, 7);
    });

    it('single page', () => {
      const r = computePaginated(makeList(3), 1);
      assert.strictEqual(r.items.length, 3);
      assert.strictEqual(r.totalPages, 1);
    });

    it('exactly 5 items = 1 page', () => {
      const r = computePaginated(makeList(5), 1);
      assert.strictEqual(r.items.length, 5);
      assert.strictEqual(r.totalPages, 1);
    });

    it('exactly 6 items = 2 pages', () => {
      const r = computePaginated(makeList(6), 2);
      assert.strictEqual(r.items.length, 1);
      assert.strictEqual(r.totalPages, 2);
    });
  });

  describe('boundary clamping', () => {
    it('clamps page 0 to page 1', () => {
      const r = computePaginated(makeList(10), 0);
      assert.strictEqual(r.page, 1);
    });

    it('clamps negative page to page 1', () => {
      const r = computePaginated(makeList(10), -5);
      assert.strictEqual(r.page, 1);
    });

    it('clamps page beyond total to last page', () => {
      const r = computePaginated(makeList(10), 99);
      assert.strictEqual(r.page, 2);
    });
  });

  describe('delete-on-last-page edge case', () => {
    it('after deleting last item the page auto-clamps', () => {
      // Simulate: 6 items, on page 2 (1 item). Delete that item → 5 items remaining.
      // currentPage was 2, now totalPages is 1. Should clamp to page 1.
      const r = computePaginated(makeList(5), 2);
      assert.strictEqual(r.page, 1);
      assert.strictEqual(r.totalPages, 1);
    });
  });
});
