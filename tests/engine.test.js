/*
 * SprintPulse automated tests. Run with:  node tests/engine.test.js
 * No test framework needed (uses Node's built-in assert).
 */
'use strict';

const assert = require('assert');
const engine = require('../lib/engine.js');
const normalize = require('../lib/normalize.js');
const report = require('../lib/report.js');
const sample = require('../lib/sample.js');
const fetchers = require('../lib/fetchers.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-18T12:00:00Z');
const iso = (daysAgo) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Sprint: 10 days, day 5 -> 50% time used.
function sprint() { return { name: 'S1', start: iso(5), end: new Date(NOW.getTime() + 5 * DAY).toISOString() }; }
function item(status, extra) {
  return Object.assign({ key: 'K', title: 'T', url: '', status, assignee: 'A', created: iso(9), updated: iso(0), due: null }, extra || {});
}
function many(n, status, extra) { return Array.from({ length: n }, () => item(status, extra)); }
function run(items, settings) { return engine.analyze({ board: { name: 'B' }, sprint: sprint(), items }, settings, NOW); }

// ---------- Schedule ----------
test('schedule green when progress matches time (gap 0)', () => {
  const r = run([].concat(many(5, 'done'), many(5, 'todo')));
  assert.strictEqual(r.timePct, 50);
  assert.strictEqual(r.progressPct, 50);
  assert.strictEqual(r.areas.schedule.rating, 'green');
});
test('schedule green at gap 5, amber at gap 10, red at gap 20', () => {
  // 20 items: 9 done = 45% (gap 5); 8 done = 40% (gap 10); 6 done = 30% (gap 20)
  assert.strictEqual(run([].concat(many(9, 'done'), many(11, 'todo'))).areas.schedule.rating, 'green');
  assert.strictEqual(run([].concat(many(8, 'done'), many(12, 'todo'))).areas.schedule.rating, 'amber');
  assert.strictEqual(run([].concat(many(6, 'done'), many(14, 'todo'))).areas.schedule.rating, 'red');
});
test('schedule amber when sprint dates are missing', () => {
  const r = engine.analyze({ sprint: { name: 'x' }, items: many(3, 'todo') }, {}, NOW);
  assert.strictEqual(r.areas.schedule.rating, 'amber');
  assert.strictEqual(r.timePct, null);
});

// ---------- Blockers ----------
test('blockers: none green, 2 recent amber, 3 red, 1 old red', () => {
  assert.strictEqual(run(many(4, 'todo')).areas.blockers.rating, 'green');
  assert.strictEqual(run([].concat(many(2, 'blocked', { updated: iso(1) }), many(4, 'todo'))).areas.blockers.rating, 'amber');
  assert.strictEqual(run([].concat(many(3, 'blocked', { updated: iso(0) }), many(4, 'todo'))).areas.blockers.rating, 'red');
  assert.strictEqual(run([].concat(many(1, 'blocked', { updated: iso(3) }), many(4, 'todo'))).areas.blockers.rating, 'red');
});
test('blocker exactly 2 days old is still amber', () => {
  assert.strictEqual(run([].concat(many(1, 'blocked', { updated: iso(2) }), many(4, 'todo'))).areas.blockers.rating, 'amber');
});

// ---------- Scope ----------
test('scope: 0 added green, 1 of 10 base amber (10%), 2 of 10 base red (20%)', () => {
  assert.strictEqual(run(many(10, 'todo')).areas.scope.rating, 'green');
  const one = run([].concat(many(10, 'todo'), many(1, 'todo', { created: iso(1) })));
  assert.strictEqual(one.areas.scope.addedPct, 10);
  assert.strictEqual(one.areas.scope.rating, 'amber');
  const two = run([].concat(many(10, 'todo'), many(2, 'todo', { created: iso(1) })));
  assert.strictEqual(two.areas.scope.rating, 'red');
});

