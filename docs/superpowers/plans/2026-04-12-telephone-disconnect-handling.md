# Telephone Mode Disconnect Handling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a player disconnects during telephone mode, pause the timer and let the host choose "continue without them" or "wait for reconnect". Allow the disconnected player to rejoin a game-in-progress lobby from the main menu.

**Architecture:**
- Persistent `playerId` (UUID) stored in client `localStorage` and attached to every `create-lobby` / `join-lobby` call. Server keys player slots by `playerId` so reconnect can restore a slot that still holds the original `playerIdx` used in `assignments`.
- On disconnect during telephone mode, don't remove the player from `lobby.players`. Mark `player.disconnected = true`, pause the timer, and emit `telephone-paused` with the disconnected nicknames. Host picks `continue` or `wait`.
- `continue` → mark disconnected players as `abandoned = true` (permanent skip). Submission counts exclude abandoned players. The existing `_resolveAudioSource` (from the earlier fallback fix) already handles missing recordings, so downstream listeners naturally fall back to an earlier phase or YouTube. Guess-phase abandoned slots stay blank.
- `wait` → keep timer paused. When player rejoins (via lobby list → rejoin prompt), re-snapshot their current phase/guess state to them and resume timer.
- `getLobbies()` now returns in-progress lobbies too, flagged `inProgress: true` with `disconnectedSlots` so the main-menu can offer "重新加入".

**Tech Stack:** Node.js + Socket.IO (server), React + Vite (client). Tests: Vitest.

---

## File Structure

**Server:**
- Modify `server/src/gameManager.js` — playerId support on create/join, disconnect handling for telephone states, reconnect API, `getLobbies()` change, pause/resume/continue host actions, lobby payload now exposes `disconnected`/`abandoned` flags.
- Modify `server/src/modes/telephone.js` — `_activePlayers()` helper, use it for submission completion checks; `pausePhase()`/`resumePhase()`; `snapshotForPlayer()` used on reconnect; treat `abandoned` players as already-submitted (their slots stay empty so fallback kicks in); guess-phase finalization tolerates missing guesses for abandoned players.
- Modify `server/src/index.js` — new socket events: `reconnect-lobby`, `telephone-continue`, `telephone-wait` (optional no-op, mostly for audit).

**Client:**
- Create `client/src/playerId.js` — `getPlayerId()` returns a persisted UUID (creates and stores one on first call).
- Modify `client/src/socket.js` — attach playerId to the socket handshake `auth` so the server sees it even before any event.
- Modify `client/src/App.jsx` — handle `telephone-paused`, `telephone-resumed`, `telephone-abandoned-players`; pass `paused` state and `disconnected` list to telephone pages.
- Modify `client/src/pages/MainMenu.jsx` — show in-progress lobbies with a "重新加入" button that prompts for the original nickname, then emits `reconnect-lobby`.
- Modify `client/src/pages/TelephonePhase.jsx` — overlay when `paused`; host decision UI (continue / wait).
- Modify `client/src/pages/TelephoneGuess.jsx` — same overlay + host decision UI.
- Modify `client/src/pages/TelephoneResults.jsx` — show "（玩家斷線未作答）" for abandoned guessers.

**Tests:**
- Modify `server/tests/telephone.test.js` — disconnect/pause/continue scenarios, reconnect scenarios.
- Modify `server/tests/gameManager.test.js` — `getLobbies()` returns in-progress lobbies; reconnect flow.

---

## Task 1: Persistent playerId on server-side slot

**Files:**
- Modify: `server/src/gameManager.js:50-99` (`createLobby`, `joinLobby`)
- Test: `server/tests/gameManager.test.js`

- [ ] **Step 1.1: Write failing test — createLobby stores playerId on slot**

Add inside an existing `describe('GameManager.createLobby', ...)` (or create one):

```js
it('stores playerId on the host player slot', () => {
  const mgr = new GameManager();
  const lobby = mgr.createLobby('sock1', { nickname: 'A', gameMode: 'lyrics-guess', playerId: 'pid-A' });
  expect(lobby.players[0].playerId).toBe('pid-A');
});

it('stores playerId on a joining player slot', () => {
  const mgr = new GameManager();
  const lobby = mgr.createLobby('sock1', { nickname: 'A', gameMode: 'lyrics-guess', playerId: 'pid-A' });
  mgr.joinLobby('sock2', { lobbyCode: lobby.id, nickname: 'B', password: null, playerId: 'pid-B' });
  expect(lobby.players[1].playerId).toBe('pid-B');
});
```

- [ ] **Step 1.2: Run tests — expect failure**

```
cd server && npx vitest run tests/gameManager.test.js -t "stores playerId"
```
Expected: FAIL (`playerId` is `undefined`).

- [ ] **Step 1.3: Implement playerId storage**

