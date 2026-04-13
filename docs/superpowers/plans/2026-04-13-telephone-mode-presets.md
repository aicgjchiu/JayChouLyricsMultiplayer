# Telephone Mode Preset & Recording Configs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three host-configurable options to 音樂傳聲筒 (telephone) mode — audio-lock-on-record, 伴唱模式 (sing-along button), and music distraction — plus a preset dropdown (新手版 / 困難版 / 地獄版 / Custom) that snaps these configs to predefined bundles and auto-switches to Custom when the host edits any individual config.

**Architecture:** All three flags plus the preset label live in `lobby.settings`. Server treats them as pure data — only validates and broadcasts. Presets are defined in one shared module (`shared/telephonePresets.js`) imported by both client and server for consistency. Client UI (MainMenu + Lobby) renders a `<select>` for the preset and three checkboxes for the individual flags; toggling a flag re-runs a `derivePresetLabel()` helper and stamps `'custom'` when no preset matches. `TelephonePhase.jsx` reads the three flags and changes recording behavior: skips `audioDisabled`, exposes a "伴唱模式" button, and runs a distraction scheduler.

**Tech Stack:** Node.js + Socket.IO (server), React/Vite (client), Vitest (server tests). No new dependencies. Distraction audio reuses existing `audio/*.mp3` clips from lyrics-guess mode.

---

## File Structure

**New files:**
- `shared/telephonePresets.js` — Preset definitions + `getPresetConfig(name)` + `derivePresetLabel(config)` helpers. Imported by client and server.
- `client/src/components/TelephoneModeSettings.jsx` — Shared UI component rendering the preset dropdown + three toggles; used by both MainMenu and Lobby.
- `client/src/distraction.js` — `DistractionScheduler` class that plays random audio clips at random intervals via a hidden `<audio>` element.
- `server/tests/telephonePresets.test.js` — Unit tests for preset helpers.

**Modified files:**
- `server/src/gameManager.js` — Extend `createLobby` and `updateSettings` to accept + persist three new fields + `telephoneModeLabel`. Re-derive label server-side on update as a sanity check.
- `client/src/pages/MainMenu.jsx` — Add `<TelephoneModeSettings>` into the create-lobby form (visible only when `gameMode === 'telephone'`). Include new fields in `create-lobby` payload.
- `client/src/pages/Lobby.jsx` — Add `<TelephoneModeSettings>` in the settings panel (host edits; non-hosts see read-only).
- `client/src/pages/TelephonePhase.jsx` — Read `lobby.settings.audioLockOnRecord`, `singalongEnabled`, `distractionEnabled`. Conditionally skip audio-disable, render 伴唱模式 button, start/stop `DistractionScheduler`.

---

## Shared Preset Definitions

The three flags and four preset labels used throughout the plan:

