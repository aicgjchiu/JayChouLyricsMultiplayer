# Jay Chou Lyrics Multiplayer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time multiplayer lyrics-guessing web game using Node.js + Socket.io on the backend and React + Vite on the frontend, deployable to Fly.io as a single Docker image.

**Architecture:** One Node.js server (Express + Socket.io) hosts all lobby/game state in memory, serves the React build as static files, and serves audio files from `/audio/*`. Clients communicate exclusively over Socket.io WebSocket events. No database.

**Tech Stack:** Node.js (ESM), Express 4, Socket.io 4, opencc-js, Vitest — React 18, Vite 5, socket.io-client — Docker, Fly.io

---

## File Map

### Server (`/server`)
| File | Responsibility |
|------|----------------|
| `package.json` | ESM deps: express, socket.io, opencc-js; devDeps: vitest |
| `src/scoring.js` | OpenCC s2t conversion, text normalization, LCS, score formula |
| `src/gameManager.js` | All lobby + game state: create, join, start, tick, score, end |
| `src/index.js` | Express setup, static serving, thin Socket.io event wiring |
| `tests/scoring.test.js` | Unit tests for scoring module |
| `tests/gameManager.test.js` | Unit tests for lobby operations |

### Client (`/client`)
| File | Responsibility |
|------|----------------|
| `package.json` | React 18, Vite 5, socket.io-client |
| `vite.config.js` | Proxy `/socket.io` and `/audio` to Express in dev |
| `index.html` | HTML entry point |
| `src/main.jsx` | React root mount |
| `src/socket.js` | Socket.io client singleton |
| `src/App.jsx` | Page state machine + all global socket event handlers |
| `src/hooks/useSocket.js` | `useSocketEvent(event, handler)` utility hook |
| `src/utils/scoring.js` | Client-side char count helper (no OpenCC, display only) |
| `src/pages/MainMenu.jsx` | Nickname, create/join lobby, public lobby browse list |
| `src/pages/Lobby.jsx` | Waiting room, player list, settings panel, start button |
| `src/pages/Game.jsx` | Audio player, answer input, countdown, live char counter |
| `src/pages/Reveal.jsx` | Per-round answer reveal table, auto-advance countdown |
| `src/pages/Results.jsx` | Final leaderboard, winner, 返回Lobby / 回主選單 |

### Root
| File | Responsibility |
|------|----------------|
| `Dockerfile` | Multi-stage: build React → copy into Node.js image |
| `fly.toml` | Fly.io machine config (shared-cpu-1x, 512MB) |
| `.dockerignore` | Exclude node_modules, .superpowers, docs, audio already in context |

---

## Socket.io Protocol Reference

### Client → Server
| Event | Payload |
|-------|---------|
| `get-lobbies` | — |
| `create-lobby` | `{ nickname, lobbyName, numQuestions, timeLimit, isPrivate, password? }` |
| `join-lobby` | `{ lobbyCode, nickname, password? }` |
| `start-game` | — (host only) |
| `submit-answer` | `{ answer: string }` |
| `restart-lobby` | — (host only, after game-over) |
| `leave-lobby` | — |

### Server → Client
| Event | Payload |
|-------|---------|
| `lobby-list` | `[{ code, name, playerCount, maxPlayers }]` |
| `joined-lobby` | `{ code }` |
| `lobby-updated` | `{ code, name, hostSocketId, settings, players[], maxPlayers }` |
| `question-start` | `{ audioUrl, charCount, hint, questionIndex, total, timeLimit }` |
| `timer-tick` | `{ secondsRemaining }` |
| `player-submitted` | `{ nickname }` |
| `question-end` | `{ correctAnswer, results: [{ nickname, answer, accuracy, pointsEarned, totalScore }] }` |
| `game-over` | `{ finalScores: [{ nickname, score }], winner }` |
| `kicked-to-menu` | `{ reason }` |
| `error` | `{ message }` |

---

## Task 1: Server Scaffolding

**Files:**
- Create: `server/package.json`
- Create: `server/src/.gitkeep`
- Create: `server/tests/.gitkeep`

- [ ] **Step 1: Create server directory and package.json**

```bash
mkdir -p server/src server/tests
```

`server/package.json`:
```json
{
  "name": "jay-chou-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "express": "^4.19.2",
    "opencc-js": "^1.0.5",
    "socket.io": "^4.7.5"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Install server dependencies**

```bash
cd server && npm install
```

Expected: `node_modules/` created with express, socket.io, opencc-js, vitest.

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "feat: add server package.json"
```

---

## Task 2: Client Scaffolding

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.js`
- Create: `client/index.html`
- Create: `client/src/main.jsx`

- [ ] **Step 1: Create client directory and package.json**

```bash
mkdir -p client/src/pages client/src/hooks client/src/utils
```

`client/package.json`:
```json
{
  "name": "jay-chou-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "socket.io-client": "^4.7.5"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.3.1"
  }
}
```

- [ ] **Step 2: Create vite.config.js**

`client/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/audio': 'http://localhost:3000',
    },
  },
});
```

- [ ] **Step 3: Create index.html and main.jsx**

`client/index.html`:
```html
<!DOCTYPE html>
<html lang="zh-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Jay Chou Lyrics</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`client/src/main.jsx`:
```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
```

- [ ] **Step 4: Install client dependencies**

```bash
cd client && npm install
```

- [ ] **Step 5: Commit**

```bash
git add client/
git commit -m "feat: add client scaffolding with Vite + React"
```

---

## Task 3: Scoring Module (TDD)

**Files:**
- Create: `server/src/scoring.js`
- Create: `server/tests/scoring.test.js`

- [ ] **Step 1: Write failing tests**