In `createLobby` signature add `playerId`:
```js
createLobby(socketId, { nickname, lobbyName, numQuestions, timeLimit, isPrivate, password, gameMode, phaseDuration, playerId })
```
Replace the host player push with:
```js
players: [{ socketId, nickname, score: 0, playerId: playerId || null, disconnected: false, abandoned: false }],
```

In `joinLobby` signature add `playerId` and replace the push with:
```js
lobby.players.push({ socketId, nickname, score: 0, playerId: playerId || null, disconnected: false, abandoned: false });
```

- [ ] **Step 1.4: Run tests — expect pass**

```
cd server && npx vitest run tests/gameManager.test.js -t "stores playerId"
```

- [ ] **Step 1.5: Commit**

```
git add server/src/gameManager.js server/tests/gameManager.test.js
git commit -m "feat(server): persist playerId on lobby player slots"
```

---

## Task 2: Client generates and sends persistent playerId

**Files:**
- Create: `client/src/playerId.js`
- Modify: `client/src/socket.js`
- Modify: `client/src/pages/MainMenu.jsx` (create-lobby, join-lobby emit calls)

- [ ] **Step 2.1: Write `playerId.js`**

```js
// client/src/playerId.js
const KEY = 'jaychou.playerId';

export function getPlayerId() {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
         Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(KEY, id);
  }
  return id;
}
```

- [ ] **Step 2.2: Wire playerId into socket handshake**

Edit `client/src/socket.js` — before `io(...)` call, import and pass:
```js
import { io } from 'socket.io-client';
import { getPlayerId } from './playerId.js';

const socket = io({ auth: { playerId: getPlayerId() } });
export default socket;
```
(If the current file structure differs, add `auth: { playerId: getPlayerId() }` to the existing `io()` options.)

- [ ] **Step 2.3: Send playerId on create-lobby**

In `MainMenu.jsx`, at the top:
```js
import { getPlayerId } from '../playerId.js';
```
In `handleCreate`, add `playerId: getPlayerId(),` to the emitted payload. In `handleQuickJoin` and `handlePrivateJoin`, add the same to the `socket.emit('join-lobby', ...)` payload.

- [ ] **Step 2.4: Build client and confirm no type errors**

```
cd client && npm run build
```
Expected: successful build.

- [ ] **Step 2.5: Commit**

```
git add client/src/playerId.js client/src/socket.js client/src/pages/MainMenu.jsx
git commit -m "feat(client): persist playerId and send on lobby entry"
```

---

## Task 3: Server reads playerId from socket handshake as a fallback

**Files:**
- Modify: `server/src/index.js` (handlers for `create-lobby`, `join-lobby`)

- [ ] **Step 3.1: Pass handshake playerId into manager calls**

In `io.on('connection', (socket) => { ... })`, add a helper:
```js
const handshakePlayerId = () => socket.handshake.auth?.playerId || null;
```
Change `create-lobby`:
```js
socket.on('create-lobby', (data) => {
  const lobby = manager.createLobby(socket.id, { ...data, playerId: data.playerId || handshakePlayerId() });
  ...
});
```
Change `join-lobby` similarly — `{ ...data, playerId: data.playerId || handshakePlayerId() }`.

- [ ] **Step 3.2: Smoke-test via server unit tests**

```
cd server && npm test
```
Expected: all existing tests still pass.

- [ ] **Step 3.3: Commit**

```
git add server/src/index.js
git commit -m "feat(server): accept playerId from socket handshake"
```

---

## Task 4: Lobby payload exposes disconnect flags; getLobbies includes in-progress lobbies

**Files:**
- Modify: `server/src/gameManager.js:23-48` (`getLobbies`, `lobbyPayload`)
- Test: `server/tests/gameManager.test.js`

- [ ] **Step 4.1: Write failing tests**

```js
it('getLobbies returns in-progress lobbies flagged with inProgress', () => {
  const mgr = new GameManager();
  const lobby = mgr.createLobby('h', { nickname: 'H', gameMode: 'telephone' });
  lobby.state = 'telephone_phase';
  lobby.players.push({ socketId: 'p2', nickname: 'P2', score: 0, playerId: null, disconnected: true, abandoned: false });
  const list = mgr.getLobbies();
  const entry = list.find(l => l.code === lobby.id);
  expect(entry.inProgress).toBe(true);
  expect(entry.disconnectedNicknames).toEqual(['P2']);
});

it('lobbyPayload reflects disconnected/abandoned flags', () => {
  const mgr = new GameManager();
  const lobby = mgr.createLobby('h', { nickname: 'H', gameMode: 'telephone' });
  lobby.players[0].disconnected = true;
  const payload = mgr.lobbyPayload(lobby);
  expect(payload.players[0].disconnected).toBe(true);
  expect(payload.players[0].abandoned).toBe(false);
});
```

- [ ] **Step 4.2: Run — expect failure**

```
cd server && npx vitest run tests/gameManager.test.js -t "in-progress"
```

