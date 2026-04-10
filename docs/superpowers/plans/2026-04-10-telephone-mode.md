# Musical Telephone Mode (音樂傳聲筒) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Musical Telephone" party mode where players record themselves singing mismatched lyrics to melodies, pass recordings down a chain, and the last person guesses the song.

**Architecture:** GameManager keeps shared lobby lifecycle; game-specific logic lives in `modes/lyricsGuess.js` (extracted) and `modes/telephone.js` (new). A pure `rotation.js` module builds the assignment matrix. Recordings are stored in-memory and served via HTTP. YouTube IFrame API embeds for Phase 1 audio.

**Tech Stack:** Node.js/Socket.IO (server), React/Vite (client), Vitest (server tests), YouTube IFrame Player API, MediaRecorder API

**Working directory:** `E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/`

---

## File Map

| File | Responsibility |
|------|---------------|
| `songs.json` | **New.** Song metadata with YouTube video IDs and timestamps. |
| `lyrics.json` | **New.** Flat pool of singable lyrics with source song name for mismatch filtering. |
| `server/src/rotation.js` | **New.** Pure function `buildAssignments(N)` → player/lyric/guess assignment matrix. |
| `server/src/modes/lyricsGuess.js` | **New.** Extracted lyrics-guess game logic from gameManager. |
| `server/src/modes/telephone.js` | **New.** Telephone mode: phase management, recording storage, guess collection, results. |
| `server/src/gameManager.js` | **Modify.** Keep lobby lifecycle; dispatch to mode modules; add `gameMode` to settings. |
| `server/src/index.js` | **Modify.** Add telephone socket handlers; add `/recordings/` HTTP endpoint. |
| `client/src/App.jsx` | **Modify.** Add telephone state + event handlers + page routing. |
| `client/src/pages/MainMenu.jsx` | **Modify.** Add game mode selector + mode-specific settings. |
| `client/src/pages/Lobby.jsx` | **Modify.** Show mode label + mode-specific settings display. |
| `client/src/pages/TelephonePhase.jsx` | **New.** Singing phase: YouTube/audio, recording UI, lyrics, timer. |
| `client/src/pages/TelephoneGuess.jsx` | **New.** Guess phase: audio playback, text input, timer. |
| `client/src/pages/TelephoneResults.jsx` | **New.** Chain auto-playback, free replay, host advance, game over. |
| `client/src/components/YouTubePlayer.jsx` | **New.** Reusable YouTube IFrame Player API wrapper. |
| `server/tests/rotation.test.js` | **New.** Constraint-based tests for assignment matrix. |
| `server/tests/telephone.test.js` | **New.** Tests for telephone mode state machine. |
| `server/tests/lyricsGuess.test.js` | **New.** Migrated existing gameManager game-logic tests. |
| `server/tests/gameManager.test.js` | **Modify.** Keep lobby lifecycle tests; remove game-logic tests (moved). |

---

## Task 1: Create seed data files

**Files:**
- Create: `songs.json`
- Create: `lyrics.json`

- [ ] **Step 1: Create `songs.json` with seed data**

```json
[
  { "id": 1, "name": "太陽之子", "youtubeId": "PLACEHOLDER", "startTime": 0, "endTime": 5 },
  { "id": 2, "name": "西西里", "youtubeId": "PLACEHOLDER", "startTime": 0, "endTime": 5 },
  { "id": 3, "name": "那天下雨了", "youtubeId": "PLACEHOLDER", "startTime": 0, "endTime": 5 },
  { "id": 4, "name": "湘女多情", "youtubeId": "PLACEHOLDER", "startTime": 0, "endTime": 5 },
  { "id": 5, "name": "誰稀罕", "youtubeId": "PLACEHOLDER", "startTime": 0, "endTime": 5 },
  { "id": 6, "name": "七月的極光", "youtubeId": "PLACEHOLDER", "startTime": 0, "endTime": 5 },
  { "id": 7, "name": "愛琴海", "youtubeId": "PLACEHOLDER", "startTime": 0, "endTime": 5 },
  { "id": 8, "name": "I Do", "youtubeId": "PLACEHOLDER", "startTime": 0, "endTime": 5 },
  { "id": 9, "name": "聖徒", "youtubeId": "PLACEHOLDER", "startTime": 0, "endTime": 5 },
  { "id": 10, "name": "女兒殿下", "youtubeId": "PLACEHOLDER", "startTime": 0, "endTime": 5 },
  { "id": 11, "name": "淘金小鎮", "youtubeId": "PLACEHOLDER", "startTime": 0, "endTime": 5 },
  { "id": 12, "name": "鄉間的路", "youtubeId": "PLACEHOLDER", "startTime": 0, "endTime": 5 },
  { "id": 13, "name": "聖誕星", "youtubeId": "PLACEHOLDER", "startTime": 0, "endTime": 5 }
]
```

- [ ] **Step 2: Create `lyrics.json` with seed data**

Use lyrics from existing questions but tagged with their source song for mismatch filtering. Include at least 13 entries (one per song) so we have enough for 8 players even after filtering.

```json
[
  { "id": 1, "songName": "太陽之子", "text": "我就是光照亮遠方黑夜我闖馬上將你擊潰" },
  { "id": 2, "songName": "太陽之子", "text": "吧台後鏡子裡的世界與你對話的人又是誰" },
  { "id": 3, "songName": "西西里", "text": "海風刮過了無人的街道" },
  { "id": 4, "songName": "西西里", "text": "別動別動誰對準了槍口你懂你懂聽我冷靜地說" },
  { "id": 5, "songName": "那天下雨了", "text": "你的頭靠著我的肩像是一種暗示" },
  { "id": 6, "songName": "湘女多情", "text": "一片片雨落入了洞庭我在小船裡等" },
  { "id": 7, "songName": "誰稀罕", "text": "我才不稀罕你稀不稀罕這首歌的名字叫誰稀罕" },
  { "id": 8, "songName": "七月的極光", "text": "在七月的極光下你微笑著不說話" },
  { "id": 9, "songName": "愛琴海", "text": "我站在愛琴海看著你遠去的帆船" },
  { "id": 10, "songName": "I Do", "text": "在教堂裡我閉上眼睛許下了願" },
  { "id": 11, "songName": "聖徒", "text": "黑暗中前行的人啊你的眼神堅定" },
  { "id": 12, "songName": "女兒殿下", "text": "女兒殿下你好美在月光下在星空裡" },
  { "id": 13, "songName": "淘金小鎮", "text": "在淘金小鎮的盡頭有一家老舊的酒館" },
  { "id": 14, "songName": "鄉間的路", "text": "走在鄉間的路上暮歸的老牛是我同伴" },
  { "id": 15, "songName": "聖誕星", "text": "聖誕星在天空閃耀你許的願望是什麼" },
  { "id": 16, "songName": "太陽之子", "text": "我扛不管聲嘶力竭不怯不退將邪惡都滅" }
]
```

- [ ] **Step 3: Commit**

```bash
git add songs.json lyrics.json
git commit -m "feat: add songs.json and lyrics.json seed data for telephone mode"
```

---

## Task 2: Rotation algorithm (TDD)

**Files:**
- Create: `server/src/rotation.js`
- Create: `server/tests/rotation.test.js`

- [ ] **Step 1: Write failing tests for `buildAssignments`**

