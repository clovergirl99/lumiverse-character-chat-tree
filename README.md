# Character Chat Tree — 2.3.0

Use the pencil button beside any chat or branch to rename it without opening it. Enter saves, Escape or Cancel discards the draft. Save errors remain visible so you can retry. Your active chat stays unchanged.

Update from the same GitHub repository, then reload Lumiverse. No uninstall or settings reset is needed.

# Character Chat Tree

An independent, unofficial extension compatible with Lumiverse.

## Install from GitHub

In Lumiverse, open Extensions, choose Add Extension, and paste:

https://github.com/clovergirl99/lumiverse-character-chat-tree

Install and enable the extension. Grant its requested permissions if prompted.

The checked-in frontend.js is the original compiled extension, unchanged. spindle.json points to it directly, so no build step is needed. The original ZIP is included with the original documentation and any available source files and tests.

---

# Character Chat Tree for Lumiverse

Adds a **Chats** drawer tab alongside Lumiverse's built-in Branches view. It shows only chats and branches belonging to the current character, including when the active chat itself has no branches.

## Features

- Registers a distinct **Chats** sidebar tab scoped to the current character and independent of the built-in branch tree.
- All Chats loads every chat for the current character, including chats hidden from the recent-chat screen, and reconstructs every branch tree from `metadata.branched_from`.
- Groups conversation trees by character, shows known message counts and update times, and marks the active chat.
- Searches chat and character names while retaining the ancestor path to matching branches.
- Lets you expand or collapse each branch subtree independently, with **Expand all** and **Collapse all** controls. Searching temporarily expands matching paths.
- Refreshes only when the active character changes, a chat is created, or a chat is deleted. Message sends and generation activity do not reload the panel.
- Falls back to Lumiverse's frontend character-chat list immediately if the extension backend is slow or unavailable, rather than leaving the panel on an endless loading screen.
- Version 2.1 has no extension backend or frontend/backend handshake. It reads the same authenticated REST endpoints as Lumiverse's built-in chat UI, with a five-second timeout and an explicit error state.

The new sidebar icon is labeled **Chats** and the panel header says **Character Chats**. It is separate from Lumiverse's built-in **Branch** icon.

> **Upgrading from versions 1.x:** uninstall **All Branches** first. Version 2 uses a new `character_chat_tree` identifier specifically to avoid the stale worker and persisted tab placement created by early versions.

## Install locally

1. Copy this entire folder to Lumiverse's `data/extensions/character_chat_tree/` directory.
2. In Lumiverse, open **Extensions**, choose **Import Local**, and select **Character Chat Tree**.
3. Enable the extension.
4. Grant the requested **Chats** and **UI Panels** permissions.

The checked-in `dist/` files make a local import ready to use; Bun is not needed on the Lumiverse server just to run it.

## Install from GitHub

1. Put this folder in its own GitHub repository.
2. Replace the `github` and `homepage` values in `spindle.json` with that repository URL.
3. Run `npm install && npm run build` (or the equivalent Bun commands) and commit `dist/` plus the lockfile.
4. In Lumiverse's Extensions panel, choose **Add Extension**, paste the repository URL, install, enable, and grant permissions.

## Develop

```sh
npm install
npm run typecheck
npm test
npm run build
```

Built against Lumiverse's Spindle API and `lumiverse-spindle-types` 0.6.12.