// ---------- Overdue ----------
test('overdue: done items never overdue; 2 amber; 3 red', () => {
  const past = { due: iso(1) };
  assert.strictEqual(run(many(3, 'done', past)).areas.overdue.rating, 'green');
  assert.strictEqual(run([].concat(many(2, 'todo', past), many(3, 'todo'))).areas.overdue.rating, 'amber');
  assert.strictEqual(run([].concat(many(3, 'inprogress', past))).areas.overdue.rating, 'red');
});

// ---------- Overall + health ----------
test('overall is the worst area and names the driver', () => {
  const r = run([].concat(many(5, 'done'), many(5, 'todo'), many(3, 'blocked')));
  assert.strictEqual(r.overall.rating, 'red');
  assert.ok(r.overall.drivers.includes('blockers'));
  assert.ok(r.overall.reason.startsWith('Blockers:'));
});
test('all green gives the on-track reason', () => {
  const r = run([].concat(many(5, 'done'), many(5, 'todo')));
  assert.strictEqual(r.overall.rating, 'green');
  assert.strictEqual(r.overall.reason, 'All four areas are on track.');
});
test('health score and problems', () => {
  const items = [item('todo', { updated: iso(4) }), item('todo', { assignee: null }), item('done', { assignee: null, updated: iso(9) }), item('todo')];
  const r = run(items);
  assert.strictEqual(r.health.issues.length, 2);
  assert.strictEqual(r.health.score, 50);
  assert.ok(r.health.issues[0].problems[0].startsWith('stale'));
  assert.deepStrictEqual(r.health.issues[1].problems, ['unassigned']);
});
test('empty sprint does not crash', () => {
  const r = run([]);
  assert.strictEqual(r.counts.total, 0);
  assert.strictEqual(r.health.score, 100);
  assert.strictEqual(r.overall.rating, 'green');
});
test('custom settings change the result', () => {
  const items = [].concat(many(8, 'done'), many(12, 'todo')); // gap 10
  assert.strictEqual(run(items).areas.schedule.rating, 'amber');
  assert.strictEqual(run(items, { scheduleGreenMax: 10 }).areas.schedule.rating, 'green');
  assert.strictEqual(run(items, { scheduleGreenMax: 2, scheduleAmberMax: 8 }).areas.schedule.rating, 'red');
});
test('invalid settings fall back to defaults', () => {
  const s = engine.mergeSettings({ staleDays: -1, scheduleGreenMax: 'abc', overdueRedCount: 5 });
  assert.strictEqual(s.staleDays, 3);
  assert.strictEqual(s.scheduleGreenMax, 5);
  assert.strictEqual(s.overdueRedCount, 5);
});

