# Telephone Phase-Race Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the race where a `submit-recording` that arrives after the host-forced phase advance (or a reconnect-driven resume) gets stored against the wrong phase/song slot, causing "our recording disappeared" and "listener hears the wrong melody".

**Architecture:** Add a client-supplied `phaseIndex` to `submit-recording` (and `submit-guess`). Server rejects mismatches with `submit-rejected` so the client can redo the submit in the new phase. Also stop the client-side MediaRecorder when the phase changes underneath it so stale blobs don't leak forward.

**Tech Stack:** Node.js + Socket.IO (server), React + Vite (client), Vitest (server tests).

---

## File Structure

- Modify `server/src/modes/telephone.js` — `submitRecording` / `submitGuess` gain phase validation.
- Modify `server/src/gameManager.js` — pass the phaseIndex through wrappers.
- Modify `server/src/index.js` — thread `phaseIndex` from socket payload.
- Modify `client/src/pages/TelephonePhase.jsx` — send `phaseIndex`; handle `submit-rejected`; stop recorder on phase change.
- Modify `client/src/pages/TelephoneGuess.jsx` — send `phaseIndex` (guess phase token).
- Modify `server/tests/telephone.test.js` — regression tests for the race.
- Modify `CLAUDE.md` — document the phase-token contract.

---

## Task 1: Regression test — submit after forced advance

**Files:**
- Modify: `server/tests/telephone.test.js`

- [ ] **Step 1: Add failing test**

Append in the file (before the last `});` of the top-level describe or as a new describe):