`server/tests/scoring.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { normalizeText, calculateScore } from '../src/scoring.js';

describe('normalizeText', () => {
  it('strips spaces and punctuation', () => {
    expect(normalizeText('海，風！刮 過')).toBe('海風刮過');
  });

  it('converts simplified to traditional', () => {
    expect(normalizeText('海风')).toBe('海風');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeText('')).toBe('');
  });
});

describe('calculateScore', () => {
  const correct = '海風刮過了無人的街道'; // 10 chars normalized

  it('perfect traditional Chinese answer scores 100 accuracy + speed bonus', () => {
    const result = calculateScore('海風刮過了無人的街道', correct, 5000, 30000);
    expect(result.accuracyScore).toBe(100);
    expect(result.speedBonus).toBe(41); // floor((1 - 5000/30000) * 50)
    expect(result.total).toBe(141);
  });

  it('perfect simplified Chinese answer scores same as traditional', () => {
    const result = calculateScore('海风刮过了无人的街道', correct, 5000, 30000);
    expect(result.accuracyScore).toBe(100);
  });

  it('partial answer (4/10 chars) scores 40 with no speed bonus below 60%', () => {
    const result = calculateScore('海風刮過', correct, 5000, 30000);
    expect(result.accuracyScore).toBe(40);
    expect(result.speedBonus).toBe(0); // accuracy < 60%
    expect(result.total).toBe(40);
  });

  it('empty answer scores 0', () => {
    const result = calculateScore('', correct, null, 30000);
    expect(result.accuracyScore).toBe(0);
    expect(result.speedBonus).toBe(0);
    expect(result.total).toBe(0);
  });

  it('speed bonus is 0 when submitted at end of timer', () => {
    const result = calculateScore('海風刮過了無人的街道', correct, 30000, 30000);
    expect(result.accuracyScore).toBe(100);
    expect(result.speedBonus).toBe(0);
  });

  it('accuracy exposed as a ratio', () => {
    const result = calculateScore('海風刮過了無人的街道', correct, 5000, 30000);
    expect(result.accuracy).toBeCloseTo(1.0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd server && npm test
```

Expected: all tests fail with "Cannot find module".

- [ ] **Step 3: Implement scoring.js**

`server/src/scoring.js`:
```js
import { Converter } from 'opencc-js';

const toTraditional = Converter({ from: 'cn', to: 'tw' });

export function normalizeText(str) {
  return toTraditional(str).replace(/[\s\p{P}]/gu, '');
}

function lcs(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * @param {string} playerAnswer - raw player input (may be simplified Chinese)
 * @param {string} correctAnswer - correct lyric from questions.json (traditional Chinese)
 * @param {number|null} submittedMs - ms elapsed since question started (null = no submission)
 * @param {number} timeLimitMs - total question time in ms
 * @returns {{ accuracyScore: number, speedBonus: number, total: number, accuracy: number }}
 */
export function calculateScore(playerAnswer, correctAnswer, submittedMs, timeLimitMs) {
  const normPlayer = normalizeText(playerAnswer);
  const normCorrect = normalizeText(correctAnswer);

  if (normCorrect.length === 0) return { accuracyScore: 0, speedBonus: 0, total: 0, accuracy: 0 };

  const matchingChars = lcs(normPlayer, normCorrect);
  const accuracy = matchingChars / normCorrect.length;
  const accuracyScore = Math.floor(accuracy * 100);

  let speedBonus = 0;
  if (accuracy >= 0.6 && submittedMs !== null) {
    speedBonus = Math.max(0, Math.floor((1 - submittedMs / timeLimitMs) * 50));
  }

  return { accuracyScore, speedBonus, total: accuracyScore + speedBonus, accuracy };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd server && npm test
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/scoring.js server/tests/scoring.test.js
git commit -m "feat: add scoring module with OpenCC, LCS, and speed bonus"
```

---

## Task 4: Game Manager (TDD)

**Files:**
- Create: `server/src/gameManager.js`
- Create: `server/tests/gameManager.test.js`

- [ ] **Step 1: Write failing tests**

`server/tests/gameManager.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameManager } from '../src/gameManager.js';

function makeMockIo() {
  const emitFn = vi.fn();
  return {
    to: vi.fn().mockReturnValue({ emit: emitFn }),
    _emitFn: emitFn,
  };
}

describe('GameManager.createLobby', () => {
  it('returns a lobby with a 6-char uppercase code', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('socket1', {
      nickname: 'Alice', lobbyName: 'Test', numQuestions: 10, timeLimit: 30,
      isPrivate: false, password: null,
    });
    expect(lobby.id).toMatch(/^[A-Z0-9]{6}$/);
    expect(lobby.players).toHaveLength(1);
    expect(lobby.players[0].nickname).toBe('Alice');
    expect(lobby.state).toBe('waiting');
  });

  it('registers socket in socketToLobby map', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('socket1', {
      nickname: 'Alice', lobbyName: 'Test', numQuestions: 10, timeLimit: 30,
      isPrivate: false, password: null,
    });
    expect(mgr.getLobby('socket1')).toBe(lobby);
  });
});

describe('GameManager.joinLobby', () => {
  let mgr, lobby;
  beforeEach(() => {
    mgr = new GameManager();
    lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
  });

  it('allows a second player to join', () => {
    const result = mgr.joinLobby('socket2', { lobbyCode: lobby.id, nickname: 'Bob', password: null });
    expect(result.error).toBeUndefined();
    expect(result.lobby.players).toHaveLength(2);
  });

  it('rejects wrong lobby code', () => {
    const result = mgr.joinLobby('socket2', { lobbyCode: 'XXXXXX', nickname: 'Bob', password: null });
    expect(result.error).toBe('Lobby not found');
  });

  it('rejects duplicate nickname', () => {
    const result = mgr.joinLobby('socket2', { lobbyCode: lobby.id, nickname: 'Host', password: null });
    expect(result.error).toBe('Nickname already taken');
  });

  it('rejects when lobby is full', () => {
    for (let i = 2; i <= 8; i++) {
      mgr.joinLobby(`socket${i}`, { lobbyCode: lobby.id, nickname: `Player${i}`, password: null });
    }
    const result = mgr.joinLobby('socket9', { lobbyCode: lobby.id, nickname: 'Extra', password: null });
    expect(result.error).toBe('Lobby is full');
  });

  it('rejects wrong password for private lobby', () => {
    const privLobby = mgr.createLobby('host2', {
      nickname: 'Host2', lobbyName: 'Private', numQuestions: 5, timeLimit: 30,
      isPrivate: true, password: 'secret',
    });
    const result = mgr.joinLobby('socket2', { lobbyCode: privLobby.id, nickname: 'Bob', password: 'wrong' });
    expect(result.error).toBe('Wrong password');
  });

  it('accepts correct password for private lobby', () => {
    const privLobby = mgr.createLobby('host2', {
      nickname: 'Host2', lobbyName: 'Private', numQuestions: 5, timeLimit: 30,
      isPrivate: true, password: 'secret',
    });
    const result = mgr.joinLobby('socket2', { lobbyCode: privLobby.id, nickname: 'Bob', password: 'secret' });
    expect(result.error).toBeUndefined();
  });
});

describe('GameManager.leaveLobby', () => {
  it('host leaving closes the lobby and emits kicked-to-menu', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.leaveLobby('host', io);
    expect(io.to).toHaveBeenCalledWith(lobby.id);
    expect(io._emitFn).toHaveBeenCalledWith('kicked-to-menu', { reason: 'host_closed' });
    expect(mgr.lobbies.has(lobby.id)).toBe(false);
  });

  it('non-host leaving removes them from player list', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.leaveLobby('p2', io);
    expect(lobby.players).toHaveLength(1);
    expect(lobby.players[0].nickname).toBe('Host');
  });
});

describe('GameManager.getPublicLobbies', () => {
  it('returns only public waiting lobbies', () => {
    const mgr = new GameManager();
    mgr.createLobby('h1', { nickname: 'H1', lobbyName: 'Public', numQuestions: 5, timeLimit: 30, isPrivate: false, password: null });
    mgr.createLobby('h2', { nickname: 'H2', lobbyName: 'Private', numQuestions: 5, timeLimit: 30, isPrivate: true, password: 'pw' });
    const list = mgr.getPublicLobbies();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Public');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd server && npm test
```