| Flag | Type | Default |
|---|---|---|
| `audioLockOnRecord` | boolean | `true` (preserves current behavior) |
| `singalongEnabled` | boolean | `false` |
| `distractionEnabled` | boolean | `false` |
| `telephoneModeLabel` | `'novice' \| 'hard' \| 'hell' \| 'custom'` | `'custom'` (when flags don't match a preset) |

Presets (as spelled out by user):

| Preset | audioLockOnRecord | singalongEnabled | distractionEnabled |
|---|---|---|---|
| novice (新手版) | `true` | `true` | `false` |
| hard (困難版) | `false` | `false` | `false` |
| hell (地獄版) | `false` | `false` | `true` |

**Invariant:** `singalongEnabled` is only meaningful when `audioLockOnRecord === true`. When `audioLockOnRecord === false`, the client UI hides the singalong row and the server coerces `singalongEnabled` to `false` before computing the label. This prevents a "custom" label from sticking when a user unchecks audioLock (which implicitly clears singalong).

---

## Task 1: Shared preset module

**Files:**
- Create: `shared/telephonePresets.js`
- Test: `server/tests/telephonePresets.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// server/tests/telephonePresets.test.js
import { describe, it, expect } from 'vitest';
import {
  TELEPHONE_PRESETS,
  getPresetConfig,
  derivePresetLabel,
  normalizeTelephoneConfig,
} from '../../shared/telephonePresets.js';

describe('telephonePresets', () => {
  it('returns exact flag bundles for each named preset', () => {
    expect(getPresetConfig('novice')).toEqual({
      audioLockOnRecord: true, singalongEnabled: true, distractionEnabled: false,
    });
    expect(getPresetConfig('hard')).toEqual({
      audioLockOnRecord: false, singalongEnabled: false, distractionEnabled: false,
    });
    expect(getPresetConfig('hell')).toEqual({
      audioLockOnRecord: false, singalongEnabled: false, distractionEnabled: true,
    });
  });

  it('returns null for unknown preset names (including "custom")', () => {
    expect(getPresetConfig('custom')).toBe(null);
    expect(getPresetConfig('bogus')).toBe(null);
  });

  it('derives the matching preset label from a flag bundle', () => {
    expect(derivePresetLabel({ audioLockOnRecord: true, singalongEnabled: true, distractionEnabled: false })).toBe('novice');
    expect(derivePresetLabel({ audioLockOnRecord: false, singalongEnabled: false, distractionEnabled: true })).toBe('hell');
  });

  it('returns "custom" when no preset matches', () => {
    expect(derivePresetLabel({ audioLockOnRecord: true, singalongEnabled: false, distractionEnabled: true })).toBe('custom');
  });

  it('normalizeTelephoneConfig coerces singalong=false when audioLock=false', () => {
    const out = normalizeTelephoneConfig({ audioLockOnRecord: false, singalongEnabled: true, distractionEnabled: false });
    expect(out.singalongEnabled).toBe(false);
  });

  it('normalizeTelephoneConfig stamps the correct label', () => {
    const out = normalizeTelephoneConfig({ audioLockOnRecord: true, singalongEnabled: true, distractionEnabled: false });
    expect(out.telephoneModeLabel).toBe('novice');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/telephonePresets.test.js`
Expected: FAIL with "Cannot find module '../../shared/telephonePresets.js'".

- [ ] **Step 3: Create the shared module**

```js
// shared/telephonePresets.js
export const TELEPHONE_PRESETS = {
  novice: { audioLockOnRecord: true,  singalongEnabled: true,  distractionEnabled: false },
  hard:   { audioLockOnRecord: false, singalongEnabled: false, distractionEnabled: false },
  hell:   { audioLockOnRecord: false, singalongEnabled: false, distractionEnabled: true  },
};

export function getPresetConfig(name) {
  return TELEPHONE_PRESETS[name] ? { ...TELEPHONE_PRESETS[name] } : null;
}

export function derivePresetLabel({ audioLockOnRecord, singalongEnabled, distractionEnabled }) {
  for (const [label, cfg] of Object.entries(TELEPHONE_PRESETS)) {
    if (cfg.audioLockOnRecord === audioLockOnRecord
        && cfg.singalongEnabled === singalongEnabled
        && cfg.distractionEnabled === distractionEnabled) {
      return label;
    }
  }
  return 'custom';
}

export function normalizeTelephoneConfig(raw) {
  const audioLockOnRecord = !!raw.audioLockOnRecord;
  const singalongEnabled = audioLockOnRecord ? !!raw.singalongEnabled : false;
  const distractionEnabled = !!raw.distractionEnabled;
  const cfg = { audioLockOnRecord, singalongEnabled, distractionEnabled };
  return { ...cfg, telephoneModeLabel: derivePresetLabel(cfg) };
}

export const DEFAULT_TELEPHONE_CONFIG = normalizeTelephoneConfig({
  audioLockOnRecord: true, singalongEnabled: false, distractionEnabled: false,
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/telephonePresets.test.js`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add shared/telephonePresets.js server/tests/telephonePresets.test.js
git commit -m "feat(telephone): add shared preset module with derive/normalize helpers"
```

---

## Task 2: Server-side settings persistence

**Files:**
- Modify: `server/src/gameManager.js:54-89` (createLobby), `server/src/gameManager.js:199-207` (updateSettings)
- Test: `server/tests/gameManager.telephoneConfig.test.js` (new)

- [ ] **Step 1: Write the failing tests**

```js
// server/tests/gameManager.telephoneConfig.test.js
import { describe, it, expect } from 'vitest';
import { GameManager } from '../src/gameManager.js';

function mkIo() { return { to: () => ({ emit: () => {} }) }; }

describe('telephone config in settings', () => {
  it('createLobby defaults telephone flags + label', () => {
    const m = new GameManager();
    const lobby = m.createLobby('s1', { nickname: 'A', gameMode: 'telephone' });
    expect(lobby.settings.audioLockOnRecord).toBe(true);
    expect(lobby.settings.singalongEnabled).toBe(false);
    expect(lobby.settings.distractionEnabled).toBe(false);
    expect(lobby.settings.telephoneModeLabel).toBe('custom'); // default doesn't match any preset
  });

  it('createLobby honors provided preset label by expanding to flags', () => {
    const m = new GameManager();
    const lobby = m.createLobby('s1', { nickname: 'A', gameMode: 'telephone', telephoneModeLabel: 'novice' });
    expect(lobby.settings.audioLockOnRecord).toBe(true);
    expect(lobby.settings.singalongEnabled).toBe(true);
    expect(lobby.settings.distractionEnabled).toBe(false);
    expect(lobby.settings.telephoneModeLabel).toBe('novice');
  });

  it('updateSettings recomputes label when flags change', () => {
    const m = new GameManager();
    const lobby = m.createLobby('s1', { nickname: 'A', gameMode: 'telephone', telephoneModeLabel: 'novice' });
    m.updateSettings('s1', { distractionEnabled: true }, mkIo());
    expect(lobby.settings.distractionEnabled).toBe(true);
    expect(lobby.settings.telephoneModeLabel).toBe('custom');
  });

  it('updateSettings with telephoneModeLabel expands to matching flags', () => {
    const m = new GameManager();
    const lobby = m.createLobby('s1', { nickname: 'A', gameMode: 'telephone' });
    m.updateSettings('s1', { telephoneModeLabel: 'hell' }, mkIo());
    expect(lobby.settings.audioLockOnRecord).toBe(false);
    expect(lobby.settings.singalongEnabled).toBe(false);
    expect(lobby.settings.distractionEnabled).toBe(true);
    expect(lobby.settings.telephoneModeLabel).toBe('hell');
  });

  it('updateSettings coerces singalong=false when audioLock=false', () => {
    const m = new GameManager();
    const lobby = m.createLobby('s1', { nickname: 'A', gameMode: 'telephone' });
    m.updateSettings('s1', { audioLockOnRecord: true, singalongEnabled: true, distractionEnabled: false }, mkIo());
    expect(lobby.settings.telephoneModeLabel).toBe('novice');
    m.updateSettings('s1', { audioLockOnRecord: false }, mkIo());
    expect(lobby.settings.singalongEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/gameManager.telephoneConfig.test.js`
Expected: FAIL — `audioLockOnRecord` is undefined / label not computed.

- [ ] **Step 3: Modify `createLobby` in `server/src/gameManager.js`**

At the top of the file, add the import:

```js
import { getPresetConfig, normalizeTelephoneConfig, DEFAULT_TELEPHONE_CONFIG } from '../../shared/telephonePresets.js';
```

Replace the `createLobby` signature and settings construction (lines 54–70):

```js
createLobby(socketId, {
  nickname, lobbyName, numQuestions, timeLimit, isPrivate, password, gameMode,
  phaseDuration, playerId,
  telephoneModeLabel, audioLockOnRecord, singalongEnabled, distractionEnabled,
}) {
  let code;
  do { code = generateCode(); } while (this.lobbies.has(code));

  // Resolve initial telephone config: preset label wins if provided, else individual flags, else defaults.
  const preset = telephoneModeLabel ? getPresetConfig(telephoneModeLabel) : null;
  const rawTel = preset ?? {
    audioLockOnRecord: audioLockOnRecord ?? DEFAULT_TELEPHONE_CONFIG.audioLockOnRecord,
    singalongEnabled: singalongEnabled ?? DEFAULT_TELEPHONE_CONFIG.singalongEnabled,
    distractionEnabled: distractionEnabled ?? DEFAULT_TELEPHONE_CONFIG.distractionEnabled,
  };
  const telCfg = normalizeTelephoneConfig(rawTel);

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
      ...telCfg,
    },
    // ... rest unchanged
```

Keep the remainder of the function body (players array, state, telephone fields, `this.lobbies.set`, etc.) exactly as it was.

- [ ] **Step 4: Modify `updateSettings` (lines 199–207)**

```js
updateSettings(socketId, data, io) {
  const lobby = this.getLobby(socketId);
  if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'waiting') return;
  if (data.numQuestions) lobby.settings.numQuestions = data.numQuestions;
  if (data.timeLimit) lobby.settings.timeLimit = data.timeLimit;
  if (data.phaseDuration) lobby.settings.phaseDuration = data.phaseDuration;
  if (data.gameMode) lobby.settings.gameMode = data.gameMode;

  // Telephone config: preset label expands to a flag bundle; individual flags patch existing values.
  const preset = data.telephoneModeLabel ? getPresetConfig(data.telephoneModeLabel) : null;
  const touched =
    preset !== null ||
    'audioLockOnRecord' in data ||
    'singalongEnabled' in data ||
    'distractionEnabled' in data;
  if (touched) {
    const base = preset ?? {
      audioLockOnRecord: lobby.settings.audioLockOnRecord,
      singalongEnabled: lobby.settings.singalongEnabled,
      distractionEnabled: lobby.settings.distractionEnabled,
    };
    const merged = preset ?? {
      ...base,
      ...('audioLockOnRecord' in data ? { audioLockOnRecord: !!data.audioLockOnRecord } : {}),
      ...('singalongEnabled' in data ? { singalongEnabled: !!data.singalongEnabled } : {}),
      ...('distractionEnabled' in data ? { distractionEnabled: !!data.distractionEnabled } : {}),
    };
    Object.assign(lobby.settings, normalizeTelephoneConfig(merged));
  }

  io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
}
```

- [ ] **Step 5: Run both test files to verify they pass**

Run: `cd server && npx vitest run tests/telephonePresets.test.js tests/gameManager.telephoneConfig.test.js`
Expected: all pass; no existing tests should regress. Also run `cd server && npm test` to make sure the full suite is green.

- [ ] **Step 6: Commit**

```bash
git add server/src/gameManager.js server/tests/gameManager.telephoneConfig.test.js
git commit -m "feat(server): persist telephone preset + flags in lobby settings"
```

---

## Task 3: Shared settings UI component

**Files:**
- Create: `client/src/components/TelephoneModeSettings.jsx`

- [ ] **Step 1: Create the component**

```jsx
// client/src/components/TelephoneModeSettings.jsx
import React from 'react';
import { TELEPHONE_PRESETS, getPresetConfig, derivePresetLabel } from '../../../shared/telephonePresets.js';

const PRESET_LABELS = { novice: '新手版', hard: '困難版', hell: '地獄版', custom: 'Custom' };

export default function TelephoneModeSettings({ config, onChange, disabled = false }) {
  // config shape: { audioLockOnRecord, singalongEnabled, distractionEnabled, telephoneModeLabel }
  const { audioLockOnRecord, singalongEnabled, distractionEnabled, telephoneModeLabel } = config;

  function applyPreset(label) {
    if (label === 'custom') {
      onChange({ ...config, telephoneModeLabel: 'custom' });
      return;
    }
    const preset = getPresetConfig(label);
    onChange({ ...preset, telephoneModeLabel: label });
  }

  function toggleFlag(key, value) {
    const next = {
      audioLockOnRecord, singalongEnabled, distractionEnabled,
      [key]: value,
    };
    // singalong only applies when audioLock is on
    if (!next.audioLockOnRecord) next.singalongEnabled = false;
    onChange({ ...next, telephoneModeLabel: derivePresetLabel(next) });
  }

  return (
    <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginTop: 12 }}>
      <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>遊戲難度</label>
      <select
        value={telephoneModeLabel}
        onChange={e => applyPreset(e.target.value)}
        disabled={disabled}
        style={{ padding: '6px 10px', fontSize: 14, marginBottom: 12 }}
      >
        {['novice', 'hard', 'hell', 'custom'].map(k => (
          <option key={k} value={k}>{PRESET_LABELS[k]}</option>
        ))}
      </select>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
        <label>
          <input type="checkbox" disabled={disabled}
            checked={audioLockOnRecord}
            onChange={e => toggleFlag('audioLockOnRecord', e.target.checked)} />
          {' '}開始錄音後停止播放音樂
        </label>

        {audioLockOnRecord && (
          <label style={{ marginLeft: 16 }}>
            <input type="checkbox" disabled={disabled}
              checked={singalongEnabled}
              onChange={e => toggleFlag('singalongEnabled', e.target.checked)} />
            {' '}伴唱模式（錄音時提供按鈕同步播放音樂）
          </label>
        )}

        <label>
          <input type="checkbox" disabled={disabled}
            checked={distractionEnabled}
            onChange={e => toggleFlag('distractionEnabled', e.target.checked)} />
          {' '}干擾音樂（錄音時隨機播放其他聲音）
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the client to verify no import errors**

Run: `cd client && npm run build`
Expected: build succeeds. (Visual testing happens in later tasks when it's wired in.)

- [ ] **Step 3: Commit**

```bash
git add client/src/components/TelephoneModeSettings.jsx
git commit -m "feat(client): add TelephoneModeSettings shared component"
```

---

## Task 4: Wire settings into MainMenu create form

**Files:**
- Modify: `client/src/pages/MainMenu.jsx:9-48`

- [ ] **Step 1: Extend the `form` state and payload**

Replace the initial `useState` call and `handleCreate` in `MainMenu.jsx`:

```jsx
import TelephoneModeSettings from '../components/TelephoneModeSettings.jsx';
import { DEFAULT_TELEPHONE_CONFIG } from '../../../shared/telephonePresets.js';

// ...inside component:
const [form, setForm] = useState({
  lobbyName: '', numQuestions: 10, timeLimit: 30, isPrivate: false, password: '',
  gameMode: 'lyrics-guess', phaseDuration: 90,
  ...DEFAULT_TELEPHONE_CONFIG, // audioLockOnRecord, singalongEnabled, distractionEnabled, telephoneModeLabel
});

function handleCreate(e) {
  e.preventDefault();
  if (!nickname.trim()) { setErrorMsg('請輸入暱稱'); return; }
  setErrorMsg('');
  socket.emit('create-lobby', {
    playerId: getPlayerId(),
    nickname: nickname.trim(),
    lobbyName: form.lobbyName || `${nickname.trim()}'s Lobby`,
    numQuestions: form.numQuestions,
    timeLimit: form.timeLimit,
    isPrivate: form.isPrivate,
    password: form.isPrivate ? form.password : null,
    gameMode: form.gameMode,
    phaseDuration: form.phaseDuration,
    telephoneModeLabel: form.telephoneModeLabel,
    audioLockOnRecord: form.audioLockOnRecord,
    singalongEnabled: form.singalongEnabled,
    distractionEnabled: form.distractionEnabled,
  });
}
```

- [ ] **Step 2: Render the component in the create form (telephone-only)**

Locate the form JSX where `gameMode === 'telephone'` branches exist (the phaseDuration select). Below that block, insert:

```jsx
{form.gameMode === 'telephone' && (
  <TelephoneModeSettings
    config={{
      audioLockOnRecord: form.audioLockOnRecord,
      singalongEnabled: form.singalongEnabled,
      distractionEnabled: form.distractionEnabled,
      telephoneModeLabel: form.telephoneModeLabel,
    }}
    onChange={next => setForm(f => ({ ...f, ...next }))}
  />
)}
```

- [ ] **Step 3: Test in browser**

Run: `cd server && node src/index.js` then open `http://localhost:3000`.
- Click 創房 → select 音樂傳聲筒 mode.
- Verify dropdown shows 新手版/困難版/地獄版/Custom.
- Select 新手版 → both checkboxes on top update (audioLock on, singalong on, distraction off).
- Uncheck distraction manually when on 新手版 (already off so pick another: check distraction on novice) → dropdown should flip to Custom.
- Create lobby → inspect `lobby.settings` via React DevTools or by logging in Lobby page.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/MainMenu.jsx
git commit -m "feat(client): add telephone preset settings to create-lobby form"
```

---

## Task 5: Wire settings into Lobby page

**Files:**
- Modify: `client/src/pages/Lobby.jsx` (around line 44 for `isTelephone` branch and line 54 for `handleSettingChange`)

- [ ] **Step 1: Import and render**

Add at the top:

```jsx
import TelephoneModeSettings from '../components/TelephoneModeSettings.jsx';
```

Below the existing phaseDuration select (line ~123), add:

```jsx
{isTelephone && (
  <TelephoneModeSettings
    disabled={!isHost}
    config={{
      audioLockOnRecord: lobby.settings.audioLockOnRecord ?? true,
      singalongEnabled: lobby.settings.singalongEnabled ?? false,
      distractionEnabled: lobby.settings.distractionEnabled ?? false,
      telephoneModeLabel: lobby.settings.telephoneModeLabel ?? 'custom',
    }}
    onChange={next => socket.emit('update-settings', { ...lobby.settings, ...next })}
  />
)}
```

(Use whatever variable the file already has for host-check. If there's no `isHost` constant, add one: `const isHost = lobby?.hostSocketId === socket.id;`.)

- [ ] **Step 2: Test in browser**

Start server, create a telephone lobby, observe:
- Host sees the dropdown/checkboxes and they're editable.
- Open a second browser tab as a non-host → joins the lobby → sees the controls disabled.
- Host picks 地獄版 → both tabs re-render showing distraction checked.
- Host toggles audioLockOnRecord while on novice → singalong row hides; dropdown flips to Custom.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Lobby.jsx
git commit -m "feat(client): add telephone preset settings to lobby panel"
```

---

## Task 6: Distraction scheduler

**Files:**
- Create: `client/src/distraction.js`

Distraction clips reuse existing `audio/*.mp3` from lyrics-guess. The scheduler picks random files, starts one, waits a random interval (3–8s after clip ends), picks again, repeats until stopped.

- [ ] **Step 1: Create the module**

```js
// client/src/distraction.js
const DISTRACTION_POOL = [
  // Pick ~8 short clips from the lyrics-guess audio folder.
  // Paths are relative to the site root; audio/ is served statically.
  '/audio/q01.mp3', '/audio/q05.mp3', '/audio/q12.mp3', '/audio/q18.mp3',
  '/audio/q24.mp3', '/audio/q33.mp3', '/audio/q45.mp3', '/audio/q60.mp3',
];

export class DistractionScheduler {
  constructor({ volume = 0.35 } = {}) {
    this.audio = new Audio();
    this.audio.volume = volume;
    this.audio.preload = 'auto';
    this.stopped = false;
    this._timer = null;
    this.audio.addEventListener('ended', () => this._scheduleNext());
    this.audio.addEventListener('error', () => this._scheduleNext());
  }

  start() {
    if (this.stopped) return;
    this._playRandom();
  }

  stop() {
    this.stopped = true;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    try { this.audio.pause(); } catch {}
    this.audio.src = '';
  }

  _playRandom() {
    if (this.stopped) return;
    const src = DISTRACTION_POOL[Math.floor(Math.random() * DISTRACTION_POOL.length)];
    this.audio.src = src;
    this.audio.currentTime = 0;
    this.audio.play().catch(() => this._scheduleNext());
  }

  _scheduleNext() {
    if (this.stopped) return;
    const waitMs = 3000 + Math.floor(Math.random() * 5000);
    this._timer = setTimeout(() => this._playRandom(), waitMs);
  }
}
```

**Note:** If the exact filenames in `audio/` differ from `q01.mp3` etc., replace the pool array with real paths. Run `ls JayChouLyricsMultiplayer/audio/*.mp3 | head -20` before writing and pick 8 real files.

- [ ] **Step 2: Verify file paths exist**

Run: `ls E:/JayChouLyricsMultiplayer/JayChouLyricsMultiplayer/audio/ | head -20`
Confirm the filenames chosen in `DISTRACTION_POOL` are real. Adjust the array to match real files before committing.

- [ ] **Step 3: Commit**

```bash
git add client/src/distraction.js
git commit -m "feat(client): add DistractionScheduler for random audio interruptions"
```

---

## Task 7: Apply configs in TelephonePhase recording flow

**Files:**
- Modify: `client/src/pages/TelephonePhase.jsx`

Three behavior changes, all gated on `lobby.settings`:

1. **audioLockOnRecord=false** → don't set `audioDisabled` when recording starts; keep the YouTube/audio player accessible throughout.
2. **singalongEnabled=true** → render a "🎵 伴唱模式" button in the `recording` UI state that, when pressed, programmatically plays the source audio from start (even if `audioDisabled` is true, this one action unlocks playback).
3. **distractionEnabled=true** → on entering `recording` state, start a `DistractionScheduler`; stop it when leaving `recording` state (stop/re-record/submit/unmount).

- [ ] **Step 1: Read current settings from props**

Ensure the component receives `lobby` (it already does). At the top of the function body, destructure:

```jsx
const audioLock = lobby?.settings?.audioLockOnRecord ?? true;
const singalong = lobby?.settings?.singalongEnabled ?? false;
const distraction = lobby?.settings?.distractionEnabled ?? false;
```

Add a new import:

```jsx
import { DistractionScheduler } from '../distraction.js';
```

And a ref for the scheduler:

```jsx
const distractionRef = useRef(null);
```

- [ ] **Step 2: Gate `setAudioDisabled(true)` in `handleStartRecording`**

Change line 59 (`setAudioDisabled(true);`) to:

```jsx
if (audioLock) setAudioDisabled(true);
```

- [ ] **Step 3: Start/stop the distraction scheduler**

At the end of `handleStartRecording` (right after `setUiState('recording');`), add:

```jsx
if (distraction) {
  distractionRef.current = new DistractionScheduler();
  distractionRef.current.start();
}
```

In `handleStopRecording`, at the very end, add:

```jsx
if (distractionRef.current) { distractionRef.current.stop(); distractionRef.current = null; }
```

Also add a cleanup effect (place after existing effects):

```jsx
useEffect(() => () => {
  if (distractionRef.current) { distractionRef.current.stop(); distractionRef.current = null; }
}, []);
```

And inside `doSubmit`, before the `socket.emit`, call the same stop block (in case auto-submit skipped `handleStopRecording`):

```jsx
if (distractionRef.current) { distractionRef.current.stop(); distractionRef.current = null; }
```

- [ ] **Step 4: Add the 伴唱模式 button in the recording UI**

Find the `{uiState === 'recording' && (...)}` block (around line 201) and extend it:

```jsx
{uiState === 'recording' && (
  <div style={{ textAlign: 'center' }}>
    <p style={{ color: '#ef4444', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>🔴 錄音中...</p>
    {singalong && audioLock && (
      <button
        onClick={() => {
          // Force-play the source audio even if audioDisabled hid it.
          if (phase.audioType === 'youtube') {
            // Temporarily unhide the YouTube player by clearing audioDisabled
            // and letting the user hear the original while recording continues.
            setAudioDisabled(false);
          } else if (recordingAudioRef.current) {
            recordingAudioRef.current.currentTime = 0;
            recordingAudioRef.current.play().catch(() => {});
          }
        }}
        style={{ padding: '8px 20px', fontSize: 14, background: '#8b5cf6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', marginRight: 8 }}>
        🎵 伴唱模式
      </button>
    )}
    <button
      onClick={handleStopRecording}
      style={{ padding: '10px 24px', fontSize: 15, background: '#333', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
      ⏹ 停止錄音
    </button>
  </div>
)}
```

**Note:** For YouTube, `setAudioDisabled(false)` re-mounts the `<YouTubePlayer>` (because it renders only when `!audioDisabled` in the `phase.audioType === 'youtube'` branch — review lines 166–187 and confirm; if it's always mounted and only the `disabled` prop changes, adapt by calling a ref method instead). If the YouTube player is always mounted, add a `playerRef` to `<YouTubePlayer>` and call `playerRef.current.playFromStart()` — but only do this if the component already exposes such an API; otherwise the simpler `setAudioDisabled(false)` approach is fine.

- [ ] **Step 5: Also hide the "開始錄音後，將無法再聽到音樂" warning when audioLock is off**

Find line 192 and replace:

```jsx
{audioLock && (
  <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>⚠️ 開始錄音後，將無法再聽到音樂</p>
)}
```

- [ ] **Step 6: Manual browser test — 新手版 preset**

Run dev server. Create a telephone lobby with 3 browser tabs. Set preset to 新手版. Start game.
- Verify during recording: source audio is hidden (audioLock=true) and 伴唱模式 button is visible. Click it → audio starts playing while recording continues.
- Submit, advance phase. Recording captured both voice + music as expected.

- [ ] **Step 7: Manual browser test — 困難版 preset**

Restart. Preset 困難版.
- During recording: audio player remains visible, no 伴唱模式 button, no distraction sounds.

- [ ] **Step 8: Manual browser test — 地獄版 preset**

Restart. Preset 地獄版.
- During recording: audio player remains visible, no 伴唱模式 button, distraction clips play at random intervals (3–8s gaps).
- Stop recording → distractions stop immediately.
- Re-record → distractions resume.
- Let timer auto-expire → distractions stop after submission.

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/TelephonePhase.jsx
git commit -m "feat(client): apply telephone configs in recording phase"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full server test suite**

Run: `cd server && npm test`
Expected: all existing tests still pass; two new test files pass.

- [ ] **Step 2: Build the client**

Run: `cd client && npm run build`
Expected: clean build, no warnings from new files.

- [ ] **Step 3: End-to-end smoke test**

Start the dev server. Play one full telephone round on each preset (novice, hard, hell, and one custom combo). Verify:
- Label persists and is shown correctly when non-host players refresh their lobby.
- Changing any single flag in the lobby flips the dropdown to Custom for all clients.
- Reconnect flow during a telephone phase still works (disconnect + rejoin), and the recording UI respects the active configs after rejoin.

- [ ] **Step 4: Update CLAUDE.md**

Add a bullet under "Telephone Mode Specifics" documenting the new settings:

```md
- **Difficulty presets:** `settings.telephoneModeLabel` is one of `novice`/`hard`/`hell`/`custom`, backed by three flags: `audioLockOnRecord`, `singalongEnabled`, `distractionEnabled`. Preset definitions live in `shared/telephonePresets.js`. Editing any flag auto-switches the label to `custom`. `singalongEnabled` is only honored when `audioLockOnRecord` is true.
- **伴唱模式 button:** When active, players can trigger synchronized playback of the source audio during recording.
- **Distraction audio:** When active, `client/src/distraction.js` plays random clips from `audio/` at random intervals during recording.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document telephone preset configs"
```

---

## Self-Review Checklist

- [x] Spec coverage: option 1 (audioLockOnRecord) → Task 7 Step 2; option 2 (singalong) → Task 7 Step 4; option 3 (distraction) → Tasks 6 + 7 Step 3. Preset dropdown in create form → Task 4; in lobby → Task 5. Auto-switch to Custom when flag changes → Task 3 component logic + Task 2 server normalization.
- [x] No placeholders: every code step has concrete code.
- [x] Type consistency: field names `audioLockOnRecord`, `singalongEnabled`, `distractionEnabled`, `telephoneModeLabel` used identically in shared module, server, client form, UI component, and `TelephonePhase.jsx`.
- [x] Distraction audio source: caveat in Task 6 Step 2 to verify real filenames before committing.
- [x] Singalong-vs-audioLock invariant enforced in both client (`toggleFlag`) and server (`normalizeTelephoneConfig`).
