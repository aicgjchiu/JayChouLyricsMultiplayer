---
title: Musical Telephone Mode (音樂傳聲筒)
date: 2026-04-10
status: approved
---

## Problem Summary

The game currently has one mode: lyrics guessing (周杰倫猜歌). A new party mode is needed — "音樂傳聲筒" (Musical Telephone) — where players listen to music, record themselves singing mismatched lyrics to the melody, pass recordings down a chain, and the last person guesses the song. The fun comes from progressive degradation of the melody through the telephone chain and the absurdity of mismatched lyrics.

---

## Data Files

Two new JSON files replace the need for `questions.json` in this mode. The existing `questions.json` remains untouched for the lyrics-guess mode.

### `songs.json`

One entry per song. Each song has a YouTube video ID and a timestamp segment (~5 seconds) for the melody the players must reproduce.

```json
[
  {
    "id": 1,
    "name": "太陽之子",
    "youtubeId": "xxxxxxxxxx",
    "startTime": 42,
    "endTime": 47
  }
]
```

### `lyrics.json`

A flat pool of short singable phrases (~5 seconds). No association to any specific song — the game intentionally assigns mismatched lyrics to melodies.

```json
[
  { "id": 1, "text": "我就是光照亮遠方黑夜我闖馬上將你擊潰" },
  { "id": 2, "text": "天青色等煙雨而我在等妳" }
]
```

At game start, N songs and N lyrics are randomly selected from these pools (N = player count).

---

## Architecture

### Mode-Separated Game Logic

`gameManager.js` remains the single entry point, owning all shared lobby lifecycle: create, join, leave, disconnect, settings, player management. Game-specific logic is extracted into separate mode modules.

| File | Responsibility |
|------|---------------|
| `server/src/gameManager.js` | Lobby lifecycle (shared). Dispatches to mode modules based on `lobby.settings.gameMode`. |
| `server/src/modes/lyricsGuess.js` | Extracted from current gameManager. Handles: startGame, submitAnswer, updateDraft, endQuestion, nextQuestion. |
| `server/src/modes/telephone.js` | New mode. Handles: startGame, submitRecording, endPhase, nextPhase, startGuess, submitGuess, endGuess, startResults, nextSong. |

GameManager dispatches based on `lobby.settings.gameMode`:

```js
startGame(socketId, io) {
  const lobby = this.getLobby(socketId);
  // shared validation (host check, min players, state check)...
  if (lobby.settings.gameMode === 'telephone') {
    telephoneMode.startGame(lobby, io);
  } else {
    lyricsGuessMode.startGame(lobby, io);
  }
}
```

Adding a 3rd mode in the future requires only a new mode file and a new dispatch branch.

---

## Lobby & Mode Selection

### Mode Selector at Lobby Creation

The host chooses a game mode when creating a lobby. The mode determines which settings are shown.

| Mode | Settings |
|------|----------|
| 周杰倫猜歌 (lyrics-guess) | numQuestions: 5/10/15/20, timeLimit: 15/30/45s |
| 音樂傳聲筒 (telephone) | phaseDuration: 60/90/120s |

### Lobby Settings

New field: `settings.gameMode` — `'lyrics-guess'` (default) or `'telephone'`.

For telephone mode:
- `settings.phaseDuration` — seconds per phase (60, 90, or 120). Default: 90.
- `numQuestions` and `timeLimit` are irrelevant and not shown.

### Constraints

- Minimum **3 players** for telephone mode (2 would mean only 1 singing phase + 1 guess — no telephone effect).
- Maximum **8 players** (existing cap).
- The mode label is shown in the lobby waiting room so players know what they're about to play.

---

## Rotation Algorithm

With N players: N songs selected, N lyrics selected, N phases total.

- **Phases 1 to N-1:** singing phases. Each player sings for a different song with a different lyric.
- **Phase N:** guess phase. Each player guesses the song for the chain they never sang in.

### Assignment Matrix (3-player example)

| | Phase 1 (YouTube) | Phase 2 (recording) | Phase 3 (guess) |
|---|---|---|---|
| **Song 1** | Player1 + Lyric1 | Player2 + Lyric2 | Player3 guesses |
| **Song 2** | Player2 + Lyric3 | Player3 + Lyric1 | Player1 guesses |
| **Song 3** | Player3 + Lyric2 | Player1 + Lyric3 | Player2 guesses |

### Constraints Satisfied

- Each phase: every player works on a different song.
- Each phase: every player sees a different lyric.
- Each song's chain: every phase uses a different lyric.
- Each player: sings for every song exactly once across N-1 singing phases.
- Each player: guesses exactly one song — the one they never sang in.
- The guesser never heard the YouTube original for that song.

### Algorithm

