/* SprintPulse service worker: clicking the toolbar icon opens the side panel. */
function enablePanelOnIconClick() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
}

chrome.runtime.onInstalled.addListener(enablePanelOnIconClick);
chrome.runtime.onStartup.addListener(enablePanelOnIconClick);
enablePanelOnIconClick();
