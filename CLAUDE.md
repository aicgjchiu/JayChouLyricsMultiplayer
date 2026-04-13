# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A real-time multiplayer web game with two music game modes, featuring Jay Chou (周杰倫) and other popular Chinese/English songs:

1. **周杰倫猜歌 (Lyrics Guess)** — Players listen to audio clips and guess the lyrics. Scored by accuracy and speed.
2. **音樂傳聲筒 (Musical Telephone)** — Players record themselves singing mismatched lyrics to melodies, pass recordings down a chain, and the last person guesses the song. No scoring — purely for entertainment.

**Live at:** https://jay-chou-lyrics-game.fly.dev/

## Tech Stack

- **Server:** Node.js, Express, Socket.IO (real-time multiplayer)
- **Client:** React (Vite), vanilla CSS (inline styles)
- **Tests:** Vitest (server-side only)
- **Deployment:** Fly.io (single machine, in-memory state)
- **APIs:** YouTube IFrame Player API (telephone mode), MediaRecorder API (browser audio recording)

## Commands

```bash
# Run server tests
cd server && npm test

# Build client
cd client && npm run build

# Start dev server (serves client dist + API)
cd server && node src/index.js

# Deploy
fly deploy
```

## Architecture

### Server

| File | Responsibility |
|------|---------------|
| `server/src/index.js` | Express server, Socket.IO handlers, HTTP endpoints, static file serving |
| `server/src/gameManager.js` | Shared lobby lifecycle (create, join, leave, settings). Dispatches to mode modules. |
| `server/src/modes/lyricsGuess.js` | Lyrics-guess game logic: questions, scoring, timers |
| `server/src/modes/telephone.js` | Telephone mode: phase management, recording storage, guess collection, step-by-step results review, pause/resume, reconnect snapshots |
| `server/src/rotation.js` | `buildAssignments(N)` — row-complete Latin square rotation (Williams for even N, backtracking for odd N) so listeners hear diverse predecessors |
| `server/src/scoring.js` | `calculateScore()` and `normalizeText()` for lyrics-guess mode |

### Client

| File | Responsibility |
|------|---------------|
| `client/src/App.jsx` | Page routing via state + socket events |
| `client/src/socket.js` | Shared Socket.IO client instance |
| `client/src/hooks/useSocket.js` | `useSocketEvent` hook for declarative socket listeners |
| `client/src/pages/MainMenu.jsx` | Mode selector, lobby creation, lobby list (incl. in-progress lobbies + rejoin prompt) |
| `client/src/playerId.js` | Persistent per-browser UUID in `localStorage` (sent on every lobby entry, used for reconnect slot matching) |
| `client/src/pages/Lobby.jsx` | Player list, mode-aware settings, start button, mic test (telephone only) |
| `client/src/pages/Game.jsx` | Lyrics-guess: audio playback, answer input, draft emission |
| `client/src/pages/Reveal.jsx` | Lyrics-guess: per-question results, host next-question button |
| `client/src/pages/Results.jsx` | Lyrics-guess: final scores with medals |
| `client/src/pages/TelephonePhase.jsx` | Telephone: listen/record/preview/submit flow |
| `client/src/pages/TelephoneGuess.jsx` | Telephone: guess the song name |
| `client/src/pages/TelephoneResults.jsx` | Telephone: host-controlled step-by-step review, per-song free-play, full game-over recap |
| `client/src/components/YouTubePlayer.jsx` | YouTube IFrame API wrapper (lazy-loads API, supports autoPlay/onEnded, enforces endTime on replay) |

### Data Files

| File | Description |
|------|-------------|
| `questions.json` | 72 lyrics-guess questions with song, hint, audio path, answer |
| `songs.json` | 21 songs with YouTube video IDs and timestamp segments (telephone mode) |
| `lyrics.json` | 23 singable lyric phrases with source `songName` for mismatch filtering |
| `audio/` | MP3 clips for lyrics-guess mode |

## Key Patterns

- **State machine:** Game state transitions are server-authoritative. Client pages are driven by socket events, not client-side routing.
- **Mode dispatch:** `gameManager.js` delegates to mode modules (`modes/lyricsGuess.js`, `modes/telephone.js`) based on `lobby.settings.gameMode`.
- **In-memory everything:** All state (lobbies, recordings) lives in server memory. No database. Recordings are stored as Buffers in a Map and served via HTTP.
- **Draft auto-submit:** In lyrics-guess mode, keystrokes emit `update-draft` so unsubmitted answers are auto-submitted when time expires.
- **Host controls pacing:** Reveal/results advancement is host-triggered (no auto-timers for page transitions).

