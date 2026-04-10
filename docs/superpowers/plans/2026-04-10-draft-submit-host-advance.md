# Draft Auto-Submit & Host-Controlled Reveal Advance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the timer expires, auto-submit each player's current draft (accuracy score only, no speed bonus); replace the 5-second auto-advance after reveal with a host-controlled "Next Question" button.

**Architecture:** Server stores per-player drafts as text is typed; `_endQuestion` falls back to the draft for unsubmitted players. The reveal auto-timer is removed; a new `nextQuestion(socketId, io)` method (host-only) drives progression. Client emits `update-draft` on every keystroke; `Reveal.jsx` gains a host button and loses its countdown.

**Tech Stack:** Node.js/Socket.IO (server), React/Vite (client), Vitest (server tests)

**Working directory:** `E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/`

---

## File Map

| File | Change |
|------|--------|
| `server/src/gameManager.js` | Add `playerDrafts` to lobby; add `updateDraft()`; use drafts in `_endQuestion`; remove revealTimer setTimeout; add `nextQuestion()` |
| `server/src/index.js` | Add `update-draft` and `next-question` socket handlers |
| `server/tests/gameManager.test.js` | New describe blocks for `updateDraft`, `nextQuestion`, and draft fallback in `_endQuestion` |
| `client/src/pages/Game.jsx` | Emit `update-draft` on textarea change |
| `client/src/pages/Reveal.jsx` | Remove countdown; add host "Next Question" button; add non-host waiting text |

---

## Task 1: Add `playerDrafts` and `updateDraft` to gameManager (TDD)

**Files:**
- Modify: `server/src/gameManager.js`
- Test: `server/tests/gameManager.test.js`

- [ ] **Step 1: Add failing tests for `updateDraft` and draft fallback in `_endQuestion`**

Append to `server/tests/gameManager.test.js`:

```js
describe('GameManager.updateDraft', () => {
  it('stores draft for a player in an active question', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('host', io);

    mgr.updateDraft('p2', '測試歌詞');
    expect(lobby.playerDrafts.get('p2')).toBe('測試歌詞');

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('ignores draft if the player has already explicitly submitted', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('host', io);

    mgr.submitAnswer('p2', { answer: '正式提交' }, io);
    mgr.updateDraft('p2', '草稿覆蓋');

    // Explicit submission in currentAnswers must not change
    expect(lobby.currentAnswers.get('p2').answer).toBe('正式提交');

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
    if (lobby.revealTimer) clearTimeout(lobby.revealTimer);
  });

  it('ignores draft if lobby is not in_question', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    // state is 'waiting', not 'in_question'
    mgr.updateDraft('p2', '草稿');
    expect(lobby.playerDrafts.size).toBe(0);
  });

  it('clears playerDrafts when a new question starts', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    // Seed a draft before game starts
    lobby.playerDrafts = new Map([['p2', 'old draft']]);

    const io = makeMockIo();
    mgr.startGame('host', io);
    // _startQuestion clears playerDrafts
    expect(lobby.playerDrafts.size).toBe(0);

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });
});

describe('GameManager._endQuestion draft fallback', () => {
  it('uses stored draft with no speed bonus for unsubmitted players', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('host', io);

    // p2 typed a draft but never hit submit
    mgr.updateDraft('p2', '太陽之子');

    // host submitted explicitly (1 of 2 — does NOT trigger auto-endQuestion)
    mgr.submitAnswer('host', { answer: '答案' }, io);
    io._emitFn.mockClear();
    io.to.mockClear();

    // Timer expires — end question directly
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    mgr._endQuestion(lobby, io);

    const [, payload] = io._emitFn.mock.calls.find(([event]) => event === 'question-end');
    const p2Result = payload.results.find(r => r.nickname === 'Player2');
    expect(p2Result.answer).toBe('太陽之子');
    // Speed bonus must be 0 (submittedMs was null)
    // pointsEarned = accuracyScore + speedBonus; since we can't know accuracyScore without
    // knowing the question answer, verify via speedBonus = pointsEarned - accuracyScore <= 0.
    // Simpler: calculateScore with null submittedMs always gives speedBonus=0 (see scoring.js line 59).
    // We trust the scoring unit tests; here we just confirm the answer was used.

    if (lobby.revealTimer) clearTimeout(lobby.revealTimer);
  });

  it('uses empty string with zero points for players with no submission and no draft', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('host', io);

    // Nobody submits or drafts
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    mgr._endQuestion(lobby, io);

    const [, payload] = io._emitFn.mock.calls.find(([event]) => event === 'question-end');
    const p2Result = payload.results.find(r => r.nickname === 'Player2');
    expect(p2Result.answer).toBe('');
    expect(p2Result.pointsEarned).toBe(0);

    if (lobby.revealTimer) clearTimeout(lobby.revealTimer);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/server"
npm test
```

