/* SprintPulse theme: system / light / dark, shared by the popup and the settings page. */
(function () {
  'use strict';

  const ORDER = ['system', 'light', 'dark'];
  const html = document.documentElement;

  function readCache() {
    try { return localStorage.getItem('sp-theme') || 'system'; } catch (e) { return 'system'; }
  }

  function apply(mode) {
    if (ORDER.indexOf(mode) === -1) mode = 'system';
    if (mode === 'system') html.removeAttribute('data-theme');
    else html.setAttribute('data-theme', mode);
    html.setAttribute('data-theme-mode', mode);
    try { localStorage.setItem('sp-theme', mode); } catch (e) { /* ignore */ }
    html.setAttribute('data-scheme', effective());
    return mode;
  }

  function current() { return html.getAttribute('data-theme-mode') || 'system'; }

  function effective() {
    const mode = current();
    if (mode !== 'system') return mode;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function set(mode) {
    apply(mode);
    try { chrome.storage.local.set({ theme: mode }); } catch (e) { /* ignore */ }
    return mode;
  }

  function cycle() {
    return set(ORDER[(ORDER.indexOf(current()) + 1) % ORDER.length]);
  }

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = function () { html.setAttribute('data-scheme', effective()); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }

  // Apply the cached value immediately (no flash), then sync with extension storage.
  apply(readCache());
  try {
    chrome.storage.local.get('theme', function (data) {
      if (data && data.theme && data.theme !== current()) apply(data.theme);
    });
  } catch (e) { /* ignore */ }

  window.SPTheme = { set: set, cycle: cycle, current: current, effective: effective };
})();