## Telephone Mode Specifics

- **Rotation algorithm:** `buildAssignments(N)` composes two matrices:
  - `buildPlayerMatrix(N)` — N rows (N-1 sing phases + 1 guess phase), each row and each column a permutation. For even N uses Williams sequencing → every listener hears each of the N-1 other players exactly once. For odd N uses backtracking search minimising duplicate predecessors (falls back through caps 1→2→N; for N=3 a repeat is mathematically unavoidable).
  - `buildLyricMatrix(N, playerMatrix)` — generic backtracking that enforces: distinct lyric per phase, distinct lyric per song across phases, each player sees distinct lyrics across their phases.
- **Guesser rule:** Row N-1 of the player matrix is the guess assignment — guaranteed to be a player who never sang that song (column-permutation property).
- **Lyrics mismatch filtering:** When songs are selected, lyrics whose `songName` matches any selected song are excluded from the pool.
- **Recording flow:** Audio disabled permanently once recording starts. Players can preview and re-record, but cannot re-listen to the source audio. If the timer expires mid-recording, client stops the recorder and submits the captured blob rather than discarding it.
- **Missing-recording fallback (`_resolveAudioSource`):** If the previous phase has no recording for this song, walks backwards through earlier phases to find the most recent recording; if none exist, falls back to the original YouTube clip. Server emits a `fallbackNotice` string naming the skipped player(s) and which phase's audio the listener is actually hearing.
- **Empty-buffer handling:** Zero-length submissions (no recording made) are NOT stored in `recordings`; this lets the fallback chain work correctly. Submitter is still counted as "submitted" so the phase can advance.
- **Disconnect handling:**
  - Non-host disconnect during telephone state → player slot is preserved (`disconnected: true`, `socketId: null`) so `playerIdx` in assignments stays valid. Timer is paused and `telephone-paused` is broadcast with disconnected nicknames.
  - Host decides via `telephone-continue` or `telephone-wait`. Continue promotes disconnected players to `abandoned: true`, adds synthetic `abandoned:${idx}` markers to the submissions Set, and either auto-advances the phase (if active players already submitted) or resumes the timer.
  - Host disconnect still closes the lobby (`_closeLobby`).
  - Abandoned players are auto-marked submitted at every subsequent `_startPhase` / `_startGuess`. Guesses made by abandoned players show `'（玩家斷線未作答）'` with a muted style in results.
- **Reconnect:** `reconnectLobby` matches a `disconnected && !abandoned` slot by `playerId`, restores `socketId`, and calls `telephoneMode.snapshotForPlayer` to re-emit the current `telephone-phase-start` or `telephone-guess-start` (with `secondsRemaining` as the new phaseDuration). If no one else is still disconnected, the game resumes.
- **playerId:** Persisted per browser in `localStorage` (`jaychou.playerId`) and sent on socket handshake + every `create-lobby`/`join-lobby`/`reconnect-lobby` payload.
- **Lobby list:** `getLobbies()` returns all non-finished lobbies with `inProgress` and `disconnectedNicknames` fields; in-progress lobbies show "（遊玩中）" in MainMenu and expose a "重新加入" button when disconnected slots exist.
- **YouTube replay fix:** The IFrame API's `start`/`end` playerVars only apply on first play. A 250ms interval monitors `getCurrentTime()` and pauses at `endTime` for all replays. Hint text tells players to use the replay button.
- **Results review:** Host-controlled step-by-step advancement via `advance-review` socket event. Steps: YouTube original → each recording → answer reveal → free-play. Server tracks `currentReviewStep` per song.
- **Game-over recap:** Shows all songs with full free-play controls (YouTube, all recordings, answers) on a single scrollable page.
- **Mic test in lobby:** Telephone mode only. Players can record/playback to verify mic before game starts.
- **Minimum 3 players** for telephone mode (2 for lyrics-guess).

## Songs Included

### Telephone Mode (songs.json — 21 songs)

青花瓷, 稻香, 晴天, 我難過, 孤勇者, 童話, 我們的愛, 曹操, Never gonna give you up, 小情歌, 那些年, 突然好想你, 你是我的花朵, 超跑情人夢, 露比醬, 快樂崇拜, 泡沫, 修練愛情, 洋蔥, 大海, 隱形的翅膀

### Lyrics Guess Mode (audio/ — 72 clips from 13 songs)

太陽之子, 西西里, 那天下雨了, 湘女多情, 誰稀罕, 七月的極光, 愛琴海, I Do, 聖徒, 女兒殿下, 淘金小鎮, 鄉間的路, 聖誕星
