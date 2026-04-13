import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameManager } from '../src/gameManager.js';

function makeMockIo() {
  const emitFn = vi.fn();
  const toObj = { emit: emitFn };
  return {
    to: vi.fn().mockReturnValue(toObj),
    _emitFn: emitFn,
  };
}

function createTelephoneLobby(mgr, playerCount) {
  const lobby = mgr.createLobby('host', {
    nickname: 'Host', lobbyName: 'Room', isPrivate: false, password: null,
    gameMode: 'telephone', phaseDuration: 90,
  });
  for (let i = 2; i <= playerCount; i++) {
    mgr.joinLobby(`p${i}`, { lobbyCode: lobby.id, nickname: `Player${i}`, password: null });
  }
  return lobby;
}

describe('Telephone mode: startGame', () => {
  it('rejects if fewer than 3 players', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 2);
    const io = makeMockIo();
    mgr.startGame('host', io);
    expect(lobby.state).toBe('waiting');
  });

  it('transitions to telephone_phase with 3 players', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    expect(lobby.state).toBe('telephone_phase');
    expect(lobby.telephone).not.toBeNull();
    expect(lobby.telephone.currentPhase).toBe(0);
    expect(lobby.telephone.songs).toHaveLength(3);
    expect(lobby.telephone.lyrics).toHaveLength(3);
    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('emits telephone-phase-start to each player with their assignment', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const sockets = new Map();
    const mockSocketEmits = {};
    lobby.players.forEach(p => {
      mockSocketEmits[p.socketId] = vi.fn();
      sockets.set(p.socketId, { emit: mockSocketEmits[p.socketId] });
    });
    const io = makeMockIo();
    io.to = vi.fn().mockImplementation((roomOrId) => {
      if (sockets.has(roomOrId)) {
        return { emit: sockets.get(roomOrId).emit };
      }
      return { emit: io._emitFn };
    });

    mgr.startGame('host', io);

    lobby.players.forEach(p => {
      expect(mockSocketEmits[p.socketId]).toHaveBeenCalledWith(
        'telephone-phase-start',
        expect.objectContaining({
          phaseIndex: 0,
          lyrics: expect.any(String),
          audioType: 'youtube',
          phaseDuration: 90,
          isFirstPhase: true,
        })
      );
    });

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('filters lyrics to avoid matching song names', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);

    const songNames = lobby.telephone.songs.map(s => s.name);
    lobby.telephone.lyrics.forEach(l => {
      expect(songNames).not.toContain(l.songName);
    });

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });
});

