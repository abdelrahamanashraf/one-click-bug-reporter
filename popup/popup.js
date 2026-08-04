/**
 * One-Click Bug Reporter - Popup UI Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM References
  const activeTargetBadge = document.getElementById('activeTargetBadge');
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const settingsModal = document.getElementById('settingsModal');

  // Canvas References
  const screenshotCanvas = document.getElementById('screenshotCanvas');
  const ctx = screenshotCanvas.getContext('2d');
  const canvasLoader = document.getElementById('canvasLoader');
  const toolBox = document.getElementById('toolBox');
  const toolPencil = document.getElementById('toolPencil');
  const toolArrow = document.getElementById('toolArrow');
  const toolUndo = document.getElementById('toolUndo');
  const toolClear = document.getElementById('toolClear');

  // Form References
  const bugTitleInput = document.getElementById('bugTitle');
  const bugSeveritySelect = document.getElementById('bugSeverity');
  const bugStepsTextarea = document.getElementById('bugSteps');
  const btnSubmitTicket = document.getElementById('btnSubmitTicket');
  const submitBtnLabel = document.getElementById('submitBtnLabel');
  const statusBanner = document.getElementById('statusBanner');
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');

  // Accordion References
  const consoleLogsList = document.getElementById('consoleLogsList');
  const networkLogsList = document.getElementById('networkLogsList');
  const metadataTable = document.getElementById('metadataTable');
  const badgeConsoleCount = document.getElementById('badgeConsoleCount');
  const badgeNetworkCount = document.getElementById('badgeNetworkCount');
  const metaUrlDomain = document.getElementById('metaUrlDomain');

  // Settings References
  const radioGithub = document.getElementById('radioGithub');
  const radioJira = document.getElementById('radioJira');
  const panelGithub = document.getElementById('panelGithub');
  const panelJira = document.getElementById('panelJira');
  const cfgGithubToken = document.getElementById('cfgGithubToken');
  const cfgGithubOwner = document.getElementById('cfgGithubOwner');
  const cfgGithubRepo = document.getElementById('cfgGithubRepo');
  const cfgJiraDomain = document.getElementById('cfgJiraDomain');
  const cfgJiraEmail = document.getElementById('cfgJiraEmail');
  const cfgJiraToken = document.getElementById('cfgJiraToken');
  const cfgJiraProject = document.getElementById('cfgJiraProject');
  const cfgJiraIssueType = document.getElementById('cfgJiraIssueType');
  const cfgJiraComponent = document.getElementById('cfgJiraComponent');
  const cfgJiraPriority = document.getElementById('cfgJiraPriority');
  const cfgJiraEnvironment = document.getElementById('cfgJiraEnvironment');
  const cfgJiraAssignee = document.getElementById('cfgJiraAssignee');

  const btnTestConfig = document.getElementById('btnTestConfig');
  const btnSaveConfig = document.getElementById('btnSaveConfig');
  const testFeedback = document.getElementById('testFeedback');

  // State Management
  let currentSettings = {};
  let currentDiagnostics = {
    metadata: {},
    consoleLogs: [],
    networkLogs: [],
    screenshotUrl: null
  };

  // Canvas Drawing State
  let activeTool = 'box'; // 'box', 'pencil', 'arrow'
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let baseImage = null;
  let historyStack = [];

  // --- 1. Load Initial State & Diagnostics ---
  currentSettings = await StorageManager.getSettings();
  updateTargetBadgeUI(currentSettings.activeTarget);
  populateSettingsForm(currentSettings);

  fetchDiagnostics();

  function updateTargetBadgeUI(target) {
    if (target === 'jira') {
      activeTargetBadge.textContent = 'Jira Cloud';
      activeTargetBadge.style.borderColor = '#0052cc';
      activeTargetBadge.style.color = '#388bfd';
    } else {
      activeTargetBadge.textContent = 'GitHub';
      activeTargetBadge.style.borderColor = 'rgba(99, 102, 241, 0.4)';
      activeTargetBadge.style.color = '#6366f1';
    }
  }

  function fetchDiagnostics() {
    canvasLoader.style.display = 'flex';
    chrome.runtime.sendMessage({ action: 'FETCH_FULL_DIAGNOSTICS' }, (response) => {
      canvasLoader.style.display = 'none';
      if (!response || response.error) {
        statusText.textContent = response ? response.error : 'Failed to capture page context';
        statusBanner.className = 'status-banner error';
        return;
      }

      currentDiagnostics = response;

      // Populate Bug Title if empty
      if (response.metadata && response.metadata.title) {
        bugTitleInput.value = `[Bug] Issue on ${response.metadata.title.substring(0, 45)}`;
      } else {
        bugTitleInput.value = `[Bug] Issue report - ${new Date().toLocaleTimeString()}`;
      }

      // Render Canvas Screenshot
      if (response.screenshotUrl) {
        initCanvas(response.screenshotUrl);
      }

      // Populate Accordions
      renderConsoleLogs(response.consoleLogs || []);
      renderNetworkLogs(response.networkLogs || []);
      renderMetadata(response.metadata || {});
    });
  }

  // --- 2. Canvas & Annotation Tools ---

  function initCanvas(dataUrl) {
    const img = new Image();
    img.onload = () => {
      baseImage = img;
      screenshotCanvas.width = img.width;
      screenshotCanvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      saveCanvasState();
    };
    img.src = dataUrl;
  }

  function saveCanvasState() {
    if (historyStack.length >= 10) historyStack.shift();
    historyStack.push(ctx.getImageData(0, 0, screenshotCanvas.width, screenshotCanvas.height));
  }

  function restoreCanvasState() {
    if (historyStack.length > 1) {
      historyStack.pop();
      const lastState = historyStack[historyStack.length - 1];
      ctx.putImageData(lastState, 0, 0);
    } else if (baseImage) {
      ctx.drawImage(baseImage, 0, 0);
    }
  }

  function setTool(toolName, el) {
    activeTool = toolName;
    [toolBox, toolPencil, toolArrow].forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
  }

  toolBox.addEventListener('click', () => setTool('box', toolBox));
  toolPencil.addEventListener('click', () => setTool('pencil', toolPencil));
  toolArrow.addEventListener('click', () => setTool('arrow', toolArrow));

  toolUndo.addEventListener('click', () => {
    restoreCanvasState();
  });

  toolClear.addEventListener('click', () => {
    if (baseImage) {
      ctx.drawImage(baseImage, 0, 0);
      historyStack = [];
      saveCanvasState();
    }
  });

  function getCanvasCoords(e) {
    const rect = screenshotCanvas.getBoundingClientRect();
    const scaleX = screenshotCanvas.width / rect.width;
    const scaleY = screenshotCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  screenshotCanvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const coords = getCanvasCoords(e);
    startX = coords.x;
    startY = coords.y;

    if (activeTool === 'pencil') {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4 * (screenshotCanvas.width / 800);
      ctx.lineCap = 'round';
    }
  });

  screenshotCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const coords = getCanvasCoords(e);

    if (activeTool === 'pencil') {
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    }
  });

  screenshotCanvas.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const coords = getCanvasCoords(e);

    const scaleFactor = screenshotCanvas.width / 800;

    if (activeTool === 'box') {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = Math.max(3, 4 * scaleFactor);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      const width = coords.x - startX;
      const height = coords.y - startY;
      ctx.fillRect(startX, startY, width, height);
      ctx.strokeRect(startX, startY, width, height);
      saveCanvasState();
    } else if (activeTool === 'arrow') {
      drawArrow(startX, startY, coords.x, coords.y, Math.max(3, 4 * scaleFactor));
      saveCanvasState();
    } else if (activeTool === 'pencil') {
      saveCanvasState();
    }
  });

  function drawArrow(fromX, fromY, toX, toY, lineWidth) {
    const headlen = 16 * (screenshotCanvas.width / 800);
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);

    ctx.strokeStyle = '#ef4444';
    ctx.fillStyle = '#ef4444';
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.lineTo(toX, toY);
    ctx.fill();
  }

  // --- 3. Diagnostics Accordion Rendering ---

  function renderConsoleLogs(logs) {
    badgeConsoleCount.textContent = `${logs.length} Logs`;
    if (logs.length > 0) {
      badgeConsoleCount.className = 'pill-badge error';
      consoleLogsList.innerHTML = logs.map(log => `
        <div class="log-entry ${log.type === 'warn' ? 'warn' : ''}">
          <div><strong>[${log.type.toUpperCase()}]</strong> ${escapeHtml(log.message)}</div>
          <div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">${log.timestamp}</div>
        </div>
      `).join('');
    } else {
      badgeConsoleCount.className = 'pill-badge info';
      consoleLogsList.innerHTML = '<p class="empty-state">No console errors or warnings recorded.</p>';
    }
  }

  function renderNetworkLogs(logs) {
    badgeNetworkCount.textContent = `${logs.length} Failures`;
    if (logs.length > 0) {
      badgeNetworkCount.className = 'pill-badge warning';
      networkLogsList.innerHTML = logs.map(net => `
        <div class="log-entry warn">
          <div><strong>[${net.method}] ${net.status} ${escapeHtml(net.statusText)}</strong></div>
          <div style="font-size: 10px; color: #cbd5e1; word-break: break-all;">${escapeHtml(net.url)}</div>
          <div style="font-size: 9px; color: #94a3b8;">Duration: ${net.durationMs}ms | ${net.timestamp}</div>
        </div>
      `).join('');
    } else {
      badgeNetworkCount.className = 'pill-badge info';
      networkLogsList.innerHTML = '<p class="empty-state">No HTTP non-2xx network requests recorded.</p>';
    }
  }

  function renderMetadata(meta) {
    if (meta.url) {
      try {
        const parsed = new URL(meta.url);
        metaUrlDomain.textContent = parsed.hostname;
      } catch (e) {
        metaUrlDomain.textContent = 'URL Info';
      }
    }

    metadataTable.innerHTML = `
      <div class="metadata-label">URL:</div>
      <div class="metadata-val">${escapeHtml(meta.url || 'N/A')}</div>
      <div class="metadata-label">User Agent:</div>
      <div class="metadata-val">${escapeHtml(meta.userAgent || 'N/A')}</div>
      <div class="metadata-label">Screen:</div>
      <div class="metadata-val">${meta.screenWidth}x${meta.screenHeight}</div>
      <div class="metadata-label">Viewport:</div>
      <div class="metadata-val">${meta.viewportWidth}x${meta.viewportHeight} (Ratio: ${meta.pixelRatio}x)</div>
      <div class="metadata-label">Platform:</div>
      <div class="metadata-val">${escapeHtml(meta.platform || 'N/A')}</div>
      <div class="metadata-label">LocalStorage:</div>
      <div class="metadata-val">${meta.localStorageCount || 0} keys captured</div>
    `;
  }

  // Accordion Toggle Handlers
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.closest('.accordion-item');
      const wasActive = item.classList.contains('active');
      
      document.querySelectorAll('.accordion-item').forEach(i => i.classList.remove('active'));
      if (!wasActive) {
        item.classList.add('active');
      }
    });
  });

  // --- 4. Submit Issue Handler ---

  btnSubmitTicket.addEventListener('click', async () => {
    const title = bugTitleInput.value.trim();
    const severity = bugSeveritySelect.value;
    const steps = bugStepsTextarea.value.trim();

    if (!title) {
      showStatus('Please enter a bug title before submitting.', 'error');
      bugTitleInput.focus();
      return;
    }

    setSubmittingState(true);
    showStatus('Preparing diagnostic payload and screenshot...', 'info');

    let screenshotBase64 = null;
    try {
      screenshotBase64 = screenshotCanvas.toDataURL('image/png');
    } catch (e) {
      console.warn('Canvas export error:', e);
    }

    const payload = {
      title,
      severity,
      steps,
      metadata: currentDiagnostics.metadata || {},
      consoleLogs: currentDiagnostics.consoleLogs || [],
      networkLogs: currentDiagnostics.networkLogs || [],
      screenshotBase64
    };

    try {
      let result = null;
      if (currentSettings.activeTarget === 'jira') {
        showStatus('Exporting ticket to Jira Cloud...', 'info');
        result = await JiraAPI.createIssue({
          domain: currentSettings.jiraDomain,
          email: currentSettings.jiraEmail,
          apiToken: currentSettings.jiraApiToken,
          projectKey: currentSettings.jiraProjectKey,
          issueType: currentSettings.jiraIssueType,
          component: currentSettings.jiraComponent,
          assignee: currentSettings.jiraAssignee,
          priority: currentSettings.jiraPriority,
          environment: currentSettings.jiraEnvironment,
          ...payload
        });
      } else {
        showStatus('Exporting ticket to GitHub Issues...', 'info');
        result = await GitHubAPI.createIssue({
          token: currentSettings.githubToken,
          owner: currentSettings.githubOwner,
          repo: currentSettings.githubRepo,
          ...payload
        });
      }

      setSubmittingState(false);
      showSuccessStatus(result.key || 'Ticket Created', result.url);
    } catch (err) {
      setSubmittingState(false);
      showStatus(`Submission Failed: ${err.message}`, 'error');
    }
  });

  function setSubmittingState(loading) {
    btnSubmitTicket.disabled = loading;
    submitBtnLabel.textContent = loading ? 'Submitting Ticket...' : 'Export Bug Ticket';
  }

  function showStatus(msg, type) {
    statusBanner.className = `status-banner ${type}`;
    statusText.textContent = msg;
    statusBanner.classList.remove('hidden');
  }

  function showSuccessStatus(issueKey, issueUrl) {
    statusBanner.className = 'status-banner success';
    statusText.innerHTML = `🎉 Successfully Created <strong>${escapeHtml(issueKey)}</strong>! <a href="${issueUrl}" target="_blank" style="color: #34d399; font-weight:700; text-decoration:underline;">View Issue ↗</a>`;
    statusBanner.classList.remove('hidden');
  }

  // --- 5. Settings & Config Modal Logic ---

  btnOpenSettings.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  radioGithub.addEventListener('change', () => toggleTargetPanels('github'));
  radioJira.addEventListener('change', () => toggleTargetPanels('jira'));

  function toggleTargetPanels(target) {
    testFeedback.className = 'test-feedback hidden';
    if (target === 'jira') {
      panelGithub.classList.add('hidden');
      panelJira.classList.remove('hidden');
    } else {
      panelJira.classList.add('hidden');
      panelGithub.classList.remove('hidden');
    }
  }

  function populateSettingsForm(s) {
    if (s.activeTarget === 'jira') {
      radioJira.checked = true;
      toggleTargetPanels('jira');
    } else {
      radioGithub.checked = true;
      toggleTargetPanels('github');
    }

    cfgGithubToken.value = s.githubToken || '';
    cfgGithubOwner.value = s.githubOwner || '';
    cfgGithubRepo.value = s.githubRepo || '';
    cfgJiraDomain.value = s.jiraDomain || '';
    cfgJiraEmail.value = s.jiraEmail || '';
    cfgJiraToken.value = s.jiraApiToken || '';
    cfgJiraProject.value = s.jiraProjectKey || '';
    cfgJiraIssueType.value = s.jiraIssueType || 'Bug';
    cfgJiraComponent.value = s.jiraComponent || '';
    cfgJiraPriority.value = s.jiraPriority || 'Medium';
    cfgJiraEnvironment.value = s.jiraEnvironment || 'Production';
    cfgJiraAssignee.value = s.jiraAssignee || '';
  }

  btnTestConfig.addEventListener('click', async () => {
    const isJira = radioJira.checked;
    testFeedback.className = 'test-feedback';
    testFeedback.textContent = 'Testing connection...';
    testFeedback.classList.remove('hidden');

    try {
      if (isJira) {
        await JiraAPI.validateConfig(
          cfgJiraDomain.value,
          cfgJiraEmail.value,
          cfgJiraToken.value,
          cfgJiraProject.value
        );
        testFeedback.className = 'test-feedback success';
        testFeedback.textContent = '✅ Jira Connection Successful! Project verified.';
      } else {
        await GitHubAPI.validateConfig(
          cfgGithubToken.value,
          cfgGithubOwner.value,
          cfgGithubRepo.value
        );
        testFeedback.className = 'test-feedback success';
        testFeedback.textContent = '✅ GitHub Connection Successful! Repository verified.';
      }
    } catch (err) {
      testFeedback.className = 'test-feedback error';
      testFeedback.textContent = `❌ Connection Error: ${err.message}`;
    }
  });

  btnSaveConfig.addEventListener('click', async () => {
    const newSettings = {
      activeTarget: radioJira.checked ? 'jira' : 'github',
      githubToken: cfgGithubToken.value.trim(),
      githubOwner: cfgGithubOwner.value.trim(),
      githubRepo: cfgGithubRepo.value.trim(),
      jiraDomain: cfgJiraDomain.value.trim(),
      jiraEmail: cfgJiraEmail.value.trim(),
      jiraApiToken: cfgJiraToken.value.trim(),
      jiraProjectKey: cfgJiraProject.value.trim(),
      jiraIssueType: cfgJiraIssueType.value.trim() || 'Bug',
      jiraComponent: cfgJiraComponent.value.trim(),
      jiraPriority: cfgJiraPriority.value,
      jiraEnvironment: cfgJiraEnvironment.value,
      jiraAssignee: cfgJiraAssignee.value.trim()
    };

    await StorageManager.saveSettings(newSettings);
    currentSettings = newSettings;
    updateTargetBadgeUI(newSettings.activeTarget);

    testFeedback.className = 'test-feedback success';
    testFeedback.textContent = '✅ Settings saved successfully!';
    testFeedback.classList.remove('hidden');

    setTimeout(() => {
      settingsModal.classList.add('hidden');
    }, 600);
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
