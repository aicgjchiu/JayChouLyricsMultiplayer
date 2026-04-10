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
