# Jay Chou Lyrics Multiplayer — Design Spec

**Date:** 2026-04-09  
**Status:** Approved

---

## Overview

A real-time multiplayer web game where players listen to Jay Chou song audio clips and type the lyrics. Players create or join lobbies, compete simultaneously, and are scored on accuracy and speed.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Node.js + Express + Socket.io |
| Frontend | React + Vite |
| State | In-memory JS objects (no database) |
| Deployment | Fly.io, single `shared-cpu-1x` 512MB VM (~$2–4/month) |

React is served as static files from the same Express server. Audio files are bundled inside the Docker image and served via Express `/audio/*`. No external services required.

---

## Architecture

### Project Structure

```
/server
  src/
    index.js          ← Express + Socket.io entry point
    gameManager.js    ← All lobby/game state logic
    scoring.js        ← Fuzzy char matching + score calculation
  questions.json
  audio/              ← Static files served by Express

/client
  src/
    pages/
      MainMenu.jsx    ← Nickname input, create/browse lobbies
      Lobby.jsx       ← Waiting room, settings (host), player list
      Game.jsx        ← Audio player, answer input, countdown
      Reveal.jsx      ← Show all answers + points this round
      Results.jsx     ← Final scores, winner, return options
    hooks/
      useSocket.js    ← Socket.io connection + event handling
    utils/
      scoring.js      ← Client-side char count display helper

Dockerfile            ← Build React with Vite, serve from Node.js
fly.toml
```

### Capacity

A single 512MB Fly.io VM comfortably handles ~50–100 concurrent players. The bottleneck is audio file serving, not game state. If traffic grows, audio files can be offloaded to a CDN (e.g. Cloudflare R2) without changing the architecture.

---

## Game State Machine

```
MENU → LOBBY → QUESTION → REVEAL → (repeat N times) → RESULTS
                                                           ↓
                                              返回 Lobby / 回主選單
```

If the host closes the lobby at any state, all players in that lobby receive `kicked-to-menu` and are redirected to MENU.

---

## Lobby System

### Lobby Object (in-memory)

```js
{
  id: "JAY4K2",           // 6-char random alphanumeric lobby code
  name: "周杰倫歌迷大挑戰",
  hostSocketId: "...",
  isPrivate: false,
  password: null,          // hashed if private
  settings: {
    numQuestions: 10,      // 5 | 10 | 15 | 20
    timeLimit: 30,         // 15 | 30 | 45 (seconds per question)
  },
  maxPlayers: 8,
  players: [
    { socketId, nickname, score: 0 }
  ],
  state: "waiting",        // "waiting" | "in_question" | "reveal" | "finished"
  questions: [],           // shuffled subset selected at game start
  currentQuestionIndex: 0,
  timerHandle: null,
}
```

### Lobby Settings (host-configurable before game starts)

| Setting | Options | Default |
|---|---|---|
| Lobby name | Free text | — |
| Number of questions | 5 / 10 / 15 / 20 | 10 |
| Time per question | 15s / 30s / 45s | 30s |
| Public / Private | Public or Private (password) | Public |

Public lobbies appear in the browse list on the Main Menu. Private lobbies require the 6-char code + password to join.

---

## Socket.io Event Protocol

### Client → Server

| Event | Payload |
|---|---|
| `create-lobby` | `{ nickname, lobbyName, numQuestions, timeLimit, isPrivate, password? }` |
| `join-lobby` | `{ lobbyCode, nickname, password? }` |
| `start-game` | _(host only, no payload)_ |
| `submit-answer` | `{ answer: string, submittedAt: number }` (ms since question start) |
| `leave-lobby` | _(no payload)_ |

### Server → Client

