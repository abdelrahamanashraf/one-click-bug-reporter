/**
 * One-Click Bug Reporter - Jira API Integration Module
 * Integrates with Jira Cloud REST API v3 to create issues with custom fields and attach screenshots.
 */

const JiraAPI = {
  cleanDomain: function (domain) {
    if (!domain) return '';
    let cleaned = domain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    if (!cleaned.includes('.')) {
      cleaned = `${cleaned}.atlassian.net`;
    }
    return cleaned;
  },

  getAuthHeader: function (email, apiToken) {
    const credentials = btoa(`${email}:${apiToken}`);
    return `Basic ${credentials}`;
  },

  /**
   * Validates Jira connection & project key
   */
  validateConfig: async function (domain, email, apiToken, projectKey) {
    const host = this.cleanDomain(domain);
    if (!host || !email || !apiToken || !projectKey) {
      throw new Error('Missing Jira Domain, User Email, API Token, or Project Key.');
    }

    const res = await fetch(`https://${host}/rest/api/3/project/${projectKey}`, {
      headers: {
        'Authorization': this.getAuthHeader(email, apiToken),
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.errorMessages ? err.errorMessages.join(', ') : `HTTP ${res.status}`;
      throw new Error(`Jira Validation Failed: ${msg}`);
    }

    return await res.json();
  },

  /**
   * Helper to convert Base64 Data URL to Blob for Attachment upload
   */
  base64ToBlob: function (base64DataUrl) {
    const parts = base64DataUrl.split(';base64,');
    const contentType = parts[0].split(':')[1] || 'image/png';
    const raw = window.atob(parts[1]);
    const uInt8Array = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  },

  /**
   * Formats Jira ADF (Atlassian Document Format) description object
   */
  buildADFDescription: function ({ steps, severity, environment, component, metadata, consoleLogs, networkLogs }) {
    const content = [];

    // Summary Header
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '🐛 Bug Summary & Environment' }]
    });

    content.push({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Severity: ', marks: [{ type: 'strong' }] },
        { type: 'text', text: severity.toUpperCase() },
        { type: 'text', text: '  |  Environment: ', marks: [{ type: 'strong' }] },
        { type: 'text', text: environment || 'Production' },
        { type: 'text', text: '  |  Component: ', marks: [{ type: 'strong' }] },
        { type: 'text', text: component || 'Default' },
        { type: 'text', text: '\nTarget URL: ', marks: [{ type: 'strong' }] },
        { type: 'text', text: metadata.url, marks: [{ type: 'link', attrs: { href: metadata.url } }] }
      ]
    });

    // Description / Steps
    content.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: '📝 Steps to Reproduce / Details' }]
    });

    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: steps || 'No description provided.' }]
    });

    // System Diagnostics
    content.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: '💻 System Diagnostics' }]
    });

    content.push({
      type: 'codeBlock',
      attrs: { language: 'text' },
      content: [{
        type: 'text',
        text: `Page Title: ${metadata.title}\nUser Agent: ${metadata.userAgent}\nScreen: ${metadata.screenWidth}x${metadata.screenHeight} | Viewport: ${metadata.viewportWidth}x${metadata.viewportHeight} (DPR: ${metadata.pixelRatio})\nPlatform: ${metadata.platform}\nLocalStorage Keys: ${metadata.localStorageCount} item(s)\nTimestamp: ${metadata.timestamp}`
      }]
    });

    // Console Errors
    content.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: `🚨 Console Errors & Warnings (${consoleLogs.length})` }]
    });

    if (consoleLogs.length === 0) {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: 'No console errors recorded during session.' }]
      });
    } else {
      const consoleText = consoleLogs.map((l, i) => `[${l.type.toUpperCase()}] ${l.timestamp}\n${l.message}${l.stack ? '\nStack:\n' + l.stack : ''}`).join('\n\n------------------\n\n');
      content.push({
        type: 'codeBlock',
        attrs: { language: 'text' },
        content: [{ type: 'text', text: consoleText }]
      });
    }

    // Network Errors
    content.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: `🌐 Failed Network Requests (${networkLogs.length})` }]
    });

    if (networkLogs.length === 0) {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: 'No HTTP non-2xx network errors captured.' }]
      });
    } else {
      const netText = networkLogs.map((n, i) => `${i + 1}. [${n.method}] ${n.url}\nStatus: ${n.status} ${n.statusText} (${n.durationMs}ms)\nBody: ${n.responseBody || 'N/A'}`).join('\n\n------------------\n\n');
      content.push({
        type: 'codeBlock',
        attrs: { language: 'json' },
        content: [{ type: 'text', text: netText }]
      });
    }

    return {
      version: 1,
      type: 'doc',
      content: content
    };
  },

  /**
   * Creates Jira Issue and uploads attached screenshot blob
   */
  createIssue: async function ({ domain, email, apiToken, projectKey, issueType, component, assignee, priority, environment, title, steps, severity, metadata, consoleLogs, networkLogs, screenshotBase64 }) {
    const host = this.cleanDomain(domain);
    if (!host || !email || !apiToken || !projectKey) {
      throw new Error('Jira configuration incomplete. Please verify credentials in settings.');
    }

    const authHeader = this.getAuthHeader(email, apiToken);
    const adfDescription = this.buildADFDescription({
      steps,
      severity,
      environment,
      component,
      metadata,
      consoleLogs,
      networkLogs
    });

    // Build fields object
    const fields = {
      project: { key: projectKey.toUpperCase() },
      summary: `[${severity.toUpperCase()}] ${title}`,
      description: adfDescription,
      issuetype: { name: issueType || 'Bug' }
    };

    // Priority Mapping
    if (priority) {
      fields.priority = { name: priority };
    }

    // Component Mapping
    if (component && component.trim()) {
      fields.components = [{ name: component.trim() }];
    }

    // Assignee Account ID Mapping
    if (assignee && assignee.trim()) {
      fields.assignee = { id: assignee.trim() };
    }

    // Environment ADF Mapping
    if (environment && environment.trim()) {
      fields.environment = {
        version: 1,
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: environment.trim() }]
        }]
      };
    }

    const issuePayload = { fields };

    // Step 1: Create Jira Issue
    const res = await fetch(`https://${host}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(issuePayload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.errorMessages ? err.errorMessages.join(', ') : (err.errors ? JSON.stringify(err.errors) : `HTTP ${res.status}`);
      throw new Error(`Failed to create Jira Issue: ${msg}`);
    }

    const createdIssue = await res.json();
    const issueKey = createdIssue.key;
    const issueUrl = `https://${host}/browse/${issueKey}`;

    // Step 2: Upload Screenshot Attachment if present
    if (screenshotBase64) {
      try {
        const imageBlob = this.base64ToBlob(screenshotBase64);
        const formData = new FormData();
        formData.append('file', imageBlob, `bug-screenshot-${issueKey}.png`);

        await fetch(`https://${host}/rest/api/3/issue/${issueKey}/attachments`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'X-Atlassian-Token': 'no-check'
          },
          body: formData
        });
      } catch (attachErr) {
        console.warn('Failed to upload screenshot attachment to Jira:', attachErr);
      }
    }

    return {
      id: createdIssue.id,
      key: issueKey,
      url: issueUrl
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = JiraAPI;
}
