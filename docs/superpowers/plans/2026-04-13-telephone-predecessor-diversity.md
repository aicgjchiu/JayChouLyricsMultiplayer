# Telephone Rotation — Predecessor Diversity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure that each listener in telephone mode hears a different previous-singer across the N-1 listen/guess occurrences, instead of always hearing the same player (current bug — predecessor is always `(L-1) mod N`).

**Architecture:** Replace the `(s+p) mod N` player-assignment formula with a **row-complete Latin square** when one exists. Use Williams's sequencing construction for even N (4, 6, 8) — analytic, optimal, every listener hears each of the N-1 others exactly once. For odd N (3, 5, 7) where Z_N has no sequencing (Gordon 1961), fall back to a backtracking search that maximises predecessor diversity; for N=3 acceptance is partial (mathematically impossible to get full diversity).

The existing `buildLyricMatrix` and its lyric-level constraints stay untouched. Only the player-assignment slice of `buildAssignments` changes.

**Tech Stack:** Pure JS, Vitest.

---

## File Structure

- Modify: `server/src/rotation.js` — add `buildPlayerMatrix(N)` (returns `[phase][songIdx] → playerIdx` for phases `0..N-1`, where phase `N-1` is the guess phase). Integrate into `buildAssignments`.
- Modify: `server/tests/rotation.test.js` — diversity assertions for N=3..8.

No other files change. All downstream code (`telephone.js`, reconnect snapshots, results, fallback chain) already addresses players by `assignments.singPhases[p][songIdx].playerIdx` and `assignments.guessPhase[i].playerIdx` — the matrix change is invisible to them.

---

## Task 1: Extract `buildPlayerMatrix` stub, keep existing behavior

**Files:**
- Modify: `server/src/rotation.js`
- Test: `server/tests/rotation.test.js`

- [ ] **Step 1.1: Write failing test — existence of the helper**

Append to `server/tests/rotation.test.js`:

```js
import { buildPlayerMatrix } from '../src/rotation.js';

describe('buildPlayerMatrix shape', () => {
  for (const N of [3, 4, 5, 6, 7, 8]) {
    it(`N=${N}: returns (N) rows × N cols, each row and col a permutation of 0..N-1`, () => {
      const m = buildPlayerMatrix(N);
      expect(m.length).toBe(N); // N-1 sing phases + 1 guess phase
      for (let p = 0; p < N; p++) {
        expect(m[p].length).toBe(N);
        const rowSet = new Set(m[p]);
        expect(rowSet.size).toBe(N);
      }
      for (let s = 0; s < N; s++) {
        const colSet = new Set();
        for (let p = 0; p < N; p++) colSet.add(m[p][s]);
        expect(colSet.size).toBe(N);
      }
    });
  }
});
```

Run `cd server && npx vitest run tests/rotation.test.js -t "buildPlayerMatrix shape"` — expect FAIL (`buildPlayerMatrix is not exported`).

- [ ] **Step 1.2: Add stub that preserves current behavior**

At the top of `server/src/rotation.js` (before `buildAssignments`):

```js
export function buildPlayerMatrix(N) {
  // Default (legacy) construction: cell[p][s] = (s + p) mod N for p in 0..N-1.
  // Row N-1 corresponds to the guess phase.
  const m = [];
  for (let p = 0; p < N; p++) {
    const row = [];
    for (let s = 0; s < N; s++) row.push((s + p) % N);
    m.push(row);
  }
  return m;
}
```

- [ ] **Step 1.3: Run tests — expect pass**

```
cd server && npx vitest run tests/rotation.test.js
```

All existing 42 rotation tests + new shape tests must pass.

- [ ] **Step 1.4: Commit**

```bash
git add server/src/rotation.js server/tests/rotation.test.js
git commit -m "$(printf 'refactor(rotation): extract buildPlayerMatrix helper\n\nCo-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: Williams row-complete construction for even N

**Files:**
- Modify: `server/src/rotation.js`
- Test: `server/tests/rotation.test.js`

### Mathematical background (for the implementer)

For even N, Z_N is sequenceable. The canonical Williams sequencing is:
```
σ = [0, 1, N-1, 2, N-2, 3, N-3, ..., N/2]
```
(alternating +1, -1, +2, -2, +3, -3 ... around the ring). Let τ_i be the partial sums mod N: τ = [σ_0, σ_0+σ_1, σ_0+σ_1+σ_2, ..., sum]. For even N, τ is a permutation of Z_N.

The square `cell[p][s] = (τ_p + s) mod N` is row-complete: each ordered adjacent pair (a,b) with a≠b appears exactly once vertically (song direction). Equivalently, for every listener B at phase p+1 in song s, their predecessor (phase p, song s) is B − σ_{p+1} (mod N). As p ranges 0..N-2, σ_{p+1} ranges over σ_1..σ_{N-1}, which are N-1 distinct nonzero elements — so B has N-1 distinct predecessors, each one of the other players exactly once.

### TDD

- [ ] **Step 2.1: Write failing diversity tests for even N**

Append:

```js
function predecessorsPerListener(m, N) {
  // For listener L: collect {predecessor player at (phase p-1, song s) : m[p][s] === L, p > 0}
  const preds = new Map(); // L -> array of predecessor playerIdx
  for (let L = 0; L < N; L++) preds.set(L, []);
  for (let p = 1; p < N; p++) {
    for (let s = 0; s < N; s++) {
      const listener = m[p][s];
      const predecessor = m[p - 1][s];
      preds.get(listener).push(predecessor);
    }
  }
  return preds;
}

