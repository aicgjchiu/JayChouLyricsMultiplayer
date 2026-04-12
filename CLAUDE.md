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
| `server/src/modes/telephone.js` | Telephone mode: phase management, recording storage, guess collection, results |
| `server/src/rotation.js` | Pure function `buildAssignments(N)` — Latin square rotation for telephone mode |
| `server/src/scoring.js` | `calculateScore()` and `normalizeText()` for lyrics-guess mode |

### Client

| File | Responsibility |
|------|---------------|
| `client/src/App.jsx` | Page routing via state + socket events |
| `client/src/socket.js` | Shared Socket.IO client instance |
| `client/src/hooks/useSocket.js` | `useSocketEvent` hook for declarative socket listeners |
| `client/src/pages/MainMenu.jsx` | Mode selector, lobby creation, lobby list |
| `client/src/pages/Lobby.jsx` | Player list, mode-aware settings, start button |
| `client/src/pages/Game.jsx` | Lyrics-guess: audio playback, answer input, draft emission |
| `client/src/pages/Reveal.jsx` | Lyrics-guess: per-question results, host next-question button |
| `client/src/pages/Results.jsx` | Lyrics-guess: final scores with medals |
| `client/src/pages/TelephonePhase.jsx` | Telephone: listen/record/preview/submit flow |
| `client/src/pages/TelephoneGuess.jsx` | Telephone: guess the song name |
| `client/src/pages/TelephoneResults.jsx` | Telephone: chain playback, host advance, game over |
| `client/src/components/YouTubePlayer.jsx` | YouTube IFrame API wrapper (lazy-loads API) |

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

- **Rotation algorithm:** `buildAssignments(N)` ensures each player sings every song exactly once, sees different lyrics each phase, and guesses a song they never sang in. Uses a formula for odd N, backtracking for even N.
- **Lyrics mismatch filtering:** When songs are selected, lyrics whose `songName` matches any selected song are excluded from the pool.
- **Recording flow:** Audio disabled permanently once recording starts. Players can preview and re-record, but cannot re-listen to the source audio.
- **Minimum 3 players** for telephone mode (2 for lyrics-guess).

## Songs Included

### Telephone Mode (songs.json — 21 songs)

青花瓷, 稻香, 晴天, 我難過, 孤勇者, 童話, 我們的愛, 曹操, Never gonna give you up, 小情歌, 那些年, 突然好想你, 你是我的花朵, 超跑情人夢, 露比醬, 快樂崇拜, 泡沫, 修練愛情, 洋蔥, 大海, 隱形的翅膀

### Lyrics Guess Mode (audio/ — 72 clips from 13 songs)

太陽之子, 西西里, 那天下雨了, 湘女多情, 誰稀罕, 七月的極光, 愛琴海, I Do, 聖徒, 女兒殿下, 淘金小鎮, 鄉間的路, 聖誕星
