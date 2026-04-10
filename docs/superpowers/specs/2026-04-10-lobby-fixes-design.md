---
title: Lobby Fixes & Invite Code Removal
date: 2026-04-10
status: approved
---

## Problem Summary

Three issues with the current lobby system:

1. **Cross-device visibility bug**: Public lobbies created on one device are not reliably visible on another device because the server only pushes `lobby-list` on-demand (when a client asks). New lobbies don't appear until the next 5-second poll tick, and there's a race condition when the socket hasn't connected yet before the first emit.

2. **Invite codes are unnecessary**: Public lobbies already appear in the list — requiring a 6-character code to join is redundant. Private lobbies only need a password as their barrier.

3. **Hard to find lobbies**: Related to bug #1 above. Stale lists make the lobby browser unreliable.

---

## Design

### 1. Real-time Lobby List

**Server (`index.js`):** After any lobby state change (create, join, leave, disconnect), broadcast the full updated lobby list to all connected sockets:
```
io.emit('lobby-list', manager.getLobbies())
```

**Client (`MainMenu.jsx`):** Also listen on `socket.on('connect', ...)` to request the lobby list immediately on (re)connect. This fixes the race condition where `socket.emit('get-lobbies')` fires before the socket is ready.

### 2. Remove Invite Code

**`Lobby.jsx`:** Remove the invite code display block (`邀請碼：{lobby.code}`). Replace with just the 🔒/🌐 badge already present in the settings panel.

**`MainMenu.jsx`:** Remove:
- The "加入 Lobby" button
- The `view === 'join'` form (invite code + password inputs)
- Related state: `joinCode`, `joinPassword`, `handleJoin`

### 3. All Lobbies in List, Inline Password for Private

**Server (`gameManager.js`):** Rename `getPublicLobbies()` to `getLobbies()`. Return all lobbies with `state === 'waiting'` (both public and private). Add `isPrivate` to each entry.

**Client (`MainMenu.jsx`):** 
- Lobby list renders all lobbies. Private ones show a 🔒 icon.
- New state: `joiningPrivate` — stores `{ code }` of the lobby being joined with a password.
- When user clicks join on a private lobby: show a small inline password input + confirm button for that row.
- When user clicks join on a public lobby: join immediately (existing `handleQuickJoin` behaviour).

---

## Files Changed

| File | Change |
|------|--------|
| `server/src/gameManager.js` | Rename `getPublicLobbies` → `getLobbies`, include `isPrivate` in result |
| `server/src/index.js` | Broadcast `lobby-list` to all sockets after lobby state changes |
| `client/src/pages/MainMenu.jsx` | Remove invite code join view; add inline password prompt for private lobbies |
| `client/src/pages/Lobby.jsx` | Remove invite code display |

---

## Out of Scope

- No changes to game logic, scoring, or settings
- No changes to how private lobbies are created (password set at creation time, unchanged)
- No URL-based lobby joining
