/**
 * Build the player-assignment matrix.
 * matrix[phase][songIdx] = playerIdx, for phase in 0..N-1.
 * Row N-1 is the guess phase.
 *
 * Even N: Williams row-complete Latin square construction.
 * Odd N: legacy cyclic formula (will be specialised in Task 3).
 */
export function buildPlayerMatrix(N) {
  if (N % 2 === 0) return _williamsPlayerMatrix(N);
  return _oddPlayerMatrix(N);
}

/**
 * Find a Williams tau sequence for Z_N (even N).
 *
 * Returns an array tau of length N that is a permutation of Z_N where
 * every consecutive difference (tau[i] - tau[i-1]) mod N is nonzero and
 * all N-1 differences are distinct (covering Z_N \ {0} exactly once).
 *
 * This guarantees that cell[p][s] = (tau[p] + s) % N is a row-complete
 * Latin square: every ordered pair (A, B) with A ≠ B appears exactly once
 * as a vertically adjacent pair (cell[p][s], cell[p+1][s]).
 */
function _williamsTau(N) {
  // Backtracking search: build tau starting from 0,
  // at each step choose an unused delta d ∈ {1..N-1} such that
  // the next value (last + d) % N has not been used yet.
  function search(tau, usedDeltas) {
    if (tau.length === N) return tau;
    const last = tau[tau.length - 1];
    for (let d = 1; d < N; d++) {
      if (usedDeltas.has(d)) continue;
      const next = (last + d) % N;
      if (tau.includes(next)) continue;
      usedDeltas.add(d);
      tau.push(next);
      const result = search(tau, usedDeltas);
      if (result) return result;
      tau.pop();
      usedDeltas.delete(d);
    }
    return null;
  }
  return search([0], new Set());
}

function _williamsPlayerMatrix(N) {
  const tau = _williamsTau(N);
  const m = [];
  for (let p = 0; p < N; p++) {
    const row = [];
    for (let s = 0; s < N; s++) row.push((tau[p] + s) % N);
    m.push(row);
  }
  return m;
}

/**
 * Check whether the first N-1 rows of a player matrix admit a valid lyric matrix.
 * Used by _oddPlayerMatrix to skip player-matrix candidates that would leave
 * buildLyricMatrix unsatisfiable.
 */
function _lyricCompatible(singRows, N) {
  const matrix = Array.from({ length: N - 1 }, () => new Array(N).fill(-1));

  function isValid(phase, song, lyric) {
    for (let s = 0; s < song; s++) {
      if (matrix[phase][s] === lyric) return false;
    }
    for (let p = 0; p < phase; p++) {
      if (matrix[p][song] === lyric) return false;
    }
    const pIdx = singRows[phase][song];
    for (let p = 0; p < phase; p++) {
      const prevS = singRows[p].indexOf(pIdx);
      if (prevS !== -1 && matrix[p][prevS] === lyric) return false;
    }
    return true;
  }

  function solve(phase, song) {
    if (phase >= N - 1) return true;
    const nextSong = song + 1;
    for (let lyric = 0; lyric < N; lyric++) {
      if (isValid(phase, song, lyric)) {
        matrix[phase][song] = lyric;
        const r = nextSong >= N ? solve(phase + 1, 0) : solve(phase, nextSong);
        if (r) return true;
        matrix[phase][song] = -1;
      }
    }
    return false;
  }

  return solve(0, 0);
}