- [ ] **Step 4.3: Implement**

Replace `getLobbies` body:
```js
getLobbies() {
  return [...this.lobbies.values()].map(l => ({
    code: l.id,
    name: l.name,
    playerCount: l.players.filter(p => !p.abandoned).length,
    maxPlayers: l.maxPlayers,
    isPrivate: l.isPrivate,
    inProgress: l.state !== 'waiting' && l.state !== 'finished',
    disconnectedNicknames: l.players.filter(p => p.disconnected && !p.abandoned).map(p => p.nickname),
  }));
}
```

In `lobbyPayload`, replace player mapping with:
```js
players: lobby.players.map(p => ({
  nickname: p.nickname,
  score: p.score,
  isHost: p.socketId === lobby.hostSocketId,
  disconnected: !!p.disconnected,
  abandoned: !!p.abandoned,
})),
```

- [ ] **Step 4.4: Run — expect pass**

```
cd server && npm test
```

- [ ] **Step 4.5: Commit**

```
git add server/src/gameManager.js server/tests/gameManager.test.js
git commit -m "feat(server): expose in-progress lobbies and player disconnect flags"
```

---

## Task 5: Telephone helpers — active players, pause, resume

**Files:**
- Modify: `server/src/modes/telephone.js`
- Test: `server/tests/telephone.test.js`

- [ ] **Step 5.1: Write failing test**

```js
describe('Telephone pause/resume', () => {
  it('pausePhase stops the timer and sets paused flag', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    expect(lobby.telephone.paused).toBeFalsy();
    expect(lobby.timerHandle).toBeTruthy();

    // directly call the module helper via manager (wired in Task 6)
    mgr.pauseTelephone(lobby, ['Host'], io);
    expect(lobby.telephone.paused).toBe(true);
    expect(lobby.timerHandle).toBeNull();
  });
});
```

- [ ] **Step 5.2: Run — expect failure**

```
cd server && npx vitest run tests/telephone.test.js -t "pausePhase"
```

- [ ] **Step 5.3: Add helpers to `server/src/modes/telephone.js`**

At top of the module (after imports, before `startGame`):
```js
export function activePlayers(lobby) {
  return lobby.players.filter(p => !p.abandoned && !p.disconnected);
}

export function pause(lobby, disconnectedNicknames, io) {
  if (!lobby.telephone) return;
  if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
  lobby.telephone.paused = true;
  lobby.telephone.pausedReason = { disconnected: disconnectedNicknames };
  io.to(lobby.id).emit('telephone-paused', { disconnectedNicknames, secondsRemaining: lobby.secondsRemaining });
}

export function resume(lobby, io) {
  if (!lobby.telephone || !lobby.telephone.paused) return;
  lobby.telephone.paused = false;
  lobby.telephone.pausedReason = null;
  // Re-arm the matching timer based on current state.
  const tickEvent = 'telephone-timer-tick';
  const onTick = () => {
    lobby.secondsRemaining--;
    io.to(lobby.id).emit(tickEvent, { secondsRemaining: lobby.secondsRemaining });
    if (lobby.secondsRemaining <= 0) {
      clearInterval(lobby.timerHandle);
      lobby.timerHandle = null;
      if (lobby.state === 'telephone_phase') _endPhase(lobby, io);
      else if (lobby.state === 'telephone_guess') _startResults(lobby, io);
    }
  };
  lobby.timerHandle = setInterval(onTick, 1000);
  io.to(lobby.id).emit('telephone-resumed', { secondsRemaining: lobby.secondsRemaining });
}
```

Update `submitRecording` completion check:
```js
if (tel.submissions.size >= activePlayers(lobby).length) { ... }
```
Update `submitGuess` completion check similarly.

Update `_startPhase` and `_startGuess`: skip `io.to(player.socketId).emit(...)` for players where `lobby.players[i].abandoned === true` — iterate `assignments.singPhases[tel.currentPhase]`, but if `lobby.players[assignment.playerIdx].abandoned`, continue (do not emit phase-start to them) and also add their `playerIdx`-derived socketId to `tel.submissions` so they don't block completion.

Concretely, inside `_startPhase`'s loop, before the emit:
```js
const player = lobby.players[assignment.playerIdx];
if (player.abandoned) {
  tel.submissions.add(player.socketId);
  continue;
}
```
Same inside `_startGuess`'s loop — abandoned players are added to `tel.submissions` so the phase can complete. Their guess is simply never recorded, which yields `guessData === undefined` in `_startResults` → falls through existing `'（未作答）'` path.

- [ ] **Step 5.4: Wire manager methods (temp, minimal — full host flow in Task 6)**

In `gameManager.js`, add:
```js
pauseTelephone(lobby, disconnectedNicknames, io) {
  telephoneMode.pause(lobby, disconnectedNicknames, io);
}
resumeTelephone(lobby, io) {
  telephoneMode.resume(lobby, io);
}
```

