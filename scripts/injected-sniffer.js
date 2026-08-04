/**
 * One-Click Bug Reporter - Enhanced Page Sniffer Script
 * Intercepts console errors/warns, resource errors, and network failures (synthesizing HTTP errors into console log stream).
 */

(function () {
  if (window.__ONE_CLICK_BUG_REPORTER_SNIFFER_INJECTED__) return;
  window.__ONE_CLICK_BUG_REPORTER_SNIFFER_INJECTED__ = true;

  const MAX_CONSOLE_LOGS = 100;
  const MAX_NETWORK_LOGS = 50;

  const consoleLogs = [];
  const networkLogs = [];

  function safeStringify(obj) {
    if (obj === null || obj === undefined) return String(obj);
    if (typeof obj === 'string') return obj;
    if (obj instanceof Error) return `${obj.name}: ${obj.message}\n${obj.stack || ''}`;
    try {
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return String(obj);
    }
  }

  function pushConsoleLog(type, message, stack = '') {
    // Avoid duplicate rapid log entries
    const last = consoleLogs[consoleLogs.length - 1];
    if (last && last.message === message && (Date.now() - new Date(last.timestamp).getTime()) < 500) {
      return;
    }

    const entry = {
      type,
      message,
      timestamp: new Date().toISOString(),
      stack: stack || (new Error().stack || '').split('\n').slice(2).join('\n').trim()
    };

    consoleLogs.push(entry);
    if (consoleLogs.length > MAX_CONSOLE_LOGS) {
      consoleLogs.shift();
    }

    notifyContentScript('CONSOLE_EVENT', entry);
  }

  // --- 1. Console Function Interceptors ---
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalAssert = console.assert;

  console.error = function (...args) {
    originalError.apply(console, args);
    const msg = args.map(arg => safeStringify(arg)).join(' ');
    pushConsoleLog('error', msg);
  };

  console.warn = function (...args) {
    originalWarn.apply(console, args);
    const msg = args.map(arg => safeStringify(arg)).join(' ');
    pushConsoleLog('warn', msg);
  };

  console.assert = function (assertion, ...args) {
    originalAssert.apply(console, [assertion, ...args]);
    if (!assertion) {
      const msg = `Assertion failed: ` + args.map(arg => safeStringify(arg)).join(' ');
      pushConsoleLog('error', msg);
    }
  };

  // Capture Unhandled Runtime JS Errors & Resource Load Errors (img/script/css 404s)
  window.addEventListener('error', function (event) {
    if (event.target && (event.target.tagName === 'IMG' || event.target.tagName === 'SCRIPT' || event.target.tagName === 'LINK')) {
      const element = event.target;
      const src = element.src || element.href || 'unknown element';
      pushConsoleLog('error', `GET ${src} net::ERR_FILE_NOT_FOUND (Resource Failed to Load <${element.tagName.toLowerCase()}>)`);
    } else {
      const msg = `Unhandled Error: ${event.message || 'Script error'} at ${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`;
      const stack = event.error && event.error.stack ? event.error.stack : '';
      pushConsoleLog('error', msg, stack);
    }
  }, true); // Use capture phase to catch element load failures

  // Capture Unhandled Promise Rejections
  window.addEventListener('unhandledrejection', function (event) {
    const reason = safeStringify(event.reason);
    const stack = event.reason && event.reason.stack ? event.reason.stack : '';
    pushConsoleLog('error', `Unhandled Promise Rejection: ${reason}`, stack);
  });

  // --- 2. Network Interceptors (Fetch & XHR) ---

  function handleNetworkFailure(log) {
    // 1. Push into Network Logs
    networkLogs.push(log);
    if (networkLogs.length > MAX_NETWORK_LOGS) {
      networkLogs.shift();
    }
    notifyContentScript('NETWORK_EVENT', log);

    // 2. Synthesize DevTools Red Console Error Message for HTTP network errors
    const consoleMsg = `${log.method} ${log.url} ${log.status} (${log.statusText || 'Network Failure'})`;
    pushConsoleLog('error', consoleMsg);
  }

  // Intercept window.fetch
  if (window.fetch) {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const startTime = performance.now();
      let resource = args[0];
      let options = args[1] || {};
      
      let url = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : String(resource));
      let method = options.method || (resource && resource.method ? resource.method : 'GET');

      try {
        const response = await originalFetch.apply(this, args);
        const duration = Math.round(performance.now() - startTime);

        if (!response.ok) { // Non-2xx HTTP status (e.g. 429, 500, 404, 401, 403)
          const clonedResponse = response.clone();
          let responseBody = '';
          try {
            const text = await clonedResponse.text();
            responseBody = text.length > 1500 ? text.substring(0, 1500) + '... [truncated]' : text;
          } catch (err) {
            responseBody = '[Unable to read response body]';
          }

          handleNetworkFailure({
            url,
            method: method.toUpperCase(),
            status: response.status,
            statusText: response.statusText || (response.status === 429 ? 'Too Many Requests' : 'HTTP Error'),
            durationMs: duration,
            timestamp: new Date().toISOString(),
            responseBody
          });
        }
        return response;
      } catch (error) {
        const duration = Math.round(performance.now() - startTime);
        handleNetworkFailure({
          url,
          method: method.toUpperCase(),
          status: 0,
          statusText: 'Network Failed / CORS Error',
          durationMs: duration,
          timestamp: new Date().toISOString(),
          responseBody: error.message || String(error)
        });
        throw error;
      }
    };
  }

  // Intercept XMLHttpRequest
  const XHRProto = XMLHttpRequest.prototype;
  const originalOpen = XHRProto.open;
  const originalSend = XHRProto.send;

  XHRProto.open = function (method, url, ...rest) {
    this._reqMethod = method;
    this._reqUrl = url;
    this._startTime = performance.now();
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XHRProto.send = function (...args) {
    this.addEventListener('load', function () {
      if (this.status < 200 || this.status >= 300) {
        const duration = this._startTime ? Math.round(performance.now() - this._startTime) : 0;
        let bodySnippet = '';
        try {
          const text = this.responseText || '';
          bodySnippet = text.length > 1500 ? text.substring(0, 1500) + '... [truncated]' : text;
        } catch (e) {
          bodySnippet = '[Unable to read XHR responseText]';
        }

        handleNetworkFailure({
          url: this._reqUrl || 'Unknown URL',
          method: (this._reqMethod || 'GET').toUpperCase(),
          status: this.status,
          statusText: this.statusText || (this.status === 429 ? 'Too Many Requests' : 'HTTP Error'),
          durationMs: duration,
          timestamp: new Date().toISOString(),
          responseBody: bodySnippet
        });
      }
    });

    this.addEventListener('error', function () {
      const duration = this._startTime ? Math.round(performance.now() - this._startTime) : 0;
      handleNetworkFailure({
        url: this._reqUrl || 'Unknown URL',
        method: (this._reqMethod || 'GET').toUpperCase(),
        status: 0,
        statusText: 'XHR Network Error',
        durationMs: duration,
        timestamp: new Date().toISOString(),
        responseBody: 'Network request failed or was blocked.'
      });
    });

    return originalSend.apply(this, args);
  };

  function notifyContentScript(type, payload) {
    window.postMessage({
      source: 'ONE_CLICK_BUG_REPORTER_SNIFFER',
      type,
      payload
    }, '*');
  }

  // Listen for request from content-script to fetch all collected logs
  window.addEventListener('message', function (event) {
    if (event.data && event.data.source === 'ONE_CLICK_BUG_REPORTER_CS' && event.data.type === 'GET_DIAGNOSTICS') {
      window.postMessage({
        source: 'ONE_CLICK_BUG_REPORTER_SNIFFER',
        type: 'DIAGNOSTICS_RESPONSE',
        payload: {
          consoleLogs,
          networkLogs
        }
      }, '*');
    }
  });

  console.log('[One-Click Bug Reporter] Enhanced diagnostics sniffer initialized on page.');
})();