describe('predecessor diversity — even N (Williams construction)', () => {
  for (const N of [4, 6, 8]) {
    it(`N=${N}: every listener hears all N-1 other players exactly once`, () => {
      const m = buildPlayerMatrix(N);
      const preds = predecessorsPerListener(m, N);
      for (let L = 0; L < N; L++) {
        const list = preds.get(L);
        expect(list.length).toBe(N - 1);
        const uniq = new Set(list);
        expect(uniq.size).toBe(N - 1); // all distinct
        expect(uniq.has(L)).toBe(false); // never yourself
      }
    });
  }
});
```

Run — expect FAIL (legacy formula gives duplicate predecessors).

- [ ] **Step 2.2: Implement Williams construction**

Replace `buildPlayerMatrix` to dispatch even N to Williams:

```js
export function buildPlayerMatrix(N) {
  if (N % 2 === 0) return _williamsPlayerMatrix(N);
  return _oddPlayerMatrix(N);
}

function _williamsSequencing(N) {
  // σ = [0, 1, N-1, 2, N-2, 3, N-3, ...], length N
  const seq = [0];
  let lo = 1, hi = N - 1;
  while (seq.length < N) {
    seq.push(lo);
    if (seq.length < N) seq.push(hi);
    lo++; hi--;
  }
  return seq;
}

function _williamsPlayerMatrix(N) {
  const sigma = _williamsSequencing(N);
  const tau = new Array(N);
  let acc = 0;
  for (let i = 0; i < N; i++) {
    acc = (acc + sigma[i]) % N;
    tau[i] = acc;
  }
  const m = [];
  for (let p = 0; p < N; p++) {
    const row = [];
    for (let s = 0; s < N; s++) row.push((tau[p] + s) % N);
    m.push(row);
  }
  return m;
}

function _oddPlayerMatrix(N) {
  // Stub for now — Task 3 implements this. Keep legacy behavior.
  const m = [];
  for (let p = 0; p < N; p++) {
    const row = [];
    for (let s = 0; s < N; s++) row.push((s + p) % N);
    m.push(row);
  }
  return m;
}
```

- [ ] **Step 2.3: Run tests — expect pass**

```
cd server && npm test
```

Shape + even-N diversity must pass. All other tests still green.

- [ ] **Step 2.4: Commit**

```bash
git add server/src/rotation.js server/tests/rotation.test.js
git commit -m "$(printf 'feat(rotation): Williams row-complete construction for even N\n\nCo-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: Backtracking search for odd N (best-effort diversity)

**Files:**
- Modify: `server/src/rotation.js`
- Test: `server/tests/rotation.test.js`

### Context

