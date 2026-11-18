/* SprintPulse settings page (interactive). */
(function () {
  'use strict';

  const engine = window.SP.engine;
  const defaults = engine.DEFAULT_SETTINGS;
  const $ = function (id) { return document.getElementById(id); };

  const GROUPS = [
    {
      key: 'schedule', title: 'Schedule', sub: 'Time used % minus work done % (percentage points)',
      icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>',
      fields: [
        { key: 'scheduleGreenMax', label: 'Green while the gap is at most', unit: 'pts', max: 50 },
        { key: 'scheduleAmberMax', label: 'Amber while the gap is at most', unit: 'pts', max: 50 }
      ],
      rules: function (v) {
        return [['green', 'gap ≤ ' + v.scheduleGreenMax + ' pts'],
          ['amber', (v.scheduleGreenMax + 1) + '–' + Math.max(v.scheduleGreenMax, v.scheduleAmberMax) + ' pts'],
          ['red', '> ' + Math.max(v.scheduleGreenMax, v.scheduleAmberMax) + ' pts']];
      }
    },
    {
      key: 'blockers', title: 'Blockers', sub: 'Blocked items and how long they have been stuck',
      icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>',
      fields: [
        { key: 'blockerRedCount', label: 'Red when this many or more are blocked', unit: 'items', max: 20, min: 1 },
        { key: 'blockerAgeDays', label: 'Red when any blocker is older than', unit: 'days', max: 14 }
      ],
      rules: function (v) {
        return [['green', 'none blocked'],
          ['amber', '1–' + Math.max(1, v.blockerRedCount - 1) + ', all ≤ ' + v.blockerAgeDays + ' days old'],
          ['red', '≥ ' + v.blockerRedCount + ' or any > ' + v.blockerAgeDays + ' days']];
      }
    },
    {
      key: 'scope', title: 'Scope', sub: 'Items added after the sprint started',
      icon: '<svg viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
      fields: [
        { key: 'scopeAmberMax', label: 'Amber while added scope is at most', unit: '%', max: 50 }
      ],
      rules: function (v) {
        return [['green', '0% added'], ['amber', 'up to ' + v.scopeAmberMax + '%'], ['red', '> ' + v.scopeAmberMax + '%']];
      }
    },
    {
      key: 'overdue', title: 'Overdue', sub: 'Unfinished items past their due date',
      icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M12 14v3"/></svg>',
      fields: [
        { key: 'overdueRedCount', label: 'Red when this many or more are overdue', unit: 'items', max: 20, min: 1 }
      ],
      rules: function (v) {
        return [['green', 'none overdue'], ['amber', '1–' + Math.max(1, v.overdueRedCount - 1)], ['red', '≥ ' + v.overdueRedCount]];
      }
    },
    {
      key: 'health', title: 'Board health', sub: 'Used for the health score and the stale check',
      icon: '<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
      fields: [
        { key: 'staleDays', label: 'An item is stale after', unit: 'days', max: 30, min: 1 }
      ],
      rules: null
    }
  ];

  let saved = Object.assign({}, defaults);
  let current = Object.assign({}, defaults);

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function icon(markup) {
    const t = document.createElement('template');
    t.innerHTML = markup;
    return t.content.firstChild;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }

  function isDirty() {
    return Object.keys(defaults).some(function (k) { return Number(current[k]) !== Number(saved[k]); });
  }

  function updateBar() {
    const dirty = isDirty();
    $('saveBar').classList.toggle('dirty', dirty);
    $('saveMsg').textContent = dirty ? 'You have unsaved changes' : 'All changes saved';
    $('saveBtn').disabled = !dirty;
  }

  function setFill(range) {
    const min = Number(range.min) || 0;
    const max = Number(range.max) || 100;
    const pct = ((Math.min(max, Number(range.value)) - min) / (max - min)) * 100;
    range.style.setProperty('--fill', pct + '%');
  }

  function renderPreview(group) {
    if (!group.rules) return;
    const box = $('preview-' + group.key);
    box.textContent = '';
    group.rules(current).forEach(function (r) {
      const rule = el('span', 'rule');
      rule.appendChild(el('span', 'rag rag-' + r[0], r[0].toUpperCase()));
      rule.appendChild(document.createTextNode(r[1]));
      box.appendChild(rule);
    });
  }

  function setValue(key, value, source) {
    let v = Math.max(0, Math.round(Number(value)));
    if (!Number.isFinite(v)) v = defaults[key];
    current[key] = v;
    const num = $('num-' + key);
    const range = $('range-' + key);
    if (source !== 'num') num.value = String(v);
    if (source !== 'range') range.value = String(v);
    setFill(range);
    $('row-' + key).classList.toggle('changed', v !== Number(saved[key]));
    GROUPS.forEach(function (g) {
      if (g.fields.some(function (f) { return f.key === key; })) renderPreview(g);
    });
    updateBar();
  }

  function build() {
    const wrap = $('groups');
    wrap.textContent = '';
    GROUPS.forEach(function (g) {
      const card = el('section', 'card group');
      const head = el('div', 'group-head');
      const gi = el('span', 'gi');
      gi.appendChild(icon(g.icon));
      head.appendChild(gi);
      const txt = el('div');
      txt.appendChild(el('h2', null, g.title));
      txt.appendChild(el('p', 'muted', g.sub));
      head.appendChild(txt);
      card.appendChild(head);

      g.fields.forEach(function (f) {
        const row = el('div', 'setting');
        row.id = 'row-' + f.key;
        const label = el('label', null, f.label);
        label.htmlFor = 'num-' + f.key;
        const def = el('span', 'def', 'Default: ' + defaults[f.key] + ' ' + f.unit);
        const resetOne = el('button', null, 'reset');
        resetOne.type = 'button';
        resetOne.addEventListener('click', function () { setValue(f.key, defaults[f.key]); });
        def.appendChild(resetOne);
        label.appendChild(def);

        const range = el('input');
        range.type = 'range';
        range.id = 'range-' + f.key;
        range.min = String(f.min || 0);
        range.max = String(f.max);
        range.step = '1';
        range.setAttribute('aria-label', f.label);
        range.addEventListener('input', function () { setValue(f.key, range.value, 'range'); });

        const num = el('div', 'num');
        const input = el('input');
        input.type = 'number';
        input.min = String(f.min || 0);
        input.step = '1';
        input.id = 'num-' + f.key;
        input.addEventListener('input', function () { if (input.value !== '') setValue(f.key, input.value, 'num'); });
        input.addEventListener('blur', function () { setValue(f.key, input.value === '' ? saved[f.key] : input.value); });
        num.appendChild(input);
        num.appendChild(el('span', 'unit', f.unit));

        row.appendChild(label);
        row.appendChild(range);
        row.appendChild(num);
        card.appendChild(row);
      });

      if (g.rules) {
        const prev = el('div', 'preview');
        prev.id = 'preview-' + g.key;
        card.appendChild(prev);
      }
      wrap.appendChild(card);
    });
  }

  function fill(values) {
    Object.keys(defaults).forEach(function (k) { setValue(k, values[k]); });
  }

  function save() {
    const values = engine.mergeSettings(current);
    if (values.scheduleAmberMax < values.scheduleGreenMax) values.scheduleAmberMax = values.scheduleGreenMax;
    chrome.storage.local.set({ settings: values }, function () {
      saved = Object.assign({}, values);
      fill(values);
      toast('Saved');
    });
  }

  function syncThemeButtons() {
    const mode = window.SPTheme.current();
    document.querySelectorAll('[data-theme-opt]').forEach(function (b) {
      const on = b.dataset.themeOpt === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  build();
  chrome.storage.local.get('settings', function (data) {
    saved = engine.mergeSettings(data && data.settings);
    current = Object.assign({}, saved);
    fill(saved);
  });

  $('saveBtn').addEventListener('click', save);
  $('discardBtn').addEventListener('click', function () { fill(saved); toast('Changes discarded'); });
  $('resetBtn').addEventListener('click', function () {
    chrome.storage.local.remove('settings', function () {
      saved = Object.assign({}, defaults);
      fill(defaults);
      toast('Defaults restored');
    });
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (isDirty()) save(); }
  });
  window.addEventListener('beforeunload', function (e) {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  document.querySelectorAll('[data-theme-opt]').forEach(function (b) {
    b.addEventListener('click', function () { window.SPTheme.set(b.dataset.themeOpt); syncThemeButtons(); });
  });
  syncThemeButtons();
  setTimeout(syncThemeButtons, 150);
})();
