import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameManager } from '../src/gameManager.js';

function makeMockIo() {
  const emitFn = vi.fn();
  return {
    to: vi.fn().mockReturnValue({ emit: emitFn }),
    _emitFn: emitFn,
  };
}

describe('GameManager.createLobby', () => {
  it('returns a lobby with a 6-char uppercase code', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('socket1', {
      nickname: 'Alice', lobbyName: 'Test', numQuestions: 10, timeLimit: 30,
      isPrivate: false, password: null,
    });
    expect(lobby.id).toMatch(/^[A-Z0-9]{6}$/);
    expect(lobby.players).toHaveLength(1);
    expect(lobby.players[0].nickname).toBe('Alice');
    expect(lobby.state).toBe('waiting');
  });

  it('registers socket in socketToLobby map', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('socket1', {
      nickname: 'Alice', lobbyName: 'Test', numQuestions: 10, timeLimit: 30,
      isPrivate: false, password: null,
    });
    expect(mgr.getLobby('socket1')).toBe(lobby);
  });
});

describe('GameManager.joinLobby', () => {
  let mgr, lobby;
  beforeEach(() => {
    mgr = new GameManager();
    lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
  });

  it('allows a second player to join', () => {
    const result = mgr.joinLobby('socket2', { lobbyCode: lobby.id, nickname: 'Bob', password: null });
    expect(result.error).toBeUndefined();
    expect(result.lobby.players).toHaveLength(2);
  });

  it('rejects wrong lobby code', () => {
    const result = mgr.joinLobby('socket2', { lobbyCode: 'XXXXXX', nickname: 'Bob', password: null });
    expect(result.error).toBe('Lobby not found');
  });

  it('rejects duplicate nickname', () => {
    const result = mgr.joinLobby('socket2', { lobbyCode: lobby.id, nickname: 'Host', password: null });
    expect(result.error).toBe('Nickname already taken');
  });

  it('rejects when lobby is full', () => {
    for (let i = 2; i <= 8; i++) {
      mgr.joinLobby(`socket${i}`, { lobbyCode: lobby.id, nickname: `Player${i}`, password: null });
    }
    const result = mgr.joinLobby('socket9', { lobbyCode: lobby.id, nickname: 'Extra', password: null });
    expect(result.error).toBe('Lobby is full');
  });

  it('rejects wrong password for private lobby', () => {
    const privLobby = mgr.createLobby('host2', {
      nickname: 'Host2', lobbyName: 'Private', numQuestions: 5, timeLimit: 30,
      isPrivate: true, password: 'secret',
    });
    const result = mgr.joinLobby('socket2', { lobbyCode: privLobby.id, nickname: 'Bob', password: 'wrong' });
    expect(result.error).toBe('Wrong password');
  });

  it('accepts correct password for private lobby', () => {
    const privLobby = mgr.createLobby('host2', {
      nickname: 'Host2', lobbyName: 'Private', numQuestions: 5, timeLimit: 30,
      isPrivate: true, password: 'secret',
    });
    const result = mgr.joinLobby('socket2', { lobbyCode: privLobby.id, nickname: 'Bob', password: 'secret' });
    expect(result.error).toBeUndefined();
  });
});

describe('GameManager.leaveLobby', () => {
  it('host leaving closes the lobby and emits kicked-to-menu', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.leaveLobby('host', io);
    expect(io.to).toHaveBeenCalledWith(lobby.id);
    expect(io._emitFn).toHaveBeenCalledWith('kicked-to-menu', { reason: 'host_closed' });
    expect(mgr.lobbies.has(lobby.id)).toBe(false);
  });

  it('non-host leaving removes them from player list', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.leaveLobby('p2', io);
    expect(lobby.players).toHaveLength(1);
    expect(lobby.players[0].nickname).toBe('Host');
  });
});

describe('GameManager.getLobbies', () => {
  it('returns all waiting lobbies (public and private) with isPrivate field', () => {
    const mgr = new GameManager();
    mgr.createLobby('h1', { nickname: 'H1', lobbyName: 'Public', numQuestions: 5, timeLimit: 30, isPrivate: false, password: null });
    mgr.createLobby('h2', { nickname: 'H2', lobbyName: 'Private', numQuestions: 5, timeLimit: 30, isPrivate: true, password: 'pw' });
    const list = mgr.getLobbies();
    expect(list).toHaveLength(2);
    const pub = list.find(l => l.name === 'Public');
    const priv = list.find(l => l.name === 'Private');
    expect(pub.isPrivate).toBe(false);
    expect(priv.isPrivate).toBe(true);
  });

  it('excludes lobbies that are in_question or finished', () => {
    const mgr = new GameManager();
    mgr.createLobby('h1', { nickname: 'H1', lobbyName: 'Waiting', numQuestions: 5, timeLimit: 30, isPrivate: false, password: null });
    const inProg = mgr.createLobby('h2', { nickname: 'H2', lobbyName: 'InProgress', numQuestions: 5, timeLimit: 30, isPrivate: false, password: null });
    inProg.state = 'in_question';
    const finished = mgr.createLobby('h3', { nickname: 'H3', lobbyName: 'Finished', numQuestions: 5, timeLimit: 30, isPrivate: false, password: null });
    finished.state = 'finished';
    const list = mgr.getLobbies();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Waiting');
  });
});

