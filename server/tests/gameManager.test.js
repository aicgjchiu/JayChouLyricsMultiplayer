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

describe('GameManager.getPublicLobbies', () => {
  it('returns only public waiting lobbies', () => {
    const mgr = new GameManager();
    mgr.createLobby('h1', { nickname: 'H1', lobbyName: 'Public', numQuestions: 5, timeLimit: 30, isPrivate: false, password: null });
    mgr.createLobby('h2', { nickname: 'H2', lobbyName: 'Private', numQuestions: 5, timeLimit: 30, isPrivate: true, password: 'pw' });
    const list = mgr.getPublicLobbies();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Public');
  });
});
