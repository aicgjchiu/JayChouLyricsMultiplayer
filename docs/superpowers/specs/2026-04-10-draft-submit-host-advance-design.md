---
title: Draft Auto-Submit & Host-Controlled Reveal Advance
date: 2026-04-10
status: approved
---

## Problem Summary

1. **Draft auto-submit on timeout**: When the timer expires, players who haven't explicitly submitted lose all their typed work. Their answer is treated as empty. The desired behavior: use whatever the player has typed as their answer, but with no speed bonus (since they didn't submit in time).

2. **Auto-countdown on reveal**: After each question, the reveal screen counts down 5 seconds and auto-advances to the next question. The host has no control over pacing. The desired behavior: display results indefinitely until the host explicitly clicks "Next Question."

---

## Design

### Feature 1: Draft Auto-Submit on Timeout

**Scoring math:** `calculateScore()` already returns `speedBonus = 0` when `submittedMs === null`. No changes needed to scoring logic.

**Client — `client/src/pages/Game.jsx`:**
- On every textarea change (when player has not yet explicitly submitted), emit `socket.emit('update-draft', { answer })`.
- When the player explicitly submits via the submit button, stop sending drafts (already handled by `submitted` state disabling the textarea).

**Server — `server/src/gameManager.js`:**
- Add `playerDrafts: new Map()` to the lobby object (socketId → latest draft string).
- Add `updateDraft(socketId, answer)` method: stores the latest draft for the socket's current lobby if the game is `in_question` and the player hasn't already explicitly submitted.
- Clear `playerDrafts` at the start of each question in `_startQuestion`.
- In `_endQuestion`: for each player not found in `currentAnswers`, look up their latest draft in `playerDrafts`. Score it with `submittedMs = null` (accuracy score only, zero speed bonus). Empty string if no draft exists.

**Server — `server/src/index.js`:**
- Add `socket.on('update-draft', ({ answer }) => manager.updateDraft(socket.id, answer, io))`.

---

### Feature 2: Host-Controlled Reveal Advance

**Server — `server/src/gameManager.js`:**
- Remove the `setTimeout` / `revealTimer` in `_endQuestion`. The lobby stays in `'reveal'` state indefinitely until the host advances.
- Add `nextQuestion(socketId, io)` method: validates that the caller is the host and that the lobby is in `'reveal'` state, then calls `_nextQuestion`.
- Keep `revealTimer: null` in the lobby object (field stays, just always null) so existing null-check cleanup calls in `leaveLobby` and `_closeLobby` remain safe no-ops.

**Server — `server/src/index.js`:**
- Add `socket.on('next-question', () => manager.nextQuestion(socket.id, io))`.

**Client — `client/src/pages/Reveal.jsx`:**
- Remove the countdown `useState` and `useEffect`.
- Remove the "下一題將在 N 秒後開始..." text.
- Accept `lobby` and `nickname` props (already passed via `...sharedProps` from `App.jsx`).
- Show a "下一題 ▶" button when `lobby?.hostSocketId === socket.id` (import `socket` from `../socket.js`).
- The button emits `socket.emit('next-question')`.
- Non-host players see a "等待房主繼續..." message instead.

---

## Files Changed

| File | Change |
|------|--------|
| `server/src/gameManager.js` | Add `playerDrafts` to lobby; add `updateDraft()`; use drafts in `_endQuestion`; remove revealTimer setTimeout; add `nextQuestion()` |
| `server/src/index.js` | Add `update-draft` and `next-question` handlers |
| `server/tests/gameManager.test.js` | Tests for `updateDraft` and `nextQuestion` |
| `client/src/pages/Game.jsx` | Emit `update-draft` on textarea change |
| `client/src/pages/Reveal.jsx` | Remove countdown; add host "Next" button / non-host waiting message |

---

## Out of Scope

- No changes to how explicitly-submitted answers are scored
- No visual indication to other players that a draft was auto-submitted vs. explicitly submitted
- No server-side debouncing of draft updates (at most 8 players, negligible traffic)
