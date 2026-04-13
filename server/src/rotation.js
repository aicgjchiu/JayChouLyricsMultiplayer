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

function _oddPlayerMatrix(N) {
  // Legacy for odd N — replaced in Task 3.
  const m = [];
  for (let p = 0; p < N; p++) {
    const row = [];
    for (let s = 0; s < N; s++) row.push((s + p) % N);
    m.push(row);
  }
  return m;
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
  // Player assignment: song s, phase p → player (s + p) % N
  // Lyric assignment: use formula for odd N, backtracking for even N
  const lyricMatrix = buildLyricMatrix(N);

  const singPhases = [];
  for (let p = 0; p < N - 1; p++) {
    const phase = [];
    for (let s = 0; s < N; s++) {
      phase.push({
        playerIdx: (s + p) % N,
        lyricIdx: lyricMatrix[p][s],
      });
    }
    singPhases.push(phase);
  }

  // Guess phase: player (s + N-1) % N guesses song s
  const guessPhase = [];
  for (let s = 0; s < N; s++) {
    guessPhase.push({
      playerIdx: (s + N - 1) % N,
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
 * 2. Each row (fixed song) has all distinct values
 * 3. Each player sees distinct lyrics across their phases
 */
function buildLyricMatrix(N) {
  // For odd N: (s * 2 + p) % N satisfies all constraints
  if (N % 2 === 1) {
    const matrix = [];
    for (let p = 0; p < N - 1; p++) {
      const row = [];
      for (let s = 0; s < N; s++) {
        row.push((s * 2 + p) % N);
      }
      matrix.push(row);
    }
    return matrix;
  }

  // For even N: use backtracking search
  const matrix = Array.from({ length: N - 1 }, () => new Array(N).fill(-1));

  function isValid(phase, song, lyric) {
    // No duplicate in this phase (column)
    for (let s = 0; s < song; s++) {
      if (matrix[phase][s] === lyric) return false;
    }
    // No duplicate in this song (row) across phases
    for (let p = 0; p < phase; p++) {
      if (matrix[p][song] === lyric) return false;
    }
    // Player who does this song in this phase hasn't seen this lyric
    const playerIdx = (song + phase) % N;
    for (let p = 0; p < phase; p++) {
      const prevSong = ((playerIdx - p) % N + N) % N;
      if (matrix[p][prevSong] === lyric) return false;
    }
    return true;
  }

  function solve(phase, song) {
    if (phase >= N - 1) return true;
    const nextSong = song + 1;
    for (let lyric = 0; lyric < N; lyric++) {
      if (isValid(phase, song, lyric)) {
        matrix[phase][song] = lyric;
        if (nextSong >= N) {
          if (solve(phase + 1, 0)) return true;
        } else {
          if (solve(phase, nextSong)) return true;
        }
        matrix[phase][song] = -1;
      }
    }
    return false;
  }

  const success = solve(0, 0);
  if (!success) throw new Error(`No valid lyric matrix found for N=${N}`);
  return matrix;
}
