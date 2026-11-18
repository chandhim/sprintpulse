/*
 * SprintPulse fetchers. Each function is injected into the active Jira / Trello tab with
 * chrome.scripting.executeScript, so it runs with the user's logged-in session.
 * IMPORTANT: every function must be fully self-contained (no outside variables), because
 * Chrome serialises the function source before injecting it. Requests are read-only (GET).
 * Each returns { ok: true, data } or { ok: false, error: { code, message } }.
 */
(function (root) {
  'use strict';

  async function fetchJira(boardId) {
    const base = location.origin;
    const MAX_ITEMS = 500;

    async function get(path) {
      const res = await fetch(base + path, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    }

    try {
      const board = await get('/rest/agile/1.0/board/' + encodeURIComponent(boardId));
      let sprints;
      try {
        sprints = await get('/rest/agile/1.0/board/' + encodeURIComponent(boardId) + '/sprint?state=active');
      } catch (e) {
        if (e.status === 400) {
          return { ok: false, error: { code: 'NO_SPRINT', message: 'This board does not use sprints (it may be a Kanban board). Open a Scrum board.' } };
        }
        throw e;
      }
      const active = (sprints && sprints.values) || [];
      if (!active.length) {
        return { ok: false, error: { code: 'NO_SPRINT', message: 'This board has no active sprint. Start a sprint in Jira, then try again.' } };
      }
      active.sort(function (a, b) { return new Date(b.startDate || 0) - new Date(a.startDate || 0); });
      const sprint = active[0];

      let flaggedFieldId = null;
      try {
        const fields = await get('/rest/api/3/field');
        const flagged = (fields || []).find(function (f) { return String(f.name || '').toLowerCase() === 'flagged'; });
        if (flagged) flaggedFieldId = flagged.id;
      } catch (e) { /* optional: continue without flagged detection */ }

      const fieldList = ['summary', 'status', 'assignee', 'duedate', 'updated', 'created', 'labels']
        .concat(flaggedFieldId ? [flaggedFieldId] : []).join(',');
      const issues = [];
      let startAt = 0;
      while (issues.length < MAX_ITEMS) {
        const page = await get('/rest/agile/1.0/sprint/' + sprint.id + '/issue?startAt=' + startAt +
          '&maxResults=100&fields=' + encodeURIComponent(fieldList));
        const batch = (page && page.issues) || [];
        Array.prototype.push.apply(issues, batch);
        startAt += batch.length;
        if (!batch.length || startAt >= (page.total || 0)) break;
      }

      return {
        ok: true,
        data: {
          baseUrl: base,
          board: { id: board.id, name: board.name },
          sprint: { id: sprint.id, name: sprint.name, startDate: sprint.startDate || null, endDate: sprint.endDate || null },
          issues: issues.slice(0, MAX_ITEMS),
          flaggedFieldId: flaggedFieldId
        }
      };
    } catch (e) {
      const status = e && e.status;
      if (status === 401 || status === 403) {
        return { ok: false, error: { code: 'AUTH', message: 'Please log in to Jira in this tab (or check you can view this board), then try again.' } };
      }
      if (status === 404) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Board not found. Open a Jira Software Scrum board and try again.' } };
      }
      return { ok: false, error: { code: 'NETWORK', message: 'Could not read data from Jira (' + ((e && e.message) || 'network error') + ').' } };
    }
  }

  async function fetchTrello(shortLink) {
    function slim(b) {
      return {
        name: b.name,
        shortLink: b.shortLink || shortLink,
        lists: (b.lists || []).map(function (l) { return { id: l.id, name: l.name, closed: !!l.closed }; }),
        cards: (b.cards || []).map(function (c) {
          return {
            id: c.id, name: c.name, idList: c.idList, closed: !!c.closed,
            due: c.due || null, dueComplete: !!c.dueComplete, idMembers: c.idMembers || [],
            dateLastActivity: c.dateLastActivity || null,
            labels: (c.labels || []).map(function (x) { return { name: x.name || '', color: x.color || '' }; }),
            url: c.shortUrl || c.url || ''
          };
        }),
        members: (b.members || []).map(function (m) { return { id: m.id, fullName: m.fullName || m.username || 'Member' }; })
      };
    }

    async function getJson(url) {
      const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (res.status === 401 || res.status === 403) {
        const err = new Error('HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      try {
        return await res.json();
      } catch (e) {
        const err = new Error('Not JSON (probably the login page)');
        err.status = 401;
        throw err;
      }
    }

    const id = encodeURIComponent(shortLink);
    try {
      let board;
      try {
        board = await getJson('https://trello.com/b/' + id + '.json');
      } catch (first) {
        if (first.status === 401 || first.status === 403) throw first;
        board = await getJson('https://trello.com/1/boards/' + id +
          '?fields=name,shortLink&lists=open&cards=open&members=all' +
          '&card_fields=name,idList,closed,due,dueComplete,idMembers,dateLastActivity,labels,shortUrl');
      }
      return { ok: true, data: slim(board) };
    } catch (e) {
      const status = e && e.status;
      if (status === 401 || status === 403) {
        return { ok: false, error: { code: 'AUTH', message: 'Please log in to Trello in this tab (or check you can view this board), then try again.' } };
      }
      if (status === 404) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Board not found. Open a Trello board and try again.' } };
      }
      return { ok: false, error: { code: 'NETWORK', message: 'Could not read data from Trello (' + ((e && e.message) || 'network error') + ').' } };
    }
  }

  const api = { fetchJira: fetchJira, fetchTrello: fetchTrello };

  root.SP = root.SP || {};
  root.SP.fetchers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