- [ ] **Step 5.5: Run tests — expect pass**

```
cd server && npm test
```

- [ ] **Step 5.6: Commit**

```
git add server/src/modes/telephone.js server/src/gameManager.js server/tests/telephone.test.js
git commit -m "feat(server): telephone pause/resume helpers and active-players accounting"
```

---

## Task 6: Disconnect during telephone → pause + notify host

**Files:**
- Modify: `server/src/gameManager.js` (`leaveLobby` / `handleDisconnect`)
- Test: `server/tests/telephone.test.js`

- [ ] **Step 6.1: Write failing test**

```js
it('disconnecting mid-telephone pauses the phase instead of kicking', () => {
  const mgr = new GameManager();
  const lobby = createTelephoneLobby(mgr, 3);
  const io = makeMockIo();
  mgr.startGame('host', io);
  mgr.handleDisconnect('p2', io);

  expect(lobby.telephone.paused).toBe(true);
  const p2 = lobby.players.find(p => p.nickname === 'Player2');
  expect(p2.disconnected).toBe(true);
  expect(p2.abandoned).toBe(false);
  expect(lobby.players.length).toBe(3); // slot preserved
  if (lobby.timerHandle) clearInterval(lobby.timerHandle);
});
```

- [ ] **Step 6.2: Run — expect failure**

- [ ] **Step 6.3: Implement — new telephone branch in `leaveLobby`**

Replace the current `else if (lobby.state.startsWith('telephone_'))` branch with:
```js
} else if (lobby.state.startsWith('telephone_')) {
  const player = lobby.players.find(p => p.socketId === socketId);
  if (!player) return;

  if (lobby.hostSocketId === socketId) {
    // Host leaving mid-game: close lobby (existing behaviour for hosts in waiting state matches this).
    this._closeLobby(lobby, io, 'host_closed');
    return;
  }

  // Mark disconnected (slot preserved; playerIdx in assignments stays valid).
  player.disconnected = true;
  player.socketId = null;

  const disconnectedNicknames = lobby.players.filter(p => p.disconnected && !p.abandoned).map(p => p.nickname);
  if (disconnectedNicknames.length > 0) {
    telephoneMode.pause(lobby, disconnectedNicknames, io);
  }
  io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
}
```

Important: move the `this.socketToLobby.delete(socketId)` call above the telephone branch so it still runs, but also add:
```js
// Keep mapping removed for the dead socket; rejoin will re-add under a new socketId.
```

- [ ] **Step 6.4: Run — expect pass**

```
cd server && npm test
```

- [ ] **Step 6.5: Commit**

```
git add server/src/gameManager.js server/tests/telephone.test.js
git commit -m "feat(server): pause telephone mode on mid-game disconnect"
```

---

## Task 7: Host chooses `continue` or `wait`

**Files:**
- Modify: `server/src/gameManager.js`
- Modify: `server/src/index.js`
- Modify: `server/src/modes/telephone.js`
- Test: `server/tests/telephone.test.js`

- [ ] **Step 7.1: Write failing tests**

```js
it('host telephone-continue marks disconnected players abandoned and resumes', () => {
  const mgr = new GameManager();
  const lobby = createTelephoneLobby(mgr, 3);
  const io = makeMockIo();
  mgr.startGame('host', io);
  mgr.handleDisconnect('p2', io);
  expect(lobby.telephone.paused).toBe(true);

  mgr.telephoneContinue('host', io);
  const p2 = lobby.players.find(p => p.nickname === 'Player2');
  expect(p2.abandoned).toBe(true);
  expect(lobby.telephone.paused).toBe(false);
  if (lobby.timerHandle) clearInterval(lobby.timerHandle);
});

it('continue during telephone_phase auto-advances if remaining players already submitted', () => {
  const mgr = new GameManager();
  const lobby = createTelephoneLobby(mgr, 3);
  const io = makeMockIo();
  mgr.startGame('host', io);
  // host and p3 submit; p2 disconnects before submitting
  mgr.submitRecording('host', Buffer.from('a'), io);
  mgr.submitRecording('p3', Buffer.from('a'), io);
  mgr.handleDisconnect('p2', io);
  expect(lobby.telephone.currentPhase).toBe(0);

  mgr.telephoneContinue('host', io);
  expect(lobby.telephone.currentPhase).toBe(1);
  if (lobby.timerHandle) clearInterval(lobby.timerHandle);
});
```

- [ ] **Step 7.2: Run — expect failure**

- [ ] **Step 7.3: Implement `telephoneContinue` in gameManager**