function _oddPlayerMatrix(N) {
  // Search for an N×N Latin square (row + col permutation) over 0..N-1
  // minimising duplicate predecessors per listener, subject to the constraint
  // that the first N-1 rows admit a valid lyric matrix (lyric-compatible).
  // Strategy: try increasing caps on per-(listener, predecessor) count.

  const m = Array.from({ length: N }, () => new Array(N).fill(-1));
  const rowUsed = Array.from({ length: N }, () => new Set());
  const colUsed = Array.from({ length: N }, () => new Set());
  const predCount = Array.from({ length: N }, () => new Array(N).fill(0));

  function reset() {
    for (let p = 0; p < N; p++) { m[p].fill(-1); rowUsed[p].clear(); }
    for (let s = 0; s < N; s++) colUsed[s].clear();
    for (let L = 0; L < N; L++) predCount[L].fill(0);
  }

  function trySolve(maxDup, nodeBudget) {
    reset();
    let nodes = 0;

    function tryCell(p, s) {
      nodes++;
      if (nodes > nodeBudget) return 'LIMIT';
      if (p === N) {
        // Verify lyric compatibility before accepting this player matrix.
        const singRows = m.slice(0, N - 1).map(row => row.slice());
        if (_lyricCompatible(singRows, N)) return true;
        return false;
      }
      const nextP = s + 1 === N ? p + 1 : p;
      const nextS = s + 1 === N ? 0 : s + 1;

      const cands = [];
      for (let v = 0; v < N; v++) {
        if (rowUsed[p].has(v)) continue;
        if (colUsed[s].has(v)) continue;
        let dup = 0;
        if (p > 0) {
          const A = m[p - 1][s];
          if (predCount[v][A] + 1 > maxDup) continue;
          dup = predCount[v][A];
        }
        cands.push([dup, v]);
      }
      cands.sort((a, b) => a[0] - b[0]);

      for (const [, v] of cands) {
        m[p][s] = v;
        rowUsed[p].add(v);
        colUsed[s].add(v);
        let A = null;
        if (p > 0) { A = m[p - 1][s]; predCount[v][A]++; }
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

    return tryCell(0, 0);
  }

  // N=3 cannot achieve maxDup=1; start at 2 (impossible strictness still attempted first for safety)
  const caps = [1, 2, N];
  for (const cap of caps) {
    const r = trySolve(cap, 2000000);
    if (r === true) return m.map(row => row.slice());
  }
  throw new Error(`No valid player matrix for N=${N}`);
}

/**
 * Build the assignment matrix for telephone mode.
 * @param {number} N - number of players (= number of songs = number of lyrics)
 * @returns {{ singPhases: Array<Array<{playerIdx, lyricIdx}>>, guessPhase: Array<{playerIdx, songIdx}> }}
 *
 * singPhases[phaseIdx][songIdx] = { playerIdx, lyricIdx }
 * guessPhase[i] = { playerIdx, songIdx }
 */
export function buildAssignments(N) {
  const playerMatrix = buildPlayerMatrix(N); // N rows × N cols
  const lyricMatrix = buildLyricMatrix(N, playerMatrix); // N-1 rows × N cols

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

  const guessPhase = [];
  for (let s = 0; s < N; s++) {
    guessPhase.push({
      playerIdx: playerMatrix[N - 1][s],
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
 * 2. Each row (fixed song) has all distinct values across phases
 * 3. Each player sees distinct lyrics across their phases
 */
function buildLyricMatrix(N, playerMatrix) {
  const matrix = Array.from({ length: N - 1 }, () => new Array(N).fill(-1));

  function isValid(phase, song, lyric) {
    // No duplicate in this phase (column of matrix at this phase)
    for (let s = 0; s < song; s++) {
      if (matrix[phase][s] === lyric) return false;
    }
    // No duplicate in this song (row-for-song across phases)
    for (let p = 0; p < phase; p++) {
      if (matrix[p][song] === lyric) return false;
    }
    // Player who sings this (phase, song) must not have seen this lyric before.
    const playerIdx = playerMatrix[phase][song];
    for (let p = 0; p < phase; p++) {
      const prevSong = playerMatrix[p].indexOf(playerIdx);
      if (prevSong !== -1 && matrix[p][prevSong] === lyric) return false;
    }
    return true;
  }

  function solve(phase, song) {
    if (phase >= N - 1) return true;
    const nextSong = song + 1;
    for (let lyric = 0; lyric < N; lyric++) {
      if (isValid(phase, song, lyric)) {
        matrix[phase][song] = lyric;
        const recurse = nextSong >= N ? solve(phase + 1, 0) : solve(phase, nextSong);
        if (recurse) return true;
        matrix[phase][song] = -1;
      }
    }
    return false;
  }

  if (!solve(0, 0)) throw new Error(`No valid lyric matrix found for N=${N}`);
  return matrix;
}