Create `server/tests/rotation.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildAssignments } from '../src/rotation.js';

describe('buildAssignments', () => {
  // Test all supported player counts (3-8)
  for (const N of [3, 4, 5, 6, 7, 8]) {
    describe(`N=${N} players`, () => {
      const result = buildAssignments(N);

      it(`has ${N - 1} singing phases plus 1 guess phase`, () => {
        expect(result.singPhases).toHaveLength(N - 1);
        expect(result.guessPhase).toHaveLength(N);
      });

      it('each singing phase assigns all N players to N different songs', () => {
        for (const phase of result.singPhases) {
          const playerIndices = phase.map(a => a.playerIdx);
          expect(new Set(playerIndices).size).toBe(N);
          expect(phase).toHaveLength(N);
        }
      });

      it('each singing phase assigns N different lyrics', () => {
        for (const phase of result.singPhases) {
          const lyricIndices = phase.map(a => a.lyricIdx);
          expect(new Set(lyricIndices).size).toBe(N);
        }
      });

      it('each song uses a different lyric each phase', () => {
        for (let s = 0; s < N; s++) {
          const lyricsForSong = result.singPhases.map(phase => phase[s].lyricIdx);
          expect(new Set(lyricsForSong).size).toBe(N - 1);
        }
      });

      it('each player sees a different lyric each phase', () => {
        for (let playerIdx = 0; playerIdx < N; playerIdx++) {
          const lyrics = [];
          for (const phase of result.singPhases) {
            const assignment = phase.find(a => a.playerIdx === playerIdx);
            if (assignment) lyrics.push(assignment.lyricIdx);
          }
          // Player sings in N-1 phases (guesses in the last)
          expect(lyrics).toHaveLength(N - 1);
          expect(new Set(lyrics).size).toBe(N - 1);
        }
      });

      it('each player sings for each song exactly once', () => {
        for (let playerIdx = 0; playerIdx < N; playerIdx++) {
          const songs = [];
          for (const phase of result.singPhases) {
            const assignment = phase.find(a => a.playerIdx === playerIdx);
            if (assignment) songs.push(result.singPhases.indexOf(phase) === -1 ? -1 : phase.indexOf(assignment));
          }
          // Actually, let's just check by song index
          const songIndices = [];
          for (const phase of result.singPhases) {
            for (let s = 0; s < N; s++) {
              if (phase[s].playerIdx === playerIdx) songIndices.push(s);
            }
          }
          expect(songIndices).toHaveLength(N - 1);
          expect(new Set(songIndices).size).toBe(N - 1);
        }
      });

      it('guess phase assigns each player to exactly one song they never sang in', () => {
        for (const guess of result.guessPhase) {
          const { playerIdx, songIdx } = guess;
          // Player should NOT have sung for this song
          for (const phase of result.singPhases) {
            expect(phase[songIdx].playerIdx).not.toBe(playerIdx);
          }
        }
        // Each player guesses exactly once
        const guessPlayers = result.guessPhase.map(g => g.playerIdx);
        expect(new Set(guessPlayers).size).toBe(N);
        // Each song is guessed exactly once
        const guessSongs = result.guessPhase.map(g => g.songIdx);
        expect(new Set(guessSongs).size).toBe(N);
      });
    });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/server"
npm test
```

Expected: FAIL — `Cannot find module '../src/rotation.js'`

- [ ] **Step 3: Implement `buildAssignments` in `server/src/rotation.js`**

```js
/**
 * Build the assignment matrix for telephone mode.
 * @param {number} N - number of players (= number of songs = number of lyrics)
 * @returns {{ singPhases: Array<Array<{playerIdx, lyricIdx}>>, guessPhase: Array<{playerIdx, songIdx}> }}
 *
 * singPhases[phaseIdx][songIdx] = { playerIdx, lyricIdx }
 * guessPhase[i] = { playerIdx, songIdx }
 */
export function buildAssignments(N) {
  // Player assignment: song s, phase p → player (s + p) % N
  // Lyric assignment: use formula for odd N, backtracking for even N
  const lyricMatrix = buildLyricMatrix(N);

  const singPhases = [];
  for (let p = 0; p < N - 1; p++) {
    const phase = [];
    for (let s = 0; s < N; s++) {
      phase.push({
        playerIdx: (s + p) % N,
        lyricIdx: lyricMatrix[p][s],
      });
    }
    singPhases.push(phase);
  }

  // Guess phase: player (s + N-1) % N guesses song s
  const guessPhase = [];
  for (let s = 0; s < N; s++) {
    guessPhase.push({
      playerIdx: (s + N - 1) % N,
      songIdx: s,
    });
  }

  return { singPhases, guessPhase };
}

/**
 * Build the lyric assignment matrix.
 * matrix[phase][song] = lyricIdx
 *
 * Constraints:
 * 1. Each column (fixed phase) is a permutation of 0..N-1
 * 2. Each row (fixed song) has all distinct values
 * 3. Each player sees distinct lyrics across their phases
 */
function buildLyricMatrix(N) {
  // For odd N: (s * 2 + p) % N satisfies all constraints
  if (N % 2 === 1) {
    const matrix = [];
    for (let p = 0; p < N - 1; p++) {
      const row = [];
      for (let s = 0; s < N; s++) {
        row.push((s * 2 + p) % N);
      }
      matrix.push(row);
    }
    return matrix;
  }

  // For even N: use backtracking search
  const matrix = Array.from({ length: N - 1 }, () => new Array(N).fill(-1));

  function isValid(phase, song, lyric) {
    // No duplicate in this phase (column)
    for (let s = 0; s < song; s++) {
      if (matrix[phase][s] === lyric) return false;
    }
    // No duplicate in this song (row) across phases
    for (let p = 0; p < phase; p++) {
      if (matrix[p][song] === lyric) return false;
    }
    // Player who does this song in this phase hasn't seen this lyric
    const playerIdx = (song + phase) % N;
    for (let p = 0; p < phase; p++) {
      const prevSong = ((playerIdx - p) % N + N) % N;
      if (matrix[p][prevSong] === lyric) return false;
    }
    return true;
  }

  function solve(phase, song) {
    if (phase >= N - 1) return true;
    const nextSong = song + 1;
    for (let lyric = 0; lyric < N; lyric++) {
      if (isValid(phase, song, lyric)) {
        matrix[phase][song] = lyric;
        if (nextSong >= N) {
          if (solve(phase + 1, 0)) return true;
        } else {
          if (solve(phase, nextSong)) return true;
        }
        matrix[phase][song] = -1;
      }
    }
    return false;
  }

  const success = solve(0, 0);
  if (!success) throw new Error(`No valid lyric matrix found for N=${N}`);
  return matrix;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/server"
npm test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/rotation.js server/tests/rotation.test.js
git commit -m "feat: add rotation algorithm for telephone mode assignments"
```

---

## Task 3: Extract lyrics-guess mode from gameManager (refactor)

This is a refactor — all existing tests must keep passing. The game-specific methods move to `modes/lyricsGuess.js`; `gameManager.js` dispatches to it.

**Files:**
- Create: `server/src/modes/lyricsGuess.js`
- Modify: `server/src/gameManager.js`
- Modify: `server/tests/gameManager.test.js`

- [ ] **Step 1: Create `server/src/modes/lyricsGuess.js`**

Extract the game-specific logic. Each function takes `lobby` as first arg instead of using `this`.

```js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { calculateScore, normalizeText } from '../scoring.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const allQuestions = JSON.parse(
  readFileSync(join(__dirname, '../../../questions.json'), 'utf-8')
);

export function startGame(lobby, io) {
  const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
  lobby.questions = shuffled.slice(0, lobby.settings.numQuestions);
  lobby.currentQuestionIndex = 0;
  lobby.players.forEach(p => { p.score = 0; });
  startQuestion(lobby, io);
}

export function submitAnswer(lobby, socketId, { answer }, io) {
  if (lobby.state !== 'in_question') return;
  if (lobby.currentAnswers.has(socketId)) return;

  const submittedMs = Date.now() - lobby.questionStartTime;
  lobby.currentAnswers.set(socketId, { answer, submittedMs });

  const player = lobby.players.find(p => p.socketId === socketId);
  if (player) io.to(lobby.id).emit('player-submitted', { nickname: player.nickname });

  if (lobby.currentAnswers.size >= lobby.players.length) {
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    endQuestion(lobby, io);
  }
}

export function updateDraft(lobby, socketId, answer) {
  if (lobby.state !== 'in_question') return;
  if (lobby.currentAnswers.has(socketId)) return;
  lobby.playerDrafts.set(socketId, answer);
}

export function nextQuestion(lobby, socketId, io) {
  if (lobby.hostSocketId !== socketId || lobby.state !== 'reveal') return;
  advanceQuestion(lobby, io);
}

export function startQuestion(lobby, io) {
  lobby.state = 'in_question';
  lobby.currentAnswers = new Map();
  lobby.playerDrafts = new Map();
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
      endQuestion(lobby, io);
    }
  }, 1000);
}

export function endQuestion(lobby, io) {
  if (lobby.state !== 'in_question') return;
  lobby.state = 'reveal';

  const q = lobby.questions[lobby.currentQuestionIndex];
  const timeLimitMs = lobby.settings.timeLimit * 1000;

  const results = lobby.players.map(player => {
    const submission = lobby.currentAnswers.get(player.socketId);
    let answer, submittedMs;
    if (submission) {
      answer = submission.answer;
      submittedMs = submission.submittedMs;
    } else {
      answer = lobby.playerDrafts.get(player.socketId) ?? '';
      submittedMs = null;
    }

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
}

export function advanceQuestion(lobby, io) {
  lobby.currentQuestionIndex++;

  if (lobby.currentQuestionIndex >= lobby.settings.numQuestions) {
    lobby.state = 'finished';
    const finalScores = [...lobby.players]
      .sort((a, b) => b.score - a.score)
      .map(p => ({ nickname: p.nickname, score: p.score }));
    io.to(lobby.id).emit('game-over', { finalScores, winner: finalScores[0]?.nickname ?? '' });
  } else {
    startQuestion(lobby, io);
  }
}
```