// ---------- Normalizers ----------
test('detectSource handles Jira, Trello and other pages', () => {
  assert.deepStrictEqual(normalize.detectSource('https://acme.atlassian.net/jira/software/projects/POS/boards/12'), { source: 'jira', boardId: '12', host: 'acme.atlassian.net' });
  assert.strictEqual(normalize.detectSource('https://acme.atlassian.net/jira/software/c/projects/POS/boards/7/backlog').boardId, '7');
  assert.strictEqual(normalize.detectSource('https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=33').boardId, '33');
  assert.deepStrictEqual(normalize.detectSource('https://trello.com/b/AbC123xy/my-board'), { source: 'trello', shortLink: 'AbC123xy' });
  assert.strictEqual(normalize.detectSource('https://acme.atlassian.net/browse/POS-1').hint, 'jira');
  assert.strictEqual(normalize.detectSource('https://example.com').source, 'none');
  assert.strictEqual(normalize.detectSource('chrome://extensions').source, 'none');
  assert.strictEqual(normalize.detectSource('').source, 'none');
});
test('Jira normalizer maps status, blocked, flagged and due date', () => {
  const ds = normalize.jira({
    baseUrl: 'https://acme.atlassian.net',
    board: { id: 12, name: 'POS board' },
    sprint: { name: 'Sprint 3', startDate: '2026-11-10T03:00:00.000Z', endDate: '2026-11-24T03:00:00.000Z' },
    flaggedFieldId: 'customfield_10021',
    issues: [
      { key: 'POS-1', fields: { summary: 'Done one', status: { name: 'Done', statusCategory: { key: 'done' } } } },
      { key: 'POS-2', fields: { summary: 'Doing', status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } }, assignee: { displayName: 'Nimal' }, duedate: '2026-11-20' } },
      { key: 'POS-3', fields: { summary: 'Blocked status', status: { name: 'Blocked', statusCategory: { key: 'indeterminate' } } } },
      { key: 'POS-4', fields: { summary: 'Flagged', status: { name: 'To Do', statusCategory: { key: 'new' } }, customfield_10021: [{ value: 'Impediment' }] } },
      { key: 'POS-5', fields: { summary: 'Label', status: { name: 'To Do', statusCategory: { key: 'new' } }, labels: ['Blocked'] } },
      { key: 'POS-6', fields: { summary: 'Plain', status: { name: 'To Do', statusCategory: { key: 'new' } } } }
    ]
  });
  assert.deepStrictEqual(ds.items.map((i) => i.status), ['done', 'inprogress', 'blocked', 'blocked', 'blocked', 'todo']);
  assert.strictEqual(ds.items[1].assignee, 'Nimal');
  assert.strictEqual(ds.items[1].due, '2026-11-20T23:59:59');
  assert.strictEqual(ds.items[0].url, 'https://acme.atlassian.net/browse/POS-1');
  assert.strictEqual(ds.sprint.name, 'Sprint 3');
  assert.strictEqual(ds.board.name, 'POS board');
});
test('Trello normalizer maps lists, labels, members, closed items and created date', () => {
  const idFromDate = (d) => Math.floor(new Date(d).getTime() / 1000).toString(16).padStart(8, '0') + '0000000000000000';
  const ds = normalize.trello({
    name: 'Club board',
    lists: [{ id: 'l1', name: 'To Do' }, { id: 'l2', name: 'Doing' }, { id: 'l3', name: 'Done' }, { id: 'l4', name: 'Blocked' }, { id: 'l5', name: 'Old', closed: true }],
    members: [{ id: 'm1', fullName: 'Kasuni' }],
    cards: [
      { id: idFromDate('2026-11-01T00:00:00Z'), name: 'A', idList: 'l1', idMembers: ['m1'], url: 'https://trello.com/c/aaa111/1-a', dateLastActivity: '2026-11-17T00:00:00Z', labels: [] },
      { id: idFromDate('2026-11-01T00:00:00Z'), name: 'B', idList: 'l2', idMembers: [], labels: [{ name: 'blocked' }] },
      { id: idFromDate('2026-11-01T00:00:00Z'), name: 'C', idList: 'l3', due: '2026-11-02T00:00:00Z', dueComplete: true },
      { id: idFromDate('2026-11-01T00:00:00Z'), name: 'D', idList: 'l4' },
      { id: idFromDate('2026-11-01T00:00:00Z'), name: 'E', idList: 'l5' },
      { id: idFromDate('2026-11-01T00:00:00Z'), name: 'F', idList: 'l2', closed: true }
    ]
  }, { name: 'Week 47', start: '2026-11-10', end: '2026-11-24' });
  assert.deepStrictEqual(ds.items.map((i) => i.title), ['A', 'B', 'C', 'D']);
  assert.deepStrictEqual(ds.items.map((i) => i.status), ['todo', 'blocked', 'done', 'blocked']);
  assert.strictEqual(ds.items[0].assignee, 'Kasuni');
  assert.strictEqual(ds.items[0].key, 'aaa111');
  assert.strictEqual(ds.items[0].created, '2026-11-01T00:00:00.000Z');
  assert.strictEqual(ds.items[2].due, null);
  assert.strictEqual(ds.sprint.start, '2026-11-10T00:00:00');
  assert.strictEqual(ds.sprint.name, 'Week 47');
});

