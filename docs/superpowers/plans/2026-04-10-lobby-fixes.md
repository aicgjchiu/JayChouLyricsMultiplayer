# Lobby Fixes & Invite Code Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix real-time lobby visibility across devices, remove invite codes entirely, and show all lobbies (public + private 🔒) in one list with inline password prompt for private ones.

**Architecture:** Server broadcasts `lobby-list` to all connected sockets whenever any lobby changes state. Client listens on `connect` event to re-fetch on reconnect. Invite code UI is removed; private lobbies use password-only gating and appear in the shared lobby list.

**Tech Stack:** Node.js/Express/Socket.IO (server), React/Vite (client), Vitest (tests)

**Working directory:** `E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/.worktrees/feature-multiplayer/`

---

## File Map

| File | Change |
|------|--------|
| `server/src/gameManager.js` | Rename `getPublicLobbies` → `getLobbies`; include all waiting lobbies + `isPrivate` field |
| `server/src/index.js` | Broadcast `lobby-list` to all sockets after every lobby state change |
| `server/tests/gameManager.test.js` | Update test for renamed method and new behavior |
| `client/src/pages/MainMenu.jsx` | Remove invite-code join view; add inline password prompt; fix socket connect timing |
| `client/src/pages/Lobby.jsx` | Remove invite code display block |

---

## Task 1: Update `getLobbies` in gameManager.js

**Files:**
- Modify: `server/src/gameManager.js` (method `getPublicLobbies`, around line 26)
- Test: `server/tests/gameManager.test.js` (describe block `GameManager.getPublicLobbies`, line 117)

- [ ] **Step 1: Update the failing test first**

Replace the `describe('GameManager.getPublicLobbies', ...)` block in `server/tests/gameManager.test.js` with:

```js
describe('GameManager.getLobbies', () => {
  it('returns all waiting lobbies (public and private) with isPrivate field', () => {
    const mgr = new GameManager();
    mgr.createLobby('h1', { nickname: 'H1', lobbyName: 'Public', numQuestions: 5, timeLimit: 30, isPrivate: false, password: null });
    mgr.createLobby('h2', { nickname: 'H2', lobbyName: 'Private', numQuestions: 5, timeLimit: 30, isPrivate: true, password: 'pw' });
    const list = mgr.getLobbies();
    expect(list).toHaveLength(2);
    const pub = list.find(l => l.name === 'Public');
    const priv = list.find(l => l.name === 'Private');
    expect(pub.isPrivate).toBe(false);
    expect(priv.isPrivate).toBe(true);
  });

  it('excludes lobbies that are in_question or finished', () => {
    const mgr = new GameManager();
    mgr.createLobby('h1', { nickname: 'H1', lobbyName: 'Waiting', numQuestions: 5, timeLimit: 30, isPrivate: false, password: null });
    const inProg = mgr.createLobby('h2', { nickname: 'H2', lobbyName: 'InProgress', numQuestions: 5, timeLimit: 30, isPrivate: false, password: null });
    inProg.state = 'in_question';
    const list = mgr.getLobbies();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Waiting');
  });
});
```

- [ ] **Step 2: Run tests to verify the new test fails**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/.worktrees/feature-multiplayer/server"
npm test
```

Expected: FAIL — `mgr.getLobbies is not a function`

- [ ] **Step 3: Update `gameManager.js`**

In `server/src/gameManager.js`, replace the `getPublicLobbies` method (lines 26-30):

```js
getLobbies() {
  return [...this.lobbies.values()]
    .filter(l => l.state === 'waiting')
    .map(l => ({
      code: l.id,
      name: l.name,
      playerCount: l.players.length,
      maxPlayers: l.maxPlayers,
      isPrivate: l.isPrivate,
    }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/.worktrees/feature-multiplayer/server"
npm test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/.worktrees/feature-multiplayer"
git add server/src/gameManager.js server/tests/gameManager.test.js
git commit -m "refactor: rename getPublicLobbies to getLobbies, return all waiting lobbies with isPrivate"
```

---

## Task 2: Broadcast lobby list on every state change in index.js

**Files:**
- Modify: `server/src/index.js`

No new tests needed — this is integration-level socket plumbing; existing tests cover the underlying manager logic.

- [ ] **Step 1: Replace `server/src/index.js` with the updated version**

```js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GameManager } from './gameManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const manager = new GameManager();

function broadcastLobbyList() {
  io.emit('lobby-list', manager.getLobbies());
}

// Serve audio files
app.use('/audio', express.static(join(__dirname, '../../audio')));

// Serve React production build
app.use(express.static(join(__dirname, '../../client/dist')));
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, '../../client/dist/index.html'));
});