- [ ] **Step 2: Rewrite `server/src/gameManager.js` to delegate to mode module**

Replace all game-specific methods with delegation. The lobby object shape stays identical — the mode module just operates on it.

```js
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as lyricsGuessMode from './modes/lyricsGuess.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export class GameManager {
  constructor() {
    this.lobbies = new Map();
    this.socketToLobby = new Map();
  }

  getLobby(socketId) {
    const code = this.socketToLobby.get(socketId);
    return code ? this.lobbies.get(code) : null;
  }

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

  lobbyPayload(lobby) {
    return {
      code: lobby.id,
      name: lobby.name,
      hostSocketId: lobby.hostSocketId,
      settings: lobby.settings,
      maxPlayers: lobby.maxPlayers,
      players: lobby.players.map(p => ({
        nickname: p.nickname,
        score: p.score,
        isHost: p.socketId === lobby.hostSocketId,
      })),
    };
  }

  createLobby(socketId, { nickname, lobbyName, numQuestions, timeLimit, isPrivate, password, gameMode, phaseDuration }) {
    let code;
    do { code = generateCode(); } while (this.lobbies.has(code));

    const lobby = {
      id: code,
      name: lobbyName || `${nickname}'s Lobby`,
      hostSocketId: socketId,
      isPrivate: Boolean(isPrivate),
      password: password || null,
      maxPlayers: 8,
      settings: {
        gameMode: gameMode || 'lyrics-guess',
        numQuestions: numQuestions || 10,
        timeLimit: timeLimit || 30,
        phaseDuration: phaseDuration || 90,
      },
      players: [{ socketId, nickname, score: 0 }],
      state: 'waiting',
      // Lyrics-guess fields
      questions: [],
      currentQuestionIndex: 0,
      currentAnswers: new Map(),
      playerDrafts: new Map(),
      timerHandle: null,
      revealTimer: null,
      questionStartTime: null,
      secondsRemaining: 0,
      // Telephone fields (populated at game start)
      telephone: null,
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
        lyricsGuessMode.endQuestion(lobby, io);
      }
    } else if (lobby.state === 'reveal') {
      if (lobby.players.length === 0) {
        if (lobby.revealTimer) { clearTimeout(lobby.revealTimer); lobby.revealTimer = null; }
        this.lobbies.delete(lobby.id);
        return;
      }
      io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
    } else if (lobby.state === 'finished') {
      io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
    } else if (lobby.state.startsWith('telephone_')) {
      // Telephone mode: mark player's submission as empty so phase can complete
      if (lobby.players.length === 0) {
        if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
        this.lobbies.delete(lobby.id);
        return;
      }
      if (lobby.telephone) {
        lobby.telephone.submissions.add(socketId);
      }
    }
  }

  handleDisconnect(socketId, io) {
    this.leaveLobby(socketId, io);
  }

  startGame(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'waiting') return;

    if (lobby.settings.gameMode === 'telephone') {
      if (lobby.players.length < 3) return;
      // Telephone mode start is handled in Task 4
      return;
    }

    if (lobby.players.length < 2) return;
    lyricsGuessMode.startGame(lobby, io);
  }

  restartLobby(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'finished') return;

    if (lobby.revealTimer) { clearTimeout(lobby.revealTimer); lobby.revealTimer = null; }
    lobby.state = 'waiting';
    lobby.questions = [];
    lobby.currentQuestionIndex = 0;
    lobby.currentAnswers = new Map();
    lobby.playerDrafts = new Map();
    lobby.players.forEach(p => { p.score = 0; });
    lobby.telephone = null;

    io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
  }

  updateSettings(socketId, data, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'waiting') return;
    if (data.numQuestions) lobby.settings.numQuestions = data.numQuestions;
    if (data.timeLimit) lobby.settings.timeLimit = data.timeLimit;
    if (data.phaseDuration) lobby.settings.phaseDuration = data.phaseDuration;
    if (data.gameMode) lobby.settings.gameMode = data.gameMode;
    io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
  }

  submitAnswer(socketId, data, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;
    lyricsGuessMode.submitAnswer(lobby, socketId, data, io);
  }

  updateDraft(socketId, answer) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;
    lyricsGuessMode.updateDraft(lobby, socketId, answer);
  }

  nextQuestion(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;
    lyricsGuessMode.nextQuestion(lobby, socketId, io);
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

- [ ] **Step 3: Run existing tests to verify they all pass**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/server"
npm test
```

Expected: All 39 existing tests PASS. The refactor changed internal delegation but not external behavior.

- [ ] **Step 4: Commit**

```bash
git add server/src/modes/lyricsGuess.js server/src/gameManager.js
git commit -m "refactor: extract lyrics-guess logic into modes/lyricsGuess.js"
```

---

## Task 4: Telephone mode server logic (TDD)

**Files:**
- Create: `server/src/modes/telephone.js`
- Create: `server/tests/telephone.test.js`
- Modify: `server/src/gameManager.js` (wire telephone dispatch)

- [ ] **Step 1: Write failing tests for telephone mode**

Create `server/tests/telephone.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameManager } from '../src/gameManager.js';

function makeMockIo() {
  const emitFn = vi.fn();
  const toObj = { emit: emitFn };
  return {
    to: vi.fn().mockReturnValue(toObj),
    _emitFn: emitFn,
  };
}

function makeMockSocket(id) {
  return {
    id,
    emit: vi.fn(),
  };
}

function createTelephoneLobby(mgr, playerCount) {
  const lobby = mgr.createLobby('host', {
    nickname: 'Host', lobbyName: 'Room', isPrivate: false, password: null,
    gameMode: 'telephone', phaseDuration: 90,
  });
  for (let i = 2; i <= playerCount; i++) {
    mgr.joinLobby(`p${i}`, { lobbyCode: lobby.id, nickname: `Player${i}`, password: null });
  }
  return lobby;
}

describe('Telephone mode: startGame', () => {
  it('rejects if fewer than 3 players', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 2);
    const io = makeMockIo();
    mgr.startGame('host', io);
    expect(lobby.state).toBe('waiting');
  });

  it('transitions to telephone_phase with 3 players', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    expect(lobby.state).toBe('telephone_phase');
    expect(lobby.telephone).not.toBeNull();
    expect(lobby.telephone.currentPhase).toBe(0);
    expect(lobby.telephone.songs).toHaveLength(3);
    expect(lobby.telephone.lyrics).toHaveLength(3);
    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('emits telephone-phase-start to each player with their assignment', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const sockets = new Map();
    const mockSocketEmits = {};
    lobby.players.forEach(p => {
      mockSocketEmits[p.socketId] = vi.fn();
      sockets.set(p.socketId, { emit: mockSocketEmits[p.socketId] });
    });
    const io = makeMockIo();
    io.to = vi.fn().mockImplementation((roomOrId) => {
      // If called with a socket ID (player-specific emit)
      if (sockets.has(roomOrId)) {
        return { emit: sockets.get(roomOrId).emit };
      }
      return { emit: io._emitFn };
    });

    mgr.startGame('host', io);

    // Each player should receive their assignment
    lobby.players.forEach(p => {
      expect(mockSocketEmits[p.socketId]).toHaveBeenCalledWith(
        'telephone-phase-start',
        expect.objectContaining({
          phaseIndex: 0,
          lyrics: expect.any(String),
          audioType: 'youtube',
          phaseDuration: 90,
          isFirstPhase: true,
        })
      );
    });

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('filters lyrics to avoid matching song names', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);

    const songNames = lobby.telephone.songs.map(s => s.name);
    lobby.telephone.lyrics.forEach(l => {
      expect(songNames).not.toContain(l.songName);
    });

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });
});

