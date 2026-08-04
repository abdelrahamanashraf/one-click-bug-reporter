/**
 * One-Click Bug Reporter - Background Service Worker (MV3)
 * Handles tab capture, web request monitoring fallback, and extension state proxy.
 */

// Global state cache per tab
const tabDiagnostics = new Map();

// Optional webRequest listener fallback
if (chrome.webRequest && chrome.webRequest.onCompleted) {
  chrome.webRequest.onCompleted.addListener(
    function (details) {
      if (details.statusCode >= 400) {
        recordNetworkFailure(details);
      }
    },
    { urls: ["<all_urls>"] }
  );

  chrome.webRequest.onErrorOccurred.addListener(
    function (details) {
      recordNetworkFailure(details);
    },
    { urls: ["<all_urls>"] }
  );
}

function recordNetworkFailure(details) {
  const tabId = details.tabId;
  if (tabId < 0) return;

  if (!tabDiagnostics.has(tabId)) {
    tabDiagnostics.set(tabId, { consoleLogs: [], networkLogs: [] });
  }

  const tabData = tabDiagnostics.get(tabId);
  const timestampStr = new Date(details.timeStamp || Date.now()).toISOString();
  const statusText = details.error || (details.statusCode === 429 ? 'Too Many Requests' : (details.statusCode ? `HTTP ${details.statusCode}` : 'Failed'));

  const exists = tabData.networkLogs.some(n => n.url === details.url && n.timestamp === timestampStr);
  
  if (!exists) {
    const netLog = {
      url: details.url,
      method: details.method || 'GET',
      status: details.statusCode || 0,
      statusText: statusText,
      durationMs: 0,
      timestamp: timestampStr,
      responseBody: '[Captured via webRequest background listener]'
    };

    tabData.networkLogs.push(netLog);

    if (tabData.networkLogs.length > 50) {
      tabData.networkLogs.shift();
    }

    // Synthesize matching Console Error entry for DevTools parity
    const consoleMsg = `${netLog.method} ${netLog.url} ${netLog.status} (${netLog.statusText})`;
    if (!tabData.consoleLogs.some(c => c.message === consoleMsg)) {
      tabData.consoleLogs.push({
        type: 'error',
        message: consoleMsg,
        timestamp: timestampStr,
        stack: '[Chrome Background WebRequest Listener]'
      });

      if (tabData.consoleLogs.length > 100) {
        tabData.consoleLogs.shift();
      }
    }
  }
}

// Clean up memory when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabDiagnostics.delete(tabId);
});

// Listen for messages from popup UI or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        sendResponse({ error: 'No active tab found' });
        return;
      }

      const activeTab = tabs[0];
      chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ dataUrl: dataUrl });
        }
      });
    });
    return true; // Keep response channel open for async callback
  }

  if (request.action === 'FETCH_FULL_DIAGNOSTICS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        sendResponse({ error: 'No active tab' });
        return;
      }

      const activeTab = tabs[0];
      
      // Step 1: Capture screenshot
      chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' }, (dataUrl) => {
        const screenshotUrl = chrome.runtime.lastError ? null : dataUrl;

        // Step 2: Request diagnostics from content script
        chrome.tabs.sendMessage(activeTab.id, { action: 'GET_PAGE_DIAGNOSTICS' }, (response) => {
          let metadata = response && response.metadata ? response.metadata : {
            url: activeTab.url,
            title: activeTab.title,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          };

          let consoleLogs = response && response.consoleLogs ? [...response.consoleLogs] : [];
          let networkLogs = response && response.networkLogs ? [...response.networkLogs] : [];

          // Merge with background webRequest logs
          const bgData = tabDiagnostics.get(activeTab.id);
          if (bgData) {
            if (bgData.networkLogs) {
              bgData.networkLogs.forEach(bgLog => {
                if (!networkLogs.some(nl => nl.url === bgLog.url && nl.timestamp === bgLog.timestamp)) {
                  networkLogs.push(bgLog);
                }
              });
            }

            if (bgData.consoleLogs) {
              bgData.consoleLogs.forEach(bgCon => {
                if (!consoleLogs.some(cl => cl.message === bgCon.message)) {
                  consoleLogs.push(bgCon);
                }
              });
            }
          }

          sendResponse({
            screenshotUrl,
            metadata,
            consoleLogs,
            networkLogs
          });
        });
      });
    });
    return true;
  }
});
