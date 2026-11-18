/* SprintPulse side panel controller (interactive UI). */
(function () {
  'use strict';

  const SP = window.SP;
  const $ = function (id) { return document.getElementById(id); };
  const AREA_ORDER = ['schedule', 'blockers', 'scope', 'overdue'];
  const HISTORY_LIMIT = 10;
  const RING_C = 2 * Math.PI * 50;
  const STATUS = [
    { key: 'done', label: 'Done', cls: 's-done' },
    { key: 'inprogress', label: 'In progress', cls: 's-inprogress' },
    { key: 'blocked', label: 'Blocked', cls: 's-blocked' },
    { key: 'todo', label: 'To do', cls: 's-todo' }
  ];
  const STATUS_LABEL = { done: 'Done', inprogress: 'In progress', blocked: 'Blocked', todo: 'To do' };
  const PROBLEMS = [
    { key: 'stale', label: 'Stale' },
    { key: 'unassigned', label: 'Unassigned' },
    { key: 'blocked', label: 'Long-blocked' },
    { key: 'overdue', label: 'Overdue' }
  ];
  const AREA_ICONS = {
    schedule: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>',
    blockers: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>',
    scope: '<svg viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
    overdue: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M12 14v3"/></svg>'
  };

  const ctx = { tab: null, detected: { source: 'none' }, lastDemo: false };
  const view = {
    result: null, exec: '', team: '', report: 'exec', tab: 'overview',
    openArea: null, healthFilter: 'all', itemFilter: 'all', query: '', healthOpen: false
  };

  // ---------- helpers ----------
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

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function localDate(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    return fmtDate(d);
  }

  function userError(message) {
    const err = new Error(message);
    err.userMessage = message;
    return err;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  // Static, trusted SVG markup only (never user data).
  function icon(markup) {
    const t = document.createElement('template');
    t.innerHTML = markup;
    return t.content.firstChild;
  }

  function ragLabel(rating) { return String(rating || '').toUpperCase(); }
  function ragPill(rating, big) { return el('span', 'rag rag-' + rating + (big ? ' big' : ''), ragLabel(rating)); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function openLink(url) { if (url) chrome.tabs.create({ url: url }); }

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function nextFrame(fn) { requestAnimationFrame(function () { requestAnimationFrame(fn); }); }

  function countUp(node, to, suffix) {
    suffix = suffix || '';
    if (reduceMotion) { node.textContent = to + suffix; return; }
    const start = performance.now();
    const dur = 900;
    (function step(t) {
      const p = Math.max(0, Math.min(1, (t - start) / dur));
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = Math.round(to * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  let toastTimer = null;
  function toast(message, isError) {
    const t = $('toast');
    t.textContent = message;
    t.classList.toggle('err', !!isError);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  function setStatus(message, kind) {
    const s = $('status');
    if (!message) { s.hidden = true; s.textContent = ''; return; }
    s.hidden = false;
    s.textContent = message;
    s.className = 'status' + (kind === 'error' ? ' error' : '');
  }

  function setBusy(busy, demo) {
    const a = $('analyzeBtn');
    const d = $('demoBtn');
    a.disabled = busy;
    d.disabled = busy;
    $('rerunBtn').disabled = busy;
    const target = demo ? d : a;
    if (busy) {
      target.dataset.label = target.innerHTML;
      target.textContent = '';
      target.appendChild(el('span', 'spinner'));
      target.appendChild(el('span', null, demo ? 'Loading…' : 'Reading board…'));
    } else {
      [a, d].forEach(function (b) {
        if (b.dataset.label) { b.innerHTML = b.dataset.label; delete b.dataset.label; }
      });
    }
  }

  // ---------- tooltip ----------
  function bindTooltip(node, text) {
    node.dataset.tip = text;
  }
  function initTooltip() {
    const tip = $('tooltip');
    document.addEventListener('mouseover', function (e) {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) { tip.hidden = true; return; }
      tip.textContent = t.dataset.tip;
      tip.hidden = false;
      const r = t.getBoundingClientRect();
      const w = tip.offsetWidth;
      const left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2));
      let top = r.top - tip.offsetHeight - 8;
      if (top < 4) top = r.bottom + 8;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    });
    document.addEventListener('scroll', function () { tip.hidden = true; }, true);
  }

  // ---------- ripple ----------
  function initRipple() {
    document.addEventListener('pointerdown', function (e) {
      const b = e.target.closest && e.target.closest('.btn');
      if (!b || b.disabled || reduceMotion) return;
      const r = b.getBoundingClientRect();
      const size = Math.max(r.width, r.height);
      const dot = el('span', 'ripple');
      dot.style.width = dot.style.height = size + 'px';
      dot.style.left = (e.clientX - r.left - size / 2) + 'px';
      dot.style.top = (e.clientY - r.top - size / 2) + 'px';
      b.appendChild(dot);
      setTimeout(function () { dot.remove(); }, 600);
    });
  }

  // ---------- start-up ----------
  async function init() {
    $('settingsLink').addEventListener('click', function (e) { e.preventDefault(); chrome.runtime.openOptionsPage(); });
    $('settingsBtn').addEventListener('click', function () { chrome.runtime.openOptionsPage(); });
    $('themeBtn').addEventListener('click', cycleTheme);
    $('analyzeBtn').addEventListener('click', function () { run(false); });
    $('demoBtn').addEventListener('click', function () { run(true); });
    $('rerunBtn').addEventListener('click', function () {
      $('rerunBtn').classList.remove('spin');
      void $('rerunBtn').offsetWidth;
      $('rerunBtn').classList.add('spin');
      run(ctx.lastDemo);
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { showTab(t.dataset.tab); });
    });
    $('segExec').addEventListener('click', function () { showReport('exec'); });
    $('segTeam').addEventListener('click', function () { showReport('team'); });
    $('copyBtn').addEventListener('click', copyReport);
    $('downloadBtn').addEventListener('click', downloadReport);
    $('healthToggle').addEventListener('click', function () { setHealthOpen(!view.healthOpen); });
    $('search').addEventListener('input', function (e) { view.query = e.target.value.trim().toLowerCase(); renderItems(); });
    document.querySelectorAll('.presets .chip').forEach(function (c) {
      c.addEventListener('click', function () { applyPreset(Number(c.dataset.weeks)); });
    });
    ['startDate', 'endDate'].forEach(function (id) {
      $(id).addEventListener('change', validateDates);
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', moveInk);
    initTooltip();
    initRipple();
    updateThemeTitle();

    $('hideBtn').addEventListener('click', hidePanel);
    await syncTab(true);
    // The panel stays open while you browse, so follow the active tab.
    chrome.tabs.onActivated.addListener(function () { syncTab(false); });
    chrome.tabs.onUpdated.addListener(function (id, info, tab) {
      if (ctx.tab && id === ctx.tab.id && (info.url || info.status === 'complete')) syncTab(false);
    });
    chrome.windows.onFocusChanged.addListener(function () { syncTab(false); });
  }

  function hidePanel() { window.close(); }

  function sourceId(d) {
    return d.source === 'jira' ? 'jira:' + d.host + ':' + d.boardId
      : d.source === 'trello' ? 'trello:' + d.shortLink : 'none';
  }

  // Re-read the active tab; reset the panel only when the board actually changed.
  async function syncTab(first) {
    let tab = null;
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tab = tabs && tabs[0];
    } catch (e) { /* keep previous */ }
    if (!tab) return;
    const detected = SP.normalize.detectSource(tab.url || '');
    const changed = first || sourceId(detected) !== sourceId(ctx.detected);
    ctx.tab = tab;
    if (!changed) return;
    ctx.detected = detected;
    if (!first && ctx.lastDemo && view.result) return; // keep showing the demo
    view.result = null;
    $('results').hidden = true;
    $('skeleton').hidden = true;
    setStatus('');
    renderIntro();
    if (detected.source === 'trello') await loadTrelloDates();
  }

  function cycleTheme() {
    const mode = window.SPTheme.cycle();
    updateThemeTitle();
    toast('Theme: ' + mode.charAt(0).toUpperCase() + mode.slice(1));
  }

  function updateThemeTitle() {
    const mode = window.SPTheme.current();
    $('themeBtn').title = 'Theme: ' + mode + ' (T to switch)';
  }

  function setBadge(kind, text) {
    $('sourceBadge').className = 'badge ' + kind;
    document.documentElement.setAttribute('data-source', kind);
    $('sourceText').textContent = text;
  }

  function renderIntro() {
    const d = ctx.detected;
    const intro = $('introText');
    const title = $('introTitle');
    $('intro').hidden = false;
    $('trelloDates').hidden = true;
    $('analyzeBtn').hidden = d.source === 'none';
    $('demoBtn').className = d.source === 'none' ? 'btn primary' : 'btn ghost';
    if (d.source === 'jira') {
      setBadge('jira', 'Jira board #' + d.boardId);
      title.textContent = 'Jira board detected';
      intro.textContent = 'SprintPulse will read the active sprint using your logged-in session. Nothing is changed on the board.';
    } else if (d.source === 'trello') {
      setBadge('trello', 'Trello board');
      title.textContent = 'Trello board detected';
      intro.textContent = 'Trello has no sprints, so set your sprint dates below. They are remembered for this board.';
      $('trelloDates').hidden = false;
    } else {
      setBadge('none', 'Not a board');
      title.textContent = 'Open a Jira or Trello board';
      if (d.hint === 'jira') {
        intro.textContent = 'Open a Jira Software board (the URL contains /boards/<number>). This panel follows your active tab. Or try the demo.';
      } else if (d.hint === 'trello') {
        intro.textContent = 'Open a Trello board (the URL starts with trello.com/b/). This panel follows your active tab. Or try the demo.';
      } else {
        intro.textContent = 'Switch to a Jira or Trello board tab and this panel will pick it up. You can explore a full example report with the demo data right now.';
      }
    }
  }

  async function loadTrelloDates() {
    const saved = await storageGet('trelloDates:' + ctx.detected.shortLink);
    $('sprintName').value = (saved && saved.name) || '';
    $('startDate').value = (saved && saved.start) || localDate(-7);
    $('endDate').value = (saved && saved.end) || localDate(7);
    highlightPreset();
  }

  function applyPreset(weeks) {
    const startVal = $('startDate').value || localDate(0);
    const s = new Date(startVal + 'T00:00:00');
    s.setDate(s.getDate() + weeks * 7);
    $('startDate').value = startVal;
    $('endDate').value = fmtDate(s);
    validateDates();
  }

  function highlightPreset() {
    const s = $('startDate').value;
    const e = $('endDate').value;
    const days = s && e ? Math.round((new Date(e + 'T00:00:00') - new Date(s + 'T00:00:00')) / 86400000) : 0;
    document.querySelectorAll('.presets .chip').forEach(function (c) {
      c.classList.toggle('active', Number(c.dataset.weeks) * 7 === days);
    });
  }

  function validateDates() {
    const s = $('startDate').value;
    const e = $('endDate').value;
    const bad = !!(s && e && e <= s);
    $('endDate').classList.toggle('invalid', bad);
    highlightPreset();
    return !bad;
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
    const trimmed = list.slice(0, HISTORY_LIMIT);
    await storageSet(key, trimmed);
    return { previous: previous, list: trimmed };
  }

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function run(demo) {
    ctx.lastDemo = demo;
    setBusy(true, demo);
    setStatus('');
    const hadResults = !$('results').hidden;
    $('results').hidden = true;
    $('skeleton').hidden = false;
    try {
      const settings = (await storageGet('settings')) || {};
      const both = await Promise.all([loadDataset(demo), delay(hadResults ? 250 : 450)]);
      const loaded = both[0];
      const result = SP.engine.analyze(loaded.dataset, settings, new Date());
      const hist = await saveHistory(loaded.historyKey, result);
      $('skeleton').hidden = true;
      // Keep the date fields visible for Trello so they can be changed and re-run.
      $('intro').hidden = !(ctx.detected.source === 'trello' && !demo);
      if (demo) setBadge('demo', 'Demo data');
      render(result, hist.previous, hist.list);
      setStatus(result.counts.total === 0 ? 'The sprint has no items yet.' : '');
    } catch (e) {
      $('skeleton').hidden = true;
      if (hadResults && view.result) $('results').hidden = false;
      setStatus(e.userMessage || ('Something went wrong: ' + (e && e.message)), 'error');
    } finally {
      setBusy(false, demo);
    }
  }

  // ---------- rendering ----------
  function render(result, previous, history) {
    view.result = result;
    view.openArea = null;
    view.healthFilter = 'all';
    view.itemFilter = 'all';
    $('results').hidden = false;

    renderHero(result);
    $('overallReason').textContent = '';
    const reasonLead = el('strong', null, 'Overall ' + ragLabel(result.overall.rating) + ' — ');
    $('overallReason').appendChild(reasonLead);
    $('overallReason').appendChild(document.createTextNode(result.overall.reason));

    $('itemsCount').textContent = String(result.counts.total);
    renderStatusBar(result);
    renderAreas(result);
    renderHealth(result);
    renderTrend(previous, history);
    renderItemFilters();
    renderItems();

    view.exec = SP.report.executive(result, previous);
    view.team = SP.report.team(result);
    showReport(view.report);
    showTab(view.tab);
  }

  function renderHero(result) {
    const r = result.overall.rating;
    $('hero').className = 'card hero ' + r;
    const badge = $('overallBadge');
    badge.className = 'rag big rag-' + r;
    badge.textContent = ragLabel(r);

    $('sprintTitle').textContent = (result.board.name || 'Board') + ' · ' + result.sprint.name;
    let dates = SP.report.shortDate(result.sprint.start) + ' → ' + SP.report.shortDate(result.sprint.end);
    if (result.sprint.day && result.sprint.length) dates += ' · day ' + result.sprint.day + ' of ' + result.sprint.length;
    $('sprintDates').textContent = dates;

    const done = result.progressPct;
    const time = result.timePct === null ? 0 : result.timePct;
    $('ringDone').style.strokeDashoffset = RING_C;
    $('ringTime').style.strokeDashoffset = RING_C;
    nextFrame(function () {
      $('ringDone').style.strokeDashoffset = RING_C * (1 - done / 100);
      $('ringTime').style.strokeDashoffset = RING_C * (1 - time / 100);
    });
    countUp($('ringPct'), done, '%');
    $('lgDone').textContent = done + '%';
    $('lgTime').textContent = result.timePct === null ? 'n/a' : time + '%';
    bindTooltip($('hero').querySelector('.ring-wrap'),
      'Outer ring: ' + done + '% of items done. Thin ring: ' + (result.timePct === null ? 'no sprint dates' : time + '% of sprint time used') + '.');
  }

  function renderStatusBar(result) {
    const c = result.counts;
    const bar = $('statusBar');
    const chips = $('statChips');
    bar.textContent = '';
    chips.textContent = '';
    STATUS.forEach(function (s) {
      const n = c[s.key];
      const pct = c.total ? (n / c.total) * 100 : 0;
      if (n > 0) {
        const seg = el('div', 'seg-bar ' + s.cls);
        bindTooltip(seg, s.label + ': ' + n + ' (' + Math.round(pct) + '%) — click to list');
        seg.addEventListener('click', function () { jumpToItems(s.key); });
        bar.appendChild(seg);
        nextFrame(function () { seg.style.width = pct + '%'; });
      }
      const chip = el('button', 'chip');
      chip.type = 'button';
      const sw = el('span', 'sw ' + s.cls);
      chip.appendChild(sw);
      chip.appendChild(el('span', null, s.label));
      chip.appendChild(el('span', 'n', String(n)));
      chip.addEventListener('click', function () { jumpToItems(s.key); });
      chips.appendChild(chip);
    });
  }

  function jumpToItems(status) {
    view.itemFilter = status;
    view.query = '';
    $('search').value = '';
    renderItemFilters();
    renderItems();
    showTab('items');
  }

  function areaItems(key, result) {
    if (key === 'blockers') return { items: result.lists.blocked, extra: function (i) { return 'no update ' + plural(SP.engine.daysSince(i.updated, Date.now()), 'day'); } };
    if (key === 'scope') return { items: result.lists.added, extra: function (i) { return 'added ' + SP.report.shortDate(i.created); } };
    if (key === 'overdue') return { items: result.lists.overdue, extra: function (i) { return 'due ' + SP.report.shortDate(i.due); } };
    return null;
  }

  function renderAreas(result) {
    const wrap = $('areas');
    wrap.textContent = '';
    AREA_ORDER.forEach(function (key) {
      const a = result.areas[key];
      const card = el('div', 'area ' + a.rating);
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-expanded', 'false');
      card.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); card.click(); }
      });
      const head = el('div', 'area-head');
      const name = el('span', 'area-name');
      name.appendChild(icon(AREA_ICONS[key]));
      name.appendChild(document.createTextNode(SP.engine.AREA_NAMES[key]));
      head.appendChild(name);
      head.appendChild(ragPill(a.rating));
      card.appendChild(head);
      card.appendChild(el('div', 'area-value', a.value));
      card.appendChild(el('div', 'area-reason', a.reason));
      const more = el('span', 'area-more', 'Details ▾');
      card.appendChild(more);
      const detail = el('div', 'area-detail');
      detail.hidden = true;
      card.appendChild(detail);

      card.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        const opening = view.openArea !== key;
        view.openArea = opening ? key : null;
        wrap.querySelectorAll('.area').forEach(function (c) {
          c.classList.remove('open');
          c.setAttribute('aria-expanded', 'false');
          c.querySelector('.area-detail').hidden = true;
          c.querySelector('.area-more').textContent = 'Details ▾';
        });
        if (opening) {
          card.classList.add('open');
          card.setAttribute('aria-expanded', 'true');
          fillAreaDetail(key, detail, result);
          detail.hidden = false;
          more.textContent = 'Hide ▴';
        }
      });
      wrap.appendChild(card);
    });
  }

  function miniBar(label, pct, color) {
    const row = el('div', 'mini-bar');
    row.appendChild(el('span', null, label));
    const track = el('div', 'track');
    const fill = el('div', 'fill');
    fill.style.background = color;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('b', null, pct === null ? 'n/a' : pct + '%'));
    nextFrame(function () { fill.style.width = (pct || 0) + '%'; });
    return row;
  }

  function fillAreaDetail(key, box, result) {
    box.textContent = '';
    if (key === 'schedule') {
      const bars = el('div', 'mini-bars');
      bars.appendChild(miniBar('Time used', result.timePct, 'var(--grey-solid)'));
      bars.appendChild(miniBar('Work done', result.progressPct, 'var(--' + result.areas.schedule.rating + '-solid)'));
      box.appendChild(bars);
      const s = result.settings;
      box.appendChild(el('p', 'muted', 'Green if the gap is ' + s.scheduleGreenMax + ' pts or less, Amber up to ' + s.scheduleAmberMax + ' pts, otherwise Red.'));
      return;
    }
    const info = areaItems(key, result);
    const list = el('ul', 'item-list');
    if (!info.items.length) {
      list.appendChild(emptyRow('Nothing here', 'This area has no items to show.'));
    } else {
      info.items.forEach(function (i) { list.appendChild(itemRow(i, [info.extra(i)])); });
    }
    box.appendChild(list);
  }

  function emptyRow(title, text) {
    const li = el('li', 'empty');
    li.appendChild(el('b', null, title));
    li.appendChild(document.createTextNode(text));
    return li;
  }

  function highlight(text, query) {
    const frag = document.createDocumentFragment();
    if (!query) { frag.appendChild(document.createTextNode(text)); return frag; }
    const lower = text.toLowerCase();
    let pos = 0;
    let idx = lower.indexOf(query);
    while (idx !== -1) {
      frag.appendChild(document.createTextNode(text.slice(pos, idx)));
      frag.appendChild(el('mark', null, text.slice(idx, idx + query.length)));
      pos = idx + query.length;
      idx = lower.indexOf(query, pos);
    }
    frag.appendChild(document.createTextNode(text.slice(pos)));
    return frag;
  }

  function itemRow(item, tags, query) {
    const li = el('li');
    const dot = el('span', 'st s-' + item.status);
    bindTooltip(dot, STATUS_LABEL[item.status] || item.status);
    li.appendChild(dot);
    const body = el('div', 'body');
    const ttl = item.url ? el('a', 'ttl') : el('span', 'ttl');
    if (item.key) {
      const k = el('span', 'key');
      k.appendChild(highlight(item.key, query));
      ttl.appendChild(k);
    }
    ttl.appendChild(highlight(item.title || '', query));
    if (item.url) {
      ttl.href = item.url;
      ttl.title = 'Open in a new tab';
      ttl.addEventListener('click', function (e) { e.preventDefault(); openLink(item.url); });
    }
    body.appendChild(ttl);
    const meta = el('div', 'meta');
    const person = el('span', 'tag person' + (item.assignee ? '' : ' warn'));
    person.appendChild(highlight(item.assignee || 'Unassigned', query));
    meta.appendChild(person);
    (tags || []).forEach(function (t) {
      if (!t || t === 'unassigned') return;
      const cls = /overdue|blocked/.test(t) ? ' bad' : /stale|unassigned|added|due/.test(t) ? ' warn' : '';
      meta.appendChild(el('span', 'tag' + cls, t));
    });
    body.appendChild(meta);
    li.appendChild(body);
    return li;
  }

  // ---------- health ----------
  function problemKind(p) { return String(p).split(' ')[0]; }

  function renderHealth(result) {
    const h = result.health;
    const gauge = $('healthGauge');
    gauge.style.setProperty('--p', 0);
    gauge.style.setProperty('--c', h.score >= 80 ? 'var(--green-solid)' : h.score >= 60 ? 'var(--amber-solid)' : 'var(--red-solid)');
    nextFrame(function () { gauge.style.setProperty('--p', h.score); });
    countUp($('healthScore'), h.score);
    bindTooltip(gauge, 'Health score ' + h.score + '/100 = 100 − items with an issue ÷ all items');
    $('healthCount').textContent = h.issues.length
      ? plural(h.issues.length, 'item') + ' need attention'
      : 'No issues found — nice!';
    $('healthToggle').hidden = !h.issues.length;
    setHealthOpen(h.issues.length > 0 && view.healthOpen);

    const filters = $('healthFilters');
    filters.textContent = '';
    const counts = {};
    h.issues.forEach(function (i) { i.problems.forEach(function (p) { counts[problemKind(p)] = (counts[problemKind(p)] || 0) + 1; }); });
    const opts = [{ key: 'all', label: 'All', n: h.issues.length }].concat(
      PROBLEMS.filter(function (p) { return counts[p.key]; }).map(function (p) { return { key: p.key, label: p.label, n: counts[p.key] }; })
    );
    opts.forEach(function (o) {
      const c = el('button', 'chip' + (view.healthFilter === o.key ? ' active' : ''));
      c.type = 'button';
      c.appendChild(el('span', null, o.label));
      c.appendChild(el('span', 'n', String(o.n)));
      c.addEventListener('click', function () {
        view.healthFilter = o.key;
        filters.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
        c.classList.add('active');
        renderHealthList();
      });
      filters.appendChild(c);
    });
    renderHealthList();
  }

  function renderHealthList() {
    const list = $('healthList');
    list.textContent = '';
    const issues = view.result.health.issues.filter(function (h) {
      return view.healthFilter === 'all' || h.problems.some(function (p) { return problemKind(p) === view.healthFilter; });
    });
    if (!issues.length) { list.appendChild(emptyRow('All clear', 'No health issues found.')); return; }
    issues.forEach(function (h) { list.appendChild(itemRow(h.item, h.problems)); });
  }

  function setHealthOpen(open) {
    view.healthOpen = open;
    $('healthBody').classList.toggle('open', open);
    $('healthToggle').textContent = open ? 'Hide' : 'Show';
    $('healthToggle').setAttribute('aria-expanded', String(open));
  }

  // ---------- trend ----------
  function renderTrend(previous, history) {
    $('previous').textContent = previous
      ? 'Last: ' + ragLabel(previous.overall) + ' on ' + SP.report.shortDate(previous.at) + ' (' + previous.progressPct + '% done)'
      : 'First check for this board.';
    const box = $('trend');
    box.textContent = '';
    const list = (history || []).slice().reverse();
    for (let i = list.length; i < HISTORY_LIMIT; i++) {
      const ph = el('div', 'tb');
      ph.style.opacity = '.25';
      ph.style.height = '4px';
      box.appendChild(ph);
    }
    list.forEach(function (h, idx) {
      const bar = el('div', 'tb ' + h.overall + (idx === list.length - 1 ? ' now' : ''));
      bindTooltip(bar, (idx === list.length - 1 ? 'Now · ' : '') + ragLabel(h.overall) + ' · ' + h.progressPct + '% done · ' + SP.report.shortDate(h.at));
      box.appendChild(bar);
      nextFrame(function () { bar.style.height = Math.max(8, h.progressPct) + '%'; });
    });
  }

  // ---------- items tab ----------
  function renderItemFilters() {
    const c = view.result.counts;
    const box = $('itemFilters');
    box.textContent = '';
    [{ key: 'all', label: 'All', n: c.total }].concat(STATUS.map(function (s) { return { key: s.key, label: s.label, n: c[s.key], cls: s.cls }; }))
      .forEach(function (o) {
        const chip = el('button', 'chip' + (view.itemFilter === o.key ? ' active' : ''));
        chip.type = 'button';
        if (o.cls) chip.appendChild(el('span', 'sw ' + o.cls));
        chip.appendChild(el('span', null, o.label));
        chip.appendChild(el('span', 'n', String(o.n)));
        chip.addEventListener('click', function () {
          view.itemFilter = o.key;
          box.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
          chip.classList.add('active');
          renderItems();
        });
        box.appendChild(chip);
      });
  }

  function renderItems() {
    const result = view.result;
    if (!result) return;
    const list = $('itemList');
    list.textContent = '';
    const problems = {};
    result.health.issues.forEach(function (h) { problems[(h.item.key || '') + '|' + h.item.title] = h.problems; });
    const order = { blocked: 0, inprogress: 1, todo: 2, done: 3 };
    const q = view.query;
    const all = [].concat(result.lists.blocked, result.lists.inprogress, result.lists.todo, result.lists.done)
      .filter(function (i) { return view.itemFilter === 'all' || i.status === view.itemFilter; })
      .filter(function (i) {
        if (!q) return true;
        return [i.key, i.title, i.assignee].some(function (v) { return v && String(v).toLowerCase().indexOf(q) !== -1; });
      })
      .sort(function (a, b) { return order[a.status] - order[b.status]; });
    if (!all.length) {
      list.appendChild(emptyRow('No matches', q ? 'Try a different search.' : 'No items with this status.'));
      return;
    }
    all.forEach(function (i) {
      const tags = [STATUS_LABEL[i.status]].concat(problems[(i.key || '') + '|' + i.title] || []);
      if (i.due && i.status !== 'done' && tags.indexOf('overdue') === -1) tags.push('due ' + SP.report.shortDate(i.due));
      list.appendChild(itemRow(i, tags, q));
    });
  }

  // ---------- tabs ----------
  function showTab(name) {
    view.tab = name;
    document.querySelectorAll('.tab').forEach(function (t) {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    ['overview', 'items', 'report'].forEach(function (p) { $('pane-' + p).hidden = p !== name; });
    moveInk();
  }

  function moveInk() {
    const active = document.querySelector('.tab.active');
    const ink = document.querySelector('.tab-ink');
    if (!active || !ink || $('results').hidden) return;
    ink.style.width = active.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + (active.offsetLeft - 3) + 'px)';
  }

  // ---------- report ----------
  function renderReportText(text) {
    const pre = $('reportText');
    pre.textContent = '';
    text.split('\n').forEach(function (line, idx, arr) {
      const isHead = /^[A-Z][A-Z \-]+ \(\d+\)$/.test(line) || /^SprintPulse /.test(line);
      const wrap = isHead ? el('span', 'r-head') : document.createDocumentFragment();
      const parts = line.split(/\b(RED|AMBER|GREEN)\b/);
      parts.forEach(function (p) {
        if (p === 'RED' || p === 'AMBER' || p === 'GREEN') wrap.appendChild(el('span', 'r-' + p.toLowerCase(), p));
        else if (p) wrap.appendChild(document.createTextNode(p));
      });
      pre.appendChild(wrap);
      if (idx < arr.length - 1) pre.appendChild(document.createTextNode('\n'));
    });
  }

  function showReport(which) {
    view.report = which;
    [['segExec', 'exec'], ['segTeam', 'team']].forEach(function (pair) {
      const on = pair[1] === which;
      $(pair[0]).classList.toggle('active', on);
      $(pair[0]).setAttribute('aria-checked', String(on));
    });
    const text = which === 'exec' ? view.exec : view.team;
    renderReportText(text);
    $('reportMeta').textContent = plural(text ? text.split('\n').length : 0, 'line') + ' · ' + text.length + ' chars';
  }

  function currentReport() { return view.report === 'exec' ? view.exec : view.team; }

  async function copyReport() {
    const text = currentReport();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = el('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const btn = $('copyBtn');
    const label = btn.querySelector('span');
    btn.classList.add('success');
    label.textContent = 'Copied';
    toast('Copied ' + (view.report === 'exec' ? 'Executive' : 'Team') + ' report');
    setTimeout(function () { btn.classList.remove('success'); label.textContent = 'Copy report'; }, 1800);
  }

  function downloadReport() {
    const text = currentReport();
    if (!text || !view.result) return;
    const slug = (view.result.board.name + '-' + view.result.sprint.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sprintpulse-' + view.report + '-' + slug + '-' + fmtDate(new Date()) + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Report saved');
  }

  // ---------- keyboard ----------
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (typing) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    const hasResults = !$('results').hidden;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') { hidePanel(); }
    else if (k === 't') { cycleTheme(); }
    else if (k === 'd' && !$('demoBtn').disabled) { run(true); }
    else if (hasResults && k === '1') { showTab('overview'); }
    else if (hasResults && k === '2') { showTab('items'); }
    else if (hasResults && k === '3') { showTab('report'); }
    else if (hasResults && k === 'c') { copyReport(); }
    else if (hasResults && k === 'r') { $('rerunBtn').click(); }
    else if (hasResults && e.key === '/') { e.preventDefault(); showTab('items'); $('search').focus(); }
    else return;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