describe('Telephone mode: submitRecording', () => {
  it('stores recording and marks player as submitted', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);

    const audioBuffer = Buffer.from('fake-audio-data');
    mgr.submitRecording('host', audioBuffer, io);

    expect(lobby.telephone.submissions.has('host')).toBe(true);
    // Recording stored — key is "songIdx-phaseIdx"
    const hostSongIdx = lobby.telephone.assignments.singPhases[0]
      .findIndex(a => a.playerIdx === lobby.players.findIndex(p => p.socketId === 'host'));
    expect(lobby.telephone.recordings.size).toBe(1);

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('advances to next phase when all players submit', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    const buf = Buffer.from('audio');
    mgr.submitRecording('host', buf, io);
    mgr.submitRecording('p2', buf, io);
    mgr.submitRecording('p3', buf, io);

    // Should advance to phase 1 (still telephone_phase since N-1=2 singing phases)
    expect(lobby.state).toBe('telephone_phase');
    expect(lobby.telephone.currentPhase).toBe(1);

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('advances to telephone_guess after all singing phases', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    const buf = Buffer.from('audio');

    // Phase 0
    mgr.submitRecording('host', buf, io);
    mgr.submitRecording('p2', buf, io);
    mgr.submitRecording('p3', buf, io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    // Phase 1 (last singing phase for N=3)
    mgr.submitRecording('host', buf, io);
    mgr.submitRecording('p2', buf, io);
    mgr.submitRecording('p3', buf, io);

    expect(lobby.state).toBe('telephone_guess');

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });
});

describe('Telephone mode: submitGuess', () => {
  function advanceToGuess(mgr, lobby, io) {
    const buf = Buffer.from('audio');
    for (let phase = 0; phase < lobby.players.length - 1; phase++) {
      lobby.players.forEach(p => mgr.submitRecording(p.socketId, buf, io));
      if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    }
  }

  it('transitions to telephone_results when all players guess', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    advanceToGuess(mgr, lobby, io);
    expect(lobby.state).toBe('telephone_guess');

    mgr.submitGuess('host', '太陽之子', io);
    mgr.submitGuess('p2', '西西里', io);
    mgr.submitGuess('p3', '那天下雨了', io);

    expect(lobby.state).toBe('telephone_results');

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });
});

