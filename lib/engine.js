/*
 * SprintPulse engine: RAG rules and board health checks.
 * Pure functions only (no chrome APIs), so the logic can be tested with Node.
 */
(function (root) {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;

  const DEFAULT_SETTINGS = {
    scheduleGreenMax: 5,   // schedule gap (percentage points) <= this is Green
    scheduleAmberMax: 15,  // gap <= this is Amber, above is Red
    blockerAgeDays: 2,     // a blocker older than this makes Blockers Red
    blockerRedCount: 3,    // this many blockers or more makes Blockers Red
    scopeAmberMax: 10,     // scope added % <= this is Amber, above is Red (0% is Green)
    overdueRedCount: 3,    // this many overdue items or more makes Overdue Red
    staleDays: 3           // not updated for this many days or more = stale
  };

  const SETTING_LABELS = {
    scheduleGreenMax: 'Schedule: Green if gap is at most (percentage points)',
    scheduleAmberMax: 'Schedule: Amber if gap is at most (percentage points)',
    blockerAgeDays: 'Blockers: Red if any blocker is older than (days)',
    blockerRedCount: 'Blockers: Red if this many or more are blocked',
    scopeAmberMax: 'Scope: Amber if added scope is at most (%)',
    overdueRedCount: 'Overdue: Red if this many or more are overdue',
    staleDays: 'Health: item is stale after (days without update)'
  };

  const RANK = { green: 0, amber: 1, red: 2 };
  const AREA_NAMES = { schedule: 'Schedule', blockers: 'Blockers', scope: 'Scope', overdue: 'Overdue' };

  function mergeSettings(settings) {
    const merged = Object.assign({}, DEFAULT_SETTINGS);
    if (settings && typeof settings === 'object') {
      Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
        const value = Number(settings[key]);
        if (settings[key] !== undefined && settings[key] !== '' && Number.isFinite(value) && value >= 0) {
          merged[key] = value;
        }
      });
    }
    return merged;
  }

  function toTime(value) {
    if (!value) return null;
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : null;
  }

  function daysSince(value, nowMs) {
    const t = toTime(value);
    if (t === null) return 0;
    return Math.max(0, Math.floor((nowMs - t) / DAY_MS));
  }

  function round(n) {
    return Math.round(n);
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function isOverdue(item, nowMs) {
    if (item.status === 'done') return false;
    const due = toTime(item.due);
    return due !== null && due < nowMs;
  }

  function isAddedAfterStart(item, startMs) {
    if (startMs === null) return false;
    const created = toTime(item.created);
    return created !== null && created > startMs;
  }

  function rateSchedule(progressPct, timePct, s) {
    if (timePct === null) {
      return { rating: 'amber', value: progressPct + '% done', reason: 'Sprint dates are missing, so the schedule cannot be checked.' };
    }
    const gap = round(timePct - progressPct);
    let rating = 'red';
    if (gap <= s.scheduleGreenMax) rating = 'green';
    else if (gap <= s.scheduleAmberMax) rating = 'amber';
    const reason = progressPct + '% done vs ' + timePct + '% of time used' +
      (gap > 0 ? ' (behind by ' + gap + ' pts)' : ' (on or ahead of plan)');
    return { rating: rating, value: progressPct + '% done', reason: reason, gap: gap };
  }

  function rateBlockers(blocked, nowMs, s) {
    if (blocked.length === 0) {
      return { rating: 'green', value: '0', reason: 'No blocked items.', oldestDays: 0 };
    }
    const oldest = blocked.reduce(function (max, item) {
      return Math.max(max, daysSince(item.updated, nowMs));
    }, 0);
    let rating = 'amber';
    if (blocked.length >= s.blockerRedCount || oldest > s.blockerAgeDays) rating = 'red';
    return {
      rating: rating,
      value: String(blocked.length),
      reason: plural(blocked.length, 'blocked item') + ' (oldest ' + plural(oldest, 'day') + ').',
      oldestDays: oldest
    };
  }

  function rateScope(added, total, s) {
    if (added.length === 0) {
      return { rating: 'green', value: '0%', reason: 'No items added after sprint start.', addedPct: 0 };
    }
    const base = total - added.length;
    const pct = base > 0 ? round((added.length / base) * 100) : 100;
    const rating = pct <= s.scopeAmberMax ? 'amber' : 'red';
    return {
      rating: rating,
      value: '+' + pct + '%',
      reason: plural(added.length, 'item') + ' added after sprint start (+' + pct + '%).',
      addedPct: pct
    };
  }

  function rateOverdue(overdue, s) {
    if (overdue.length === 0) {
      return { rating: 'green', value: '0', reason: 'No overdue items.' };
    }
    const rating = overdue.length >= s.overdueRedCount ? 'red' : 'amber';
    return { rating: rating, value: String(overdue.length), reason: plural(overdue.length, 'item') + ' past the due date.' };
  }

  function healthCheck(items, nowMs, s) {
    const issues = [];
    items.forEach(function (item) {
      if (item.status === 'done') return;
      const problems = [];
      const idle = daysSince(item.updated, nowMs);
      if (idle >= s.staleDays) problems.push('stale ' + plural(idle, 'day'));
      if (!item.assignee) problems.push('unassigned');
      if (item.status === 'blocked' && idle > s.blockerAgeDays) problems.push('blocked ' + plural(idle, 'day'));
      if (isOverdue(item, nowMs)) problems.push('overdue');
      if (problems.length) issues.push({ item: item, problems: problems });
    });
    const score = items.length ? round(100 - (issues.length / items.length) * 100) : 100;
    return { score: score, issues: issues };
  }

  /**
   * dataset = { board: {name, source}, sprint: {name, start, end}, items: [ {key, title, url, status,
   *             assignee, created, updated, due} ] }
   */
  function analyze(dataset, settings, now) {
    const s = mergeSettings(settings);
    const nowMs = now ? new Date(now).getTime() : Date.now();
    const items = (dataset && Array.isArray(dataset.items)) ? dataset.items : [];
    const sprint = (dataset && dataset.sprint) || {};
    const startMs = toTime(sprint.start);
    const endMs = toTime(sprint.end);

    const groups = { todo: [], inprogress: [], blocked: [], done: [] };
    items.forEach(function (item) {
      (groups[item.status] || groups.todo).push(item);
    });

    const total = items.length;
    const progressPct = total ? round((groups.done.length / total) * 100) : 0;
    let timePct = null;
    if (startMs !== null && endMs !== null && endMs > startMs) {
      timePct = round(Math.min(100, Math.max(0, ((nowMs - startMs) / (endMs - startMs)) * 100)));
    }

    const added = items.filter(function (item) { return isAddedAfterStart(item, startMs); });
    const overdue = items.filter(function (item) { return isOverdue(item, nowMs); });

    const areas = {
      schedule: total === 0
        ? { rating: 'green', value: '0 items', reason: 'No items in this sprint yet.' }
        : rateSchedule(progressPct, timePct, s),
      blockers: rateBlockers(groups.blocked, nowMs, s),
      scope: rateScope(added, total, s),
      overdue: rateOverdue(overdue, s)
    };

    const worst = Object.keys(areas).reduce(function (acc, key) {
      return RANK[areas[key].rating] > RANK[acc] ? areas[key].rating : acc;
    }, 'green');
    const drivers = Object.keys(areas).filter(function (key) { return areas[key].rating === worst; });
    const overallReason = worst === 'green'
      ? 'All four areas are on track.'
      : drivers.map(function (key) { return AREA_NAMES[key] + ': ' + areas[key].reason; }).join(' ');

    let sprintDay = null;
    let sprintLength = null;
    if (startMs !== null && endMs !== null && endMs > startMs) {
      sprintLength = Math.max(1, Math.round((endMs - startMs) / DAY_MS));
      sprintDay = Math.min(sprintLength, Math.max(0, Math.floor((nowMs - startMs) / DAY_MS) + 1));
    }

    return {
      generatedAt: new Date(nowMs).toISOString(),
      settings: s,
      board: (dataset && dataset.board) || {},
      sprint: { name: sprint.name || 'Current sprint', start: sprint.start || null, end: sprint.end || null, day: sprintDay, length: sprintLength },
      counts: { total: total, todo: groups.todo.length, inprogress: groups.inprogress.length, blocked: groups.blocked.length, done: groups.done.length },
      progressPct: progressPct,
      timePct: timePct,
      areas: areas,
      overall: { rating: worst, reason: overallReason, drivers: drivers },
      health: healthCheck(items, nowMs, s),
      lists: { todo: groups.todo, inprogress: groups.inprogress, blocked: groups.blocked, done: groups.done, added: added, overdue: overdue }
    };
  }

  const api = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    SETTING_LABELS: SETTING_LABELS,
    AREA_NAMES: AREA_NAMES,
    mergeSettings: mergeSettings,
    daysSince: daysSince,
    analyze: analyze
  };

  root.SP = root.SP || {};
  root.SP.engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