describe('Telephone mode: submitRecording', () => {
  it('stores recording and marks player as submitted', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);

    const audioBuffer = Buffer.from('fake-audio-data');
    mgr.submitRecording('host', audioBuffer, io);

    expect(lobby.telephone.submissions.has('host')).toBe(true);
    expect(lobby.telephone.recordings.size).toBe(1);

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('advances to next phase when all players submit', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    const buf = Buffer.from('audio');
    mgr.submitRecording('host', buf, io);
    mgr.submitRecording('p2', buf, io);
    mgr.submitRecording('p3', buf, io);

    expect(lobby.state).toBe('telephone_phase');
    expect(lobby.telephone.currentPhase).toBe(1);

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('advances to telephone_guess after all singing phases', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    const buf = Buffer.from('audio');

    // Phase 0
    mgr.submitRecording('host', buf, io);
    mgr.submitRecording('p2', buf, io);
    mgr.submitRecording('p3', buf, io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    // Phase 1 (last singing phase for N=3)
    mgr.submitRecording('host', buf, io);
    mgr.submitRecording('p2', buf, io);
    mgr.submitRecording('p3', buf, io);

    expect(lobby.state).toBe('telephone_guess');

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });
});

describe('Telephone mode: fallback when a player does not record', () => {
  function socketEmitsMap(lobby) {
    const map = {};
    lobby.players.forEach(p => { map[p.socketId] = vi.fn(); });
    return map;
  }
  function makeIoWithPerSocket(map, lobbyId) {
    const io = makeMockIo();
    io.to = vi.fn().mockImplementation((target) => {
      if (target === lobbyId) return { emit: io._emitFn };
      return { emit: map[target] || vi.fn() };
    });
    return io;
  }

  it('does not store empty buffer as a recording', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    mgr.submitRecording('host', Buffer.alloc(0), io);

    expect(lobby.telephone.submissions.has('host')).toBe(true);
    expect(lobby.telephone.recordings.size).toBe(0);

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('phase 1 falls back to YouTube when phase 0 singer did not record', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const emits = socketEmitsMap(lobby);
    const io = makeIoWithPerSocket(emits, lobby.id);
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    const tel = lobby.telephone;
    // For songIdx = 0, the phase-0 singer submits empty buffer; others submit real audio.
    const phase0 = tel.assignments.singPhases[0];
    const skippedPlayerIdx = phase0[0].playerIdx;
    const skippedSocket = lobby.players[skippedPlayerIdx].socketId;
    lobby.players.forEach(p => {
      const buf = p.socketId === skippedSocket ? Buffer.alloc(0) : Buffer.from('audio');
      mgr.submitRecording(p.socketId, buf, io);
    });
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    // Phase 1 started. Find the player assigned to songIdx=0 in phase 1 and check their payload.
    const phase1 = lobby.telephone.assignments.singPhases[1];
    const listenerIdx = phase1[0].playerIdx;
    const listenerSocket = lobby.players[listenerIdx].socketId;

    const calls = emits[listenerSocket].mock.calls.filter(c => c[0] === 'telephone-phase-start' && c[1].phaseIndex === 1);
    expect(calls.length).toBe(1);
    const payload = calls[0][1];
    expect(payload.audioType).toBe('youtube');
    expect(payload.fallbackNotice).toContain('沒錄音');
    expect(payload.fallbackNotice).toContain('原曲');

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('phase 2 falls back to phase 0 recording when phase 1 singer did not record', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 4);
    const emits = socketEmitsMap(lobby);
    const io = makeIoWithPerSocket(emits, lobby.id);
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    const tel = lobby.telephone;
    // Phase 0: everyone records.
    lobby.players.forEach(p => mgr.submitRecording(p.socketId, Buffer.from('audio'), io));
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    // Phase 1: songIdx=0 singer skips, others record.
    const phase1 = tel.assignments.singPhases[1];
    const skippedPlayerIdx = phase1[0].playerIdx;
    const skippedSocket = lobby.players[skippedPlayerIdx].socketId;
    lobby.players.forEach(p => {
      const buf = p.socketId === skippedSocket ? Buffer.alloc(0) : Buffer.from('audio');
      mgr.submitRecording(p.socketId, buf, io);
    });
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    // Phase 2 listener for songIdx=0 should receive phase-0 recording URL + notice.
    const phase2 = tel.assignments.singPhases[2];
    const listenerSocket = lobby.players[phase2[0].playerIdx].socketId;
    const calls = emits[listenerSocket].mock.calls.filter(c => c[0] === 'telephone-phase-start' && c[1].phaseIndex === 2);
    expect(calls.length).toBe(1);
    const payload = calls[0][1];
    expect(payload.audioType).toBe('recording');
    expect(payload.audioUrl).toBe(`/recordings/${lobby.id}/0/0`);
    expect(payload.fallbackNotice).toContain('沒錄音');
    expect(payload.fallbackNotice).toContain('第 1 回合');

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });
});

describe('Telephone mode: submitGuess', () => {
  it('transitions to telephone_results when all players guess', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    const buf = Buffer.from('audio');
    for (let phase = 0; phase < lobby.players.length - 1; phase++) {
      lobby.players.forEach(p => mgr.submitRecording(p.socketId, buf, io));
      if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    }
    expect(lobby.state).toBe('telephone_guess');

    mgr.submitGuess('host', '太陽之子', io);
    mgr.submitGuess('p2', '西西里', io);
    mgr.submitGuess('p3', '那天下雨了', io);

    expect(lobby.state).toBe('telephone_results');

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });
});

