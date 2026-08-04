/**
 * One-Click Bug Reporter - Content Script
 * Gathers page metadata, injects page sniffer, and relays telemetry to Extension service worker/popup.
 */

(function () {
  if (window.__ONE_CLICK_BUG_REPORTER_CONTENT_SCRIPT_LOADED__) return;
  window.__ONE_CLICK_BUG_REPORTER_CONTENT_SCRIPT_LOADED__ = true;

  const consoleLogs = [];
  const networkLogs = [];

  // Inject page-level sniffer script into the document DOM
  function injectSnifferScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('scripts/injected-sniffer.js');
      script.onload = function () {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.warn('[One-Click Bug Reporter] Unable to inject page sniffer script:', e);
    }
  }

  injectSnifferScript();

  // Listen to messages from injected page sniffer
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.source !== 'ONE_CLICK_BUG_REPORTER_SNIFFER') return;

    if (event.data.type === 'CONSOLE_EVENT') {
      consoleLogs.push(event.data.payload);
      if (consoleLogs.length > 50) consoleLogs.shift();
    } else if (event.data.type === 'NETWORK_EVENT') {
      networkLogs.push(event.data.payload);
      if (networkLogs.length > 20) networkLogs.shift();
    } else if (event.data.type === 'DIAGNOSTICS_RESPONSE') {
      if (event.data.payload.consoleLogs) {
        consoleLogs.length = 0;
        consoleLogs.push(...event.data.payload.consoleLogs);
      }
      if (event.data.payload.networkLogs) {
        networkLogs.length = 0;
        networkLogs.push(...event.data.payload.networkLogs);
      }
    }
  });

  // Extract page metadata
  function getMetadata() {
    let localStorageKeys = [];
    let localStorageCount = 0;
    try {
      localStorageCount = window.localStorage.length;
      for (let i = 0; i < Math.min(localStorageCount, 25); i++) {
        const key = window.localStorage.key(i);
        if (key) localStorageKeys.push(key);
      }
    } catch (e) {
      // Access might be blocked by security policy
    }

    return {
      url: window.location.href,
      title: document.title || 'Untitled Page',
      userAgent: navigator.userAgent,
      platform: navigator.platform || 'Unknown',
      language: navigator.language || 'en-US',
      screenWidth: window.screen ? window.screen.width : 0,
      screenHeight: window.screen ? window.screen.height : 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
      localStorageCount: localStorageCount,
      localStorageKeys: localStorageKeys,
      timestamp: new Date().toISOString()
    };
  }

  // Handle messages from Extension background worker or popup
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'GET_PAGE_DIAGNOSTICS') {
      // Request latest sniffer state
      window.postMessage({ source: 'ONE_CLICK_BUG_REPORTER_CS', type: 'GET_DIAGNOSTICS' }, '*');

      setTimeout(function () {
        sendResponse({
          metadata: getMetadata(),
          consoleLogs: consoleLogs,
          networkLogs: networkLogs
        });
      }, 50);
      return true; // Keep channel open for async response
    }
  });
})();
