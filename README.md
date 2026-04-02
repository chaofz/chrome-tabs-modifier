# Tab Neighbors

A Chrome extension that changes two default tab behaviors:

- **New tabs** open immediately to the right of the active tab (instead of at the end).
- **Closing a tab** activates the tab to the left (instead of the last-active tab).

## Install

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked** and select this folder
4. The extension is now active — no popup or toolbar icon, it runs in the background

## Debugging

Open `chrome://extensions/`, find **Tab Neighbors**, and click **"Inspect views: service worker"** to see console logs. Every tab move and activation is logged, and warnings appear if an operation didn't produce the expected result.