// ---------- Demo data + reports ----------
test('demo sprint produces an AMBER result with health issues', () => {
  const r = engine.analyze(sample.build(NOW), {}, NOW);
  assert.strictEqual(r.counts.total, 20);
  assert.strictEqual(r.overall.rating, 'amber');
  assert.strictEqual(r.areas.blockers.rating, 'amber');
  assert.strictEqual(r.areas.scope.rating, 'amber');
  assert.strictEqual(r.areas.overdue.rating, 'amber');
  assert.ok(r.health.issues.length >= 3);
});
test('demo stays AMBER at any time of day', () => {
  for (let h = 0; h < 24; h += 1) {
    const t = new Date('2026-11-18T00:00:00');
    t.setHours(h, 30);
    const r = engine.analyze(sample.build(t), {}, t);
    assert.strictEqual(r.overall.rating, 'amber', 'hour ' + h);
    assert.strictEqual(r.areas.schedule.rating, 'green', 'schedule at hour ' + h);
  }
});
test('executive report is short, names the status, progress and who is blocked', () => {
  global.SP = { engine };
  const r = engine.analyze(sample.build(NOW), {}, NOW);
  const text = report.executive(r);
  assert.ok(text.split('\n').length <= 12, 'lines: ' + text.split('\n').length);
  assert.ok(text.includes('AMBER. 45% done, 44% of time used. Needs attention: Blockers, Scope, Overdue.'));
  assert.ok(text.includes('Help needed:\n- POS-109 Card payment integration | Ravindu Gunawardena | blocked, no update for 1 day'));
  assert.ok(text.includes('POS-110 Loyalty points calculation'));
});
test('executive report shows the previous check when there is one', () => {
  global.SP = { engine };
  const r = engine.analyze(sample.build(NOW), {}, NOW);
  const text = report.executive(r, { at: '2026-11-11T09:00:00Z', overall: 'green', progressPct: 30 });
  assert.ok(text.includes('Last check (2026-11-11): GREEN, 30% done.'));
  assert.ok(!report.executive(r).includes('Last check'));
});
test('reports do not claim an empty or undated sprint is healthy', () => {
  global.SP = { engine };
  const r = engine.analyze({ board: { name: 'B' }, sprint: { name: 'S1' }, items: [] }, {}, NOW);
  const exec = report.executive(r);
  assert.ok(exec.includes('Dates: not set'));
  assert.ok(exec.includes('no rating yet'));
  assert.ok(!/GREEN/.test(exec));
  assert.ok(report.team(r).includes('no items yet'));
});
test('team report lists people workload, does not repeat overdue in attention, caps done list', () => {
  global.SP = { engine };
  const r = engine.analyze(sample.build(NOW), {}, NOW);
  const text = report.team(r);
  assert.ok(text.includes('OPEN WORK BY PERSON'));
  assert.ok(/- Unassigned: 2 open/.test(text));
  const attention = text.split('NEEDS ATTENTION')[1].split('\n\n')[0];
  assert.ok(!/overdue/.test(attention), attention);
  const many = JSON.parse(JSON.stringify(r));
  many.lists.done = Array.from({ length: 14 }, (_, i) => ({ key: 'D-' + i, title: 't', assignee: 'x', status: 'done' }));
  assert.ok(report.team(many).includes('- ...and 4 more'));
});
test('team report lists blocked, overdue, added and health sections', () => {
  global.SP = { engine };
  const r = engine.analyze(sample.build(NOW), {}, NOW);
  const text = report.team(r);
  ['BLOCKED (2)', 'OVERDUE (1)', 'ADDED AFTER SPRINT START (1)', 'NEEDS ATTENTION', 'DONE (9)'].forEach((h) => {
    assert.ok(text.includes(h), 'missing ' + h);
  });
});

// ---------- Fetchers (mocked browser) ----------
function mockFetch(routes) {
  return async function (url) {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    const r = routes[key];
    const value = typeof r === 'function' ? r(path) : r;
    if (value && value.__status) return { ok: false, status: value.__status, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => value };
  };
}

