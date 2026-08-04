# 🐞 The "One-Click Bug Reporter" Chrome & Edge Extension (Manifest V3)

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Browser Support](https://img.shields.io/badge/Browsers-Chrome%20%7C%20Edge-blue.svg)](https://www.google.com/chrome/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Save QA Engineers & Developers 10+ minutes per bug ticket** by automatically capturing active viewport screenshots with canvas annotations, console errors, failed network requests, device/browser metadata, and exporting formatted bug reports directly into **Jira Cloud** or **GitHub Issues**.

---

## 📸 Overview & Extension Interface

```
+---------------------------------------------------------------------------------+
|  🐞 Bug Reporter                       [ GitHub ]  [ Alt+Shift+B ]  [ ⚙ Settings ]|
+---------------------------------------------------------------------------------+
|  Viewport Screenshot & Markup Canvas                                            |
|  [ ⬛ Rectangle ] [ ✏️ Pencil ] [ ➔ Arrow ] [ ↩ Undo ] [ 🗑️ Clear ]              |
|  +---------------------------------------------------------------------------+  |
|  |  (Annotated Screenshot Canvas)                                            |  |
|  +---------------------------------------------------------------------------+  |
|                                                                                 |
|  Bug Title *                                           Severity                 |
|  [ [Bug] Issue on Choose Your Motor Insurance...     ] [ Medium 🟡           v] |
|                                                                                 |
|  Steps to Reproduce / Details                                                   |
|  [ 1. Go to page... 2. Click submit button... 3. Observed 429 error...       ] |
|                                                                                 |
|  v 🚨 Captured Console Logs                            [ 2 Logs ] (Red)         |
|  v 🌐 Failed Network Calls                             [ 4 Failures ] (Yellow)  |
|  v 💻 Device & Metadata                                [ store-uat.tree.sa ]    |
|                                                                                 |
|  [ 🚀 EXPORT BUG TICKET                                                      ]  |
+---------------------------------------------------------------------------------+
```

---

## 🏛️ Project Architecture & Breakdown

The extension is designed around a decoupled, modular Manifest V3 architecture:

```
                      +---------------------------------------+
                      |         Target Web Page (Tab)         |
                      |  +---------------------------------+  |
                      |  | Page Script Sniffer             |  |
                      |  | Intercepts console.error/warn,  |  |
                      |  | fetch/XHR non-2xx failures      |  |
                      |  +----------------+----------------+  |
                      +-------------------|-------------------+
                                          | postMessage
                                          v
                      +---------------------------------------+
                      |           Content Script              |
                      | Gathers URL, UserAgent, Resolution,   |
                      | Viewport, LocalStorage & relays logs  |
                      +-------------------+-------------------+
                                          | chrome.runtime.sendMessage
                                          v
+---------------------------------------------------------------------------------+
|                         Background Service Worker                               |
| - chrome.tabs.captureVisibleTab (Full viewport screenshot)                      |
| - Background webRequest listener (synthesizing HTTP 429/500 errors into logs)   |
| - Manages diagnostic log buffers per tab                                        |
+----------------------------------------+----------------------------------------+
                                         | chrome.runtime.sendMessage
                                         v
+---------------------------------------------------------------------------------+
|                           Extension Popup UI & Canvas                           |
| - Live Screenshot Canvas with annotation tools (box, pencil, arrow)             |
| - Accordions: Console Logs & Failed Network Requests                            |
| - Platform Switcher: GitHub vs. Jira + API Auth Setup Modal                     |
+----------------------------------------+----------------------------------------+
                                         | Fetch REST API
                      +------------------+------------------+
                      |                                     |
                      v                                     v
          +-----------------------+             +-----------------------+
          |   GitHub Issues API   |             |   Jira Cloud API      |
          | - Create Issue        |             | - Create Issue (ADF)  |
          | - Embed Markdown/Data |             | - Custom Fields       |
          |                       |             | - Attach Screenshot   |
          +-----------------------+             +-----------------------+
```

### File Breakdown

```
├── manifest.json              # Extension Manifest V3 configuration (Chrome & Edge)
├── background/
│   └── service-worker.js      # Background worker handling screenshot capture & tab state
├── scripts/
│   ├── injected-sniffer.js    # Injected DOM script intercepting console errors & network failures
│   └── content-script.js      # Relays page metadata (URL, UserAgent, resolution, localStorage)
├── lib/
│   ├── storage.js             # Chrome storage manager for options & tokens
│   ├── github-api.js          # GitHub REST API client & markdown ticket formatter
│   └── jira-api.js            # Jira Cloud REST API v3 client, ADF builder & screenshot attacher
├── popup/
│   ├── popup.html             # Glassmorphism popup UI with canvas annotator & form inputs
│   ├── popup.css              # Dark theme design system with micro-interactions & badge styles
│   └── popup.js               # Interactive canvas renderer, accordion toggles, and issue exporter
├── icons/                     # Extension icons (logo.png, icon16.png, icon48.png, icon128.png)
├── build.js                   # Zero-dependency packaging script generating store ZIP archives
└── package.json               # NPM scripts and project metadata
```

---

## ⚡ Key Features

1. **Automatic Viewport Screenshot Capture & Annotation Tools**:
   - Uses `chrome.tabs.captureVisibleTab` to capture full high-resolution visible viewport screenshots.
   - Built-in canvas markup toolbar: Draw Red Highlight Box, Freehand Pencil, Arrow Tool, Undo, and Clear options.

2. **Diagnostics Collection Engine**:
   - **Console & DevTools Log Sniffer**: Intercepts `console.error`, `console.warn`, `console.assert`, unhandled JavaScript runtime errors, and promise rejections.
   - **Network Monitor & DevTools Error Synthesis**: Intercepts `window.fetch`, `XMLHttpRequest`, and background `chrome.webRequest` events. Automatically mirrors HTTP non-2xx status codes (e.g. 429 Too Many Requests, 500 Internal Error, 404, CORS) into both **Failed Network Calls** AND the **Captured Console Logs** stream.
   - **Device & Metadata Collector**: URL, Page Title, User Agent, Screen resolution, Viewport size, Device Pixel Ratio, OS/Platform, and LocalStorage keys snapshot.

3. **Multi-Platform Integration**:
   - **GitHub Issues**: Formats rich Markdown with collapsible `<details>` blocks for logs and embeds screenshot previews.
   - **Jira Cloud REST API**: Formats Atlassian Document Format (ADF) description, maps custom fields (Component, Priority, Environment, Assignee ID), and uploads annotated screenshot blobs via Jira Attachments API.

4. **Keyboard Shortcut (`Alt + Shift + B`)**:
   - Press **`Alt + Shift + B`** (Windows/Linux) or **`Option + Shift + B`** (macOS) on any web page to immediately open the Bug Reporter popup without using your mouse.

---

## 🌐 Installation Guide

### Installing on Google Chrome
1. Download or clone this repository to your local computer.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked**.
5. Select the project folder: `c:\Users\LENOVO\Downloads\One-Click Bug Reporter`.
6. Click the extension puzzle icon in your browser toolbar to pin **One-Click Bug Reporter**!

### Installing on Microsoft Edge
1. Open Microsoft Edge and navigate to `edge://extensions/`.
2. Turn on **Developer mode** toggle in the left sidebar menu.
3. Click **Load unpacked**.
4. Select the project folder: `c:\Users\LENOVO\Downloads\One-Click Bug Reporter`.
5. Click the extension puzzle icon in the top right to pin and launch the extension!

---

## ⚙️ Configuration & Setup

Click the gear icon (**Settings**) in the top right corner of the extension popup:

### GitHub Integration
1. Select **GitHub Issues** as target platform.
2. Enter your **Personal Access Token (PAT)** (Requires `public_repo` or `repo` scope).
3. Enter the **Repo Owner / Org** (e.g., `acme-corp`) and **Repository Name** (e.g., `my-app`).
4. Click **Test Connection** to verify permissions, then click **Save Settings**.

### Jira Cloud Integration
1. Select **Jira Cloud** as target platform.
2. Enter your **Jira Site Domain** (e.g., `company.atlassian.net`).
3. Enter your **User Email Address** (e.g., `qa@company.com`).
4. Enter your **Jira API Token** (Generated at `id.atlassian.com/manage-profile/security/api-tokens`).
5. Enter your **Project Key** (e.g., `BUG` or `PROJ`).
6. *(Optional)* Configure default **Component**, **Priority**, **Environment**, or **Assignee Account ID**.
7. Click **Test Connection**, then click **Save Settings**.

---

## 📦 Building Store ZIP Distribution Package

To package the extension for submission to the **Chrome Web Store** or **Microsoft Edge Add-ons Partner Center**:

```bash
npm run build
# OR
node build.js
```

This generates `dist/one-click-bug-reporter-v1.0.0.zip` ready for store uploads!

---

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
