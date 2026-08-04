/**
 * One-Click Bug Reporter - Storage Manager
 * Helper for saving and loading integration preferences & auth tokens securely in chrome.storage.local.
 */

const StorageManager = {
  getSettings: function () {
    return new Promise((resolve) => {
      chrome.storage.local.get([
        'activeTarget',
        'githubToken',
        'githubOwner',
        'githubRepo',
        'jiraDomain',
        'jiraEmail',
        'jiraApiToken',
        'jiraProjectKey',
        'jiraIssueType',
        'jiraComponent',
        'jiraAssignee',
        'jiraPriority',
        'jiraEnvironment'
      ], (items) => {
        resolve({
          activeTarget: items.activeTarget || 'github',
          githubToken: items.githubToken || '',
          githubOwner: items.githubOwner || '',
          githubRepo: items.githubRepo || '',
          jiraDomain: items.jiraDomain || '',
          jiraEmail: items.jiraEmail || '',
          jiraApiToken: items.jiraApiToken || '',
          jiraProjectKey: items.jiraProjectKey || '',
          jiraIssueType: items.jiraIssueType || 'Bug',
          jiraComponent: items.jiraComponent || '',
          jiraAssignee: items.jiraAssignee || '',
          jiraPriority: items.jiraPriority || 'Medium',
          jiraEnvironment: items.jiraEnvironment || 'Production'
        });
      });
    });
  },

  saveSettings: function (settings) {
    return new Promise((resolve) => {
      chrome.storage.local.set(settings, () => {
        resolve(true);
      });
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageManager;
}