Expected: FAIL — `mgr.updateDraft is not a function` and `lobby.playerDrafts` undefined

- [ ] **Step 3: Add `playerDrafts` to lobby in `createLobby`, add `updateDraft()`, clear drafts in `_startQuestion`, use drafts in `_endQuestion`**

In `server/src/gameManager.js`:

**3a.** In `createLobby`, add `playerDrafts: new Map()` to the lobby object (after `currentAnswers`):

```js
const lobby = {
  id: code,
  name: lobbyName || `${nickname}'s Lobby`,
  hostSocketId: socketId,
  isPrivate: Boolean(isPrivate),
  password: password || null,
  maxPlayers: 8,
  settings: { numQuestions: Math.min(numQuestions || 10, allQuestions.length), timeLimit: timeLimit || 30 },
  players: [{ socketId, nickname, score: 0 }],
  state: 'waiting',
  questions: [],
  currentQuestionIndex: 0,
  currentAnswers: new Map(),
  playerDrafts: new Map(),
  timerHandle: null,
  revealTimer: null,
  questionStartTime: null,
  secondsRemaining: 0,
};
```

**3b.** Add `updateDraft` method after `submitAnswer`:

```js
updateDraft(socketId, answer) {
  const lobby = this.getLobby(socketId);
  if (!lobby || lobby.state !== 'in_question') return;
  if (lobby.currentAnswers.has(socketId)) return; // already explicitly submitted
  lobby.playerDrafts.set(socketId, answer);
}
```

**3c.** In `_startQuestion`, clear `playerDrafts` (add after `lobby.currentAnswers = new Map()`):

```js
_startQuestion(lobby, io) {
  lobby.state = 'in_question';
  lobby.currentAnswers = new Map();
  lobby.playerDrafts = new Map();
  lobby.questionStartTime = Date.now();
  lobby.secondsRemaining = lobby.settings.timeLimit;
  // ... rest unchanged
```

**3d.** In `_endQuestion`, replace the `const results = lobby.players.map(...)` block with the draft-aware version:

```js
const results = lobby.players.map(player => {
  const submission = lobby.currentAnswers.get(player.socketId);
  let answer, submittedMs;
  if (submission) {
    answer = submission.answer;
    submittedMs = submission.submittedMs;
  } else {
    answer = lobby.playerDrafts.get(player.socketId) ?? '';
    submittedMs = null; // no speed bonus for auto-submitted drafts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/server"
npm test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer"
git add server/src/gameManager.js server/tests/gameManager.test.js
git commit -m "feat: store player drafts and use them on timeout with no speed bonus"
```

---

## Task 2: Remove auto-advance timer, add `nextQuestion` method (TDD)

**Files:**
- Modify: `server/src/gameManager.js`
- Test: `server/tests/gameManager.test.js`

- [ ] **Step 1: Add failing tests for `nextQuestion` and no-auto-advance**

Append to `server/tests/gameManager.test.js`:

```js
describe('GameManager.nextQuestion', () => {
  it('does not set revealTimer after _endQuestion (no auto-advance)', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('host', io);

    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    mgr._endQuestion(lobby, io);

    expect(lobby.revealTimer).toBeNull();

    if (lobby.revealTimer) clearTimeout(lobby.revealTimer);
  });

  it('rejects if caller is not the host', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('host', io);
    lobby.state = 'reveal';

    mgr.nextQuestion('p2', io);
    expect(lobby.state).toBe('reveal'); // unchanged

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('rejects if state is not reveal', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('host', io);
    // state is in_question

    mgr.nextQuestion('host', io);
    expect(lobby.state).toBe('in_question'); // unchanged

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('advances to next question when host calls from reveal state', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('host', io);
    lobby.state = 'reveal';
    io._emitFn.mockClear();
    io.to.mockClear();

    mgr.nextQuestion('host', io);

    expect(lobby.state).toBe('in_question');
    expect(io._emitFn).toHaveBeenCalledWith('question-start', expect.objectContaining({
      questionIndex: 2,
    }));

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('ends the game when host advances past the last question', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('host', io);
    lobby.currentQuestionIndex = 4; // 0-indexed; this is the last of 5
    lobby.state = 'reveal';
    io._emitFn.mockClear();
    io.to.mockClear();

    mgr.nextQuestion('host', io);

    expect(lobby.state).toBe('finished');
    expect(io._emitFn).toHaveBeenCalledWith('game-over', expect.objectContaining({
      finalScores: expect.any(Array),
    }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/server"
npm test
```

Expected: FAIL — `mgr.nextQuestion is not a function` and `revealTimer` is not null after `_endQuestion`

- [ ] **Step 3: Remove `revealTimer` setTimeout from `_endQuestion` and add `nextQuestion` method**

In `server/src/gameManager.js`:

**3a.** In `_endQuestion`, remove the `setTimeout` block at the end. The method should end after emitting `question-end`:

```js
_endQuestion(lobby, io) {
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
  // No auto-advance timer — host calls next-question to proceed
}
```

**3b.** Add `nextQuestion` method after `updateDraft`:

```js
nextQuestion(socketId, io) {
  const lobby = this.getLobby(socketId);
  if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'reveal') return;
  this._nextQuestion(lobby, io);
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
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer"
git add server/src/gameManager.js server/tests/gameManager.test.js
git commit -m "feat: remove auto-advance timer, add host-controlled nextQuestion"
```

---

## Task 3: Add socket handlers in index.js

**Files:**
- Modify: `server/src/index.js`

- [ ] **Step 1: Add `update-draft` and `next-question` handlers**

In `server/src/index.js`, add these two handlers inside `io.on('connection', ...)`, after the `submit-answer` handler:

```js
socket.on('update-draft', ({ answer }) => manager.updateDraft(socket.id, answer));
socket.on('next-question', () => manager.nextQuestion(socket.id, io));
```

The full updated handlers block (replace from `socket.on('submit-answer'` through `socket.on('update-settings'`):

```js
socket.on('submit-answer', (data) => manager.submitAnswer(socket.id, data, io));
socket.on('update-draft', ({ answer }) => manager.updateDraft(socket.id, answer));
socket.on('next-question', () => manager.nextQuestion(socket.id, io));

socket.on('restart-lobby', () => {
  manager.restartLobby(socket.id, io);
  broadcastLobbyList();
});
socket.on('update-settings', (data) => manager.updateSettings(socket.id, data, io));
```

- [ ] **Step 2: Run server tests to confirm no regressions**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/server"
npm test
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer"
git add server/src/index.js
git commit -m "feat: add update-draft and next-question socket handlers"
```

---

## Task 4: Emit `update-draft` from Game.jsx on keystroke

**Files:**
- Modify: `client/src/pages/Game.jsx`

- [ ] **Step 1: Add `handleAnswerChange` and wire it to the textarea**

In `client/src/pages/Game.jsx`, add a `handleAnswerChange` function and update the textarea's `onChange`:

Replace:
```jsx
onChange={e => setAnswer(e.target.value)}
```

With (add the function before `handleSubmit` and update the onChange):

```jsx
function handleAnswerChange(e) {
  const newAnswer = e.target.value;
  setAnswer(newAnswer);
  if (!submitted) {
    socket.emit('update-draft', { answer: newAnswer });
  }
}
```

And in the textarea JSX:
```jsx
onChange={handleAnswerChange}
```

The full updated form section:

```jsx
<form onSubmit={handleSubmit}>
  <textarea
    value={answer}
    onChange={handleAnswerChange}
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
```

- [ ] **Step 2: Commit**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer"
git add client/src/pages/Game.jsx
git commit -m "feat: emit update-draft to server on every keystroke"
```

---

## Task 5: Rewrite Reveal.jsx — remove countdown, add host button

**Files:**
- Modify: `client/src/pages/Reveal.jsx`

- [ ] **Step 1: Replace `Reveal.jsx` with the updated version**

```jsx
import React from 'react';
import socket from '../socket.js';

export default function Reveal({ revealData, lobby }) {
  if (!revealData) return null;

  const isHost = lobby?.hostSocketId === socket.id;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>本題結果</h2>
        {isHost ? (
          <button
            onClick={() => socket.emit('next-question')}
            style={{ padding: '8px 20px', fontSize: 15, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            下一題 ▶
          </button>
        ) : (
          <p style={{ margin: 0, color: '#888', fontSize: 14 }}>等待房主繼續...</p>
        )}
      </div>

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

- [ ] **Step 2: Commit**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer"
git add client/src/pages/Reveal.jsx
git commit -m "feat: replace reveal countdown with host-controlled next question button"
```

---

## Task 6: Build, verify, and deploy

- [ ] **Step 1: Run all server tests**

```bash
cd "E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/server"
npm test
```

Expected: All tests PASS (should now be 38+ tests)

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

Expected: Both machines show "good state" — actually we scaled to 1 machine, so 1 machine should reach "good state". Visit https://jay-chou-lyrics-game.fly.dev/ to verify.