describe('Telephone mode: nextSong', () => {
  function advanceToResults(mgr, lobby, io) {
    const buf = Buffer.from('audio');
    for (let phase = 0; phase < lobby.players.length - 1; phase++) {
      lobby.players.forEach(p => mgr.submitRecording(p.socketId, buf, io));
      if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    }
    lobby.players.forEach(p => mgr.submitGuess(p.socketId, 'guess', io));
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
  }

  it('advances to next song in results when host calls', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    advanceToResults(mgr, lobby, io);
    expect(lobby.state).toBe('telephone_results');
    expect(lobby.telephone.currentResultSong).toBe(0);

    mgr.nextSong('host', io);
    expect(lobby.telephone.currentResultSong).toBe(1);

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('transitions to finished after all songs shown', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    advanceToResults(mgr, lobby, io);

    // 3 songs — advance through all
    mgr.nextSong('host', io);
    mgr.nextSong('host', io);
    mgr.nextSong('host', io);

    expect(lobby.state).toBe('finished');

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('rejects if caller is not host', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    advanceToResults(mgr, lobby, io);

    mgr.nextSong('p2', io);
    expect(lobby.telephone.currentResultSong).toBe(0); // unchanged
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/server"
npm test
```

Expected: FAIL — `mgr.submitRecording is not a function`

- [ ] **Step 3: Create `server/src/modes/telephone.js`**

```js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildAssignments } from '../rotation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const allSongs = JSON.parse(
  readFileSync(join(__dirname, '../../../songs.json'), 'utf-8')
);
const allLyrics = JSON.parse(
  readFileSync(join(__dirname, '../../../lyrics.json'), 'utf-8')
);

export function startGame(lobby, io) {
  const N = lobby.players.length;

  // Select N random songs
  const shuffledSongs = [...allSongs].sort(() => Math.random() - 0.5);
  const songs = shuffledSongs.slice(0, N);

  // Filter lyrics: exclude any whose songName matches a selected song
  const selectedSongNames = new Set(songs.map(s => s.name));
  const eligibleLyrics = allLyrics.filter(l => !selectedSongNames.has(l.songName));
  const shuffledLyrics = [...eligibleLyrics].sort(() => Math.random() - 0.5);
  const lyrics = shuffledLyrics.slice(0, N);

  const assignments = buildAssignments(N);

  lobby.telephone = {
    songs,
    lyrics,
    assignments,
    currentPhase: 0,
    recordings: new Map(),
    submissions: new Set(),
    guesses: new Map(),
    currentResultSong: 0,
  };

  _startPhase(lobby, io);
}

export function submitRecording(lobby, socketId, audioBuffer, io) {
  if (lobby.state !== 'telephone_phase') return;
  if (lobby.telephone.submissions.has(socketId)) return;

  const tel = lobby.telephone;
  const playerIdx = lobby.players.findIndex(p => p.socketId === socketId);
  if (playerIdx === -1) return;

  // Find which song this player is working on in this phase
  const phase = tel.assignments.singPhases[tel.currentPhase];
  const songIdx = phase.findIndex(a => a.playerIdx === playerIdx);
  if (songIdx === -1) return;

  tel.recordings.set(`${songIdx}-${tel.currentPhase}`, audioBuffer);
  tel.submissions.add(socketId);

  io.to(lobby.id).emit('player-submitted', {
    nickname: lobby.players[playerIdx].nickname,
  });

  if (tel.submissions.size >= lobby.players.length) {
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    _endPhase(lobby, io);
  }
}

export function submitGuess(lobby, socketId, guess, io) {
  if (lobby.state !== 'telephone_guess') return;
  if (lobby.telephone.submissions.has(socketId)) return;

  const tel = lobby.telephone;
  const playerIdx = lobby.players.findIndex(p => p.socketId === socketId);
  if (playerIdx === -1) return;

  // Find which song this player is guessing
  const guessAssignment = tel.assignments.guessPhase.find(g => g.playerIdx === playerIdx);
  if (!guessAssignment) return;

  tel.guesses.set(guessAssignment.songIdx, {
    playerSocketId: socketId,
    nickname: lobby.players[playerIdx].nickname,
    guess,
  });
  tel.submissions.add(socketId);

  if (tel.submissions.size >= lobby.players.length) {
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    _startResults(lobby, io);
  }
}

export function nextSong(lobby, socketId, io) {
  if (lobby.state !== 'telephone_results') return;
  if (lobby.hostSocketId !== socketId) return;

  const tel = lobby.telephone;
  tel.currentResultSong++;

  if (tel.currentResultSong >= tel.songs.length) {
    lobby.state = 'finished';
    io.to(lobby.id).emit('game-over', { mode: 'telephone' });
  } else {
    io.to(lobby.id).emit('telephone-next-song', {
      songIndex: tel.currentResultSong,
    });
  }
}

function _startPhase(lobby, io) {
  lobby.state = 'telephone_phase';
  const tel = lobby.telephone;
  tel.submissions = new Set();
  lobby.secondsRemaining = lobby.settings.phaseDuration;

  const phase = tel.assignments.singPhases[tel.currentPhase];

  // Emit per-player assignment
  for (let songIdx = 0; songIdx < phase.length; songIdx++) {
    const assignment = phase[songIdx];
    const player = lobby.players[assignment.playerIdx];
    const song = tel.songs[songIdx];
    const lyric = tel.lyrics[assignment.lyricIdx];

    let audioUrl, audioType;
    if (tel.currentPhase === 0) {
      audioType = 'youtube';
      audioUrl = { youtubeId: song.youtubeId, startTime: song.startTime, endTime: song.endTime };
    } else {
      audioType = 'recording';
      // Find previous phase's recording for this song
      const prevKey = `${songIdx}-${tel.currentPhase - 1}`;
      if (tel.recordings.has(prevKey)) {
        audioUrl = `/recordings/${lobby.id}/${songIdx}/${tel.currentPhase - 1}`;
      } else {
        // Pass-through: use the same source as previous phase would have
        audioUrl = _findFallbackAudio(tel, songIdx, tel.currentPhase - 1, lobby.id);
      }
    }

    io.to(player.socketId).emit('telephone-phase-start', {
      phaseIndex: tel.currentPhase,
      songLabel: `歌曲 ${songIdx + 1}`,
      lyrics: lyric.text,
      audioUrl,
      audioType,
      phaseDuration: lobby.settings.phaseDuration,
      isFirstPhase: tel.currentPhase === 0,
    });
  }

  // Start countdown timer
  lobby.timerHandle = setInterval(() => {
    lobby.secondsRemaining--;
    io.to(lobby.id).emit('telephone-timer-tick', { secondsRemaining: lobby.secondsRemaining });
    if (lobby.secondsRemaining <= 0) {
      clearInterval(lobby.timerHandle);
      lobby.timerHandle = null;
      _endPhase(lobby, io);
    }
  }, 1000);
}

function _endPhase(lobby, io) {
  const tel = lobby.telephone;
  io.to(lobby.id).emit('telephone-phase-end', { phaseIndex: tel.currentPhase });

  tel.currentPhase++;

  if (tel.currentPhase >= lobby.players.length - 1) {
    // All singing phases done → start guess phase
    _startGuess(lobby, io);
  } else {
    _startPhase(lobby, io);
  }
}

function _startGuess(lobby, io) {
  lobby.state = 'telephone_guess';
  const tel = lobby.telephone;
  tel.submissions = new Set();
  lobby.secondsRemaining = lobby.settings.phaseDuration;

  for (const guess of tel.assignments.guessPhase) {
    const player = lobby.players[guess.playerIdx];
    const songIdx = guess.songIdx;

    // Last recording in this song's chain
    const lastPhase = lobby.players.length - 2; // N-1 singing phases, 0-indexed
    const lastKey = `${songIdx}-${lastPhase}`;
    let audioUrl;
    if (tel.recordings.has(lastKey)) {
      audioUrl = `/recordings/${lobby.id}/${songIdx}/${lastPhase}`;
    } else {
      audioUrl = _findFallbackAudio(tel, songIdx, lastPhase, lobby.id);
    }

    io.to(player.socketId).emit('telephone-guess-start', {
      audioUrl,
      phaseDuration: lobby.settings.phaseDuration,
    });
  }

  // Start countdown timer
  lobby.timerHandle = setInterval(() => {
    lobby.secondsRemaining--;
    io.to(lobby.id).emit('telephone-timer-tick', { secondsRemaining: lobby.secondsRemaining });
    if (lobby.secondsRemaining <= 0) {
      clearInterval(lobby.timerHandle);
      lobby.timerHandle = null;
      _startResults(lobby, io);
    }
  }, 1000);
}

function _startResults(lobby, io) {
  lobby.state = 'telephone_results';
  const tel = lobby.telephone;
  tel.currentResultSong = 0;

  // Build results data for all songs
  const results = tel.songs.map((song, songIdx) => {
    const chain = [];
    for (let p = 0; p < lobby.players.length - 1; p++) {
      const assignment = tel.assignments.singPhases[p][songIdx];
      const player = lobby.players[assignment.playerIdx];
      const lyric = tel.lyrics[assignment.lyricIdx];
      const hasRecording = tel.recordings.has(`${songIdx}-${p}`);
      chain.push({
        nickname: player.nickname,
        lyrics: lyric.text,
        audioUrl: hasRecording ? `/recordings/${lobby.id}/${songIdx}/${p}` : null,
        phaseIndex: p,
      });
    }

    const guessData = tel.guesses.get(songIdx);

    return {
      songName: song.name,
      youtube: { youtubeId: song.youtubeId, startTime: song.startTime, endTime: song.endTime },
      chain,
      guess: guessData ? guessData.guess : '（未作答）',
      guesserNickname: guessData ? guessData.nickname : '?',
    };
  });

  io.to(lobby.id).emit('telephone-results-start', { results });
}

function _findFallbackAudio(tel, songIdx, targetPhase, lobbyId) {
  // Walk backwards to find the most recent recording for this song
  for (let p = targetPhase; p >= 0; p--) {
    if (tel.recordings.has(`${songIdx}-${p}`)) {
      return `/recordings/${lobbyId}/${songIdx}/${p}`;
    }
  }
  // No recordings at all — return null (edge case: all players skipped)
  return null;
}
```

- [ ] **Step 4: Wire telephone mode dispatch in gameManager.js**

Update `startGame` in `server/src/gameManager.js` to call the telephone module:

Add import at top:
```js
import * as telephoneMode from './modes/telephone.js';
```

Replace the telephone placeholder in `startGame`:
```js
  startGame(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'waiting') return;

    if (lobby.settings.gameMode === 'telephone') {
      if (lobby.players.length < 3) return;
      telephoneMode.startGame(lobby, io);
    } else {
      if (lobby.players.length < 2) return;
      lyricsGuessMode.startGame(lobby, io);
    }
  }
```

Add new dispatch methods:
```js
  submitRecording(socketId, audioBuffer, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;
    telephoneMode.submitRecording(lobby, socketId, audioBuffer, io);
  }

  submitGuess(socketId, guess, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;
    telephoneMode.submitGuess(lobby, socketId, guess, io);
  }

  nextSong(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;
    telephoneMode.nextSong(lobby, socketId, io);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/server"
npm test
```

Expected: All tests PASS (existing 39 + new rotation tests + new telephone tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/modes/telephone.js server/tests/telephone.test.js server/src/gameManager.js
git commit -m "feat: add telephone mode server logic with state machine and recording storage"
```

---

## Task 5: Server wiring — socket handlers and HTTP endpoint

**Files:**
- Modify: `server/src/index.js`

- [ ] **Step 1: Add telephone socket handlers and recording HTTP endpoint**

In `server/src/index.js`:

Add the recordings HTTP endpoint BEFORE the static file catch-all:

```js
// Serve recordings (in-memory audio buffers)
app.get('/recordings/:lobbyId/:songIdx/:phaseIdx', (req, res) => {
  const { lobbyId, songIdx, phaseIdx } = req.params;
  const lobby = manager.lobbies.get(lobbyId);
  if (!lobby || !lobby.telephone) {
    return res.status(404).send('Not found');
  }
  const key = `${songIdx}-${phaseIdx}`;
  const buffer = lobby.telephone.recordings.get(key);
  if (!buffer) {
    return res.status(404).send('Recording not found');
  }
  res.set('Content-Type', 'audio/webm');
  res.send(buffer);
});
```

Add telephone socket handlers after the existing `next-question` handler:

```js
socket.on('submit-recording', ({ audioData }) => {
  const buffer = Buffer.from(audioData);
  manager.submitRecording(socket.id, buffer, io);
});
socket.on('submit-guess', ({ guess }) => manager.submitGuess(socket.id, guess, io));
socket.on('next-song', () => manager.nextSong(socket.id, io));
```

- [ ] **Step 2: Run tests to verify no regressions**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/server"
npm test
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add server/src/index.js
git commit -m "feat: add telephone socket handlers and recording HTTP endpoint"
```

---

## Task 6: Client — mode selection in MainMenu + Lobby

**Files:**
- Modify: `client/src/pages/MainMenu.jsx`
- Modify: `client/src/pages/Lobby.jsx`

- [ ] **Step 1: Update MainMenu.jsx with game mode selector**

Add `gameMode` and `phaseDuration` to the form state:

```js
const [form, setForm] = useState({
  lobbyName: '', numQuestions: 10, timeLimit: 30, isPrivate: false, password: '',
  gameMode: 'lyrics-guess', phaseDuration: 90,
});
```

Update `handleCreate` to include mode fields:

```js
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
    gameMode: form.gameMode,
    phaseDuration: form.phaseDuration,
  });
}
```

Add mode selector and conditional settings in the create form, replacing the existing settings section (between the lobby name input and the privacy checkbox):

```jsx
<label>遊戲模式</label>
<select value={form.gameMode} onChange={e => setForm(f => ({ ...f, gameMode: e.target.value }))}
  style={{ width: '100%', padding: '6px 10px', margin: '4px 0 12px' }}>
  <option value="lyrics-guess">周杰倫猜歌</option>
  <option value="telephone">音樂傳聲筒</option>
