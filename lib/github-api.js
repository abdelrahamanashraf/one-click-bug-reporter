/**
 * One-Click Bug Reporter - GitHub API Integration Module
 */

const GitHubAPI = {
  /**
   * Validates repository access with provided PAT token
   */
  validateConfig: async function (token, owner, repo) {
    if (!token || !owner || !repo) {
      throw new Error('Missing GitHub Token, Owner, or Repository name.');
    }
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'One-Click-Bug-Reporter-Extension'
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub Repository validation failed (HTTP ${res.status})`);
    }

    return await res.json();
  },

  /**
   * Formats markdown body with full diagnostic details
   */
  formatMarkdownBody: function ({ steps, severity, metadata, consoleLogs, networkLogs, screenshotBase64 }) {
    const severityIcons = {
      Low: '🔵 **LOW**',
      Medium: '🟡 **MEDIUM**',
      High: '🟠 **HIGH**',
      Critical: '🔴 **CRITICAL**'
    };

    let md = `## 🐛 Bug Summary\n`;
    md += `**Severity:** ${severityIcons[severity] || severity}\n`;
    md += `**Reported At:** \`${metadata.timestamp || new Date().toISOString()}\`  \n`;
    md += `**Target URL:** [${metadata.url}](${metadata.url})\n\n`;

    md += `### 📝 Steps to Reproduce / Description\n`;
    md += `${steps ? steps : '_No description provided._'}\n\n`;

    if (screenshotBase64) {
      md += `### 📸 Viewport Screenshot\n`;
      md += `![Captured Screenshot](${screenshotBase64})\n\n`;
    }

    md += `### 💻 System & Device Diagnostics\n`;
    md += `| Attribute | Value |\n`;
    md += `| --- | --- |\n`;
    md += `| **Page Title** | ${metadata.title || 'N/A'} |\n`;
    md += `| **User Agent** | \`${metadata.userAgent || 'N/A'}\` |\n`;
    md += `| **Screen Resolution** | ${metadata.screenWidth}x${metadata.screenHeight} |\n`;
    md += `| **Viewport Size** | ${metadata.viewportWidth}x${metadata.viewportHeight} (Ratio: ${metadata.pixelRatio}x) |\n`;
    md += `| **OS / Platform** | ${metadata.platform || 'N/A'} |\n`;
    md += `| **LocalStorage Keys** | ${metadata.localStorageCount} items (${(metadata.localStorageKeys || []).slice(0, 8).join(', ')}${metadata.localStorageCount > 8 ? '...' : ''}) |\n\n`;

    // Console Errors Section
    md += `### 🚨 Console Logs & Errors (${consoleLogs.length})\n`;
    if (consoleLogs.length === 0) {
      md += `_No console errors or warnings recorded during session._\n\n`;
    } else {
      md += `<details><summary><b>Click to expand console errors (${consoleLogs.length})</b></summary>\n\n`;
      consoleLogs.forEach((log, index) => {
        md += `\`\`\`text\n`;
        md += `[${log.type.toUpperCase()}] ${log.timestamp}\n`;
        md += `${log.message}\n`;
        if (log.stack) {
          md += `Stack:\n${log.stack}\n`;
        }
        md += `\`\`\`\n`;
      });
      md += `</details>\n\n`;
    }

    // Network Errors Section
    md += `### 🌐 Failed Network Requests (${networkLogs.length})\n`;
    if (networkLogs.length === 0) {
      md += `_No HTTP non-2xx network failures recorded._\n\n`;
    } else {
      md += `<details><summary><b>Click to expand failed network requests (${networkLogs.length})</b></summary>\n\n`;
      networkLogs.forEach((req, index) => {
        md += `#### ${index + 1}. \`${req.method}\` ${req.url}\n`;
        md += `- **Status:** \`${req.status} ${req.statusText}\` (${req.durationMs}ms)\n`;
        md += `- **Timestamp:** \`${req.timestamp}\` \n`;
        if (req.responseBody) {
          md += `<details><summary>Response Snippet</summary>\n\n\`\`\`json\n${req.responseBody}\n\`\`\`\n</details>\n`;
        }
        md += `\n`;
      });
      md += `</details>\n\n`;
    }

    md += `---\n*Reported automatically via One-Click Bug Reporter Chrome/Edge Extension.*`;
    return md;
  },

  /**
   * Submits issue to GitHub Issues
   */
  createIssue: async function ({ token, owner, repo, title, steps, severity, metadata, consoleLogs, networkLogs, screenshotBase64 }) {
    if (!token || !owner || !repo) {
      throw new Error('GitHub configuration is incomplete. Please check token, owner, and repository in settings.');
    }

    const bodyMarkdown = this.formatMarkdownBody({
      steps,
      severity,
      metadata,
      consoleLogs,
      networkLogs,
      screenshotBase64
    });

    const payload = {
      title: `[${severity.toUpperCase()}] ${title}`,
      body: bodyMarkdown,
      labels: ['bug', severity.toLowerCase()]
    };

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'One-Click-Bug-Reporter-Extension'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to create GitHub Issue (HTTP ${res.status})`);
    }

    const createdIssue = await res.json();
    return {
      id: createdIssue.number,
      key: `#${createdIssue.number}`,
      url: createdIssue.html_url
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GitHubAPI;
}
