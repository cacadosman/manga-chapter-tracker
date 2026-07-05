import { MSG } from '../src/shared/constants.js';
import { buildMalXml } from '../src/shared/mal-export.js';
import { parseMalXml } from '../src/shared/mal-import.js';
import { timeAgo, formatNum, escapeHtml, escapeAttr, stamp } from '../src/shared/util.js';

const $ = (sel) => document.querySelector(sel);

let currentState = { manga: {}, settings: { autoTrack: true } };
let expandedKey = null;
let currentPage = 1;
const PER_PAGE = 5;

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => resolve(resp || { ok: false }));
  });
}

async function refresh() {
  const resp = await send({ type: MSG.GET_STATE });
  if (resp && resp.ok && resp.tracker) {
    currentState = resp.tracker;
  }
  render();
}

function render() {
  const settings = currentState.settings || {};
  const manga = currentState.manga || {};

  $('#subtitle').textContent = Object.keys(manga).length + ' manga tracked';
  $('#autoToggle').checked = settings.autoTrack !== false;
  $('#malToggle').checked = settings.lookupMalIds !== false;
  $('#footStat').textContent = Object.keys(manga).length + ' entries';

  const q = ($('#searchInput').value || '').trim().toLowerCase();
  const list = Object.values(manga)
    .filter((m) => !q || (m.title || '').toLowerCase().includes(q))
    .sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));

  const container = $('#list');
  if (Object.keys(manga).length === 0) {
    container.innerHTML =
      '<div class="empty"><div class="big">\uD83D\uDCD6</div>' +
      '<strong>No chapters tracked yet</strong><br />' +
      'Open and read a chapter on a supported site &mdash; it will be saved automatically.</div>';
    $('#pager').innerHTML = '';
    return;
  }
  if (list.length === 0) {
    container.innerHTML = '<div class="empty">No matches.</div>';
    $('#pager').innerHTML = '';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * PER_PAGE;
  const pageItems = list.slice(start, start + PER_PAGE);

  const parts = pageItems.map((m) => {
    const readCount = Object.keys(m.readChapters || {}).length;
    const thumb = m.poster
      ? '<img class="thumb" src="' + escapeAttr(m.poster) + '" alt="" />'
      : '<div class="thumb-fallback">' + escapeHtml((m.title || '?').charAt(0).toUpperCase()) + '</div>';
    const malBadge = m.malId
      ? '<span class="badge mal" title="MyAnimeList id ' + m.malId + '">MAL</span>'
      : '<span class="badge nomal" title="No MyAnimeList link">no MAL</span>';
    const isExpanded = expandedKey === m.key;
    return (
      '<div class="card' + (isExpanded ? ' expanded' : '') + '" data-key="' + escapeAttr(m.key) + '">' +
        '<div class="card-head">' +
          thumb +
          '<div class="meta clickable">' +
            '<div class="title-row"><span class="t">' + escapeHtml(m.title || 'Unknown') + '</span>' + malBadge + '</div>' +
            '<div class="sub">Up to <span class="chap">Ch.' + escapeHtml(formatNum(m.maxChapter)) + '</span> &middot; ' + readCount + ' read &middot; ' + timeAgo(m.lastReadAt) + '</div>' +
          '</div>' +
          '<button class="icon-btn edit" title="Edit chapter" aria-label="Edit chapter">&#9998;</button>' +
          '<button class="icon-btn del" title="Remove" aria-label="Remove">&times;</button>' +
        '</div>' +
        (isExpanded ? renderDetail(m) : '') +
      '</div>'
    );
  });
  container.innerHTML = parts.join('');

  renderPager(currentPage, totalPages, list.length);

  container.querySelectorAll('.card').forEach((card) => {
    const key = card.getAttribute('data-key');

    card.querySelector('.meta.clickable').addEventListener('click', () => {
      expandedKey = (expandedKey === key) ? null : key;
      render();
    });

    card.querySelector('.icon-btn.edit').addEventListener('click', (e) => {
      e.stopPropagation();
      expandedKey = key;
      render();
      const input = card.querySelector('.chap-input');
      if (input) { input.focus(); input.select(); }
    });

    card.querySelector('.icon-btn.del').addEventListener('click', async (e) => {
      e.stopPropagation();
      await send({ type: MSG.DELETE_MANGA, key });
      if (expandedKey === key) expandedKey = null;
      toast('Removed', 'ok');
      refresh();
    });

    card.querySelectorAll('.hist-set').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const num = btn.getAttribute('data-num');
        await send({ type: MSG.SET_CHAPTER, key, chapterNumber: num });
        toast('Set to Ch.' + formatNum(num), 'ok');
        refresh();
      });
    });

    const saveBtn = card.querySelector('.chap-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const input = card.querySelector('.chap-input');
        const raw = (input.value || '').trim();
        const val = parseFloat(raw);
        if (raw === '' || !isFinite(val) || val < 0) { toast('Enter a valid number', 'err'); return; }
        await send({ type: MSG.SET_CHAPTER, key, chapterNumber: val });
        toast('Saved Ch.' + formatNum(val), 'ok');
        refresh();
      });
    }
    const cancelBtn = card.querySelector('.chap-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        expandedKey = null;
        render();
      });
    }
    const input = card.querySelector('.chap-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveBtn.click(); }
        else if (e.key === 'Escape') { e.preventDefault(); expandedKey = null; render(); }
      });
    }

    // MAL ID save/clear.
    const malSave = card.querySelector('.mal-save');
    if (malSave) {
      malSave.addEventListener('click', async (e) => {
        e.stopPropagation();
        const malInput = card.querySelector('.mal-input');
        const raw = (malInput.value || '').trim();
        const val = parseInt(raw, 10);
        if (raw !== '' && (!isFinite(val) || val < 0)) { toast('Enter a valid MAL ID or 0', 'err'); return; }
        await send({ type: MSG.SET_MAL_ID, key, malId: val || 0 });
        toast('MAL ID saved', 'ok');
        refresh();
      });
    }
    const malClear = card.querySelector('.mal-clear');
    if (malClear) {
      malClear.addEventListener('click', (e) => {
        e.stopPropagation();
        card.querySelector('.mal-input').value = '0';
        malSave.click();
      });
    }
  });
}