test('fetchJira reads board, sprint, flagged field and pages of issues', async () => {
  global.location = { origin: 'https://acme.atlassian.net' };
  const issues = Array.from({ length: 150 }, (_, i) => ({ key: 'POS-' + i, fields: {} }));
  global.fetch = mockFetch({
    '/rest/agile/1.0/board/12/sprint': { values: [{ id: 9, name: 'Sprint 9', startDate: '2026-11-10', endDate: '2026-11-24' }] },
    '/rest/agile/1.0/board/12': { id: 12, name: 'POS board' },
    '/rest/api/3/field': [{ id: 'customfield_10021', name: 'Flagged' }],
    '/rest/agile/1.0/sprint/9/issue': (path) => {
      const start = Number((path.match(/startAt=(\d+)/) || [])[1] || 0);
      return { total: 150, issues: issues.slice(start, start + 100) };
    }
  });
  const res = await fetchers.fetchJira('12');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.issues.length, 150);
  assert.strictEqual(res.data.flaggedFieldId, 'customfield_10021');
  assert.strictEqual(res.data.sprint.name, 'Sprint 9');
});
test('fetchJira reports no active sprint, Kanban boards and login problems', async () => {
  global.location = { origin: 'https://acme.atlassian.net' };
  global.fetch = mockFetch({ '/rest/agile/1.0/board/12/sprint': { values: [] }, '/rest/agile/1.0/board/12': { id: 12, name: 'B' } });
  assert.strictEqual((await fetchers.fetchJira('12')).error.code, 'NO_SPRINT');
  global.fetch = mockFetch({ '/rest/agile/1.0/board/12/sprint': { __status: 400 }, '/rest/agile/1.0/board/12': { id: 12, name: 'B' } });
  assert.strictEqual((await fetchers.fetchJira('12')).error.code, 'NO_SPRINT');
  global.fetch = mockFetch({ '/rest/agile/1.0/board/12': { __status: 401 } });
  assert.strictEqual((await fetchers.fetchJira('12')).error.code, 'AUTH');
  global.fetch = async () => { throw new Error('offline'); };
  assert.strictEqual((await fetchers.fetchJira('12')).error.code, 'NETWORK');
});
test('fetchTrello uses the board JSON and falls back to the API', async () => {
  global.fetch = mockFetch({ '/b/AbC123.json': { name: 'Club', lists: [{ id: 'l1', name: 'To Do' }], cards: [{ id: 'c1', name: 'X', idList: 'l1' }], members: [] } });
  const a = await fetchers.fetchTrello('AbC123');
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.data.cards.length, 1);
  global.fetch = mockFetch({ '/b/AbC123.json': { __status: 500 }, '/1/boards/AbC123': { name: 'Club', lists: [], cards: [], members: [] } });
  const b = await fetchers.fetchTrello('AbC123');
  assert.strictEqual(b.ok, true);
  assert.strictEqual(b.data.name, 'Club');
  global.fetch = mockFetch({ '/b/AbC123.json': { __status: 401 } });
  assert.strictEqual((await fetchers.fetchTrello('AbC123')).error.code, 'AUTH');
});
test('fetchers are self-contained (safe to inject into a tab)', () => {
  // Chrome serialises the function source; it must not depend on outside names.
  ['fetchJira', 'fetchTrello'].forEach((name) => {
    const src = fetchers[name].toString();
    assert.ok(!/\bSP\b|\bmodule\b|\broot\b/.test(src), name + ' references outside scope');
  });
});

(async () => {
  for (const t of tests) {
    try {
      await t.fn();
      passed += 1;
      console.log('PASS  ' + t.name);
    } catch (e) {
      console.log('FAIL  ' + t.name + '\n      ' + e.message);
      process.exitCode = 1;
    }
  }
  console.log('\n' + passed + ' of ' + tests.length + ' tests passed.');
})();