describe('GameManager.startGame', () => {
  it('rejects if socket is not host', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('p2', io);
    expect(lobby.state).toBe('waiting'); // state unchanged
  });

  it('rejects if fewer than 2 players', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    const io = makeMockIo();
    mgr.startGame('host', io);
    expect(lobby.state).toBe('waiting');
  });

  it('transitions to in_question and emits question-start', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('host', io);
    expect(lobby.state).toBe('in_question');
    expect(io.to).toHaveBeenCalledWith(lobby.id);
    expect(io._emitFn).toHaveBeenCalledWith('question-start', expect.objectContaining({
      questionIndex: 1,
      total: 5,
      timeLimit: 30,
    }));
    // Clean up timer
    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
  });
});

describe('GameManager.submitAnswer', () => {
  it('records submission and emits player-submitted', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('host', io);
    io._emitFn.mockClear();
    io.to.mockClear();

    mgr.submitAnswer('host', { answer: '測試' }, io);
    expect(lobby.currentAnswers.has('host')).toBe(true);
    expect(io._emitFn).toHaveBeenCalledWith('player-submitted', { nickname: 'Host' });

    // Clean up timer
    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
    if (lobby.revealTimer) clearTimeout(lobby.revealTimer);
  });

  it('ignores duplicate submissions from same player', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('host', io);

    mgr.submitAnswer('host', { answer: '測試' }, io);
    const sizeAfterFirst = lobby.currentAnswers.size;
    mgr.submitAnswer('host', { answer: '再次' }, io);
    expect(lobby.currentAnswers.size).toBe(sizeAfterFirst);

    if (lobby.timerHandle) clearInterval(lobby.timerHandle);
    if (lobby.revealTimer) clearTimeout(lobby.revealTimer);
  });

  it('emits question-end when all players submit', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('host', {
      nickname: 'Host', lobbyName: 'Room', numQuestions: 5, timeLimit: 30,
      isPrivate: false, password: null,
    });
    mgr.joinLobby('p2', { lobbyCode: lobby.id, nickname: 'Player2', password: null });
    const io = makeMockIo();
    mgr.startGame('host', io);

    mgr.submitAnswer('host', { answer: '測試' }, io);
    mgr.submitAnswer('p2', { answer: '歌詞' }, io);

    expect(lobby.state).toBe('reveal');
    expect(io._emitFn).toHaveBeenCalledWith('question-end', expect.objectContaining({
      correctAnswer: expect.any(String),
      results: expect.arrayContaining([
        expect.objectContaining({ nickname: 'Host' }),
        expect.objectContaining({ nickname: 'Player2' }),
      ]),
    }));

    if (lobby.revealTimer) clearTimeout(lobby.revealTimer);
  });
});

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

    expect(lobby.currentAnswers.get('p2').answer).toBe('正式提交');
    expect(lobby.playerDrafts.has('p2')).toBe(false);

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
    lobby.playerDrafts = new Map([['p2', 'old draft']]);

    const io = makeMockIo();
    mgr.startGame('host', io);
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

    mgr.updateDraft('p2', '太陽之子');
    mgr.submitAnswer('host', { answer: '答案' }, io);
    io._emitFn.mockClear();
    io.to.mockClear();

    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    mgr._endQuestion(lobby, io);

    const [, payload] = io._emitFn.mock.calls.find(([event]) => event === 'question-end');
    const p2Result = payload.results.find(r => r.nickname === 'Player2');
    expect(p2Result.answer).toBe('太陽之子');

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

    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    mgr._endQuestion(lobby, io);

    const [, payload] = io._emitFn.mock.calls.find(([event]) => event === 'question-end');
    const p2Result = payload.results.find(r => r.nickname === 'Player2');
    expect(p2Result.answer).toBe('');
    expect(p2Result.pointsEarned).toBe(0);

    if (lobby.revealTimer) clearTimeout(lobby.revealTimer);
  });
});

describe('playerId persistence', () => {
  it('stores playerId on the host player slot', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('sock1', { nickname: 'A', gameMode: 'lyrics-guess', playerId: 'pid-A' });
    expect(lobby.players[0].playerId).toBe('pid-A');
    expect(lobby.players[0].disconnected).toBe(false);
    expect(lobby.players[0].abandoned).toBe(false);
  });

  it('stores playerId on a joining player slot', () => {
    const mgr = new GameManager();
    const lobby = mgr.createLobby('sock1', { nickname: 'A', gameMode: 'lyrics-guess', playerId: 'pid-A' });
    mgr.joinLobby('sock2', { lobbyCode: lobby.id, nickname: 'B', password: null, playerId: 'pid-B' });
    expect(lobby.players[1].playerId).toBe('pid-B');
    expect(lobby.players[1].disconnected).toBe(false);
  });
});

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