function renderPager(page, totalPages, totalItems) {
  const pager = $('#pager');
  if (totalPages <= 1) {
    pager.innerHTML = '<span class="pager-info">' + totalItems + ' item' + (totalItems !== 1 ? 's' : '') + '</span>';
    return;
  }
  const from = (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, totalItems);
  pager.innerHTML =
    '<button class="pager-btn" data-action="prev"' + (page <= 1 ? ' disabled' : '') + '>&lsaquo; Prev</button>' +
    '<span class="pager-info">' + from + '-' + to + ' of ' + totalItems + ' &middot; page ' + page + '/' + totalPages + '</span>' +
    '<button class="pager-btn" data-action="next"' + (page >= totalPages ? ' disabled' : '') + '>Next &rsaquo;</button>';

  pager.querySelector('[data-action="prev"]').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; render(); }
  });
  pager.querySelector('[data-action="next"]').addEventListener('click', () => {
    if (currentPage < totalPages) { currentPage++; render(); }
  });
}

function renderDetail(m) {
  const history = Array.isArray(m.history) ? m.history : [];
  const histHtml = history.length > 0
    ? history.map((h) =>
        '<div class="hist-item">' +
          '<span class="hist-chap">Ch.' + escapeHtml(formatNum(h.number)) + '</span>' +
          '<span class="hist-time">' + escapeHtml(timeAgo(h.readAt)) + '</span>' +
          '<button class="hist-set" data-num="' + escapeAttr(h.number) + '" title="Set as current chapter">set</button>' +
        '</div>'
      ).join('')
    : '<div class="hist-empty">No chapter history yet.</div>';

  const malVal = m.malId || 0;
  const sources = Array.isArray(m.sources) && m.sources.length > 0 ? m.sources : [m.source].filter(Boolean);
  const sourcesStr = sources.join(', ');

  return (
    '<div class="detail">' +
      '<div class="detail-section">' +
        '<div class="detail-label">Set current chapter</div>' +
        '<div class="edit-row">' +
          '<input type="number" class="chap-input" min="0" step="any" value="' + escapeAttr(formatNum(m.maxChapter)) + '" placeholder="e.g. 10" />' +
          '<button class="btn-sm chap-save">Save</button>' +
          '<button class="btn-sm ghost chap-cancel">Cancel</button>' +
        '</div>' +
        '<div class="edit-hint">Rolls back and deletes any chapters read above this value.</div>' +
      '</div>' +
      '<div class="detail-section">' +
        '<div class="detail-label">MyAnimeList ID</div>' +
        '<div class="edit-row">' +
          '<input type="number" class="mal-input" min="0" step="1" value="' + escapeAttr(String(malVal)) + '" placeholder="MAL id" />' +
          '<button class="btn-sm mal-save">Save</button>' +
          '<button class="btn-sm ghost mal-clear">Clear</button>' +
        '</div>' +
        '<div class="edit-hint">Matching MAL ID ensures import links to your list. 0 = skipped on import.</div>' +
      '</div>' +
      '<div class="detail-section">' +
        '<div class="detail-label">Sources</div>' +
        '<div class="edit-row"><span class="edit-hint">' + escapeHtml(sourcesStr) + '</span></div>' +
      '</div>' +
      '<div class="detail-section">' +
        '<div class="detail-label">History <span class="muted-count">(' + history.length + ')</span></div>' +
        '<div class="hist-list">' + histHtml + '</div>' +
      '</div>' +
    '</div>'
  );
}