describe('Telephone mode: nextSong', () => {
  function advanceToResults(mgr, lobby, io) {
    const buf = Buffer.from('audio');
    for (let phase = 0; phase < lobby.players.length - 1; phase++) {
      lobby.players.forEach(p => mgr.submitRecording(p.socketId, buf, io));
      if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    }
    lobby.players.forEach(p => mgr.submitGuess(p.socketId, 'guess', io));
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
  }

  it('advances to next song in results when host calls', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    advanceToResults(mgr, lobby, io);
    expect(lobby.state).toBe('telephone_results');
    expect(lobby.telephone.currentResultSong).toBe(0);

    mgr.nextSong('host', io);
    expect(lobby.telephone.currentResultSong).toBe(1);

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('transitions to finished after all songs shown', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    advanceToResults(mgr, lobby, io);

    mgr.nextSong('host', io);
    mgr.nextSong('host', io);
    mgr.nextSong('host', io);

    expect(lobby.state).toBe('finished');

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('rejects if caller is not host', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    advanceToResults(mgr, lobby, io);

    mgr.nextSong('p2', io);
    expect(lobby.telephone.currentResultSong).toBe(0);
  });
});

describe('Telephone disconnect pause', () => {
  it('disconnecting mid-telephone pauses the phase and preserves slot', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);

    mgr.handleDisconnect('p2', io);

    expect(lobby.telephone.paused).toBe(true);
    expect(lobby.timerHandle).toBeNull();

    const p2 = lobby.players.find(p => p.nickname === 'Player2');
    expect(p2).toBeDefined();
    expect(p2.disconnected).toBe(true);
    expect(p2.abandoned).toBe(false);
    expect(p2.socketId).toBeNull();
    expect(lobby.players.length).toBe(3); // slot preserved
  });

  it('host disconnecting mid-telephone still closes the lobby', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);

    mgr.handleDisconnect('host', io);
    // _closeLobby deletes the lobby
    expect(mgr.lobbies.has(lobby.id)).toBe(false);
  });

  it('second disconnect adds to disconnectedNicknames, stays paused', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 4);
    const io = makeMockIo();
    mgr.startGame('host', io);

    mgr.handleDisconnect('p2', io);
    mgr.handleDisconnect('p3', io);

    expect(lobby.telephone.paused).toBe(true);
    const disconnected = lobby.players.filter(p => p.disconnected).map(p => p.nickname).sort();
    expect(disconnected).toEqual(['Player2', 'Player3']);
    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });
});

describe('Telephone pause/resume', () => {
  it('pauseTelephone stops the timer and sets paused flag', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    expect(lobby.telephone.paused).toBeFalsy();
    expect(lobby.timerHandle).toBeTruthy();

    mgr.pauseTelephone(lobby, ['Player2'], io);
    expect(lobby.telephone.paused).toBe(true);
    expect(lobby.timerHandle).toBeNull();
  });

  it('resumeTelephone re-arms timer and clears paused flag', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();
    mgr.startGame('host', io);
    mgr.pauseTelephone(lobby, ['Player2'], io);

    mgr.resumeTelephone(lobby, io);
    expect(lobby.telephone.paused).toBe(false);
    expect(lobby.timerHandle).toBeTruthy();
    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });

  it('abandoned players are auto-added to submissions at phase start', () => {
    const mgr = new GameManager();
    const lobby = createTelephoneLobby(mgr, 3);
    const io = makeMockIo();

    // Mark p2 as abandoned BEFORE startGame so _startPhase pre-adds the marker.
    const p2 = lobby.players.find(p => p.nickname === 'Player2');
    const p2Idx = lobby.players.indexOf(p2);
    p2.abandoned = true;

    mgr.startGame('host', io);
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }

    // _startPhase should have pre-added the abandoned:idx marker for p2.
    expect(lobby.telephone.submissions.has(`abandoned:${p2Idx}`)).toBe(true);

    // With the marker pre-added, host+p3 submitting (2 real + 1 abandoned = 3 total) advances the phase.
    mgr.submitRecording('host', Buffer.from('a'), io);
    mgr.submitRecording('p3', Buffer.from('a'), io);

    expect(lobby.telephone.currentPhase).toBeGreaterThanOrEqual(1);
    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });
});
