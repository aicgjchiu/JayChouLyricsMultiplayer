import { describe, it, expect } from 'vitest';
import { buildAssignments } from '../src/rotation.js';

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