function toast(msg, kind) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

async function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs: true });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('#autoToggle').addEventListener('change', async (e) => {
    await send({ type: MSG.SET_SETTING, key: 'autoTrack', value: e.target.checked });
    toast(e.target.checked ? 'Tracking on' : 'Tracking paused', e.target.checked ? 'ok' : '');
  });

  $('#malToggle').addEventListener('change', async (e) => {
    await send({ type: MSG.SET_SETTING, key: 'lookupMalIds', value: e.target.checked });
    toast(e.target.checked ? 'MAL lookup on' : 'MAL lookup off', e.target.checked ? 'ok' : '');
  });

  $('#btnExport').addEventListener('click', async () => {
    const manga = currentState.manga || {};
    const total = Object.keys(manga).length;
    if (total === 0) { toast('Nothing to export yet', 'err'); return; }
    const withMal = Object.values(manga).filter((m) => m.malId).length;
    const xml = buildMalXml(currentState);
    try {
      await downloadBlob(xml, 'manga-mal-export_' + stamp() + '.xml', 'application/xml;charset=utf-8');
      toast('Exported ' + total + ' titles (' + withMal + ' MAL-linked)', 'ok');
    } catch (e) {
      toast('Export failed', 'err');
    }
  });

  $('#btnBackup').addEventListener('click', async () => {
    const json = JSON.stringify(currentState, null, 2);
    try {
      await downloadBlob(json, 'manga-tracker-backup_' + stamp() + '.json', 'application/json');
      toast('Backup downloaded', 'ok');
    } catch (e) {
      toast('Backup failed', 'err');
    }
  });

  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !parsed.manga) {
        throw new Error('Not a valid tracker backup');
      }
      if (!parsed.settings) parsed.settings = { autoTrack: true, siteFilter: 'all' };
      await send({ type: MSG.REPLACE_STATE, tracker: parsed });
      toast('Backup restored', 'ok');
      refresh();
    } catch (err) {
      toast('Invalid backup file', 'err');
    } finally {
      e.target.value = '';
    }
  });

  // Import from MyAnimeList XML
  $('#btnImportMal').addEventListener('click', () => $('#fileImportMal').click());
  $('#fileImportMal').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const entries = parseMalXml(text);
      if (!entries || !entries.length) throw new Error('No entries found');
      const resp = await send({ type: MSG.IMPORT_MAL, entries });
      if (resp && resp.ok && resp.stats) {
        const s = resp.stats;
        toast('Imported ' + s.total + ' entries (' + s.added + ' new, ' + s.updated + ' updated)', 'ok');
      } else {
        toast('Import failed', 'err');
      }
      refresh();
    } catch (err) {
      toast('Invalid MAL XML file', 'err');
    } finally {
      e.target.value = '';
    }
  });

  $('#btnClear').addEventListener('click', async () => {
    if (Object.keys(currentState.manga || {}).length === 0) { toast('Already empty', ''); return; }
    if (!confirm('Delete ALL tracked manga? This cannot be undone.')) return;
    await send({ type: MSG.CLEAR_ALL });
    toast('Cleared', 'ok');
    refresh();
  });

  $('#searchInput').addEventListener('input', () => {
    currentPage = 1;
    render();
  });

  refresh();
});
