const TAG = "[TabNeighbors]";

// windowId -> { tabId, index }
const activeTabInfo = new Map();
// tabId -> { windowId, index }
const tabIndexMap = new Map();

async function refreshWindowTabs(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  for (const tab of tabs) {
    tabIndexMap.set(tab.id, { windowId: tab.windowId, index: tab.index });
    if (tab.active) {
      activeTabInfo.set(tab.windowId, { tabId: tab.id, index: tab.index });
    }
  }
}

async function initAllWindows() {
  const windows = await chrome.windows.getAll({ populate: true });
  for (const win of windows) {
    for (const tab of win.tabs) {
      tabIndexMap.set(tab.id, { windowId: win.id, index: tab.index });
      if (tab.active) {
        activeTabInfo.set(win.id, { tabId: tab.id, index: tab.index });
      }
    }
  }
  console.log(TAG, "Initialized. Tracking", tabIndexMap.size, "tabs across", windows.length, "windows");
}

// --- New tab: move to right of active tab ---

chrome.tabs.onCreated.addListener(async (tab) => {
  try {
    const active = activeTabInfo.get(tab.windowId);
    if (!active) {
      console.log(TAG, "Tab created: id=%d, no active tab tracked for window %d — skipping move", tab.id, tab.windowId);
      await refreshWindowTabs(tab.windowId);
      return;
    }

    const desiredIndex = active.index + 1;

    if (tab.index === desiredIndex) {
      console.log(TAG, "Tab created: id=%d already at desired index %d — no move needed", tab.id, desiredIndex);
      await refreshWindowTabs(tab.windowId);
      return;
    }

    const moved = await chrome.tabs.move(tab.id, { index: desiredIndex });
    await refreshWindowTabs(tab.windowId);

    const actualIndex = Array.isArray(moved) ? moved[0].index : moved.index;
    if (actualIndex !== desiredIndex) {
      console.warn(TAG, "New tab placement failed: expected index %d, got %d (tab %d)", desiredIndex, actualIndex, tab.id);
    } else {
      console.log(
        TAG,
        "Tab created: id=%d, moved to index %d (right of active tab %d at index %d)",
        tab.id, actualIndex, active.tabId, active.index
      );
    }
  } catch (error) {
    console.error(TAG, "onCreated handler error:", error);
  }
});

// --- Tab closed: activate left neighbor ---

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  try {
    if (removeInfo.isWindowClosing) {
      tabIndexMap.delete(tabId);
      return;
    }

    const closedInfo = tabIndexMap.get(tabId);
    tabIndexMap.delete(tabId);

    if (!closedInfo) {
      console.log(TAG, "Tab closed: id=%d, no index info tracked — skipping", tabId);
      return;
    }

    const windowId = closedInfo.windowId;
    const closedIndex = closedInfo.index;
    const targetIndex = Math.max(0, closedIndex - 1);

    const remainingTabs = await chrome.tabs.query({ windowId });
    if (remainingTabs.length === 0) return;

    const targetTab = remainingTabs.find((t) => t.index === targetIndex);
    if (!targetTab) {
      console.warn(TAG, "No tab found at target index %d in window %d", targetIndex, windowId);
      await refreshWindowTabs(windowId);
      return;
    }

    await chrome.tabs.update(targetTab.id, { active: true });

    const [verifyTab] = await chrome.tabs.query({ windowId, active: true });
    if (verifyTab && verifyTab.id !== targetTab.id) {
      console.warn(
        TAG,
        "Left-activate failed: expected tab %d, got %d",
        targetTab.id, verifyTab.id
      );
    } else {
      console.log(
        TAG,
        "Tab closed: id=%d at index %d, activated left neighbor tab %d at index %d",
        tabId, closedIndex, targetTab.id, targetIndex
      );
    }

    await refreshWindowTabs(windowId);
  } catch (error) {
    console.error(TAG, "onRemoved handler error:", error);
  }
});

// --- Track active tab changes ---

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    activeTabInfo.set(activeInfo.windowId, { tabId: tab.id, index: tab.index });
    tabIndexMap.set(tab.id, { windowId: activeInfo.windowId, index: tab.index });
  } catch (error) {
    console.error(TAG, "onActivated handler error:", error);
  }
});

// --- Keep indexes accurate on move/detach/attach ---

chrome.tabs.onMoved.addListener(async (_tabId, moveInfo) => {
  await refreshWindowTabs(moveInfo.windowId);
});

chrome.tabs.onDetached.addListener(async (_tabId, detachInfo) => {
  tabIndexMap.delete(_tabId);
  await refreshWindowTabs(detachInfo.oldWindowId);
});

chrome.tabs.onAttached.addListener(async (tabId, attachInfo) => {
  await refreshWindowTabs(attachInfo.newWindowId);
});

// --- Initialize on service worker start ---

initAllWindows();