Expected: all tests fail with "Cannot find module".

- [ ] **Step 3: Implement gameManager.js**

`server/src/gameManager.js`:
```js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { calculateScore, normalizeText } from './scoring.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const allQuestions = JSON.parse(
  readFileSync(join(__dirname, '../../questions.json'), 'utf-8')
);

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export class GameManager {
  constructor() {
    this.lobbies = new Map();       // code -> lobby
    this.socketToLobby = new Map(); // socketId -> code
  }

  getLobby(socketId) {
    const code = this.socketToLobby.get(socketId);
    return code ? this.lobbies.get(code) : null;
  }

  getPublicLobbies() {
    return [...this.lobbies.values()]
      .filter(l => !l.isPrivate && l.state === 'waiting')
      .map(l => ({ code: l.id, name: l.name, playerCount: l.players.length, maxPlayers: l.maxPlayers }));
  }

  lobbyPayload(lobby) {
    return {
      code: lobby.id,
      name: lobby.name,
      hostSocketId: lobby.hostSocketId,
      settings: lobby.settings,
      maxPlayers: lobby.maxPlayers,
      players: lobby.players.map(p => ({ nickname: p.nickname, score: p.score, socketId: p.socketId })),
    };
  }

  createLobby(socketId, { nickname, lobbyName, numQuestions, timeLimit, isPrivate, password }) {
    let code;
    do { code = generateCode(); } while (this.lobbies.has(code));

    const lobby = {
      id: code,
      name: lobbyName || `${nickname}'s Lobby`,
      hostSocketId: socketId,
      isPrivate: Boolean(isPrivate),
      password: password || null,
      maxPlayers: 8,
      settings: { numQuestions: numQuestions || 10, timeLimit: timeLimit || 30 },
      players: [{ socketId, nickname, score: 0 }],
      state: 'waiting',
      questions: [],
      currentQuestionIndex: 0,
      currentAnswers: new Map(),
      timerHandle: null,
      revealTimer: null,    // setTimeout handle for 5s auto-advance between questions
      questionStartTime: null,
      secondsRemaining: 0,
    };

    this.lobbies.set(code, lobby);
    this.socketToLobby.set(socketId, code);
    return lobby;
  }

  joinLobby(socketId, { lobbyCode, nickname, password }) {
    const code = (lobbyCode || '').toUpperCase();
    const lobby = this.lobbies.get(code);

    if (!lobby) return { error: 'Lobby not found' };
    if (lobby.state !== 'waiting') return { error: 'Game already in progress' };
    if (lobby.players.length >= lobby.maxPlayers) return { error: 'Lobby is full' };
    if (lobby.players.some(p => p.nickname === nickname)) return { error: 'Nickname already taken' };
    if (lobby.isPrivate && lobby.password !== password) return { error: 'Wrong password' };

    lobby.players.push({ socketId, nickname, score: 0 });
    this.socketToLobby.set(socketId, code);
    return { lobby };
  }

  leaveLobby(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;

    this.socketToLobby.delete(socketId);

    if (lobby.hostSocketId === socketId) {
      this._closeLobby(lobby, io, 'host_closed');
      return;
    }

    lobby.players = lobby.players.filter(p => p.socketId !== socketId);

    if (lobby.state === 'waiting') {
      io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
    } else if (lobby.state === 'in_question') {
      if (lobby.players.length === 0) {
        if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
        this.lobbies.delete(lobby.id);
        return;
      }
      if (lobby.currentAnswers.size >= lobby.players.length) {
        if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
        this._endQuestion(lobby, io);
      }
    }
  }

  handleDisconnect(socketId, io) {
    this.leaveLobby(socketId, io);
  }

  startGame(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.hostSocketId !== socketId) return;
    if (lobby.players.length < 2 || lobby.state !== 'waiting') return;

    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    lobby.questions = shuffled.slice(0, lobby.settings.numQuestions);
    lobby.currentQuestionIndex = 0;
    lobby.players.forEach(p => { p.score = 0; });

    this._startQuestion(lobby, io);
  }

  restartLobby(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'finished') return;

    if (lobby.revealTimer) { clearTimeout(lobby.revealTimer); lobby.revealTimer = null; }
    lobby.state = 'waiting';
    lobby.questions = [];
    lobby.currentQuestionIndex = 0;
    lobby.currentAnswers = new Map();
    lobby.players.forEach(p => { p.score = 0; });

    io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
  }

  submitAnswer(socketId, { answer }, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.state !== 'in_question') return;
    if (lobby.currentAnswers.has(socketId)) return;

    const submittedMs = Date.now() - lobby.questionStartTime;
    lobby.currentAnswers.set(socketId, { answer, submittedMs });

    const player = lobby.players.find(p => p.socketId === socketId);
    if (player) io.to(lobby.id).emit('player-submitted', { nickname: player.nickname });

    if (lobby.currentAnswers.size >= lobby.players.length) {
      if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
      this._endQuestion(lobby, io);
    }
  }

  _startQuestion(lobby, io) {
    lobby.state = 'in_question';
    lobby.currentAnswers = new Map();
    lobby.questionStartTime = Date.now();
    lobby.secondsRemaining = lobby.settings.timeLimit;

    const q = lobby.questions[lobby.currentQuestionIndex];
    io.to(lobby.id).emit('question-start', {
      audioUrl: `/${q.audio}`,
      charCount: normalizeText(q.answer).length,
      hint: q.hint,
      questionIndex: lobby.currentQuestionIndex + 1,
      total: lobby.settings.numQuestions,
      timeLimit: lobby.settings.timeLimit,
    });

    lobby.timerHandle = setInterval(() => {
      lobby.secondsRemaining--;
      io.to(lobby.id).emit('timer-tick', { secondsRemaining: lobby.secondsRemaining });
      if (lobby.secondsRemaining <= 0) {
        clearInterval(lobby.timerHandle);
        lobby.timerHandle = null;
        this._endQuestion(lobby, io);
      }
    }, 1000);
  }

  _endQuestion(lobby, io) {
    if (lobby.state !== 'in_question') return; // guard against double-call
    lobby.state = 'reveal';

    const q = lobby.questions[lobby.currentQuestionIndex];
    const timeLimitMs = lobby.settings.timeLimit * 1000;

    const results = lobby.players.map(player => {
      const submission = lobby.currentAnswers.get(player.socketId);
      const answer = submission?.answer ?? '';
      const submittedMs = submission?.submittedMs ?? null;

      const { accuracyScore, speedBonus, accuracy } = calculateScore(answer, q.answer, submittedMs, timeLimitMs);
      const pointsEarned = accuracyScore + speedBonus;
      player.score += pointsEarned;

      return {
        nickname: player.nickname,
        answer,
        accuracy: Math.round(accuracy * 100),
        pointsEarned,
        totalScore: player.score,
      };
    });

    io.to(lobby.id).emit('question-end', { correctAnswer: q.answer, results });

    lobby.revealTimer = setTimeout(() => {
      lobby.revealTimer = null;
      this._nextQuestion(lobby, io);
    }, 5000);
  }

  _nextQuestion(lobby, io) {
    lobby.currentQuestionIndex++;

    if (lobby.currentQuestionIndex >= lobby.settings.numQuestions) {
      lobby.state = 'finished';
      const finalScores = [...lobby.players]
        .sort((a, b) => b.score - a.score)
        .map(p => ({ nickname: p.nickname, score: p.score }));
      io.to(lobby.id).emit('game-over', { finalScores, winner: finalScores[0]?.nickname ?? '' });
    } else {
      this._startQuestion(lobby, io);
    }
  }

  _closeLobby(lobby, io, reason) {
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    if (lobby.revealTimer) { clearTimeout(lobby.revealTimer); lobby.revealTimer = null; }
    io.to(lobby.id).emit('kicked-to-menu', { reason });
    lobby.players.forEach(p => this.socketToLobby.delete(p.socketId));
    this.lobbies.delete(lobby.id);
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
cd server && npm test
```

Expected: all tests PASS (scoring + gameManager).

- [ ] **Step 5: Commit**

```bash
git add server/src/gameManager.js server/tests/gameManager.test.js
git commit -m "feat: add GameManager with lobby state, timer, scoring integration"
```

---

## Task 5: Express + Socket.io Server

**Files:**
- Create: `server/src/index.js`

- [ ] **Step 1: Create index.js**

`server/src/index.js`:
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

// Serve audio files
app.use('/audio', express.static(join(__dirname, '../../audio')));

// Serve React production build
app.use(express.static(join(__dirname, '../../client/dist')));
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, '../../client/dist/index.html'));
});

io.on('connection', (socket) => {
  socket.on('get-lobbies', () => {
    socket.emit('lobby-list', manager.getPublicLobbies());
  });

  socket.on('create-lobby', (data) => {
    const lobby = manager.createLobby(socket.id, data);
    socket.join(lobby.id);
    socket.emit('joined-lobby', { code: lobby.id });
    io.to(lobby.id).emit('lobby-updated', manager.lobbyPayload(lobby));
  });

  socket.on('join-lobby', (data) => {
    const result = manager.joinLobby(socket.id, data);
    if (result.error) { socket.emit('error', { message: result.error }); return; }
    socket.join(result.lobby.id);
    socket.emit('joined-lobby', { code: result.lobby.id });
    io.to(result.lobby.id).emit('lobby-updated', manager.lobbyPayload(result.lobby));
  });

  socket.on('start-game', () => manager.startGame(socket.id, io));

  socket.on('submit-answer', (data) => manager.submitAnswer(socket.id, data, io));

  socket.on('restart-lobby', () => manager.restartLobby(socket.id, io));

  socket.on('leave-lobby', () => manager.leaveLobby(socket.id, io));

  socket.on('disconnect', () => manager.handleDisconnect(socket.id, io));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
```

- [ ] **Step 2: Smoke test the server**

First build a temp React page so the server has something to serve:
```bash
mkdir -p client/dist && echo '<!DOCTYPE html><html><body>ok</body></html>' > client/dist/index.html
```

Then start the server:
```bash
cd server && npm run dev
```

Expected: `Server listening on port 3000` — no errors.

Stop the server with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.js
git commit -m "feat: add Express + Socket.io server wiring"
```

---

## Task 6: React App Shell

**Files:**
- Create: `client/src/socket.js`
- Create: `client/src/hooks/useSocket.js`
- Create: `client/src/utils/scoring.js`
- Create: `client/src/App.jsx`

- [ ] **Step 1: Create socket singleton**

`client/src/socket.js`:
```js
import { io } from 'socket.io-client';
const socket = io();
export default socket;
```

- [ ] **Step 2: Create useSocketEvent hook**

`client/src/hooks/useSocket.js`:
```js
import { useEffect } from 'react';
import socket from '../socket.js';

export function useSocketEvent(event, handler) {
  useEffect(() => {
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [event, handler]);
}
```

- [ ] **Step 3: Create client-side char count utility**

`client/src/utils/scoring.js`:
```js
// Client-side only — no OpenCC conversion, display purposes only
export function normalizeForCount(str) {
  return str.replace(/[\s\p{P}]/gu, '');
}

export function getCharCount(str) {
  return normalizeForCount(str).length;
}
```

- [ ] **Step 4: Create App.jsx with page state machine**

`client/src/App.jsx`:
```jsx
import React, { useState, useCallback } from 'react';
import socket from './socket.js';
import { useSocketEvent } from './hooks/useSocket.js';
import MainMenu from './pages/MainMenu.jsx';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';
import Reveal from './pages/Reveal.jsx';
import Results from './pages/Results.jsx';

export default function App() {
  const [page, setPage] = useState('menu');
  const [nickname, setNickname] = useState('');
  const [lobby, setLobby] = useState(null);
  const [question, setQuestion] = useState(null);
  const [timer, setTimer] = useState(0);
  const [revealData, setRevealData] = useState(null);
  const [finalData, setFinalData] = useState(null);

  useSocketEvent('lobby-updated', useCallback((data) => setLobby(data), []));

  useSocketEvent('joined-lobby', useCallback(() => setPage('lobby'), []));

  useSocketEvent('question-start', useCallback((data) => {
    setQuestion(data);
    setTimer(data.timeLimit);
    setRevealData(null);
    setPage('game');
  }, []));

  useSocketEvent('timer-tick', useCallback(({ secondsRemaining }) => {
    setTimer(secondsRemaining);
  }, []));

  useSocketEvent('question-end', useCallback((data) => {
    setRevealData(data);
    setPage('reveal');
  }, []));

  useSocketEvent('game-over', useCallback((data) => {
    setFinalData(data);
    setPage('results');
  }, []));

  useSocketEvent('kicked-to-menu', useCallback(() => {
    setPage('menu');
    setLobby(null);
    setQuestion(null);
    setRevealData(null);
    setFinalData(null);
  }, []));

  const goToMenu = useCallback(() => {
    socket.emit('leave-lobby');
    setPage('menu');
    setLobby(null);
    setQuestion(null);
    setRevealData(null);
    setFinalData(null);
  }, []);

  const goToLobby = useCallback((isHost) => {
    if (isHost) socket.emit('restart-lobby');
    setPage('lobby');
    setQuestion(null);
    setRevealData(null);
    setFinalData(null);
  }, []);

  const sharedProps = {
    nickname, setNickname,
    lobby, setLobby,
    question, timer,
    revealData, finalData,
    setPage, goToMenu, goToLobby,
  };

  return (
    <>
      {page === 'menu' && <MainMenu {...sharedProps} />}
      {page === 'lobby' && <Lobby {...sharedProps} />}
      {page === 'game' && <Game {...sharedProps} />}
      {page === 'reveal' && <Reveal {...sharedProps} />}
      {page === 'results' && <Results {...sharedProps} />}
    </>
  );
}
```

- [ ] **Step 5: Add placeholder pages so the build doesn't break**

Create each of the following with a minimal placeholder:

`client/src/pages/MainMenu.jsx`:
```jsx
export default function MainMenu() { return <div>MainMenu</div>; }
```

`client/src/pages/Lobby.jsx`:
```jsx
export default function Lobby() { return <div>Lobby</div>; }
```

`client/src/pages/Game.jsx`:
```jsx
export default function Game() { return <div>Game</div>; }
```

`client/src/pages/Reveal.jsx`:
```jsx
export default function Reveal() { return <div>Reveal</div>; }
```

`client/src/pages/Results.jsx`:
```jsx
export default function Results() { return <div>Results</div>; }
```

- [ ] **Step 6: Verify the client builds**

```bash
cd client && npm run build
```

Expected: `dist/` created with no errors.

- [ ] **Step 7: Verify full stack starts together**

Open two terminals:
```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

Open `http://localhost:5173` — should see "MainMenu" text. No console errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/
git commit -m "feat: add React app shell, socket singleton, page state machine"
```

---

## Task 7: MainMenu Page

**Files:**
- Modify: `client/src/pages/MainMenu.jsx`

- [ ] **Step 1: Implement MainMenu.jsx**

`client/src/pages/MainMenu.jsx`:
```jsx
import React, { useState, useEffect, useCallback } from 'react';
import socket from '../socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';

export default function MainMenu({ nickname, setNickname }) {
  const [view, setView] = useState('home'); // 'home' | 'create' | 'join'
  const [lobbyList, setLobbyList] = useState([]);
  const [form, setForm] = useState({
    lobbyName: '', numQuestions: 10, timeLimit: 30, isPrivate: false, password: '',
  });
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    socket.emit('get-lobbies');
    const interval = setInterval(() => socket.emit('get-lobbies'), 5000);
    return () => clearInterval(interval);
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

  function handleJoin(e) {
    e.preventDefault();
    if (!nickname.trim()) { setErrorMsg('請輸入暱稱'); return; }
    if (!joinCode.trim()) { setErrorMsg('請輸入邀請碼'); return; }
    setErrorMsg('');
    socket.emit('join-lobby', {
      lobbyCode: joinCode.trim().toUpperCase(),
      nickname: nickname.trim(),
      password: joinPassword || null,
    });
  }

  function handleQuickJoin(code) {
    if (!nickname.trim()) { setErrorMsg('請先輸入暱稱'); return; }
    setErrorMsg('');
    socket.emit('join-lobby', { lobbyCode: code, nickname: nickname.trim(), password: null });
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
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <button onClick={() => setView('create')} style={{ flex: 1, padding: 10, fontSize: 16 }}>
              建立 Lobby
            </button>
            <button onClick={() => setView('join')} style={{ flex: 1, padding: 10, fontSize: 16 }}>
              加入 Lobby
            </button>
          </div>

          <h3 style={{ marginBottom: 8 }}>公開 Lobbies</h3>
          {lobbyList.length === 0 && <p style={{ color: '#888' }}>目前沒有公開 Lobby</p>}
          {lobbyList.map(l => (
            <div key={l.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
              <span>{l.name}</span>
              <span style={{ color: '#888', fontSize: 14 }}>{l.playerCount}/{l.maxPlayers} 人</span>
              <button onClick={() => handleQuickJoin(l.code)} style={{ padding: '4px 12px' }}>加入</button>
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
            {' '}私人 Lobby
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

      {view === 'join' && (
        <form onSubmit={handleJoin}>
          <h3>加入 Lobby</h3>
          <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="邀請碼 (6 碼)" maxLength={6}
            style={{ width: '100%', padding: '8px 12px', margin: '4px 0 12px', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 18, letterSpacing: 4 }} />
          <input value={joinPassword} onChange={e => setJoinPassword(e.target.value)}
            placeholder="密碼（私人 Lobby 才需要）" type="password"
            style={{ width: '100%', padding: '6px 10px', margin: '4px 0 12px', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={{ flex: 1, padding: 10 }}>加入</button>
            <button type="button" onClick={() => setView('home')} style={{ flex: 1, padding: 10 }}>返回</button>
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Start both server and client dev servers. Open `http://localhost:5173`. Verify:
- Nickname input works
- "建立 Lobby" shows create form with all fields
- "加入 Lobby" shows code input
- Public lobby list auto-refreshes every 5 seconds

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/MainMenu.jsx
git commit -m "feat: implement MainMenu page"
```

---

## Task 8: Lobby Page

**Files:**
- Modify: `client/src/pages/Lobby.jsx`

- [ ] **Step 1: Implement Lobby.jsx**

`client/src/pages/Lobby.jsx`:
```jsx
import React, { useState, useCallback } from 'react';
import socket from '../socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';

export default function Lobby({ nickname, lobby, setLobby, goToMenu }) {
  const [settings, setSettings] = useState(lobby?.settings || { numQuestions: 10, timeLimit: 30 });
  const [errorMsg, setErrorMsg] = useState('');

  const isHost = lobby?.hostSocketId === socket.id;

  useSocketEvent('error', useCallback(({ message }) => setErrorMsg(message), []));

  function handleStartGame() {
    socket.emit('start-game');
  }

  function handleSettingChange(key, value) {
    const updated = { ...settings, [key]: Number(value) };
    setSettings(updated);
    // Optimistic: server will broadcast lobby-updated confirming
    socket.emit('update-settings', updated);
  }

  if (!lobby) return null;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{lobby.name}</h2>
        <button onClick={goToMenu} style={{ padding: '6px 14px' }}>離開</button>
      </div>

      <div style={{ background: '#f5f5f5', borderRadius: 8, padding: '8px 16px', marginBottom: 20, fontFamily: 'monospace', fontSize: 22, letterSpacing: 6, textAlign: 'center' }}>
        邀請碼：{lobby.code}
      </div>

      {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: '0 0 12px' }}>玩家 ({lobby.players.length}/{lobby.maxPlayers})</h4>
          {lobby.players.map(p => (
            <div key={p.socketId} style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}>
              {p.socketId === lobby.hostSocketId ? '👑 ' : '🎵 '}
              {p.nickname}
              {p.socketId === socket.id ? ' (你)' : ''}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: '0 0 12px' }}>設定</h4>

          <label style={{ display: 'block', marginBottom: 4 }}>題數</label>
          {isHost ? (
            <select value={lobby.settings.numQuestions}
              onChange={e => handleSettingChange('numQuestions', e.target.value)}
              style={{ width: '100%', padding: '6px 8px', marginBottom: 12 }}>
              {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n} 題</option>)}
            </select>
          ) : (
            <p style={{ margin: '0 0 12px', fontWeight: 600 }}>{lobby.settings.numQuestions} 題</p>
          )}

          <label style={{ display: 'block', marginBottom: 4 }}>每題時間</label>
          {isHost ? (
            <select value={lobby.settings.timeLimit}
              onChange={e => handleSettingChange('timeLimit', e.target.value)}
              style={{ width: '100%', padding: '6px 8px', marginBottom: 12 }}>
              {[15, 30, 45].map(s => <option key={s} value={s}>{s} 秒</option>)}
            </select>
          ) : (
            <p style={{ margin: '0 0 12px', fontWeight: 600 }}>{lobby.settings.timeLimit} 秒</p>
          )}

          <p style={{ margin: 0, color: '#888', fontSize: 14 }}>
            {lobby.isPrivate ? '🔒 私人' : '🌐 公開'}
          </p>
        </div>
      </div>

      {isHost && (
        <button
          onClick={handleStartGame}
          disabled={lobby.players.length < 2}
          style={{
            display: 'block', width: '100%', marginTop: 20, padding: 14,
            fontSize: 18, background: lobby.players.length >= 2 ? '#22c55e' : '#ccc',
            color: 'white', border: 'none', borderRadius: 8, cursor: lobby.players.length >= 2 ? 'pointer' : 'not-allowed',
          }}>
          開始遊戲 {lobby.players.length < 2 ? '（需要至少 2 名玩家）' : ''}
        </button>
      )}
      {!isHost && (
        <p style={{ textAlign: 'center', color: '#888', marginTop: 20 }}>等待房主開始遊戲...</p>
      )}
    </div>
  );
}
```

> **Note:** The settings `update-settings` event requires a small addition to `server/src/index.js` and `GameManager`. Add to `index.js`:
> ```js
> socket.on('update-settings', (settings) => manager.updateSettings(socket.id, settings, io));
> ```
> Add to `GameManager`:
> ```js
> updateSettings(socketId, { numQuestions, timeLimit }, io) {
>   const lobby = this.getLobby(socketId);
>   if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'waiting') return;
>   lobby.settings.numQuestions = numQuestions;
>   lobby.settings.timeLimit = timeLimit;
>   io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
> }
> ```

- [ ] **Step 2: Add updateSettings to server**

In `server/src/gameManager.js`, add after `restartLobby`:
```js
updateSettings(socketId, { numQuestions, timeLimit }, io) {
  const lobby = this.getLobby(socketId);
  if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'waiting') return;
  if (numQuestions) lobby.settings.numQuestions = numQuestions;
  if (timeLimit) lobby.settings.timeLimit = timeLimit;
  io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
}
```

In `server/src/index.js`, add after `restart-lobby` handler:
```js
socket.on('update-settings', (data) => manager.updateSettings(socket.id, data, io));
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:5173` in two browser tabs. Create a lobby in tab 1, join in tab 2. Verify:
- Both tabs show the player list
- Host sees editable settings, non-host sees read-only
- Changing settings in host tab reflects in non-host tab
- Start button only enabled when 2+ players
- "離開" returns to main menu

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Lobby.jsx server/src/gameManager.js server/src/index.js
git commit -m "feat: implement Lobby page and updateSettings"
```

---

## Task 9: Game Page

**Files:**
- Modify: `client/src/pages/Game.jsx`

- [ ] **Step 1: Implement Game.jsx**

`client/src/pages/Game.jsx`:
```jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import socket from '../socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';
import { getCharCount } from '../utils/scoring.js';

export default function Game({ question, timer, lobby }) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedPlayers, setSubmittedPlayers] = useState([]);
  const audioRef = useRef(null);

  // Reset state when a new question arrives
  useEffect(() => {
    setAnswer('');
    setSubmitted(false);
    setSubmittedPlayers([]);
    if (audioRef.current) {
      audioRef.current.load();
      audioRef.current.play().catch(() => {});
    }
  }, [question?.questionIndex]);

  useSocketEvent('player-submitted', useCallback(({ nickname }) => {
    setSubmittedPlayers(prev => [...prev, nickname]);
  }, []));

  function handleSubmit(e) {
    e.preventDefault();
    if (submitted) return;
    socket.emit('submit-answer', { answer });
    setSubmitted(true);
  }

  if (!question) return null;

  const timerColor = timer <= 10 ? '#ef4444' : '#1f2937';
  const typedCount = getCharCount(answer);

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 16, color: '#555' }}>第 {question.questionIndex} / {question.total} 題</span>
        <span style={{ fontSize: 28, fontWeight: 700, color: timerColor }}>⏱ {timer}s</span>
      </div>

      <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 16, marginBottom: 16, textAlign: 'center' }}>
        <p style={{ margin: '0 0 4px', color: '#888', fontSize: 14 }}>提示：{question.hint}（共 {question.charCount} 字）</p>
        <audio ref={audioRef} src={question.audioUrl} preload="auto" style={{ width: '100%', marginBottom: 8 }} controls />
        <button
          onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); } }}
          style={{ padding: '6px 16px', fontSize: 14 }}>
          🔁 重播
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <textarea
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          disabled={submitted}
          placeholder={submitted ? '已提交' : '輸入歌詞...'}
          rows={2}
          style={{
            width: '100%', padding: '10px 12px', fontSize: 16, boxSizing: 'border-box',
            border: '2px solid #ddd', borderRadius: 8, resize: 'none',
            background: submitted ? '#f9f9f9' : 'white',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ color: '#888', fontSize: 14 }}>{typedCount} / {question.charCount} 字</span>
          <button type="submit" disabled={submitted} style={{ padding: '8px 20px', fontSize: 15, background: submitted ? '#ccc' : '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: submitted ? 'not-allowed' : 'pointer' }}>
            {submitted ? '已提交 ✓' : '提交'}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 20, borderTop: '1px solid #eee', paddingTop: 12 }}>
        <p style={{ color: '#888', fontSize: 13, margin: '0 0 8px' }}>其他玩家</p>
        {lobby?.players
          .filter(p => p.socketId !== socket.id)
          .map(p => (
            <span key={p.socketId} style={{ marginRight: 12, fontSize: 14 }}>
              {submittedPlayers.includes(p.nickname) ? '✅' : '✍️'} {p.nickname}
            </span>
          ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

With two tabs open in a lobby, start a game. Verify:
- Audio auto-plays
- Replay button works
- Char counter updates as you type (e.g. `3 / 10 字`)
- After submitting, input is disabled and button shows "已提交 ✓"
- The other tab shows ✅ next to the submitted player

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Game.jsx
git commit -m "feat: implement Game page with audio, countdown, char counter"
```

---

## Task 10: Reveal Page

**Files:**
- Modify: `client/src/pages/Reveal.jsx`

- [ ] **Step 1: Implement Reveal.jsx**

`client/src/pages/Reveal.jsx`:
```jsx
import React, { useState, useEffect } from 'react';

export default function Reveal({ revealData }) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    setCountdown(5);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [revealData]);

  if (!revealData) return null;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <h2 style={{ marginBottom: 4 }}>本題結果</h2>
      <p style={{ color: '#888', marginBottom: 16 }}>下一題將在 {countdown} 秒後開始...</p>

      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 16px', marginBottom: 20 }}>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: '#16a34a' }}>正確答案</p>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{revealData.correctAnswer}</p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ddd', color: '#888', fontSize: 13 }}>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>玩家</th>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>答案</th>
            <th style={{ padding: '6px 8px', textAlign: 'center' }}>準確率</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>得分</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>總分</th>
          </tr>
        </thead>
        <tbody>
          {revealData.results.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '8px 8px', fontWeight: 500 }}>{r.nickname}</td>
              <td style={{ padding: '8px 8px', color: r.answer ? '#333' : '#bbb', fontStyle: r.answer ? 'normal' : 'italic' }}>
                {r.answer || '（未作答）'}
              </td>
              <td style={{ padding: '8px 8px', textAlign: 'center', color: r.accuracy >= 80 ? '#16a34a' : r.accuracy >= 50 ? '#d97706' : '#dc2626' }}>
                {r.accuracy}%
              </td>
              <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600, color: r.pointsEarned > 0 ? '#16a34a' : '#888' }}>
                +{r.pointsEarned}
              </td>
              <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700 }}>
                {r.totalScore}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Complete a question in both tabs. Verify:
- Correct answer shown prominently
- All players' answers, accuracy %, points, and totals displayed
- 5-second countdown ticks down before auto-advancing to next question

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Reveal.jsx
git commit -m "feat: implement Reveal page with per-round answer table"
```

---

## Task 11: Results Page

**Files:**
- Modify: `client/src/pages/Results.jsx`

- [ ] **Step 1: Implement Results.jsx**

`client/src/pages/Results.jsx`:
```jsx
import React from 'react';
import socket from '../socket.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Results({ finalData, lobby, goToLobby, goToMenu }) {
  if (!finalData) return null;

  const isHost = lobby?.hostSocketId === socket.id;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24, textAlign: 'center' }}>
      <h1 style={{ marginBottom: 4 }}>🏆 遊戲結束</h1>
      {finalData.winner && (
        <p style={{ fontSize: 20, marginBottom: 24, color: '#f59e0b' }}>
          恭喜 <strong>{finalData.winner}</strong> 獲勝！
        </p>
      )}

      <div style={{ border: '1px solid #ddd', borderRadius: 10, overflow: 'hidden', marginBottom: 28 }}>
        {finalData.finalScores.map((p, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px', borderBottom: i < finalData.finalScores.length - 1 ? '1px solid #eee' : 'none',
            background: i === 0 ? '#fefce8' : 'white',
          }}>
            <span style={{ fontSize: 22, width: 32 }}>{MEDALS[i] || `${i + 1}`}</span>
            <span style={{ flex: 1, textAlign: 'left', fontWeight: i === 0 ? 700 : 400, fontSize: 16 }}>{p.nickname}</span>
            <span style={{ fontWeight: 700, fontSize: 18 }}>{p.score} 分</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button
          onClick={() => goToLobby(isHost)}
          style={{ flex: 1, padding: 12, fontSize: 16, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          返回 Lobby
        </button>
        <button
          onClick={goToMenu}
          style={{ flex: 1, padding: 12, fontSize: 16, background: 'white', border: '2px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
          回主選單
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify full game flow end-to-end**

Open two browser tabs. Complete a full game (all questions). Verify:
- Final leaderboard shows all players, sorted by score, with medals
- Winner highlighted in gold
- "返回 Lobby" resets the lobby to waiting state (both tabs see it)
- "回主選單" disconnects and returns to menu

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Results.jsx
git commit -m "feat: implement Results page with leaderboard and return options"
```

---

## Task 12: Deployment — Dockerfile + fly.toml

**Files:**
- Create: `Dockerfile`
- Create: `fly.toml`
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

`.dockerignore`:
```
**/node_modules
**/.git
.superpowers
docs
client/dist
```

- [ ] **Step 2: Create Dockerfile**

`Dockerfile`:
```dockerfile
# Stage 1: Build React client
FROM node:20-alpine AS builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine
WORKDIR /app

# Copy server
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/

# Copy game assets
COPY questions.json ./
COPY audio/ ./audio/

# Copy built React app
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3000
CMD ["node", "server/src/index.js"]
```

- [ ] **Step 3: Update server/src/index.js paths for Docker**

The Dockerfile puts everything under `/app`. The paths in `index.js` need to resolve correctly. Verify the paths:
- `join(__dirname, '../../audio')` — `__dirname` is `/app/server/src`, so `../../audio` = `/app/audio` ✓
- `join(__dirname, '../../client/dist')` — resolves to `/app/client/dist` ✓
- `join(__dirname, '../../questions.json')` in gameManager — resolves to `/app/questions.json` ✓

No changes needed.

- [ ] **Step 4: Create fly.toml**

First, create the Fly.io app if not already done:
```bash
fly launch --no-deploy --name jay-chou-lyrics
```

Then update the generated `fly.toml` (or create it) with:
```toml
app = "jay-chou-lyrics"
primary_region = "nrt"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

> `auto_stop_machines = "off"` is critical — WebSocket connections require the machine to stay alive.

- [ ] **Step 5: Test Docker build locally**

```bash
docker build -t jay-chou-test .
docker run -p 3000:3000 jay-chou-test
```

Open `http://localhost:3000` — should see the full game, including audio served correctly.

- [ ] **Step 6: Deploy to Fly.io**

```bash
fly deploy
```

Expected output ends with: `Visit your newly deployed app at https://jay-chou-lyrics.fly.dev`

- [ ] **Step 7: Verify deployed app**

Open the Fly.io URL in two different browser tabs. Complete a full game end-to-end on the live server.

- [ ] **Step 8: Final commit**

```bash
git add Dockerfile .dockerignore fly.toml
git commit -m "feat: add Dockerfile and fly.toml for production deployment"
```

---

## Post-Deployment Checklist

- [ ] Audio files with Chinese filenames load correctly (URL encoding test: open `/audio/太陽之子_202-209.mp3` directly)
- [ ] Multiple simultaneous lobbies work independently
- [ ] Host closing lobby sends all players to menu
- [ ] Private lobby rejects wrong password
- [ ] Simplified Chinese input scores same as traditional (test with `海风刮过了无人的街道` vs answer `海風刮過了無人的街道`)
