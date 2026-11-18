/* SprintPulse popup controller. */
(function () {
  'use strict';

  const SP = window.SP;
  const $ = function (id) { return document.getElementById(id); };
  const AREA_ORDER = ['schedule', 'blockers', 'scope', 'overdue'];
  const HISTORY_LIMIT = 10;

  const ctx = { tab: null, detected: { source: 'none' } };
  const view = { exec: '', team: '', active: 'exec' };

  // ---------- small helpers ----------
  function storageGet(key) {
    return new Promise(function (resolve) {
      chrome.storage.local.get(key, function (data) { resolve((data || {})[key]); });
    });
  }

  function storageSet(key, value) {
    return new Promise(function (resolve) {
      const obj = {};
      obj[key] = value;
      chrome.storage.local.set(obj, resolve);
    });
  }

  function localDate(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    const pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function userError(message) {
    const err = new Error(message);
    err.userMessage = message;
    return err;
  }

  function setStatus(message, kind) {
    const el = $('status');
    if (!message) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = message;
    el.className = 'status' + (kind === 'error' ? ' error' : '');
  }

  function setBusy(busy) {
    $('analyzeBtn').disabled = busy;
    $('demoBtn').disabled = busy;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function ragLabel(rating) { return String(rating || '').toUpperCase(); }

  function openLink(url) {
    if (url) chrome.tabs.create({ url: url });
  }

  // ---------- start-up ----------
  async function init() {
    $('settingsLink').addEventListener('click', function (e) { e.preventDefault(); chrome.runtime.openOptionsPage(); });
    $('analyzeBtn').addEventListener('click', function () { run(false); });
    $('demoBtn').addEventListener('click', function () { run(true); });
    $('tabExec').addEventListener('click', function () { showReport('exec'); });
    $('tabTeam').addEventListener('click', function () { showReport('team'); });
    $('copyBtn').addEventListener('click', copyReport);

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      ctx.tab = tabs && tabs[0];
    } catch (e) {
      ctx.tab = null;
    }
    ctx.detected = SP.normalize.detectSource((ctx.tab && ctx.tab.url) || '');
    renderIntro();
    if (ctx.detected.source === 'trello') await loadTrelloDates();
  }

  function renderIntro() {
    const d = ctx.detected;
    const badge = $('sourceBadge');
    const intro = $('introText');
    const analyze = $('analyzeBtn');
    if (d.source === 'jira') {
      badge.textContent = 'Jira board #' + d.boardId;
      intro.textContent = 'Jira board detected. Click Analyze to read the active sprint using your logged-in session.';
    } else if (d.source === 'trello') {
      badge.textContent = 'Trello board';
      intro.textContent = 'Trello board detected. Trello has no sprints, so enter your sprint dates, then click Analyze.';
      $('trelloDates').hidden = false;
    } else {
      badge.textContent = 'Not a board';
      analyze.hidden = true;
      if (d.hint === 'jira') {
        intro.textContent = 'Open a Jira Software board (the URL contains /boards/<number>), then click the SprintPulse icon again. Or try the demo.';
      } else if (d.hint === 'trello') {
        intro.textContent = 'Open a Trello board (the URL starts with trello.com/b/), then click the SprintPulse icon again. Or try the demo.';
      } else {
        intro.textContent = 'Open a Jira or Trello board, then click the SprintPulse icon again. You can also try the demo data now.';
      }
    }
  }

  async function loadTrelloDates() {
    const saved = await storageGet('trelloDates:' + ctx.detected.shortLink);
    $('sprintName').value = (saved && saved.name) || '';
    $('startDate').value = (saved && saved.start) || localDate(-7);
    $('endDate').value = (saved && saved.end) || localDate(7);
  }

  // ---------- data ----------
  async function inject(func, args) {
    if (!ctx.tab || ctx.tab.id === undefined) throw userError('No active tab found. Click on the board tab and try again.');
    let results;
    try {
      results = await chrome.scripting.executeScript({ target: { tabId: ctx.tab.id }, func: func, args: args });
    } catch (e) {
      throw userError('SprintPulse could not read this page. Reload the board tab, then click the SprintPulse icon again.');
    }
    const result = results && results[0] && results[0].result;
    if (!result) throw userError('No data came back from the page. Reload the board tab and try again.');
    if (!result.ok) throw userError((result.error && result.error.message) || 'Could not read the board.');
    return result.data;
  }

  async function loadDataset(demo) {
    const d = ctx.detected;
    if (demo) return { dataset: SP.sample.build(new Date()), historyKey: 'history:demo' };

    if (d.source === 'jira') {
      const raw = await inject(SP.fetchers.fetchJira, [d.boardId]);
      return { dataset: SP.normalize.jira(raw), historyKey: 'history:jira:' + d.host + ':' + d.boardId };
    }

    if (d.source === 'trello') {
      const dates = { name: $('sprintName').value, start: $('startDate').value, end: $('endDate').value };
      if (!dates.start || !dates.end) throw userError('Please enter both the sprint start and end dates.');
      if (dates.end <= dates.start) throw userError('The end date must be after the start date.');
      await storageSet('trelloDates:' + d.shortLink, dates);
      const raw = await inject(SP.fetchers.fetchTrello, [d.shortLink]);
      return { dataset: SP.normalize.trello(raw, dates), historyKey: 'history:trello:' + d.shortLink };
    }

    throw userError('Open a Jira or Trello board first, or use the demo data.');
  }

  async function saveHistory(key, result) {
    const list = (await storageGet(key)) || [];
    const previous = list.length ? list[0] : null;
    list.unshift({ at: result.generatedAt, overall: result.overall.rating, progressPct: result.progressPct });
    await storageSet(key, list.slice(0, HISTORY_LIMIT));
    return previous;
  }

  async function run(demo) {
    setBusy(true);
    setStatus(demo ? 'Loading demo sprint…' : 'Reading sprint data…');
    try {
      const settings = (await storageGet('settings')) || {};
      const loaded = await loadDataset(demo);
      const result = SP.engine.analyze(loaded.dataset, settings, new Date());
      const previous = await saveHistory(loaded.historyKey, result);
      render(result, previous);
      setStatus(result.counts.total === 0 ? 'The sprint has no items yet.' : '');
    } catch (e) {
      setStatus(e.userMessage || ('Something went wrong: ' + (e && e.message)), 'error');
    } finally {
      setBusy(false);
    }
  }

  // ---------- rendering ----------
  function render(result, previous) {
    $('results').hidden = false;

    const badge = $('overallBadge');
    badge.className = 'rag big rag-' + result.overall.rating;
    badge.textContent = ragLabel(result.overall.rating);

    $('sprintTitle').textContent = (result.board.name || 'Board') + ' · ' + result.sprint.name;
    let dates = SP.report.shortDate(result.sprint.start) + ' to ' + SP.report.shortDate(result.sprint.end);
    if (result.sprint.day && result.sprint.length) dates += ' (day ' + result.sprint.day + ' of ' + result.sprint.length + ')';
    $('sprintDates').textContent = dates;
    $('previous').textContent = previous
      ? 'Last check: ' + ragLabel(previous.overall) + ' on ' + SP.report.shortDate(previous.at) + ' (' + previous.progressPct + '% done)'
      : 'First check for this board.';
    $('overallReason').textContent = result.overall.reason;

    const areas = $('areas');
    areas.textContent = '';
    AREA_ORDER.forEach(function (key) {
      const a = result.areas[key];
      const card = el('div', 'area ' + a.rating);
      const head = el('div', 'area-head');
      head.appendChild(el('span', 'area-name', SP.engine.AREA_NAMES[key]));
      head.appendChild(el('span', 'rag rag-' + a.rating, ragLabel(a.rating)));
      card.appendChild(head);
      card.appendChild(el('div', 'area-value', a.value));
      card.appendChild(el('div', 'area-reason', a.reason));
      areas.appendChild(card);
    });

    $('healthScore').textContent = String(result.health.score);
    $('healthCount').textContent = '(' + result.health.issues.length + ' item' + (result.health.issues.length === 1 ? '' : 's') + ' need attention)';
    const list = $('healthList');
    list.textContent = '';
    if (!result.health.issues.length) {
      list.appendChild(el('li', null, 'No health issues found.'));
    }
    result.health.issues.forEach(function (h) {
      const li = el('li');
      const label = (h.item.key ? h.item.key + ' ' : '') + h.item.title;
      if (h.item.url) {
        const a = el('a', null, label);
        a.href = h.item.url;
        a.addEventListener('click', function (e) { e.preventDefault(); openLink(h.item.url); });
        li.appendChild(a);
      } else {
        li.appendChild(el('span', null, label));
      }
      li.appendChild(el('span', 'problems', ' — ' + h.problems.join(', ')));
      list.appendChild(li);
    });

    view.exec = SP.report.executive(result);
    view.team = SP.report.team(result);
    showReport(view.active);
  }

  function showReport(which) {
    view.active = which;
    $('tabExec').classList.toggle('active', which === 'exec');
    $('tabTeam').classList.toggle('active', which === 'team');
    $('tabExec').setAttribute('aria-selected', String(which === 'exec'));
    $('tabTeam').setAttribute('aria-selected', String(which === 'team'));
    $('reportText').value = which === 'exec' ? view.exec : view.team;
    $('copied').hidden = true;
  }

  async function copyReport() {
    const text = $('reportText').value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const area = $('reportText');
      area.focus();
      area.select();
      document.execCommand('copy');
    }
    const copied = $('copied');
    copied.hidden = false;
    setTimeout(function () { copied.hidden = true; }, 1800);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