| Event | Payload |
|---|---|
| `lobby-updated` | `{ players[], settings, hostSocketId, lobbyCode }` |
| `question-start` | `{ audioUrl, charCount, hint, questionIndex, total }` |
| `timer-tick` | `{ secondsRemaining }` |
| `question-end` | `{ correctAnswer, results: [{ nickname, answer, accuracy, pointsEarned, totalScore }] }` |
| `game-over` | `{ finalScores: [{ nickname, score }], winner }` |
| `kicked-to-menu` | `{ reason: "host_closed" }` |
| `error` | `{ message }` (wrong password, lobby not found, nickname taken, etc.) |

### Disconnect Handling

- **Player disconnects in LOBBY:** Removed from player list; `lobby-updated` broadcast to remaining players.
- **Player disconnects in QUESTION / REVEAL:** Treated as submitting no answer (0 pts for that round); game continues for remaining players. They are removed from the player list and won't appear in future reveals.
- **Host disconnects at any state:** Lobby is closed immediately; all remaining players receive `kicked-to-menu`.

### Timer Authority

The server owns the timer. It broadcasts `timer-tick` every second and fires `question-end` when the countdown reaches 0. Clients display the server's remaining seconds — no client-side clock drift.

---

## Scoring

### Formula (per question, max 150 pts)

**Step 1 — Accuracy score (0–100 pts)**
```
accuracy = matchingChars / totalChars
accuracyScore = floor(accuracy × 100)
```

**Step 2 — Speed bonus (0–50 pts)**
```
Only awarded if accuracy ≥ 60%
speedBonus = floor((1 - submittedAt / timeLimitMs) × 50)
```

**Total = accuracyScore + speedBonus**

No answer submitted = 0 pts.

### Answer Matching Algorithm

1. Strip all punctuation and whitespace from both the correct answer and the player's input
2. Compute Longest Common Subsequence (LCS) of the two normalized strings
3. `matchingChars = LCS length`, `totalChars = normalized correct answer length`

### UI During Question

- **Hint shown:** `提示：「西西里」(共 7 字)` — total character count of the answer (punctuation/spaces excluded)
- **Live counter:** Updates on every keystroke showing `2 / 7 字` (player's typed char count / answer char count, both normalized)
- **Other players:** Show ✅ (submitted) or ✍️ (still typing) — no answer content revealed until `question-end`

---

## Screen Descriptions

### Main Menu
- Nickname input (required before any action)
- "建立 Lobby" → opens create-lobby form (name, settings)
- "加入 Lobby" → input lobby code (+ password if private)
- Browse list of public lobbies (name, player count, join button)

### Lobby (Waiting Room)
- Shows lobby code prominently for sharing
- Player list with host crown indicator
- Settings panel (editable by host only, read-only for others)
- "開始遊戲" button (host only, enabled when ≥2 players)
- Players can leave at any time; if host leaves, lobby closes and all players are sent to MENU

### Game (In Question)
- Current question number and total (e.g. 第 3 / 10 題)
- Audio player (auto-plays on question start) + 🔁 Replay button
- Countdown timer (turns red when ≤10s)
- Answer text input + live `X / Y 字` counter below
- Other players' submission status (✅ / ✍️)

### Reveal (Between Questions)
- Correct answer displayed
- Table: each player's submitted answer, accuracy %, points earned this round, running total
- Auto-advances to next question after 5 seconds (countdown shown)

### Results (Final)
- Winner announcement
- Final leaderboard: rank, nickname, total score (🥇🥈🥉)
- Two buttons for all players: "返回 Lobby" and "回主選單"
  - "返回 Lobby" returns to the same lobby's waiting room (host can start a new game)
  - "回主選單" disconnects and returns to MENU

---

## Deployment

```
Dockerfile
  ├── Stage 1: Build React with Vite → dist/
  └── Stage 2: Node.js image
        ├── Copy dist/ → served by Express
        ├── Copy server/src/
        ├── Copy questions.json + audio/
        └── CMD: node src/index.js

fly.toml
  machine: shared-cpu-1x, 512MB
  port: 3000
  auto_stop: false  (WebSocket connections must stay alive)
```

Deploy with `fly deploy`. No persistent volumes, no external services. State is in-memory and resets on restart (acceptable for a game).
