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

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function copyRichLinks(links) {
  const plain = links.map((l) => l.url).join("\n");
  const htmlBody = links
    .map(
      (l) =>
        `<a href="${escapeHtml(l.url)}">${escapeHtml(l.title || l.url)}</a>`
    )
    .join("<br>\n");
  const html = `<meta charset="utf-8">${htmlBody}`;
  const item = new ClipboardItem({
    "text/plain": new Blob([plain], { type: "text/plain" }),
    "text/html": new Blob([html], { type: "text/html" }),
  });
  try {
    await navigator.clipboard.write([item]);
  } catch {
    await navigator.clipboard.writeText(plain);
  }
}

async function loadCurrentTabUrls() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const urls = tabs
    .map((t) => t.url)
    .filter((url) => url && !isNewTabLike(url));
  return urls;
}

async function titleByUrlForCurrentWindow() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const map = new Map();
  for (const t of tabs) {
    if (t.url && !isNewTabLike(t.url)) {
      map.set(t.url, t.title || t.url);
    }
  }
  return map;
}

async function copyLinksFromTextarea() {
  const ta = document.getElementById("urls");
  const urls = parseLines(ta.value);
  if (urls.length === 0) return;

  const titles = await titleByUrlForCurrentWindow();
  const links = urls.map((url) => ({
    url,
    title: titles.get(url) || url,
  }));
  await copyRichLinks(links);
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
  const copyBtn = document.getElementById("copy");
  const openBtn = document.getElementById("open");

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

  copyBtn.addEventListener("click", () => {
    copyLinksFromTextarea();
  });

  openBtn.addEventListener("click", () => {
    openAllFromTextarea();
  });
}

document.addEventListener("DOMContentLoaded", init);
