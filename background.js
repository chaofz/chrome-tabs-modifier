// windowId -> { tabId, index }
const activeTabInfo = new Map();
// tabId -> { windowId, index }
const tabIndexMap = new Map();

function refreshWindowTabs(windowId) {
  return chrome.tabs.query({ windowId }).then((tabs) => {
    for (const tab of tabs) {
      tabIndexMap.set(tab.id, { windowId: tab.windowId, index: tab.index });
      if (tab.active) {
        activeTabInfo.set(tab.windowId, { tabId: tab.id, index: tab.index });
      }
    }
  });
}

chrome.windows.getAll({ populate: true }).then((windows) => {
  for (const win of windows) {
    for (const tab of win.tabs) {
      tabIndexMap.set(tab.id, { windowId: win.id, index: tab.index });
      if (tab.active) {
        activeTabInfo.set(win.id, { tabId: tab.id, index: tab.index });
      }
    }
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  const active = activeTabInfo.get(tab.windowId);
  if (!active) {
    refreshWindowTabs(tab.windowId);
    return;
  }

  const desiredIndex = active.index + 1;
  if (tab.index === desiredIndex) {
    refreshWindowTabs(tab.windowId);
    return;
  }

  chrome.tabs.move(tab.id, { index: desiredIndex }).then(() =>
    refreshWindowTabs(tab.windowId)
  );
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
    );
  });
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  chrome.tabs.get(tabId).then((tab) => {
    activeTabInfo.set(windowId, { tabId: tab.id, index: tab.index });
    tabIndexMap.set(tab.id, { windowId, index: tab.index });
  });
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
      const others = tabs.filter((t) => t.id !== active.id).map((t) => t.id);
      if (others.length) chrome.tabs.remove(others);
    } else if (command === "close-tabs-to-right") {
      const right = tabs.filter((t) => t.index > active.index).map((t) => t.id);
      if (right.length) chrome.tabs.remove(right);
    } else if (command === "duplicate-tab") {
      chrome.tabs.duplicate(active.id);
    }
  });
});
