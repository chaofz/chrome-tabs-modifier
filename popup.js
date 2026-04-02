function isNewTabLike(url) {
  if (!url || url === "") return true;
  const u = url.toLowerCase();
  if (u === "about:blank") return true;
  if (u.startsWith("chrome://newtab")) return true;
  if (u.startsWith("chrome://new-tab-page")) return true;
  if (u.startsWith("edge://newtab")) return true;
  return false;
}

function normalizeUrl(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
      return new URL(trimmed).href;
    }
    return new URL(`https://${trimmed}`).href;
  } catch {
    return null;
  }
}

function parseLines(text) {
  const lines = text.split(/\r\n|\n|\r/);
  const urls = [];
  for (const line of lines) {
    const href = normalizeUrl(line);
    if (href) urls.push(href);
  }
  return urls;
}

async function loadCurrentTabUrls() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const urls = tabs
    .map((t) => t.url)
    .filter((url) => url && !isNewTabLike(url));
  return urls;
}

function openAllFromTextarea() {
  const ta = document.getElementById("urls");
  const urls = parseLines(ta.value);
  if (urls.length === 0) return;

  // Fire creates in one synchronous turn so Chrome keeps the user-gesture
  // allowance for every tab (await between calls drops it after the first).
  for (let i = 0; i < urls.length; i++) {
    chrome.tabs.create({
      url: urls[i],
      active: i === 0,
    });
  }
  window.close();
}

function init() {
  const ta = document.getElementById("urls");
  const btn = document.getElementById("open");

  function scrollTextareaToContentBottom() {
    ta.scrollTop = ta.scrollHeight;
    ta.scrollLeft = 0;
  }

  loadCurrentTabUrls().then((urls) => {
    ta.value = urls.join("\n");
    ta.focus();
    ta.select();
    scrollTextareaToContentBottom();
    requestAnimationFrame(() => {
      scrollTextareaToContentBottom();
    });
  });

  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      openAllFromTextarea();
    }
  });

  btn.addEventListener("click", () => {
    openAllFromTextarea();
  });
}

document.addEventListener("DOMContentLoaded", init);
