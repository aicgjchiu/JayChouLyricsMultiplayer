import { describe, it, expect } from 'vitest';
import { buildAssignments, buildPlayerMatrix } from '../src/rotation.js';

describe('buildAssignments', () => {
  // Test all supported player counts (3-8)
  for (const N of [3, 4, 5, 6, 7, 8]) {
    describe(`N=${N} players`, () => {
      const result = buildAssignments(N);

      it(`has ${N - 1} singing phases plus 1 guess phase`, () => {
        expect(result.singPhases).toHaveLength(N - 1);
        expect(result.guessPhase).toHaveLength(N);
      });

      it('each singing phase assigns all N players to N different songs', () => {
        for (const phase of result.singPhases) {
          const playerIndices = phase.map(a => a.playerIdx);
          expect(new Set(playerIndices).size).toBe(N);
          expect(phase).toHaveLength(N);
        }
      });

      it('each singing phase assigns N different lyrics', () => {
        for (const phase of result.singPhases) {
          const lyricIndices = phase.map(a => a.lyricIdx);
          expect(new Set(lyricIndices).size).toBe(N);
        }
      });

      it('each song uses a different lyric each phase', () => {
        for (let s = 0; s < N; s++) {
          const lyricsForSong = result.singPhases.map(phase => phase[s].lyricIdx);
          expect(new Set(lyricsForSong).size).toBe(N - 1);
        }
      });

      it('each player sees a different lyric each phase', () => {
        for (let playerIdx = 0; playerIdx < N; playerIdx++) {
          const lyrics = [];
          for (const phase of result.singPhases) {
            const assignment = phase.find(a => a.playerIdx === playerIdx);
            if (assignment) lyrics.push(assignment.lyricIdx);
          }
          expect(lyrics).toHaveLength(N - 1);
          expect(new Set(lyrics).size).toBe(N - 1);
        }
      });

      it('each player sings for each song exactly once', () => {
        for (let playerIdx = 0; playerIdx < N; playerIdx++) {
          const songIndices = [];
          for (const phase of result.singPhases) {
            for (let s = 0; s < N; s++) {
              if (phase[s].playerIdx === playerIdx) songIndices.push(s);
            }
          }
          expect(songIndices).toHaveLength(N - 1);
          expect(new Set(songIndices).size).toBe(N - 1);
        }
      });

      it('guess phase assigns each player to exactly one song they never sang in', () => {
        for (const guess of result.guessPhase) {
          const { playerIdx, songIdx } = guess;
          for (const phase of result.singPhases) {
            expect(phase[songIdx].playerIdx).not.toBe(playerIdx);
          }
        }
        const guessPlayers = result.guessPhase.map(g => g.playerIdx);
        expect(new Set(guessPlayers).size).toBe(N);
        const guessSongs = result.guessPhase.map(g => g.songIdx);
        expect(new Set(guessSongs).size).toBe(N);
      });
    });
  }
});

describe('buildPlayerMatrix shape', () => {
  for (const N of [3, 4, 5, 6, 7, 8]) {
    it(`N=${N}: returns N rows x N cols, each row and col a permutation of 0..N-1`, () => {
      const m = buildPlayerMatrix(N);
      expect(m.length).toBe(N);
      for (let p = 0; p < N; p++) {
        expect(m[p].length).toBe(N);
        expect(new Set(m[p]).size).toBe(N);
      }
      for (let s = 0; s < N; s++) {
        const colSet = new Set();
        for (let p = 0; p < N; p++) colSet.add(m[p][s]);
        expect(colSet.size).toBe(N);
      }
    });
  }
});

function predecessorsPerListener(m, N) {
  const preds = new Map();
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
        expect(uniq.size).toBe(N - 1);
        expect(uniq.has(L)).toBe(false);
      }
    });
  }
});

describe('predecessor diversity — odd N (best effort)', () => {
  it('N=3: each listener gets N-1 predecessors, none is self', () => {
    const m = buildPlayerMatrix(3);
    const preds = predecessorsPerListener(m, 3);
    for (let L = 0; L < 3; L++) {
      expect(preds.get(L).length).toBe(2);
      for (const a of preds.get(L)) expect(a).not.toBe(L);
    }
  });

  for (const N of [5, 7]) {
    it(`N=${N}: no listener has more than 1 duplicate predecessor (maxRepeat <= 2)`, () => {
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
