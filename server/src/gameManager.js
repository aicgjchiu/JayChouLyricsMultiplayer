import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as lyricsGuessMode from './modes/lyricsGuess.js';
import * as telephoneMode from './modes/telephone.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export class GameManager {
  constructor() {
    this.lobbies = new Map();
    this.socketToLobby = new Map();
  }

  getLobby(socketId) {
    const code = this.socketToLobby.get(socketId);
    return code ? this.lobbies.get(code) : null;
  }

  getLobbies() {
    return [...this.lobbies.values()]
      .filter(l => l.state !== 'finished')
      .map(l => ({
        code: l.id,
        name: l.name,
        playerCount: l.players.filter(p => !p.abandoned).length,
        maxPlayers: l.maxPlayers,
        isPrivate: l.isPrivate,
        inProgress: l.state !== 'waiting',
        disconnectedNicknames: l.players.filter(p => p.disconnected && !p.abandoned).map(p => p.nickname),
      }));
  }

  lobbyPayload(lobby) {
    return {
      code: lobby.id,
      name: lobby.name,
      hostSocketId: lobby.hostSocketId,
      settings: lobby.settings,
      maxPlayers: lobby.maxPlayers,
      players: lobby.players.map(p => ({
        nickname: p.nickname,
        score: p.score,
        isHost: p.socketId === lobby.hostSocketId,
        disconnected: !!p.disconnected,
        abandoned: !!p.abandoned,
      })),
    };
  }

  createLobby(socketId, { nickname, lobbyName, numQuestions, timeLimit, isPrivate, password, gameMode, phaseDuration, playerId }) {
    let code;
    do { code = generateCode(); } while (this.lobbies.has(code));

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
      },
      players: [{ socketId, nickname, score: 0, playerId: playerId || null, disconnected: false, abandoned: false }],
      state: 'waiting',
      // Lyrics-guess fields
      questions: [],
      currentQuestionIndex: 0,
      currentAnswers: new Map(),
      playerDrafts: new Map(),
      timerHandle: null,
      revealTimer: null,
      questionStartTime: null,
      secondsRemaining: 0,
      // Telephone fields (populated at game start)
      telephone: null,
    };

    this.lobbies.set(code, lobby);
    this.socketToLobby.set(socketId, code);
    return lobby;
  }

  joinLobby(socketId, { lobbyCode, nickname, password, playerId }) {
    const code = (lobbyCode || '').toUpperCase();
    const lobby = this.lobbies.get(code);

    if (!lobby) return { error: 'Lobby not found' };
    if (lobby.state !== 'waiting') return { error: 'Game already in progress' };
    if (lobby.players.length >= lobby.maxPlayers) return { error: 'Lobby is full' };
    if (lobby.players.some(p => p.nickname === nickname)) return { error: 'Nickname already taken' };
    if (lobby.isPrivate && lobby.password !== password) return { error: 'Wrong password' };

    lobby.players.push({ socketId, nickname, score: 0, playerId: playerId || null, disconnected: false, abandoned: false });
    this.socketToLobby.set(socketId, code);
    return { lobby };
  }

  leaveLobby(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;

    this.socketToLobby.delete(socketId);

    if (lobby.hostSocketId === socketId) {
      this._closeLobby(lobby, io, 'host_closed');
      return;
    }

    if (lobby.state.startsWith('telephone_')) {
      // Preserve slot — playerIdx in telephone.assignments must stay valid.
      const player = lobby.players.find(p => p.socketId === socketId);
      if (!player) return;
      player.disconnected = true;
      player.socketId = null;

      const disconnectedNicknames = lobby.players
        .filter(p => p.disconnected && !p.abandoned)
        .map(p => p.nickname);
      if (disconnectedNicknames.length > 0) {
        telephoneMode.pause(lobby, disconnectedNicknames, io);
      }
      io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
      return;
    }

    // Non-telephone states: existing behavior (filter out).
    lobby.players = lobby.players.filter(p => p.socketId !== socketId);

    if (lobby.state === 'waiting') {
      io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
    } else if (lobby.state === 'in_question') {
      if (lobby.players.length === 0) {
        if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
        this.lobbies.delete(lobby.id);
        return;
      }
      if (lobby.currentAnswers.size >= lobby.players.length) {
        if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
        lyricsGuessMode.endQuestion(lobby, io);
      }
    } else if (lobby.state === 'reveal') {
      if (lobby.players.length === 0) {
        if (lobby.revealTimer) { clearTimeout(lobby.revealTimer); lobby.revealTimer = null; }
        this.lobbies.delete(lobby.id);
        return;
      }
      io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
    } else if (lobby.state === 'finished') {
      io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
    }
  }

  handleDisconnect(socketId, io) {
    this.leaveLobby(socketId, io);
  }

  startGame(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'waiting') return;

    if (lobby.settings.gameMode === 'telephone') {
      if (lobby.players.length < 3) return;
      telephoneMode.startGame(lobby, io);
      return;
    }

    if (lobby.players.length < 2) return;
    lyricsGuessMode.startGame(lobby, io);
  }

  restartLobby(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'finished') return;

    if (lobby.revealTimer) { clearTimeout(lobby.revealTimer); lobby.revealTimer = null; }
    lobby.state = 'waiting';
    lobby.questions = [];
    lobby.currentQuestionIndex = 0;
    lobby.currentAnswers = new Map();
    lobby.playerDrafts = new Map();
    lobby.players.forEach(p => { p.score = 0; });
    lobby.telephone = null;

    io.to(lobby.id).emit('lobby-restarted');
    io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
  }

  updateSettings(socketId, data, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'waiting') return;
    if (data.numQuestions) lobby.settings.numQuestions = data.numQuestions;
    if (data.timeLimit) lobby.settings.timeLimit = data.timeLimit;
    if (data.phaseDuration) lobby.settings.phaseDuration = data.phaseDuration;
    if (data.gameMode) lobby.settings.gameMode = data.gameMode;
    io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
  }

  submitAnswer(socketId, data, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;
    lyricsGuessMode.submitAnswer(lobby, socketId, data, io);
  }

  updateDraft(socketId, answer) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;
    lyricsGuessMode.updateDraft(lobby, socketId, answer);
  }

  nextQuestion(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;
    lyricsGuessMode.nextQuestion(lobby, socketId, io);
  }

  // Keep _endQuestion and _nextQuestion as delegation methods for backward compatibility
  // (tests call mgr._endQuestion and mgr._nextQuestion directly)
  _endQuestion(lobby, io) {
    lyricsGuessMode.endQuestion(lobby, io);
  }

  _nextQuestion(lobby, io) {
    lyricsGuessMode.advanceQuestion(lobby, io);
  }

  submitRecording(socketId, audioBuffer, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;
    telephoneMode.submitRecording(lobby, socketId, audioBuffer, io);
  }

  submitGuess(socketId, guess, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;
    telephoneMode.submitGuess(lobby, socketId, guess, io);
  }

  nextSong(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;
    telephoneMode.nextSong(lobby, socketId, io);
  }

  advanceReview(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby) return;
    telephoneMode.advanceReview(lobby, socketId, io);
  }

  pauseTelephone(lobby, disconnectedNicknames, io) {
    telephoneMode.pause(lobby, disconnectedNicknames, io);
  }

  resumeTelephone(lobby, io) {
    telephoneMode.resume(lobby, io);
  }

  wantRematch(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.state !== 'finished') return;
    if (lobby.hostSocketId === socketId) return;
    const player = lobby.players.find(p => p.socketId === socketId);
    if (!player) return;
    io.to(lobby.id).emit('player-wants-rematch', { nickname: player.nickname });
  }

  _closeLobby(lobby, io, reason) {
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    if (lobby.revealTimer) { clearTimeout(lobby.revealTimer); lobby.revealTimer = null; }
    io.to(lobby.id).emit('kicked-to-menu', { reason });
    lobby.players.forEach(p => this.socketToLobby.delete(p.socketId));
    this.lobbies.delete(lobby.id);
  }
}
