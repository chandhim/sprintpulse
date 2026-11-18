/*
 * SprintPulse reports: plain text that pastes cleanly into email, WhatsApp or Slack.
 */
(function (root) {
  'use strict';

  const AREA_ORDER = ['schedule', 'blockers', 'scope', 'overdue'];
  const AREA_NAMES = { schedule: 'Schedule', blockers: 'Blockers', scope: 'Scope', overdue: 'Overdue' };
  const DOT = { green: '🟢', amber: '🟡', red: '🔴' };
  const EXEC_HELP_MAX = 3;
  const DONE_LIST_MAX = 10;

  function upper(rating) { return String(rating || '').toUpperCase(); }
  function dot(rating) { return DOT[rating] || ''; }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function shortDate(value) {
    if (!value) return '?';
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '?';
    const pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function title(result) {
    return (result.board.name || 'Board') + ' | ' + (result.sprint.name || 'Sprint');
  }

  function datesLine(result) {
    const s = result.sprint;
    if (!s.start || !s.end) return 'Dates: not set';
    let line = 'Dates: ' + shortDate(s.start) + ' to ' + shortDate(s.end);
    if (s.day && s.length) line += ' (day ' + s.day + ' of ' + s.length + ')';
    return line;
  }

  function nowOf(result, nowValue) {
    return nowValue ? new Date(nowValue).getTime() : new Date(result.generatedAt).getTime();
  }

  function idleDays(item, nowMs) {
    const engine = root.SP && root.SP.engine;
    return engine ? engine.daysSince(item.updated, nowMs) : 0;
  }

  function itemLine(item, extra) {
    let line = '- ' + (item.key ? item.key + ' ' : '') + item.title;
    line += ' | ' + (item.assignee || 'Unassigned');
    if (extra) line += ' | ' + extra;
    return line;
  }

  function progressHeadline(result) {
    let line = result.progressPct + '% done';
    if (result.timePct !== null && result.timePct !== undefined) line += ', ' + result.timePct + '% of time used';
    return line;
  }

  /* previous (optional): { at, overall, progressPct } from the last saved check of this board. */
  function executive(result, previous, nowValue) {
    const lines = [];
    const nowMs = nowOf(result, nowValue);
    lines.push('SprintPulse status: ' + title(result));
    lines.push(datesLine(result));

    if (result.counts.total === 0) {
      lines.push('Overall: no rating yet. This sprint has no items, so there is nothing to assess.');
      return lines.join('\n');
    }

    const rating = result.overall.rating;
    const attention = AREA_ORDER.filter(function (k) { return result.areas[k].rating !== 'green'; })
      .map(function (k) { return AREA_NAMES[k]; });
    lines.push('Overall: ' + dot(rating) + ' ' + upper(rating) + '. ' + progressHeadline(result) + '.' +
      (attention.length ? ' Needs attention: ' + attention.join(', ') + '.' : ' All areas on track.'));
    if (previous && previous.overall) {
      lines.push('Last check (' + shortDate(previous.at) + '): ' + upper(previous.overall) + ', ' + previous.progressPct + '% done.');
    }
    AREA_ORDER.forEach(function (key) {
      const a = result.areas[key];
      lines.push('- ' + dot(a.rating) + ' ' + AREA_NAMES[key] + ': ' + upper(a.rating) + '. ' + a.reason.replace(/\.$/, '') + '.');
    });

    const help = [];
    result.lists.blocked.forEach(function (i) {
      help.push(itemLine(i, 'blocked, no update for ' + plural(idleDays(i, nowMs), 'day')));
    });
    result.lists.overdue.forEach(function (i) {
      if (i.status !== 'blocked') help.push(itemLine(i, 'overdue, was due ' + shortDate(i.due)));
    });
    if (!help.length) {
      lines.push('Help needed: none at this time.');
    } else {
      lines.push('Help needed:');
      help.slice(0, EXEC_HELP_MAX).forEach(function (l) { lines.push(l); });
      if (help.length > EXEC_HELP_MAX) lines.push('- ...and ' + (help.length - EXEC_HELP_MAX) + ' more (see the team report).');
    }
    return lines.join('\n');
  }

  function section(lines, heading, items, extraFn, max) {
    if (!items.length) return;
    lines.push('');
    lines.push(heading + ' (' + items.length + ')');
    items.slice(0, max || items.length).forEach(function (item) { lines.push(itemLine(item, extraFn ? extraFn(item) : '')); });
    if (max && items.length > max) lines.push('- ...and ' + (items.length - max) + ' more');
  }

  function workload(result) {
    const open = [].concat(result.lists.blocked, result.lists.inprogress, result.lists.todo);
    const overdueSet = new Set(result.lists.overdue);
    const people = {};
    open.forEach(function (i) {
      const name = i.assignee || 'Unassigned';
      const p = people[name] || (people[name] = { name: name, open: 0, blocked: 0, overdue: 0 });
      p.open++;
      if (i.status === 'blocked') p.blocked++;
      if (overdueSet.has(i)) p.overdue++;
    });
    return Object.keys(people).map(function (k) { return people[k]; }).sort(function (a, b) {
      if (a.name === 'Unassigned') return 1;
      if (b.name === 'Unassigned') return -1;
      return b.open - a.open || a.name.localeCompare(b.name);
    });
  }

  function team(result, nowValue) {
    const nowMs = nowOf(result, nowValue);
    const idle = function (item) { return 'no update for ' + plural(idleDays(item, nowMs), 'day'); };
    const c = result.counts;
    const lines = [];
    lines.push('SprintPulse team report: ' + title(result));
    lines.push(datesLine(result) + (c.total ? ' | Overall: ' + upper(result.overall.rating) : ''));
    if (!c.total) {
      lines.push('This sprint has no items yet.');
      lines.push('');
      lines.push('Generated by SprintPulse on ' + shortDate(result.generatedAt) + '.');
      return lines.join('\n');
    }
    lines.push('Progress (by item count): ' + c.done + '/' + c.total + ' done (' + result.progressPct + '%) | In progress: ' +
      c.inprogress + ' | To do: ' + c.todo + ' | Blocked: ' + c.blocked);
    lines.push('Board health score: ' + result.health.score + '/100');

    section(lines, 'BLOCKED', result.lists.blocked, idle);
    section(lines, 'OVERDUE', result.lists.overdue, function (i) { return 'due ' + shortDate(i.due); });
    section(lines, 'ADDED AFTER SPRINT START', result.lists.added, function (i) { return 'added ' + shortDate(i.created); });

    // Overdue and long-blocked items already appear above, so only list stale / unassigned here.
    const attention = [];
    result.health.issues.forEach(function (h) {
      const problems = h.problems.filter(function (p) { return /^(stale|unassigned)/.test(p); });
      if (problems.length) attention.push({ item: h.item, problems: problems });
    });
    if (attention.length) {
      lines.push('');
      lines.push('NEEDS ATTENTION (' + attention.length + ')');
      attention.forEach(function (h) { lines.push(itemLine(h.item, h.problems.join(', '))); });
    }

    const people = workload(result);
    if (people.length) {
      lines.push('');
      lines.push('OPEN WORK BY PERSON (' + people.length + ')');
      people.forEach(function (p) {
        const flags = [];
        if (p.blocked) flags.push(p.blocked + ' blocked');
        if (p.overdue) flags.push(p.overdue + ' overdue');
        lines.push('- ' + p.name + ': ' + p.open + ' open' + (flags.length ? ' (' + flags.join(', ') + ')' : ''));
      });
    }

    section(lines, 'IN PROGRESS', result.lists.inprogress);
    section(lines, 'TO DO', result.lists.todo);
    section(lines, 'DONE', result.lists.done, null, DONE_LIST_MAX);
    lines.push('');
    lines.push('Generated by SprintPulse on ' + shortDate(result.generatedAt) + '.');
    return lines.join('\n');
  }

  const api = { executive: executive, team: team, shortDate: shortDate };

  root.SP = root.SP || {};
  root.SP.report = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