io.on('connection', (socket) => {
  socket.on('get-lobbies', () => {
    socket.emit('lobby-list', manager.getLobbies());
  });

  socket.on('create-lobby', (data) => {
    const lobby = manager.createLobby(socket.id, data);
    socket.join(lobby.id);
    socket.emit('joined-lobby', { code: lobby.id });
    io.to(lobby.id).emit('lobby-updated', manager.lobbyPayload(lobby));
    broadcastLobbyList();
  });

  socket.on('join-lobby', (data) => {
    const result = manager.joinLobby(socket.id, data);
    if (result.error) { socket.emit('error', { message: result.error }); return; }
    socket.join(result.lobby.id);
    socket.emit('joined-lobby', { code: result.lobby.id });
    io.to(result.lobby.id).emit('lobby-updated', manager.lobbyPayload(result.lobby));
    broadcastLobbyList();
  });

  socket.on('start-game', () => manager.startGame(socket.id, io));

  socket.on('submit-answer', (data) => manager.submitAnswer(socket.id, data, io));

  socket.on('restart-lobby', () => manager.restartLobby(socket.id, io));
  socket.on('update-settings', (data) => manager.updateSettings(socket.id, data, io));

  socket.on('leave-lobby', () => {
    manager.leaveLobby(socket.id, io);
    broadcastLobbyList();
  });

  socket.on('disconnect', () => {
    manager.handleDisconnect(socket.id, io);
    broadcastLobbyList();
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
```

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/.worktrees/feature-multiplayer/server"
npm test
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/.worktrees/feature-multiplayer"
git add server/src/index.js
git commit -m "feat: broadcast lobby-list to all sockets on every lobby state change"
```

---

## Task 3: Remove invite code from Lobby.jsx

**Files:**
- Modify: `client/src/pages/Lobby.jsx` (lines 29-31)

- [ ] **Step 1: Remove the invite code display block**

In `client/src/pages/Lobby.jsx`, remove lines 29-31:

```jsx
      <div style={{ background: '#f5f5f5', borderRadius: 8, padding: '8px 16px', marginBottom: 20, fontFamily: 'monospace', fontSize: 22, letterSpacing: 6, textAlign: 'center' }}>
        邀請碼：{lobby.code}
      </div>
```

The `isPrivate` badge already exists further down (line 72-74), so no replacement is needed.

- [ ] **Step 2: Commit**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/.worktrees/feature-multiplayer"
git add client/src/pages/Lobby.jsx
git commit -m "feat: remove invite code display from lobby room"
```

---

## Task 4: Rewrite MainMenu.jsx — remove invite-code join, add inline password prompt

**Files:**
- Modify: `client/src/pages/MainMenu.jsx`

- [ ] **Step 1: Replace `client/src/pages/MainMenu.jsx` with the updated version**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import socket from '../socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';

export default function MainMenu({ nickname, setNickname }) {
  const [view, setView] = useState('home'); // 'home' | 'create'
  const [lobbyList, setLobbyList] = useState([]);
  const [form, setForm] = useState({
    lobbyName: '', numQuestions: 10, timeLimit: 30, isPrivate: false, password: '',
  });
  const [joiningPrivate, setJoiningPrivate] = useState(null); // { code } | null
  const [privatePassword, setPrivatePassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fetchLobbies = () => socket.emit('get-lobbies');
    fetchLobbies();
    socket.on('connect', fetchLobbies);
    const interval = setInterval(fetchLobbies, 5000);
    return () => {
      socket.off('connect', fetchLobbies);
      clearInterval(interval);
    };
  }, []);

  useSocketEvent('lobby-list', useCallback((list) => setLobbyList(list), []));
  useSocketEvent('error', useCallback(({ message }) => setErrorMsg(message), []));

  function handleCreate(e) {
    e.preventDefault();
    if (!nickname.trim()) { setErrorMsg('請輸入暱稱'); return; }
    setErrorMsg('');
    socket.emit('create-lobby', {
      nickname: nickname.trim(),
      lobbyName: form.lobbyName || `${nickname.trim()}'s Lobby`,
      numQuestions: form.numQuestions,
      timeLimit: form.timeLimit,
      isPrivate: form.isPrivate,
      password: form.isPrivate ? form.password : null,
    });
  }

  function handleQuickJoin(lobby) {
    if (!nickname.trim()) { setErrorMsg('請先輸入暱稱'); return; }
    if (lobby.isPrivate) {
      setJoiningPrivate({ code: lobby.code });
      setPrivatePassword('');
      return;
    }
    setErrorMsg('');
    socket.emit('join-lobby', { lobbyCode: lobby.code, nickname: nickname.trim(), password: null });
  }

  function handlePrivateJoin(e) {
    e.preventDefault();
    if (!nickname.trim()) { setErrorMsg('請先輸入暱稱'); return; }
    setErrorMsg('');
    socket.emit('join-lobby', { lobbyCode: joiningPrivate.code, nickname: nickname.trim(), password: privatePassword || null });
    setJoiningPrivate(null);
    setPrivatePassword('');
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <h1 style={{ textAlign: 'center', marginBottom: 24 }}>🎵 Jay Chou Lyrics</h1>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4 }}>暱稱</label>
        <input
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          placeholder="輸入你的暱稱..."
          maxLength={16}
          style={{ width: '100%', padding: '8px 12px', fontSize: 16, boxSizing: 'border-box' }}
        />
      </div>

      {errorMsg && <p style={{ color: 'red', margin: '8px 0' }}>{errorMsg}</p>}

      {view === 'home' && (
        <>
          <div style={{ marginBottom: 24 }}>
            <button onClick={() => setView('create')} style={{ width: '100%', padding: 10, fontSize: 16 }}>
              建立 Lobby
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Lobbies</h3>
            <button onClick={() => socket.emit('get-lobbies')} style={{ padding: '4px 10px', fontSize: 13 }}>重新整理</button>
          </div>
          {lobbyList.length === 0 && <p style={{ color: '#888' }}>目前沒有 Lobby</p>}
          {lobbyList.map(l => (
            <div key={l.code}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                <span>{l.isPrivate ? '🔒 ' : ''}{l.name}</span>
                <span style={{ color: '#888', fontSize: 14 }}>{l.playerCount}/{l.maxPlayers} 人</span>
                <button onClick={() => handleQuickJoin(l)} style={{ padding: '4px 12px' }}>加入</button>
              </div>
              {joiningPrivate?.code === l.code && (
                <form onSubmit={handlePrivateJoin} style={{ padding: '8px 0', display: 'flex', gap: 8 }}>
                  <input
                    value={privatePassword}
                    onChange={e => setPrivatePassword(e.target.value)}
                    placeholder="輸入密碼"
                    type="password"
                    autoFocus
                    style={{ flex: 1, padding: '6px 10px', boxSizing: 'border-box' }}
                  />
                  <button type="submit" style={{ padding: '6px 12px' }}>確認</button>
                  <button type="button" onClick={() => setJoiningPrivate(null)} style={{ padding: '6px 12px' }}>取消</button>
                </form>
              )}
            </div>
          ))}
        </>
      )}

      {view === 'create' && (
        <form onSubmit={handleCreate}>
          <h3>建立 Lobby</h3>
          <label>Lobby 名稱</label>
          <input value={form.lobbyName} onChange={e => setForm(f => ({ ...f, lobbyName: e.target.value }))}
            placeholder={`${nickname || '你'}'s Lobby`} style={{ width: '100%', padding: '6px 10px', margin: '4px 0 12px', boxSizing: 'border-box' }} />

          <label>題數</label>
          <select value={form.numQuestions} onChange={e => setForm(f => ({ ...f, numQuestions: Number(e.target.value) }))}
            style={{ width: '100%', padding: '6px 10px', margin: '4px 0 12px' }}>
            {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n} 題</option>)}
          </select>

          <label>每題時間</label>
          <select value={form.timeLimit} onChange={e => setForm(f => ({ ...f, timeLimit: Number(e.target.value) }))}
            style={{ width: '100%', padding: '6px 10px', margin: '4px 0 12px' }}>
            {[15, 30, 45].map(s => <option key={s} value={s}>{s} 秒</option>)}
          </select>

          <label>
            <input type="checkbox" checked={form.isPrivate} onChange={e => setForm(f => ({ ...f, isPrivate: e.target.checked }))} />
            {' '}私人 Lobby（需要密碼）
          </label>
          {form.isPrivate && (
            <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="設定密碼" style={{ width: '100%', padding: '6px 10px', margin: '8px 0 12px', boxSizing: 'border-box' }} />
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" style={{ flex: 1, padding: 10 }}>建立</button>
            <button type="button" onClick={() => setView('home')} style={{ flex: 1, padding: 10 }}>返回</button>
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/.worktrees/feature-multiplayer"
git add client/src/pages/MainMenu.jsx
git commit -m "feat: remove invite code join, show all lobbies, add inline password + manual refresh"
```

---

## Task 5: Rebuild client dist and verify

- [ ] **Step 1: Build the client**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/.worktrees/feature-multiplayer/client"
npm run build
```

Expected: Build succeeds with no errors. Output in `client/dist/`.

- [ ] **Step 2: Run all server tests one final time**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/.worktrees/feature-multiplayer/server"
npm test
```

Expected: All tests PASS

- [ ] **Step 3: Commit the built dist**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/.worktrees/feature-multiplayer"
git add client/dist
git commit -m "chore: rebuild client dist"
```