</select>

{form.gameMode === 'lyrics-guess' && (
  <>
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
  </>
)}

{form.gameMode === 'telephone' && (
  <>
    <label>每回合時間</label>
    <select value={form.phaseDuration} onChange={e => setForm(f => ({ ...f, phaseDuration: Number(e.target.value) }))}
      style={{ width: '100%', padding: '6px 10px', margin: '4px 0 12px' }}>
      {[60, 90, 120].map(s => <option key={s} value={s}>{s} 秒</option>)}
    </select>
  </>
)}
```

- [ ] **Step 2: Update Lobby.jsx with mode-aware settings display and start validation**

Replace the settings panel and start button to be mode-aware:

```jsx
import React, { useState, useCallback } from 'react';
import socket from '../socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';

export default function Lobby({ nickname, lobby, goToMenu }) {
  const [errorMsg, setErrorMsg] = useState('');

  const isHost = lobby?.hostSocketId === socket.id;
  const isTelephone = lobby?.settings?.gameMode === 'telephone';
  const minPlayers = isTelephone ? 3 : 2;

  useSocketEvent('error', useCallback(({ message }) => setErrorMsg(message), []));

  function handleStartGame() {
    socket.emit('start-game');
  }

  function handleSettingChange(key, value) {
    socket.emit('update-settings', { ...lobby.settings, [key]: Number(value) });
  }

  if (!lobby) return null;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{lobby.name}</h2>
        <button onClick={goToMenu} style={{ padding: '6px 14px' }}>離開</button>
      </div>

      <p style={{ margin: '0 0 12px', padding: '6px 12px', background: isTelephone ? '#fef3c7' : '#dbeafe', borderRadius: 6, fontSize: 14 }}>
        {isTelephone ? '🎤 音樂傳聲筒' : '🎵 周杰倫猜歌'}
      </p>

      {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: '0 0 12px' }}>玩家 ({lobby.players.length}/{lobby.maxPlayers})</h4>
          {lobby.players.map(p => (
            <div key={p.nickname} style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}>
              {p.isHost ? '👑 ' : '🎵 '}
              {p.nickname}
              {p.nickname === nickname ? ' (你)' : ''}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: '0 0 12px' }}>設定</h4>

          {!isTelephone && (
            <>
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
            </>
          )}

          {isTelephone && (
            <>
              <label style={{ display: 'block', marginBottom: 4 }}>每回合時間</label>
              {isHost ? (
                <select value={lobby.settings.phaseDuration}
                  onChange={e => handleSettingChange('phaseDuration', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', marginBottom: 12 }}>
                  {[60, 90, 120].map(s => <option key={s} value={s}>{s} 秒</option>)}
                </select>
              ) : (
                <p style={{ margin: '0 0 12px', fontWeight: 600 }}>{lobby.settings.phaseDuration} 秒</p>
              )}
            </>
          )}

          <p style={{ margin: 0, color: '#888', fontSize: 14 }}>
            {lobby.isPrivate ? '🔒 私人' : '🌐 公開'}
          </p>
        </div>
      </div>

      {isHost && (
        <button
          onClick={handleStartGame}
          disabled={lobby.players.length < minPlayers}
          style={{
            display: 'block', width: '100%', marginTop: 20, padding: 14,
            fontSize: 18, background: lobby.players.length >= minPlayers ? '#22c55e' : '#ccc',
            color: 'white', border: 'none', borderRadius: 8,
            cursor: lobby.players.length >= minPlayers ? 'pointer' : 'not-allowed',
          }}>
          開始遊戲 {lobby.players.length < minPlayers ? `（需要至少 ${minPlayers} 名玩家）` : ''}
        </button>
      )}
      {!isHost && (
        <p style={{ textAlign: 'center', color: '#888', marginTop: 20 }}>等待房主開始遊戲...</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/MainMenu.jsx client/src/pages/Lobby.jsx
git commit -m "feat: add game mode selector to lobby creation and settings display"
```

---

## Task 7: Client — App.jsx routing for telephone mode

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add telephone state and event handlers**

```jsx
import React, { useState, useCallback } from 'react';
import socket from './socket.js';
import { useSocketEvent } from './hooks/useSocket.js';
import MainMenu from './pages/MainMenu.jsx';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';
import Reveal from './pages/Reveal.jsx';
import Results from './pages/Results.jsx';
import TelephonePhase from './pages/TelephonePhase.jsx';
import TelephoneGuess from './pages/TelephoneGuess.jsx';
import TelephoneResults from './pages/TelephoneResults.jsx';

export default function App() {
  const [page, setPage] = useState('menu');
  const [nickname, setNickname] = useState('');
  const [lobby, setLobby] = useState(null);
  const [question, setQuestion] = useState(null);
  const [timer, setTimer] = useState(0);
  const [revealData, setRevealData] = useState(null);
  const [finalData, setFinalData] = useState(null);
  // Telephone mode state
  const [phonePhase, setPhonePhase] = useState(null);
  const [phoneGuess, setPhoneGuess] = useState(null);
  const [phoneResults, setPhoneResults] = useState(null);

  useSocketEvent('lobby-updated', useCallback((data) => setLobby(data), []));

  useSocketEvent('joined-lobby', useCallback(() => setPage('lobby'), []));

  // Lyrics-guess events
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

  // Telephone events
  useSocketEvent('telephone-phase-start', useCallback((data) => {
    setPhonePhase(data);
    setTimer(data.phaseDuration);
    setPage('telephone-phase');
  }, []));

  useSocketEvent('telephone-timer-tick', useCallback(({ secondsRemaining }) => {
    setTimer(secondsRemaining);
  }, []));

  useSocketEvent('telephone-phase-end', useCallback(() => {
    // Brief transition — next phase-start will arrive shortly
  }, []));

  useSocketEvent('telephone-guess-start', useCallback((data) => {
    setPhoneGuess(data);
    setTimer(data.phaseDuration);
    setPage('telephone-guess');
  }, []));

  useSocketEvent('telephone-results-start', useCallback((data) => {
    setPhoneResults(data);
    setPage('telephone-results');
  }, []));

  useSocketEvent('telephone-next-song', useCallback(({ songIndex }) => {
    setPhoneResults(prev => prev ? { ...prev, currentSongIndex: songIndex } : prev);
  }, []));

  useSocketEvent('game-over', useCallback((data) => {
    setFinalData(data);
    if (data.mode === 'telephone') {
      setPage('telephone-results');
    } else {
      setPage('results');
    }
  }, []));

  useSocketEvent('kicked-to-menu', useCallback(() => {
    setPage('menu');
    setLobby(null);
    setQuestion(null);
    setRevealData(null);
    setFinalData(null);
    setPhonePhase(null);
    setPhoneGuess(null);
    setPhoneResults(null);
  }, []));

  const goToMenu = useCallback(() => {
    socket.emit('leave-lobby');
    setPage('menu');
    setLobby(null);
    setQuestion(null);
    setRevealData(null);
    setFinalData(null);
    setPhonePhase(null);
    setPhoneGuess(null);
    setPhoneResults(null);
  }, []);

  const goToLobby = useCallback((isHost) => {
    if (isHost) socket.emit('restart-lobby');
    setPage('lobby');
    setQuestion(null);
    setRevealData(null);
    setFinalData(null);
    setPhonePhase(null);
    setPhoneGuess(null);
    setPhoneResults(null);
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
      {page === 'telephone-phase' && <TelephonePhase phase={phonePhase} timer={timer} lobby={lobby} nickname={nickname} />}
      {page === 'telephone-guess' && <TelephoneGuess guess={phoneGuess} timer={timer} lobby={lobby} nickname={nickname} />}
      {page === 'telephone-results' && (
        <TelephoneResults results={phoneResults} lobby={lobby} finalData={finalData} goToMenu={goToMenu} goToLobby={goToLobby} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat: add telephone mode routing and state to App.jsx"
```

---

## Task 8: Client — YouTubePlayer component + TelephonePhase page

**Files:**
- Create: `client/src/components/YouTubePlayer.jsx`
- Create: `client/src/pages/TelephonePhase.jsx`

- [ ] **Step 1: Create `client/src/components/YouTubePlayer.jsx`**

```jsx
import React, { useEffect, useRef, useState } from 'react';

let apiLoaded = false;
let apiReady = false;
const readyCallbacks = [];

function loadYouTubeApi() {
  if (apiLoaded) return;
  apiLoaded = true;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => {
    apiReady = true;
    readyCallbacks.forEach(cb => cb());
    readyCallbacks.length = 0;
  };
}

function onApiReady(cb) {
  if (apiReady) { cb(); return; }
  readyCallbacks.push(cb);
  loadYouTubeApi();
}

export default function YouTubePlayer({ youtubeId, startTime, endTime, disabled, onDisable }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onApiReady(() => {
      if (!containerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        width: 300,
        height: 170,
        videoId: youtubeId,
        playerVars: { start: Math.floor(startTime), end: Math.ceil(endTime), controls: 0, modestbranding: 1 },
        events: {
          onReady: () => setReady(true),
        },
      });
    });

    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
    };
  }, [youtubeId, startTime, endTime]);

  function handlePlay() {
    if (playerRef.current) {
      playerRef.current.seekTo(startTime);
      playerRef.current.playVideo();
    }
  }

  function handleStop() {
    if (playerRef.current) {
      playerRef.current.stopVideo();
    }
  }

  // When disabled (recording started), stop and hide
  useEffect(() => {
    if (disabled && playerRef.current) {
      playerRef.current.stopVideo();
    }
  }, [disabled]);

  if (disabled) {
    return <p style={{ color: '#888', fontStyle: 'italic', textAlign: 'center' }}>音樂已停止（錄音中）</p>;
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div ref={containerRef} />
      {ready && (
        <button onClick={handlePlay} style={{ marginTop: 8, padding: '6px 16px', fontSize: 14 }}>
          🔁 重播片段
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/pages/TelephonePhase.jsx`**

```jsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import socket from '../socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';
import YouTubePlayer from '../components/YouTubePlayer.jsx';

export default function TelephonePhase({ phase, timer, lobby, nickname }) {
  const [uiState, setUiState] = useState('listen'); // 'listen' | 'recording' | 'preview' | 'submitted'
  const [audioDisabled, setAudioDisabled] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [submittedPlayers, setSubmittedPlayers] = useState([]);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioPreviewRef = useRef(null);
  const recordingAudioRef = useRef(null);

  // Reset state when phase changes
  useEffect(() => {
    setUiState('listen');
    setAudioDisabled(false);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setSubmittedPlayers([]);
  }, [phase?.phaseIndex]);

  useSocketEvent('player-submitted', useCallback(({ nickname: n }) => {
    setSubmittedPlayers(prev => [...prev, n]);
  }, []));

  // Auto-submit on timer expiry
  useEffect(() => {
    if (timer <= 0 && uiState !== 'submitted') {
      handleAutoSubmit();
    }
  }, [timer]);

  function handleAutoSubmit() {
    if (recordedBlob) {
      doSubmit(recordedBlob);
    } else {
      // No recording — submit empty
      doSubmit(null);
    }
  }

  async function handleStartRecording() {
    setAudioDisabled(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        setUiState('preview');
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setUiState('recording');
    } catch (err) {
      alert('無法存取麥克風: ' + err.message);
    }
  }

  function handleStopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
  }

  function handleReRecord() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    handleStartRecording();
  }

  function handleSubmit() {
    doSubmit(recordedBlob);
  }

  async function doSubmit(blob) {
    if (uiState === 'submitted') return;
    setUiState('submitted');
    if (blob) {
      const arrayBuffer = await blob.arrayBuffer();
      socket.emit('submit-recording', { audioData: arrayBuffer });
    } else {
      socket.emit('submit-recording', { audioData: new ArrayBuffer(0) });
    }
  }

  if (!phase) return null;

  const timerColor = timer <= 10 ? '#ef4444' : '#1f2937';

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 16, color: '#555' }}>
          第 {phase.phaseIndex + 1} 回合 — {phase.songLabel}
        </span>
        <span style={{ fontSize: 28, fontWeight: 700, color: timerColor }}>⏱ {timer}s</span>
      </div>

      <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>請用提供的歌詞，搭配你聽到的旋律來唱歌</p>
      </div>

      <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 16, marginBottom: 16, textAlign: 'center' }}>
        <p style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>{phase.lyrics}</p>

        {phase.audioType === 'youtube' ? (
          <YouTubePlayer
            youtubeId={phase.audioUrl.youtubeId}
            startTime={phase.audioUrl.startTime}
            endTime={phase.audioUrl.endTime}
            disabled={audioDisabled}
          />
        ) : (
          !audioDisabled ? (
            <>
              <audio ref={recordingAudioRef} src={phase.audioUrl} preload="auto" style={{ width: '100%', marginBottom: 8 }} controls />
              <button
                onClick={() => { if (recordingAudioRef.current) { recordingAudioRef.current.currentTime = 0; recordingAudioRef.current.play().catch(() => {}); } }}
                style={{ padding: '6px 16px', fontSize: 14 }}>
                🔁 重播
              </button>
            </>
          ) : (
            <p style={{ color: '#888', fontStyle: 'italic' }}>音樂已停止（錄音中）</p>
          )
        )}
      </div>

      {uiState === 'listen' && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>⚠️ 開始錄音後，將無法再聽到音樂</p>
          <button
            onClick={handleStartRecording}
            style={{ padding: '12px 32px', fontSize: 16, background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            🎤 開始錄音
          </button>
        </div>
      )}

      {uiState === 'recording' && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#ef4444', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>🔴 錄音中...</p>
          <button
            onClick={handleStopRecording}
            style={{ padding: '10px 24px', fontSize: 15, background: '#333', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            ⏹ 停止錄音
          </button>
        </div>
      )}

      {uiState === 'preview' && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#555', marginBottom: 8 }}>試聽你的錄音：</p>
          <audio ref={audioPreviewRef} src={recordedUrl} controls style={{ width: '100%', marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={handleReRecord}
              style={{ padding: '8px 20px', fontSize: 15, background: '#f59e0b', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              🔄 重錄
            </button>
            <button onClick={handleSubmit}
              style={{ padding: '8px 20px', fontSize: 15, background: '#22c55e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              ✅ 提交
            </button>
          </div>
        </div>
      )}

      {uiState === 'submitted' && (
        <p style={{ textAlign: 'center', color: '#22c55e', fontWeight: 600, fontSize: 16 }}>✅ 已提交，等待其他玩家...</p>
      )}

      <div style={{ marginTop: 20, borderTop: '1px solid #eee', paddingTop: 12 }}>
        <p style={{ color: '#888', fontSize: 13, margin: '0 0 8px' }}>其他玩家</p>
        {lobby?.players
          .filter(p => p.nickname !== nickname)
          .map(p => (
            <span key={p.nickname} style={{ marginRight: 12, fontSize: 14 }}>
              {submittedPlayers.includes(p.nickname) ? '✅' : '✍️'} {p.nickname}
            </span>
          ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/YouTubePlayer.jsx client/src/pages/TelephonePhase.jsx
git commit -m "feat: add YouTubePlayer component and TelephonePhase page with recording UI"
```

---

## Task 9: Client — TelephoneGuess page

**Files:**
- Create: `client/src/pages/TelephoneGuess.jsx`

- [ ] **Step 1: Create `client/src/pages/TelephoneGuess.jsx`**

```jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import socket from '../socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';

export default function TelephoneGuess({ guess, timer, lobby, nickname }) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedPlayers, setSubmittedPlayers] = useState([]);
  const audioRef = useRef(null);

  useEffect(() => {
    setAnswer('');
    setSubmitted(false);
    setSubmittedPlayers([]);
    if (audioRef.current) {
      audioRef.current.load();
      audioRef.current.play().catch(() => {});
    }
  }, [guess]);

  useSocketEvent('player-submitted', useCallback(({ nickname: n }) => {
    setSubmittedPlayers(prev => [...prev, n]);
  }, []));

  // Auto-submit on timer expiry
  useEffect(() => {
    if (timer <= 0 && !submitted) {
      handleSubmit();
    }
  }, [timer]);

  function handleSubmit(e) {
    if (e) e.preventDefault();
    if (submitted) return;
    setSubmitted(true);
    socket.emit('submit-guess', { guess: answer });
  }

  if (!guess) return null;

  const timerColor = timer <= 10 ? '#ef4444' : '#1f2937';

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 16, color: '#555' }}>猜歌名</span>
        <span style={{ fontSize: 28, fontWeight: 700, color: timerColor }}>⏱ {timer}s</span>
      </div>

      <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 16, marginBottom: 16, textAlign: 'center' }}>
        <p style={{ margin: '0 0 8px', color: '#888', fontSize: 14 }}>聽聽這段錄音，猜猜是哪首歌？</p>
        <audio ref={audioRef} src={guess.audioUrl} preload="auto" style={{ width: '100%', marginBottom: 8 }} controls />
        <button
          onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); } }}
          style={{ padding: '6px 16px', fontSize: 14 }}>
          🔁 重播
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          disabled={submitted}
          placeholder={submitted ? '已提交' : '輸入歌名...'}
          style={{
            width: '100%', padding: '10px 12px', fontSize: 16, boxSizing: 'border-box',
            border: '2px solid #ddd', borderRadius: 8,
            background: submitted ? '#f9f9f9' : 'white',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="submit" disabled={submitted} style={{
            padding: '8px 20px', fontSize: 15,
            background: submitted ? '#ccc' : '#3b82f6', color: 'white',
            border: 'none', borderRadius: 6, cursor: submitted ? 'not-allowed' : 'pointer',
          }}>
            {submitted ? '已提交 ✓' : '提交'}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 20, borderTop: '1px solid #eee', paddingTop: 12 }}>
        <p style={{ color: '#888', fontSize: 13, margin: '0 0 8px' }}>其他玩家</p>
        {lobby?.players
          .filter(p => p.nickname !== nickname)
          .map(p => (
            <span key={p.nickname} style={{ marginRight: 12, fontSize: 14 }}>
              {submittedPlayers.includes(p.nickname) ? '✅' : '✍️'} {p.nickname}
            </span>
          ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/TelephoneGuess.jsx
git commit -m "feat: add TelephoneGuess page for song name guessing"
```

---

## Task 10: Client — TelephoneResults page

**Files:**
- Create: `client/src/pages/TelephoneResults.jsx`

- [ ] **Step 1: Create `client/src/pages/TelephoneResults.jsx`**

```jsx
import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket.js';
import YouTubePlayer from '../components/YouTubePlayer.jsx';

export default function TelephoneResults({ results, lobby, finalData, goToMenu, goToLobby }) {
  const [currentSong, setCurrentSong] = useState(0);
  const [autoPlayIndex, setAutoPlayIndex] = useState(0); // -1=youtube, 0..N-2=recordings, N-1=done
  const [autoPlayDone, setAutoPlayDone] = useState(false);
  const audioRefs = useRef([]);

  const isHost = lobby?.hostSocketId === socket.id;
  const isGameOver = !!finalData;

  // Update currentSong from server events
  useEffect(() => {
    if (results?.currentSongIndex !== undefined) {
      setCurrentSong(results.currentSongIndex);
      setAutoPlayIndex(0);
      setAutoPlayDone(false);
    }
  }, [results?.currentSongIndex]);

  if (!results || !results.results) return null;

  const songs = results.results;
  const song = songs[currentSong];
  if (!song) return null;

  const chainLength = song.chain.length;

  function handleAudioEnded(idx) {
    if (autoPlayDone) return;
    // Auto-advance to next recording
    const nextIdx = idx + 1;
    if (nextIdx < chainLength) {
      setAutoPlayIndex(nextIdx);
      // Play next after brief delay
      setTimeout(() => {
        if (audioRefs.current[nextIdx]) {
          audioRefs.current[nextIdx].play().catch(() => {});
        }
      }, 500);
    } else {
      setAutoPlayDone(true);
    }
  }

  function handlePlayEntry(idx) {
    // Stop all other audio
    audioRefs.current.forEach((ref, i) => {
      if (ref && i !== idx) { ref.pause(); ref.currentTime = 0; }
    });
    if (audioRefs.current[idx]) {
      audioRefs.current[idx].currentTime = 0;
      audioRefs.current[idx].play().catch(() => {});
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>結果回顧 — 歌曲 {currentSong + 1}/{songs.length}</h2>
      </div>

      {/* YouTube original */}
      <div style={{ background: '#f0f9ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
        <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>原曲</p>
        <YouTubePlayer
          youtubeId={song.youtube.youtubeId}
          startTime={song.youtube.startTime}
          endTime={song.youtube.endTime}
          disabled={false}
        />
      </div>

      {/* Recording chain */}
      {song.chain.map((entry, idx) => (
        <div key={idx} style={{
          background: autoPlayIndex === idx && !autoPlayDone ? '#fef9c3' : '#f5f5f5',
          border: autoPlayIndex === idx && !autoPlayDone ? '1px solid #fcd34d' : '1px solid #e5e5e5',
          borderRadius: 8, padding: '10px 16px', marginBottom: 8,
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#888' }}>
            第 {entry.phaseIndex + 1} 回合 — {entry.nickname}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 500 }}>歌詞: {entry.lyrics}</p>
          {entry.audioUrl ? (
            <>
              <audio
                ref={el => audioRefs.current[idx] = el}
                src={entry.audioUrl}
                preload="auto"
                onEnded={() => handleAudioEnded(idx)}
                style={{ width: '100%' }}
                controls
              />
              {autoPlayDone && (
                <button onClick={() => handlePlayEntry(idx)}
                  style={{ marginTop: 4, padding: '4px 12px', fontSize: 13 }}>
                  ▶ 播放
                </button>
              )}
            </>
          ) : (
            <p style={{ color: '#bbb', fontStyle: 'italic', margin: 0 }}>（未錄音）</p>
          )}
        </div>
      ))}

      {/* Guess reveal */}
      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: '#16a34a' }}>{song.guesserNickname} 猜的答案</p>
        <p style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>{song.guess}</p>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: '#888' }}>正確答案</p>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: song.guess === song.songName ? '#16a34a' : '#dc2626' }}>
          {song.songName}
        </p>
      </div>

      {/* Navigation */}
      {!isGameOver && isHost && (
        <button
          onClick={() => socket.emit('next-song')}
          style={{ width: '100%', padding: '12px', fontSize: 16, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          下一首 ▶
        </button>
      )}
      {!isGameOver && !isHost && (
        <p style={{ textAlign: 'center', color: '#888', fontSize: 14 }}>等待房主繼續...</p>
      )}

      {isGameOver && (
        <div style={{ textAlign: 'center' }}>
          <h2>🎉 遊戲結束</h2>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            {isHost && (
              <button
                onClick={() => goToLobby(true)}
                style={{ padding: '12px 24px', fontSize: 16, background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                再玩一次
              </button>
            )}
            <button
              onClick={goToMenu}
              style={{ padding: '12px 24px', fontSize: 16, background: 'white', border: '2px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
              回主選單
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/TelephoneResults.jsx
git commit -m "feat: add TelephoneResults page with chain playback and host advance"
```

---

## Task 11: Build, verify, and deploy

- [ ] **Step 1: Run all server tests**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/server"
npm test
```

Expected: All tests PASS

- [ ] **Step 2: Build client**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/client"
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit dist**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer"
git add client/dist
git commit -m "chore: rebuild client dist"
```

- [ ] **Step 4: Deploy to Fly.io**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer"
fly deploy
```

Expected: Machine reaches "good state". Visit https://jay-chou-lyrics-game.fly.dev/ to verify both modes work.
