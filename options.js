/* SprintPulse settings page. */
(function () {
  'use strict';

  const engine = window.SP.engine;
  const defaults = engine.DEFAULT_SETTINGS;
  const labels = engine.SETTING_LABELS;
  const $ = function (id) { return document.getElementById(id); };

  function build(values) {
    const form = $('form');
    form.textContent = '';
    Object.keys(defaults).forEach(function (key) {
      const row = document.createElement('div');
      row.className = 'setting';
      const label = document.createElement('label');
      label.htmlFor = 'set-' + key;
      label.textContent = labels[key] + ' [' + defaults[key] + ']';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.id = 'set-' + key;
      input.value = String(values[key]);
      row.appendChild(label);
      row.appendChild(input);
      form.appendChild(row);
    });
  }

  function flash() {
    const saved = $('saved');
    saved.hidden = false;
    setTimeout(function () { saved.hidden = true; }, 1600);
  }

  function readForm() {
    const values = {};
    Object.keys(defaults).forEach(function (key) {
      values[key] = Number($('set-' + key).value);
    });
    return engine.mergeSettings(values);
  }

  function load() {
    chrome.storage.local.get('settings', function (data) {
      build(engine.mergeSettings(data && data.settings));
    });
  }

  $('saveBtn').addEventListener('click', function () {
    const values = readForm();
    if (values.scheduleAmberMax < values.scheduleGreenMax) values.scheduleAmberMax = values.scheduleGreenMax;
    chrome.storage.local.set({ settings: values }, function () {
      build(values);
      flash();
    });
  });

  $('resetBtn').addEventListener('click', function () {
    chrome.storage.local.remove('settings', function () {
      build(Object.assign({}, defaults));
      flash();
    });
  });

  load();
})();