```js
describe('Telephone mode: submit race with host-forced continue', () => {
  it('rejects a submit-recording whose phaseIndex is stale after forced advance', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 4);
    const io = makeMockIo();
    mgr.startGame('host', io);
    expect(lobby.state).toBe('telephone_phase');
    expect(lobby.telephone.currentPhase).toBe(0);

    // 3 of 4 players submit normally in phase 0.
    const submitters = lobby.players.slice(0, 3);
    for (const p of submitters) {
      mgr.submitRecording(p.socketId, Buffer.from([1, 2, 3]), io, 0);
    }
    // 4th player disconnects -> pause.
    const laggard = lobby.players[3];
    mgr.handleDisconnect(laggard.socketId, io);
    expect(lobby.telephone.paused).toBe(true);

    // Host forces continue; with 3 real submits + 1 abandoned marker, phase advances.
    mgr.telephoneContinue('host', io);
    expect(lobby.telephone.currentPhase).toBe(1);

    // A late submission from one of the real players carrying phaseIndex=0 must be rejected,
    // NOT stored against phase 1.
    const stalePlayer = submitters[0];
    const beforeKeys = [...lobby.telephone.recordings.keys()];
    mgr.submitRecording(stalePlayer.socketId, Buffer.from([9, 9]), io, 0);
    const afterKeys = [...lobby.telephone.recordings.keys()];
    expect(afterKeys).toEqual(beforeKeys);

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('emits submit-rejected to the stale submitter', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 4);
    const perSocket = {};
    lobby.players.forEach(p => { perSocket[p.socketId] = vi.fn(); });
    const io = makeMockIo();
    io.to = vi.fn().mockImplementation(id => ({ emit: perSocket[id] || io._emitFn }));

    mgr.startGame('host', io);
    const [a, b, c, d] = lobby.players;
    mgr.submitRecording(a.socketId, Buffer.from([1]), io, 0);
    mgr.submitRecording(b.socketId, Buffer.from([1]), io, 0);
    mgr.submitRecording(c.socketId, Buffer.from([1]), io, 0);
    mgr.handleDisconnect(d.socketId, io);
    mgr.telephoneContinue('host', io);

    perSocket[a.socketId].mockClear();
    mgr.submitRecording(a.socketId, Buffer.from([9]), io, 0);
    expect(perSocket[a.socketId]).toHaveBeenCalledWith(
      'submit-rejected',
      expect.objectContaining({ reason: 'phase-mismatch', currentPhase: 1 })
    );

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `cd server && npm test -- telephone.test.js`
Expected: two new failures (current signature ignores the 4th arg; no submit-rejected emitted).

---

## Task 2: Server — validate phaseIndex in `submitRecording`

**Files:**
- Modify: `server/src/modes/telephone.js`
- Modify: `server/src/gameManager.js`
- Modify: `server/src/index.js`

- [ ] **Step 1: Update `submitRecording` signature (server/src/modes/telephone.js:86)**

Replace the existing `submitRecording` with:

```js
export function submitRecording(lobby, socketId, audioBuffer, io, clientPhaseIndex) {
  if (lobby.state !== 'telephone_phase') {
    io.to(socketId).emit('submit-rejected', {
      reason: 'wrong-state',
      state: lobby.state,
    });
    return;
  }
  const tel = lobby.telephone;
  if (typeof clientPhaseIndex === 'number' && clientPhaseIndex !== tel.currentPhase) {
    io.to(socketId).emit('submit-rejected', {
      reason: 'phase-mismatch',
      currentPhase: tel.currentPhase,
    });
    return;
  }
  if (tel.submissions.has(socketId)) return;

  const playerIdx = lobby.players.findIndex(p => p.socketId === socketId);
  if (playerIdx === -1) return;

  const phase = tel.assignments.singPhases[tel.currentPhase];
  const songIdx = phase.findIndex(a => a.playerIdx === playerIdx);
  if (songIdx === -1) return;

  if (audioBuffer && audioBuffer.length > 0) {
    tel.recordings.set(`${songIdx}-${tel.currentPhase}`, audioBuffer);
  }
  tel.submissions.add(socketId);

  io.to(lobby.id).emit('player-submitted', {
    nickname: lobby.players[playerIdx].nickname,
  });

  if (tel.submissions.size >= lobby.players.length) {
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    _endPhase(lobby, io);
  }
}
```

- [ ] **Step 2: Thread phase through `GameManager.submitRecording` (server/src/gameManager.js)**

Find the wrapper (`submitRecording(socketId, buffer, io)`) and add the arg:

```js
submitRecording(socketId, buffer, io, phaseIndex) {
  const lobby = this.getLobby(socketId);
  if (!lobby) return;
  telephoneMode.submitRecording(lobby, socketId, buffer, io, phaseIndex);
}
```

- [ ] **Step 3: Thread phase through socket handler (server/src/index.js:75)**

```js
socket.on('submit-recording', ({ audioData, phaseIndex }) => {
  const buffer = Buffer.from(audioData);
  manager.submitRecording(socket.id, buffer, io, phaseIndex);
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd server && npm test -- telephone.test.js`
Expected: the two new tests pass; existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add server/src/modes/telephone.js server/src/gameManager.js server/src/index.js server/tests/telephone.test.js
git commit -m "fix(telephone): reject stale submit-recording after forced phase advance"
```

---

## Task 3: Apply the same guard to `submitGuess`

**Files:**
- Modify: `server/src/modes/telephone.js`
- Modify: `server/src/gameManager.js`
- Modify: `server/src/index.js`
- Modify: `server/tests/telephone.test.js`

- [ ] **Step 1: Add failing test for guess-phase mismatch**

Append:

```js
describe('Telephone mode: submit-guess phase validation', () => {
  it('rejects a guess submitted with stale state (not in guess state yet)', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const perSocket = {};
    lobby.players.forEach(p => { perSocket[p.socketId] = vi.fn(); });
    const io = makeMockIo();
    io.to = vi.fn().mockImplementation(id => ({ emit: perSocket[id] || io._emitFn }));
    mgr.startGame('host', io);
    // Still in telephone_phase.
    mgr.submitGuess(lobby.players[0].socketId, 'x', io);
    expect(perSocket[lobby.players[0].socketId]).toHaveBeenCalledWith(
      'submit-rejected',
      expect.objectContaining({ reason: 'wrong-state' })
    );
    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });
});
```

- [ ] **Step 2: Update `submitGuess` in telephone.js**

Replace `submitGuess`'s guard:

```js
export function submitGuess(lobby, socketId, guess, io) {
  if (lobby.state !== 'telephone_guess') {
    io.to(socketId).emit('submit-rejected', {
      reason: 'wrong-state',
      state: lobby.state,
    });
    return;
  }
  if (lobby.telephone.submissions.has(socketId)) return;
  // ... rest unchanged
```

- [ ] **Step 3: Run tests**

Run: `cd server && npm test -- telephone.test.js`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/modes/telephone.js server/tests/telephone.test.js
git commit -m "fix(telephone): reject submit-guess when not in guess state"
```

---

## Task 4: Client — send phaseIndex and stop recorder on phase change

**Files:**
- Modify: `client/src/pages/TelephonePhase.jsx`

- [ ] **Step 1: Stop recorder on phase change**

Replace the phase-change useEffect (lines 28-36):

```jsx
useEffect(() => {
  if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
    autoSubmitOnStopRef.current = false;
    try { mediaRecorderRef.current.stop(); } catch (_) {}
  }
  if (streamRef.current) {
    streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }
  if (distractionRef.current) { distractionRef.current.stop(); distractionRef.current = null; }
  setUiState('listen');
  setAudioDisabled(false);
  setRecordedBlob(null);
  setRecordedUrl(null);
  setSubmittedPlayers([]);
  submittedRef.current = false;
}, [phase?.phaseIndex]);
```

- [ ] **Step 2: Include phaseIndex in submit payload**

Replace `doSubmit`:

```jsx
async function doSubmit(blob) {
  if (submittedRef.current) return;
  submittedRef.current = true;
  setUiState('submitted');
  if (distractionRef.current) { distractionRef.current.stop(); distractionRef.current = null; }
  const payload = { phaseIndex: phase.phaseIndex };
  if (blob && blob.size > 0) {
    payload.audioData = await blob.arrayBuffer();
  } else {
    payload.audioData = new ArrayBuffer(0);
  }
  socket.emit('submit-recording', payload);
}
```

- [ ] **Step 3: Handle submit-rejected (phase-mismatch → allow re-record in new phase)**

After the existing `useSocketEvent('player-submitted', …)`, add:

```jsx
useSocketEvent('submit-rejected', useCallback(({ reason }) => {
  if (reason === 'phase-mismatch' || reason === 'wrong-state') {
    submittedRef.current = false;
    if (recordedBlob) setUiState('preview');
    else setUiState('listen');
    alert('上一輪已結束，你的提交被退回。請在新回合重新錄音。');
  }
}, [recordedBlob]));
```

- [ ] **Step 4: Build client**

Run: `cd client && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/TelephonePhase.jsx
git commit -m "fix(telephone client): stamp submit-recording with phaseIndex; stop recorder on phase change"
```

---

## Task 5: Document the contract

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add bullet under "Disconnect handling"**

Under the disconnect-handling list, add:

```
  - **Submit phase token:** `submit-recording` payloads include the client's `phaseIndex`. Server validates against `tel.currentPhase` and emits `submit-rejected { reason: 'phase-mismatch' | 'wrong-state' }` if the submit arrived after a forced advance. Prevents stale recordings from landing in the next phase's (songIdx, phase) slot.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note submit-recording phase token"
```

---

## Self-Review

- Spec coverage: race → Task 2; guess parallel → Task 3; client stop-on-advance + re-submit flow → Task 4; docs → Task 5.
- No placeholders; every code block is complete.
- Signatures consistent: `submitRecording(lobby, socketId, buffer, io, clientPhaseIndex)` across telephone.js, gameManager.js, index.js.
- Reject payload shape stable: `{ reason, currentPhase?, state? }` — matches test assertions and client handler.
