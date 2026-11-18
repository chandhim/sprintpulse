/*
 * SprintPulse normalizers: detect the board in a URL and convert raw Jira / Trello JSON
 * into the common item format used by the engine.
 * Item: { key, title, url, status: 'todo'|'inprogress'|'blocked'|'done', assignee, created, updated, due }
 */
(function (root) {
  'use strict';

  const DONE_RE = /(done|complete|closed|shipped|released)/i;
  const BLOCK_RE = /block/i;
  const PROGRESS_RE = /(doing|progress|review|test|qa|develop)/i;

  function detectSource(url) {
    let u;
    try { u = new URL(url); } catch (e) { return { source: 'none' }; }
    const host = u.hostname.toLowerCase();
    if (host.endsWith('.atlassian.net')) {
      const m = u.pathname.match(/\/boards\/(\d+)/) || (u.search.match(/[?&]rapidView=(\d+)/));
      if (m) return { source: 'jira', boardId: m[1], host: host };
      return { source: 'none', hint: 'jira' };
    }
    if (host === 'trello.com' || host === 'www.trello.com') {
      const m = u.pathname.match(/^\/b\/([A-Za-z0-9]+)/);
      if (m) return { source: 'trello', shortLink: m[1] };
      return { source: 'none', hint: 'trello' };
    }
    return { source: 'none' };
  }

  function jiraDueToIso(due) {
    if (!due) return null;
    // Jira "duedate" is a date only (YYYY-MM-DD): treat it as due at the end of that day.
    return /^\d{4}-\d{2}-\d{2}$/.test(due) ? due + 'T23:59:59' : due;
  }

  function isFlagged(value) {
    if (!value) return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  function jira(raw) {
    const data = raw || {};
    const base = data.baseUrl || '';
    const flaggedId = data.flaggedFieldId;
    const items = (data.issues || []).map(function (issue) {
      const f = issue.fields || {};
      const statusName = (f.status && f.status.name) || '';
      const category = (f.status && f.status.statusCategory && f.status.statusCategory.key) || '';
      const labels = Array.isArray(f.labels) ? f.labels : [];
      const flagged = flaggedId ? isFlagged(f[flaggedId]) : false;
      let status = 'todo';
      if (category === 'done') status = 'done';
      else if (BLOCK_RE.test(statusName) || labels.some(function (l) { return /^blocked$/i.test(l); }) || flagged) status = 'blocked';
      else if (category === 'indeterminate') status = 'inprogress';
      return {
        key: issue.key || String(issue.id || ''),
        title: f.summary || '(no title)',
        url: base && issue.key ? base + '/browse/' + issue.key : '',
        status: status,
        assignee: (f.assignee && (f.assignee.displayName || f.assignee.name)) || null,
        created: f.created || null,
        updated: f.updated || f.created || null,
        due: jiraDueToIso(f.duedate)
      };
    });
    const sprint = data.sprint || {};
    return {
      board: { name: (data.board && data.board.name) || 'Jira board', source: 'jira', id: data.board && data.board.id },
      sprint: { name: sprint.name || 'Active sprint', start: sprint.startDate || null, end: sprint.endDate || null },
      items: items
    };
  }

  function trelloCreated(id) {
    if (!id || id.length < 8) return null;
    const seconds = parseInt(id.substring(0, 8), 16);
    return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
  }

  function dateOnlyStart(d) { return d ? d + 'T00:00:00' : null; }
  function dateOnlyEnd(d) { return d ? d + 'T23:59:59' : null; }

  function trello(raw, dates) {
    const data = raw || {};
    const lists = {};
    (data.lists || []).forEach(function (l) { lists[l.id] = l; });
    const members = {};
    (data.members || []).forEach(function (m) { members[m.id] = m.fullName || m.username || 'Member'; });

    const items = [];
    (data.cards || []).forEach(function (card) {
      const list = lists[card.idList];
      if (card.closed || !list || list.closed) return;
      const listName = list.name || '';
      const labels = card.labels || [];
      let status = 'todo';
      if (DONE_RE.test(listName)) status = 'done';
      else if (BLOCK_RE.test(listName) || labels.some(function (l) { return BLOCK_RE.test(l.name || ''); })) status = 'blocked';
      else if (PROGRESS_RE.test(listName)) status = 'inprogress';
      const names = (card.idMembers || []).map(function (id) { return members[id]; }).filter(Boolean);
      items.push({
        key: (((card.url || '').match(/\/c\/([A-Za-z0-9]+)/) || [])[1]) || String(card.id || '').slice(-6),
        title: card.name || '(no title)',
        url: card.url || '',
        status: status,
        assignee: names.length ? names.join(', ') : null,
        created: trelloCreated(card.id),
        updated: card.dateLastActivity || trelloCreated(card.id),
        due: card.dueComplete ? null : (card.due || null)
      });
    });

    const d = dates || {};
    return {
      board: { name: data.name || 'Trello board', source: 'trello', id: data.shortLink || null },
      sprint: { name: (d.name && d.name.trim()) || 'Current sprint', start: dateOnlyStart(d.start), end: dateOnlyEnd(d.end) },
      items: items
    };
  }

  const api = { detectSource: detectSource, jira: jira, trello: trello, trelloCreated: trelloCreated };

  root.SP = root.SP || {};
  root.SP.normalize = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