```js
telephoneContinue(socketId, io) {
  const lobby = this.getLobby(socketId);
  if (!lobby || lobby.hostSocketId !== socketId) return;
  if (!lobby.telephone || !lobby.telephone.paused) return;

  // Promote disconnected → abandoned.
  lobby.players.forEach(p => { if (p.disconnected) p.abandoned = true; });

  // Add abandoned players' (now-null) socketIds to submissions so the phase can complete.
  // We use a stable synthetic key per playerIdx because socketId is null.
  const tel = lobby.telephone;
  lobby.players.forEach((p, idx) => {
    if (p.abandoned) tel.submissions.add(`abandoned:${idx}`);
  });

  io.to(lobby.id).emit('telephone-abandoned-players', {
    nicknames: lobby.players.filter(p => p.abandoned).map(p => p.nickname),
  });
  io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));

  // Check if phase should already advance with remaining active players.
  const active = lobby.players.filter(p => !p.abandoned);
  if (tel.submissions.size >= active.length) {
    // Advance immediately without resuming timer.
    lobby.telephone.paused = false;
    if (lobby.state === 'telephone_phase') telephoneMode._endPhaseExported(lobby, io);
    else if (lobby.state === 'telephone_guess') telephoneMode._startResultsExported(lobby, io);
  } else {
    telephoneMode.resume(lobby, io);
  }
}

telephoneWait(socketId, io) {
  const lobby = this.getLobby(socketId);
  if (!lobby || lobby.hostSocketId !== socketId) return;
  // No-op; timer remains paused. Explicit event for UI consistency.
  io.to(lobby.id).emit('telephone-wait-ack');
}
```

Export `_endPhase` and `_startResults` from `telephone.js` as `_endPhaseExported` and `_startResultsExported` (or rename the internal ones and export directly — simplest: add `export { _endPhase as _endPhaseExported, _startResults as _startResultsExported };` at the bottom of `telephone.js`).

