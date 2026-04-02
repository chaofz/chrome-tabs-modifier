# Tabs Modifier

A powerful Chrome extension to manage tab behavior and perform bulk actions.

## Features

- **Smart New Tabs**: New tabs open immediately to the right of the active tab.
- **Left-Neighbor Activation**: Closing a tab activates the tab to its left.
- **Bulk Tab Management**:
  - **Open/Copy Panel**: Press `⌘⇧O` (Mac) or `Ctrl+Shift+O` (Win/Linux) to open a panel where you can see all current URLs, copy them, or paste a list of URLs to open them all at once.
- **Keyboard Shortcuts**:
  - `⌘.` (Mac) or `Ctrl+.` (Win/Linux): Copy current tab URL to clipboard.
  - `⌘⇧E` (Mac) or `Ctrl+Shift+E` (Win/Linux): Close all other tabs.
  - `Close all tabs to the right` (Customizable shortcut).

## Permissions

- **`tabs`**: To manage tab positions and activation.
- **`activeTab` & `scripting`**: To copy the current URL to your clipboard.
- **`clipboardWrite`**: To allow the extension to write URLs to your clipboard without repeated browser prompts.

## Install

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder.
4. Pin the extension to your toolbar for easy access to the bulk panel.

## Customization

You can change any keyboard shortcut by going to `chrome://extensions/shortcuts`.