- **Player rotation:** Song `s` assigns player `(s + phase) % N` for each phase.
- **Lyric rotation:** Song `s` in phase `p` uses lyric `(s * k + p) % N` where `k` is chosen coprime to N to ensure no repeats.
- **Guess phase (N):** The player assigned to each song in phase N is the guesser (no lyrics needed).

---

## Telephone Game State Machine

### States

```
waiting → telephone_phase → telephone_guess → telephone_results → finished
              ↕ (repeat N-1 times)
```

### Phase Flow (Phases 1 to N-1) — State: `telephone_phase`

1. Server emits `telephone-phase-start` to each player with their assignment:
   ```js
   {
     phaseIndex,        // 0-based
     songLabel,         // generic label for display (e.g., "歌曲 1") — never the real song name
     lyrics,            // the lyrics text to sing
     audioUrl,          // YouTube embed data (phase 1) or HTTP recording URL (phase 2+)
     audioType,         // 'youtube' | 'recording'
     phaseDuration,     // seconds
     isFirstPhase       // true for phase 1
   }
   ```
2. Player listens to audio (can replay freely).
3. Player clicks "Start Recording" — **warning shown first**: "開始錄音後，將無法再聽到音樂". Audio becomes permanently unplayable.
4. Player records via MediaRecorder API. Red recording indicator shown.
5. Player clicks "Stop Recording" — preview plays back. Player can:
   - **Play back** their recording to review it.
   - **Re-record** — discard and record again (still can't hear original audio).
   - **Submit** — upload recording to server.
6. Timer expiry: auto-submits last completed recording. If no recording exists, empty entry (next player hears same audio as this player would have).
7. When all players submit (or timer expires), server transitions to next phase or guess phase.

### Guess Flow (Phase N) — State: `telephone_guess`

1. Server emits `telephone-guess-start` to each player:
   ```js
   {
     audioUrl,          // HTTP URL to the last recording in the chain
     phaseDuration      // same duration setting
   }
   ```
2. Player hears the last recording in their assigned chain. Can replay.
3. Player types their guess (free text — song name).
4. Timer expires or all submit — server collects guesses.

### No Scoring

There is no scoring in telephone mode. The guess is shown alongside the correct answer purely for entertainment.

---

## Audio Recording & Storage

### Client-Side Recording

- **API:** `navigator.mediaDevices.getUserMedia({ audio: true })` → MediaRecorder
- **Format:** WebM/Opus (best cross-browser support), fallback to WAV
- **Permission:** Requested when player clicks "Start Recording" (not on page load)

### UI Flow Per Phase

```
[Listen to audio] → can replay freely
        ↓ click "Start Recording" (warning: 開始錄音後，將無法再聽到音樂)
[Recording...] → red indicator, "Stop" button
        ↓ click "Stop"
[Preview] → play/pause own recording, "Re-record" button, "Submit" button
        ↓ submit or timer expires
[Waiting] → "等待其他玩家..." message
```

### Upload

- Socket.IO binary event: `socket.emit('submit-recording', { audioBlob })`
- ~80KB per 5-second recording — trivial for socket transport
- Server receives and stores as Buffer

### Server-Side Storage

- In-memory on the lobby object: `recordings: Map<string, Buffer>`
- Key format: `"songIdx-phaseIdx"` → Buffer
- With 8 players max: 8 songs × 7 recordings × ~80KB ≈ 4.5MB — fine for memory
- Cleared when lobby is closed or game restarts via `restartLobby`

### Playback via HTTP

- Endpoint: `GET /recordings/:lobbyId/:songIdx/:phaseIdx`
- Returns Buffer with `Content-Type: audio/webm`
- `<audio>` elements use this URL as `src`
- Used in phases 2+ (player hears previous recording) and in results playback

### Auto-Submit on Timeout

- If player has at least one completed recording but hasn't submitted: auto-submit the last one.
- If player has no recording at all: empty entry. The next player in the chain hears the same audio as the current player would have (pass-through).

---

## YouTube Embed

### YouTube IFrame Player API

- Load IFrame API script dynamically: `https://www.youtube.com/iframe_api`
- Embed player sized for audio focus: ~300×170px
- Parameters from `songs.json`: `videoId`, `start`, `end`
- Player can replay the segment freely (`seekTo(startTime)` + `playVideo()`)

### Why IFrame API (not plain `<iframe>`)

Programmatic control is required:
- `seekTo()` for replaying the specific segment
- `stopVideo()` to kill audio when recording starts
- `onStateChange` to detect when segment finishes

### Lifecycle

- **Phase 1 only:** YouTube player renders for the song assigned to this player.
- **When recording starts:** `player.stopVideo()`, player element hidden/disabled permanently.
- **Phases 2+:** No YouTube. `<audio>` element with recording URL instead.
- **Results screen:** YouTube player re-used to play original segment during chain playback.

---

## Results Playback Screen — State: `telephone_results`

### Auto-Playback Sequence (per song)

One song chain at a time:

1. **YouTube original** — embedded player plays the song segment (startTime → endTime).
2. **Phase 1 recording** — auto-plays with label: "[Player1] 唱的版本 — 歌詞: [lyrics text]"
3. **Phase 2 recording** — auto-plays with label: "[Player2] 唱的版本 — 歌詞: [lyrics text]"
4. ... through all N-1 recordings
5. **Guess reveal** — show: "[PlayerN] 猜的答案: [guess]" vs. "正確答案: [song name]"

### After Auto-Playback Finishes

- All entries (YouTube + recordings) become freely clickable for replay
- Host sees "下一首 ▶" button to proceed to next song's chain
- Non-host sees "等待房主繼續..."

### Visual Layout

- Vertical timeline/list showing each step in the chain
- Currently-playing entry is highlighted
- Each entry shows: player name, lyrics used (or "猜歌名" for guess), play button
- Guess reveal at the bottom with correct answer comparison

### After All N Songs Reviewed → Game Over (State: `finished`)

- **Host:** "再玩一次" button (emits `restart-lobby`) + "回到主選單" button (emits `leave-lobby`)
- **Non-host:** "回到主選單" button (emits `leave-lobby`). Players who stay wait for host to restart — same pattern as existing Results page.

---

## Client Pages

| Page | When Shown | Mode |
|------|-----------|------|
| `MainMenu.jsx` | Mode selector in create-lobby form | Both |
| `Lobby.jsx` | Shows game mode label | Both |
| `TelephonePhase.jsx` | **New.** Singing phase UI (audio + recording + lyrics) | Telephone |
| `TelephoneGuess.jsx` | **New.** Guess phase UI (audio + text input) | Telephone |
| `TelephoneResults.jsx` | **New.** Chain playback + guess reveal | Telephone |
| `Game.jsx` | Unchanged | Lyrics-guess |
| `Reveal.jsx` | Unchanged | Lyrics-guess |
| `Results.jsx` | Unchanged | Lyrics-guess |

`App.jsx` routes to the correct page based on game mode and socket events.

---

## Socket Events (New)

| Event | Direction | Payload |
|-------|-----------|---------|
| `telephone-phase-start` | Server → Client | Per-player assignment (phase, lyrics, audioUrl, audioType) |
| `telephone-phase-end` | Server → Client | Phase complete signal |
| `telephone-guess-start` | Server → Client | Per-player guess assignment (audioUrl) |
| `telephone-guess-end` | Server → Client | Guess complete signal |
| `telephone-results-start` | Server → Client | Full results data (all chains, all recordings, all guesses) |
| `telephone-timer-tick` | Server → Client | `{ secondsRemaining }` |
| `submit-recording` | Client → Server | `{ audioBlob }` (binary) |
| `submit-guess` | Client → Server | `{ guess }` (string) |
| `next-song` | Client → Server | Host advances to next song in results |

---

## Files Changed

| File | Change |
|------|--------|
| `songs.json` | **New.** Song data with YouTube IDs and timestamps. |
| `lyrics.json` | **New.** Flat pool of singable lyrics. |
| `server/src/gameManager.js` | Extract mode-specific logic; add dispatch by gameMode; add telephone socket handlers; add recordings HTTP endpoint. |
| `server/src/modes/lyricsGuess.js` | **New.** Extracted current game logic. |
| `server/src/modes/telephone.js` | **New.** Telephone mode: rotation, phase management, recording storage, results. |
| `server/src/index.js` | Add new socket event handlers; add `/recordings/` HTTP endpoint; serve `songs.json` and `lyrics.json`. |
| `client/src/App.jsx` | Route to telephone pages based on mode + events. |
| `client/src/pages/MainMenu.jsx` | Add game mode selector; show mode-specific settings. |
| `client/src/pages/Lobby.jsx` | Show game mode label; mode-specific start validation (min 3 for telephone). |
| `client/src/pages/TelephonePhase.jsx` | **New.** Singing phase: YouTube/audio playback, recording UI, lyrics display. |
| `client/src/pages/TelephoneGuess.jsx` | **New.** Guess phase: audio playback, text input. |
| `client/src/pages/TelephoneResults.jsx` | **New.** Chain auto-playback, free replay, host advance, game over. |
| `server/tests/gameManager.test.js` | Update for refactored GameManager. |
| `server/tests/telephone.test.js` | **New.** Tests for rotation, phase transitions, recording storage, guess collection. |
| `server/tests/lyricsGuess.test.js` | **New.** Existing game logic tests migrated from gameManager.test.js. |

---

## Out of Scope

- No scoring in telephone mode
- No visual indication of whether a recording was auto-submitted or explicitly submitted
- No server-side audio processing or format conversion
- No peer-to-peer audio transfer — all recordings go through the server
- No changes to the existing lyrics-guess mode behavior
- No mobile-specific recording UI optimizations (standard MediaRecorder API)
