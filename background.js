// windowId -> { tabId, index } for the currently active tab
const activeTabInfo = new Map();
// tabId -> { windowId, index }
const tabIndexMap = new Map();

function seedFromTabs(tabs) {
  for (const t of tabs) {
    tabIndexMap.set(t.id, { windowId: t.windowId, index: t.index });
    if (t.active) {
      activeTabInfo.set(t.windowId, { tabId: t.id, index: t.index });
    }
  }
}

function refreshWindowTabs(windowId) {
  return chrome.tabs
    .query({ windowId })
    .then(seedFromTabs)
    .catch(() => {});
}

// Given a freshly queried tab list, pick the best "reference" tab that the
// new tab should be placed to the right of. Priority:
//   1. opener (link opened in new tab keeps context)
//   2. currently active tab that isn't the new one (new background tab)
//   3. cached previous-active tab (captured before any await in onCreated)
//   4. most recently accessed other tab (SW cold-start / no cache)
function pickReferenceTab(newTab, cachedActive, tabs) {
  if (newTab.openerTabId) {
    const opener = tabs.find((t) => t.id === newTab.openerTabId);
    if (opener) return opener;
  }

  const activeNow = tabs.find((t) => t.active && t.id !== newTab.id);
  if (activeNow) return activeNow;

  if (cachedActive && cachedActive.tabId !== newTab.id) {
    const cached = tabs.find((t) => t.id === cachedActive.tabId);
    if (cached) return cached;
  }

  const candidates = tabs
    .filter((t) => t.id !== newTab.id)
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return candidates[0] || null;
}

chrome.windows.getAll({ populate: true }).then((windows) => {
  for (const win of windows) {
    if (win.tabs) seedFromTabs(win.tabs);
  }
});

chrome.tabs.onCreated.addListener(async (tab) => {
  // Capture cache synchronously before any await so onActivated running
  // for the new tab during our await doesn't overwrite what we read.
  const cachedActive = activeTabInfo.get(tab.windowId);

  let tabs;
  try {
    tabs = await chrome.tabs.query({ windowId: tab.windowId });
  } catch {
    return;
  }

  // Refresh local state from the fresh query regardless of what we do next.
  seedFromTabs(tabs);

  const reference = pickReferenceTab(tab, cachedActive, tabs);
  if (!reference) return;

  // Use FRESH indices. The cached active.index can be stale after another
  // tab was closed/moved, which previously caused the new tab to land in
  // the wrong slot (sometimes still the rightmost).
  const newTabFresh = tabs.find((t) => t.id === tab.id);
  if (!newTabFresh) return; // already closed

  const maxIndex = tabs.length - 1;
  const desiredIndex = Math.min(reference.index + 1, maxIndex);
  if (newTabFresh.index === desiredIndex) return;

  const attemptMove = () =>
    chrome.tabs.move(tab.id, { index: desiredIndex });

  try {
    await attemptMove();
  } catch {
    // Transient: tab group boundary, pinned-tab constraint, or race with
    // another event. Retry once after giving Chrome a tick to settle.
    try {
      await new Promise((r) => setTimeout(r, 30));
      await attemptMove();
    } catch {
      // Give up silently; state will resync on the next event.
    }
  }
  refreshWindowTabs(tab.windowId);
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (removeInfo.isWindowClosing) {
    tabIndexMap.delete(tabId);
    return;
  }

  const closedInfo = tabIndexMap.get(tabId);
  tabIndexMap.delete(tabId);
  if (!closedInfo) return;

  const { windowId, index: closedIndex } = closedInfo;
  const targetIndex = Math.max(0, closedIndex - 1);

  chrome.tabs.query({ windowId }).then((tabs) => {
    if (tabs.length === 0) return;
    const target = tabs.find((t) => t.index === targetIndex);
    if (!target) {
      refreshWindowTabs(windowId);
      return;
    }
    chrome.tabs.update(target.id, { active: true }).then(() =>
      refreshWindowTabs(windowId)
    ).catch(() => {
      // Tab might have been closed
    });
  }).catch(() => {
    // Window might have been closed
  });
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  const known = tabIndexMap.get(tabId);
  if (known) {
    activeTabInfo.set(windowId, { tabId, index: known.index });
  }

  chrome.tabs.get(tabId).then((tab) => {
    if (chrome.runtime.lastError || !tab) return;
    activeTabInfo.set(windowId, { tabId: tab.id, index: tab.index });
    tabIndexMap.set(tab.id, { windowId, index: tab.index });
  }).catch(() => {});
});

chrome.tabs.onMoved.addListener((_tabId, moveInfo) => {
  refreshWindowTabs(moveInfo.windowId);
});

chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
  tabIndexMap.delete(tabId);
  refreshWindowTabs(detachInfo.oldWindowId);
});

chrome.tabs.onAttached.addListener((_tabId, attachInfo) => {
  refreshWindowTabs(attachInfo.newWindowId);
});

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ currentWindow: true }).then((tabs) => {
    const active = tabs.find((t) => t.active);
    if (!active) return;

    if (command === "close-other-tabs") {
      const others = tabs.filter((t) => t.id !== active.id && !t.pinned).map((t) => t.id);
      if (others.length) chrome.tabs.remove(others);
    } else if (command === "close-tabs-to-right") {
      const right = tabs.filter((t) => t.index > active.index).map((t) => t.id);
      if (right.length) chrome.tabs.remove(right);
    } else if (command === "copy-url") {
      const url = active.url;
      if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://')) {
        return;
      }
      const title = active.title || url;
      chrome.scripting.executeScript({
        target: { tabId: active.id },
        func: (payload) => {
          const { url, title } = payload;
          const escapeHtml = (s) =>
            s
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;");
          const html = `<meta charset="utf-8"><a href="${escapeHtml(url)}">${escapeHtml(title)}</a>`;
          const item = new ClipboardItem({
            "text/plain": new Blob([url], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          });
          return navigator.clipboard
            .write([item])
            .catch(() => navigator.clipboard.writeText(url));
        },
        args: [{ url, title }],
      }).catch(() => {
        // Fallback: some pages may block scripting
      });
    }
  });
});