For N ∈ {3, 5, 7}, Z_N has no sequencing (Gordon's theorem), so no cyclic row-complete LS exists. N=3 is also known to have no row-complete LS at all. For N=5, 7 existence is open/unknown. We use backtracking with a diversity objective:

- Hard constraints: each row is a permutation of 0..N-1, each column is a permutation of 0..N-1 (Latin square).
- Soft: minimize total "predecessor repeats" (count pairs (L, A) where A is predecessor of L more than once).

Strategy: fill the matrix column by column (song by song), phase by phase. For each (p, s), try players in an order that prefers predecessors not yet used for this listener. Backtrack on Latin-square violation. Accept the first full fill that reaches min-repeats = N*floor bound (if any), else accept any valid fill.

For N=3, min-repeats ≥ 3 (each listener has 2 predecessors drawn from 2 others — must repeat twice across listeners total at least). For N=5, 7 aim for 0 ideally, accept small non-zero.

### TDD

- [ ] **Step 3.1: Diversity-ish tests for odd N**

Append:

```js
describe('predecessor diversity — odd N (best effort)', () => {
  it('N=3: each listener gets 2 predecessors (may repeat)', () => {
    const m = buildPlayerMatrix(3);
    const preds = predecessorsPerListener(m, 3);
    for (let L = 0; L < 3; L++) {
      expect(preds.get(L).length).toBe(2);
      for (const a of preds.get(L)) expect(a).not.toBe(L);
    }
  });

  for (const N of [5, 7]) {
    it(`N=${N}: no listener has MORE than 1 duplicate predecessor`, () => {
      const m = buildPlayerMatrix(N);
      const preds = predecessorsPerListener(m, N);
      for (let L = 0; L < N; L++) {
        const list = preds.get(L);
        expect(list.length).toBe(N - 1);
        const counts = new Map();
        for (const a of list) counts.set(a, (counts.get(a) || 0) + 1);
        const maxRepeat = Math.max(...counts.values());
        expect(maxRepeat).toBeLessThanOrEqual(2);
        for (const a of list) expect(a).not.toBe(L);
      }
    });
  }
});
```

Run — expect the N=5,7 tests to FAIL with the legacy stub (all predecessors of L are (L-1) mod N, so `maxRepeat` = N-1).

- [ ] **Step 3.2: Implement `_oddPlayerMatrix` via backtracking**

Replace the stub:

```js
function _oddPlayerMatrix(N) {
  // Columns = songs; rows = phases. Row N-1 is the guess phase.
  // Hard: each row + each column is a permutation of 0..N-1.
  // Soft: minimise duplicate predecessors per listener.

  const m = Array.from({ length: N }, () => new Array(N).fill(-1));
  const rowUsed = Array.from({ length: N }, () => new Set());
  const colUsed = Array.from({ length: N }, () => new Set());
  // predCount[L][A] = how many times A is a predecessor of L so far
  const predCount = Array.from({ length: N }, () => new Array(N).fill(0));

  // Max acceptable duplicate count for any (L, A) — loop-tighten until infeasible.
  // Start strict (≤1), relax to (≤2) if no solution found within budget.
  function trySolve(maxDup) {
    let nodes = 0;
    const LIMIT = 200000;

    function tryCell(p, s) {
      nodes++;
      if (nodes > LIMIT) return 'LIMIT';
      if (p === N) return true;
      const nextP = s + 1 === N ? p + 1 : p;
      const nextS = s + 1 === N ? 0 : s + 1;

      // Candidate order: players not in row p or col s, sorted by ascending predCount increment
      const candidates = [];
      for (let v = 0; v < N; v++) {
        if (rowUsed[p].has(v)) continue;
        if (colUsed[s].has(v)) continue;
        let dup = 0;
        if (p > 0) {
          const A = m[p - 1][s];
          if (predCount[v][A] + 1 > maxDup) continue;
          dup = predCount[v][A];
        }
        candidates.push([dup, v]);
      }
      candidates.sort((a, b) => a[0] - b[0]);

      for (const [, v] of candidates) {
        m[p][s] = v;
        rowUsed[p].add(v);
        colUsed[s].add(v);
        let A = null;
        if (p > 0) {
          A = m[p - 1][s];
          predCount[v][A]++;
        }
        const r = tryCell(nextP, nextS);
        if (r === true) return true;
        if (r === 'LIMIT') return 'LIMIT';
        m[p][s] = -1;
        rowUsed[p].delete(v);
        colUsed[s].delete(v);
        if (A !== null) predCount[v][A]--;
      }
      return false;
    }

    // reset
    for (let p = 0; p < N; p++) { m[p].fill(-1); rowUsed[p].clear(); }
    for (let s = 0; s < N; s++) colUsed[s].clear();
    for (let L = 0; L < N; L++) predCount[L].fill(0);
    return tryCell(0, 0);
  }

  for (const maxDup of [1, 2, N]) {
    const r = trySolve(maxDup);
    if (r === true) return m.map(row => row.slice());
  }
  throw new Error(`No valid player matrix for N=${N}`);
}
```

- [ ] **Step 3.3: Run tests — expect pass**

```
cd server && npm test
```

Odd-N diversity tests pass. All existing tests still pass.

- [ ] **Step 3.4: Commit**

```bash
git add server/src/rotation.js server/tests/rotation.test.js
git commit -m "$(printf 'feat(rotation): backtracking predecessor diversity for odd N\n\nCo-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: Integrate `buildPlayerMatrix` into `buildAssignments`

**Files:**
- Modify: `server/src/rotation.js`
- Test: `server/tests/rotation.test.js` (existing assertions re-run)

- [ ] **Step 4.1: Rewrite `buildAssignments` to use the new matrix**

Replace the current body of `buildAssignments(N)`:

```js
export function buildAssignments(N) {
  const playerMatrix = buildPlayerMatrix(N); // [phase][songIdx] → playerIdx, N rows
  const lyricMatrix = buildLyricMatrix(N);   // [phase][songIdx] → lyricIdx, N-1 rows

  const singPhases = [];
  for (let p = 0; p < N - 1; p++) {
    const phase = [];
    for (let s = 0; s < N; s++) {
      phase.push({
        playerIdx: playerMatrix[p][s],
        lyricIdx: lyricMatrix[p][s],
      });
    }
    singPhases.push(phase);
  }

  // Guess phase = row N-1 of the player matrix
  const guessPhase = [];
  for (let s = 0; s < N; s++) {
    guessPhase.push({
      playerIdx: playerMatrix[N - 1][s],
      songIdx: s,
    });
  }

  return { singPhases, guessPhase };
}
```

- [ ] **Step 4.2: Update `buildLyricMatrix` to NOT assume the cyclic player formula**

The even-N `isValid` check in `buildLyricMatrix` has this line:
```js
const playerIdx = (song + phase) % N;
for (let p = 0; p < phase; p++) {
  const prevSong = ((playerIdx - p) % N + N) % N;
  if (matrix[p][prevSong] === lyric) return false;
}
```
This check uses the legacy formula to identify which prior cells belong to the same player. With the new `playerMatrix`, replace with:

```js
const playerIdx = playerMatrix[phase][song];
for (let p = 0; p < phase; p++) {
  // Find the song at phase p where this player sang (one-to-one per row)
  const prevSong = playerMatrix[p].indexOf(playerIdx);
  if (matrix[p][prevSong] === lyric) return false;
}
```

To make this work, pass `playerMatrix` into `buildLyricMatrix`. Change its signature to `buildLyricMatrix(N, playerMatrix)` and thread it from `buildAssignments`. Also for odd N: the current `(s * 2 + p) % N` formula is hard-coded; keep it for the odd-N branch of `buildLyricMatrix` (it still produces a valid lyric matrix satisfying the odd-N constraints — but the "each player sees distinct lyrics across their phases" invariant might break if the player matrix is no longer cyclic).

Safer change: **always** use the even-N backtracking branch when `playerMatrix` is non-cyclic. Concretely:

```js
function buildLyricMatrix(N, playerMatrix) {
  if (N % 2 === 1 && _isLegacyCyclic(playerMatrix, N)) {
    return _oddCyclicLyricMatrix(N); // the (s*2+p) % N formula, extracted
  }
  return _backtrackingLyricMatrix(N, playerMatrix);
}

function _isLegacyCyclic(pm, N) {
  for (let p = 0; p < N; p++) for (let s = 0; s < N; s++) {
    if (pm[p][s] !== (s + p) % N) return false;
  }
  return true;
}
```

`_oddCyclicLyricMatrix` wraps the existing `(s*2+p) % N` logic; `_backtrackingLyricMatrix` wraps the existing even-N backtracking but replaces the `playerIdx`/`prevSong` derivation with the indexOf-based lookup.

- [ ] **Step 4.3: Run all tests**

```
cd server && npm test
```

Expected: all tests pass, including the 42 existing rotation tests (they test invariants: distinct lyrics per player, each song visits every player, guesser doesn't sing the same song, etc. — all still hold because `buildPlayerMatrix` preserves traversal).

If any existing test fails, inspect — it likely assumes the legacy `(s+p) mod N` shape. If so, rewrite the test to assert the semantic invariant (e.g., "player X sees N-1 distinct lyrics") rather than the literal numeric pattern. Do NOT weaken a test just to make it pass.

- [ ] **Step 4.4: Commit**

```bash
git add server/src/rotation.js server/tests/rotation.test.js
git commit -m "$(printf 'feat(rotation): route buildAssignments through new player matrix\n\nCo-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: Downstream smoke + client build

**Files:** none (verification only)

- [ ] **Step 5.1: Full server test run**

```
cd server && npm test
```

All 119+ existing tests plus the new diversity ones must pass. Telephone-mode tests especially — they implicitly depend on `buildAssignments`.

- [ ] **Step 5.2: Client build**

```
cd client && npm run build
```

Expected: clean build.

- [ ] **Step 5.3: Manual sanity log (optional)**

Quick script: `node -e "import('./server/src/rotation.js').then(({buildPlayerMatrix}) => { for (const n of [3,4,5,6,7,8]) { console.log('N='+n); console.log(buildPlayerMatrix(n).map(r=>r.join(' ')).join('\n')); }})"`

Inspect visually that rows/cols are permutations and that for even N the predecessor sequence σ looks like the Williams sequencing (0,1,N-1,2,N-2,...).

- [ ] **Step 5.4: No commit** (verification-only)