Also update `submitRecording` / `submitGuess` completion checks in `telephone.js` to count abandoned submissions — already handled because we write `abandoned:${idx}` into the Set. But the conditional must use `activePlayers(lobby).length + abandonedCount`. Simplest: just compare against `lobby.players.length` again, since both active and abandoned are tracked. Update:
```js
if (tel.submissions.size >= lobby.players.length) { ... }
```
(Abandoned players are always added to submissions at phase start in Task 5's `_startPhase` change AND again at continue time. The Set dedups.)

Hmm — revise Task 5's note: abandoned players' `socketId` is `null` after disconnect. `tel.submissions.add(null)` would collide. Instead use `abandoned:${idx}` consistently. Adjust Task 5 Step 5.3's phase-start loop accordingly:
```js
if (player.abandoned) {
  tel.submissions.add(`abandoned:${assignment.playerIdx}`);
  continue;
}
```

- [ ] **Step 7.4: Wire socket events**

`server/src/index.js`:
```js
socket.on('telephone-continue', () => manager.telephoneContinue(socket.id, io));
socket.on('telephone-wait', () => manager.telephoneWait(socket.id, io));
```

- [ ] **Step 7.5: Run — expect pass**

```
cd server && npm test
```

- [ ] **Step 7.6: Commit**

```
git add server/src/gameManager.js server/src/index.js server/src/modes/telephone.js server/tests/telephone.test.js
git commit -m "feat(server): host continue/wait decisions on telephone disconnect"
```

---

## Task 8: Reconnect API

**Files:**
- Modify: `server/src/gameManager.js`
- Modify: `server/src/modes/telephone.js` — add `snapshotForPlayer(lobby, player)`
- Modify: `server/src/index.js`
- Test: `server/tests/telephone.test.js`

- [ ] **Step 8.1: Write failing tests**

```js
it('reconnect restores disconnected player slot by playerId', () => {
  const mgr = new GameManager();
  const lobby = mgr.createLobby('host', { nickname: 'Host', gameMode: 'telephone', playerId: 'pid-host' });
  mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'P2', playerId: 'pid-2' });
  mgr.joinLobby('p3', { lobbyCode: lobby.id, nickname: 'P3', playerId: 'pid-3' });
  const io = makeMockIo();
  mgr.startGame('host', io);

  mgr.handleDisconnect('p2', io);
  expect(lobby.players[1].disconnected).toBe(true);

  const result = mgr.reconnectLobby('p2-new', { lobbyCode: lobby.id, playerId: 'pid-2', nickname: 'P2' }, io);
  expect(result.error).toBeFalsy();
  expect(lobby.players[1].disconnected).toBe(false);
  expect(lobby.players[1].socketId).toBe('p2-new');
  if (lobby.timerHandle) clearInterval(lobby.timerHandle);
});

it('reconnect rejects if nickname does not match playerId slot', () => {
  const mgr = new GameManager();
  const lobby = mgr.createLobby('host', { nickname: 'Host', gameMode: 'telephone', playerId: 'pid-host' });
  mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'P2', playerId: 'pid-2' });
  mgr.joinLobby('p3', { lobbyCode: lobby.id, nickname: 'P3', playerId: 'pid-3' });
  const io = makeMockIo();
  mgr.startGame('host', io);
  mgr.handleDisconnect('p2', io);

  const result = mgr.reconnectLobby('stranger', { lobbyCode: lobby.id, playerId: 'pid-unknown', nickname: 'P2' }, io);
  expect(result.error).toBeTruthy();
  if (lobby.timerHandle) clearInterval(lobby.timerHandle);
});
```

- [ ] **Step 8.2: Run — expect failure**

- [ ] **Step 8.3: Implement `reconnectLobby` in `gameManager.js`**

```js
reconnectLobby(socketId, { lobbyCode, playerId, nickname }, io) {
  const code = (lobbyCode || '').toUpperCase();
  const lobby = this.lobbies.get(code);
  if (!lobby) return { error: 'Lobby not found' };
  if (!playerId) return { error: 'Missing playerId' };

  const slot = lobby.players.find(p => p.playerId === playerId && p.disconnected && !p.abandoned);
  if (!slot) return { error: 'No disconnected slot matches (maybe host chose to continue without you)' };
  if (nickname && slot.nickname !== nickname) return { error: 'Nickname does not match the disconnected slot' };

  slot.socketId = socketId;
  slot.disconnected = false;
  this.socketToLobby.set(socketId, code);

  io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));

  // Snapshot current telephone state to the reconnected player.
  if (lobby.telephone) {
    const snap = telephoneMode.snapshotForPlayer(lobby, slot);
    if (snap) io.to(socketId).emit(snap.event, snap.payload);
  }

  // If no one else is disconnected, resume.
  const stillDisconnected = lobby.players.some(p => p.disconnected && !p.abandoned);
  if (!stillDisconnected && lobby.telephone && lobby.telephone.paused) {
    telephoneMode.resume(lobby, io);
  }

  return { lobby };
}
```

- [ ] **Step 8.4: Implement `snapshotForPlayer` in `telephone.js`**

```js
export function snapshotForPlayer(lobby, player) {
  const tel = lobby.telephone;
  if (!tel) return null;
  const playerIdx = lobby.players.indexOf(player);

  if (lobby.state === 'telephone_phase') {
    const phase = tel.assignments.singPhases[tel.currentPhase];
    const songIdx = phase.findIndex(a => a.playerIdx === playerIdx);
    if (songIdx === -1) return null;
    const song = tel.songs[songIdx];
    const lyric = tel.lyrics[phase[songIdx].lyricIdx];
    let audioUrl, audioType, fallbackNotice = null;
    if (tel.currentPhase === 0) {
      audioType = 'youtube';
      audioUrl = { youtubeId: song.youtubeId, startTime: song.startTime, endTime: song.endTime };
    } else {
      const resolved = _resolveAudioSource(lobby, tel, songIdx, tel.currentPhase - 1, song);
      audioType = resolved.audioType; audioUrl = resolved.audioUrl; fallbackNotice = resolved.fallbackNotice;
    }
    return {
      event: 'telephone-phase-start',
      payload: {
        phaseIndex: tel.currentPhase,
        songLabel: `歌曲 ${songIdx + 1}`,
        lyrics: lyric.text,
        audioUrl, audioType, fallbackNotice,
        phaseDuration: lobby.secondsRemaining,
        isFirstPhase: tel.currentPhase === 0,
      },
    };
  }

  if (lobby.state === 'telephone_guess') {
    const guess = tel.assignments.guessPhase.find(g => g.playerIdx === playerIdx);
    if (!guess) return null;
    const song = tel.songs[guess.songIdx];
    const lastPhase = lobby.players.length - 2;
    const resolved = _resolveAudioSource(lobby, tel, guess.songIdx, lastPhase, song);
    return {
      event: 'telephone-guess-start',
      payload: {
        audioUrl: resolved.audioUrl,
        audioType: resolved.audioType,
        fallbackNotice: resolved.fallbackNotice,
        phaseDuration: lobby.secondsRemaining,
      },
    };
  }

  return null;
}
```

- [ ] **Step 8.5: Wire socket event**

`server/src/index.js`:
```js
socket.on('reconnect-lobby', (data) => {
  const result = manager.reconnectLobby(socket.id, { ...data, playerId: data.playerId || handshakePlayerId() }, io);
  if (result.error) { socket.emit('error', { message: result.error }); return; }
  socket.join(result.lobby.id);
  socket.emit('joined-lobby', { code: result.lobby.id });
  broadcastLobbyList();
});
```

- [ ] **Step 8.6: Run — expect pass**

```
cd server && npm test
```

- [ ] **Step 8.7: Commit**

```
git add server/src/gameManager.js server/src/modes/telephone.js server/src/index.js server/tests/telephone.test.js
git commit -m "feat(server): reconnect API for telephone mode"
```

---

## Task 9: Client — paused overlay + host decision UI on TelephonePhase

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/pages/TelephonePhase.jsx`

- [ ] **Step 9.1: Wire pause/resume events in `App.jsx`**

Add state:
```js
const [phonePaused, setPhonePaused] = useState(null); // { disconnectedNicknames } or null
```
Register handlers:
```js
useSocketEvent('telephone-paused', useCallback((data) => setPhonePaused(data), []));
useSocketEvent('telephone-resumed', useCallback(() => setPhonePaused(null), []));
useSocketEvent('telephone-abandoned-players', useCallback(() => setPhonePaused(null), []));
```
Pass `paused={phonePaused}` to both `TelephonePhase` and `TelephoneGuess`.

- [ ] **Step 9.2: Render paused overlay in `TelephonePhase.jsx`**

Accept `paused` prop; add after the lyrics/audio block, before the UI-state buttons:
```jsx
{paused && (
  <div style={{ background: '#fff7ed', border: '2px solid #f97316', borderRadius: 10, padding: 16, marginBottom: 16, textAlign: 'center' }}>
    <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#9a3412' }}>
      ⏸ 已暫停 — 以下玩家斷線：{paused.disconnectedNicknames.join('、')}
    </p>
    {lobby?.hostSocketId === socket.id ? (
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={() => socket.emit('telephone-continue')}
          style={{ padding: '8px 20px', fontSize: 15, background: '#ef4444', color: 'white', border: 'none', borderRadius: 6 }}>
          不等了，繼續遊戲
        </button>
        <button onClick={() => socket.emit('telephone-wait')}
          style={{ padding: '8px 20px', fontSize: 15, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6 }}>
          等待重連
        </button>
      </div>
    ) : (
      <p style={{ color: '#888', fontSize: 14, margin: 0 }}>等待房主決定...</p>
    )}
  </div>
)}
```
Also block auto-submit while paused — at the top of the timer-expiry `useEffect`:
```js
if (paused) return;
```

- [ ] **Step 9.3: Repeat overlay in `TelephoneGuess.jsx`**

Same block, same gating on the auto-submit effect.

- [ ] **Step 9.4: Build and smoke-test**

```
cd client && npm run build
```

- [ ] **Step 9.5: Commit**

```
git add client/src/App.jsx client/src/pages/TelephonePhase.jsx client/src/pages/TelephoneGuess.jsx
git commit -m "feat(client): paused overlay + host continue/wait UI"
```

---

## Task 10: Client — in-progress lobbies and rejoin flow

**Files:**
- Modify: `client/src/pages/MainMenu.jsx`
- Modify: `client/src/App.jsx` (handle `joined-lobby` after reconnect)

- [ ] **Step 10.1: Render in-progress lobbies with 重新加入 button**

In `MainMenu.jsx`'s lobby list render, replace the current `<div>` per lobby with:
```jsx
<div key={l.code} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <span>
      {l.isPrivate ? '🔒 ' : ''}{l.name}
      {l.inProgress && <span style={{ marginLeft: 8, fontSize: 12, color: '#f97316' }}>（遊玩中）</span>}
    </span>
    <span style={{ color: '#888', fontSize: 14 }}>{l.playerCount}/{l.maxPlayers} 人</span>
    {!l.inProgress && (
      <button onClick={() => handleQuickJoin(l)}
        disabled={l.playerCount >= l.maxPlayers}
        style={{ padding: '4px 12px' }}>加入</button>
    )}
    {l.inProgress && l.disconnectedNicknames?.length > 0 && (
      <button onClick={() => handleRejoinPrompt(l)} style={{ padding: '4px 12px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 4 }}>
        重新加入
      </button>
    )}
  </div>
  {l.inProgress && l.disconnectedNicknames?.length > 0 && (
    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
      斷線中：{l.disconnectedNicknames.join('、')}
    </p>
  )}
</div>
```

- [ ] **Step 10.2: Add rejoin prompt handler**

Add state:
```js
const [rejoinTarget, setRejoinTarget] = useState(null); // { code, name, disconnectedNicknames }
const [rejoinNickname, setRejoinNickname] = useState('');
```
Handler:
```js
function handleRejoinPrompt(l) {
  setRejoinTarget(l);
  setRejoinNickname('');
  setErrorMsg('');
}

function handleRejoinConfirm(e) {
  e.preventDefault();
  if (!rejoinTarget) return;
  if (!rejoinNickname.trim()) { setErrorMsg('請輸入你斷線前的暱稱'); return; }
  socket.emit('reconnect-lobby', {
    lobbyCode: rejoinTarget.code,
    nickname: rejoinNickname.trim(),
    playerId: getPlayerId(),
  });
}
```
Render prompt (modal-ish inline) when `rejoinTarget`:
```jsx
{rejoinTarget && (
  <form onSubmit={handleRejoinConfirm} style={{ padding: 12, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, marginTop: 12 }}>
    <p style={{ margin: '0 0 8px' }}>要重新加入「{rejoinTarget.name}」？請輸入你剛才使用的暱稱：</p>
    <input
      value={rejoinNickname}
      onChange={e => setRejoinNickname(e.target.value)}
      placeholder="你斷線前的暱稱"
      style={{ width: '100%', padding: '6px 10px', marginBottom: 8, boxSizing: 'border-box' }}
    />
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="submit" style={{ padding: '6px 12px' }}>重新加入</button>
      <button type="button" onClick={() => setRejoinTarget(null)} style={{ padding: '6px 12px' }}>取消</button>
    </div>
  </form>
)}
```

- [ ] **Step 10.3: After `joined-lobby`, let App.jsx route to appropriate telephone page**

Already handled — the snapshot event (`telephone-phase-start` or `telephone-guess-start`) will follow `joined-lobby` and App.jsx's existing listeners will route.

- [ ] **Step 10.4: Build**

```
cd client && npm run build
```

- [ ] **Step 10.5: Commit**

```
git add client/src/pages/MainMenu.jsx client/src/App.jsx
git commit -m "feat(client): show in-progress lobbies and add rejoin flow"
```

---

## Task 11: Results — show "斷線未作答" for abandoned guessers

**Files:**
- Modify: `server/src/modes/telephone.js` (`_startResults`)
- Modify: `client/src/pages/TelephoneResults.jsx`

- [ ] **Step 11.1: Tag abandoned-guesser results on server**

In `_startResults`, replace the `guess` / `guesserNickname` block:
```js
const guessData = tel.guesses.get(songIdx);
const guesserAssignment = tel.assignments.guessPhase.find(g => g.songIdx === songIdx);
const guesserPlayer = guesserAssignment ? lobby.players[guesserAssignment.playerIdx] : null;
const guesserAbandoned = !!(guesserPlayer && guesserPlayer.abandoned);

return {
  songName: song.name,
  youtube: ...,
  chain,
  guess: guessData ? guessData.guess : (guesserAbandoned ? '（玩家斷線未作答）' : '（未作答）'),
  guesserNickname: guesserPlayer ? guesserPlayer.nickname : '?',
  guesserAbandoned,
};
```

- [ ] **Step 11.2: Style abandoned results in client**

In both review-step and free-play/recap blocks in `TelephoneResults.jsx`, when `song.guesserAbandoned`, wrap the guess display in a muted style:
```jsx
<p style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#9ca3af', fontStyle: 'italic' }}>
  {song.guess}
</p>
```
(Use `song.guesserAbandoned ?` ternary where the current `{song.guess}` is rendered.)

- [ ] **Step 11.3: Test**

Add test in `server/tests/telephone.test.js`:
```js
it('results mark abandoned guessers', () => {
  const mgr = new GameManager();
  const lobby = createTelephoneLobby(mgr, 3);
  const io = makeMockIo();
  mgr.startGame('host', io);
  if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

  const buf = Buffer.from('a');
  for (let phase = 0; phase < 2; phase++) {
    lobby.players.forEach(p => mgr.submitRecording(p.socketId, buf, io));
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
  }
  // Now in guess phase. Host and p3 guess; p2 disconnects and host continues.
  mgr.submitGuess('host', 'X', io);
  mgr.submitGuess('p3', 'Y', io);
  mgr.handleDisconnect('p2', io);
  mgr.telephoneContinue('host', io);

  expect(lobby.state).toBe('telephone_results');
  const p2Songs = lobby.telephone.resultsData.filter(r => r.guesserAbandoned);
  expect(p2Songs.length).toBe(1);
  expect(p2Songs[0].guess).toBe('（玩家斷線未作答）');
  if (lobby.timerHandle) clearInterval(lobby.timerHandle);
});
```
Run:
```
cd server && npm test
```

- [ ] **Step 11.4: Commit**

```
git add server/src/modes/telephone.js client/src/pages/TelephoneResults.jsx server/tests/telephone.test.js
git commit -m "feat: mark and display abandoned guessers in results"
```

---

## Task 12: Manual integration smoke

- [ ] **Step 12.1: Boot dev server and test**

```
cd server && node src/index.js
```
Open two browser windows, create telephone lobby with 3 players (use two tabs + one incognito), start game, close one tab mid-phase. In remaining tabs:
- Verify 橘色暫停面板出現並列出斷線者 nickname。
- 非 host 窗口看到「等待房主決定...」。
- Host 點「不等了，繼續遊戲」→ phase 推進；斷線的 songIdx 路徑應顯示 fallback 提示。
- 新開一個標籤，在 MainMenu 看到 lobby 標「遊玩中」並列出斷線者；按「重新加入」輸入原 nickname → 自動進入當前 phase。

Record observed results in commit message if any polish is needed; open follow-up issues otherwise.

- [ ] **Step 12.2: Verify existing behaviour unchanged**

```
cd server && npm test
cd client && npm run build
```
Both must pass.
