import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { calculateScore, normalizeText } from './scoring.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const allQuestions = JSON.parse(
  readFileSync(join(__dirname, '../../questions.json'), 'utf-8')
);

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export class GameManager {
  constructor() {
    this.lobbies = new Map();       // code -> lobby
    this.socketToLobby = new Map(); // socketId -> code
  }

  getLobby(socketId) {
    const code = this.socketToLobby.get(socketId);
    return code ? this.lobbies.get(code) : null;
  }

  getPublicLobbies() {
    return [...this.lobbies.values()]
      .filter(l => !l.isPrivate && l.state === 'waiting')
      .map(l => ({ code: l.id, name: l.name, playerCount: l.players.length, maxPlayers: l.maxPlayers }));
  }

  lobbyPayload(lobby) {
    return {
      code: lobby.id,
      name: lobby.name,
      hostSocketId: lobby.hostSocketId,
      settings: lobby.settings,
      maxPlayers: lobby.maxPlayers,
      players: lobby.players.map(p => ({ nickname: p.nickname, score: p.score, isHost: p.socketId === lobby.hostSocketId })),
    };
  }

  createLobby(socketId, { nickname, lobbyName, numQuestions, timeLimit, isPrivate, password }) {
    let code;
    do { code = generateCode(); } while (this.lobbies.has(code));

    const lobby = {
      id: code,
      name: lobbyName || `${nickname}'s Lobby`,
      hostSocketId: socketId,
      isPrivate: Boolean(isPrivate),
      password: password || null,
      maxPlayers: 8,
      settings: { numQuestions: Math.min(numQuestions || 10, allQuestions.length), timeLimit: timeLimit || 30 },
      players: [{ socketId, nickname, score: 0 }],
      state: 'waiting',
      questions: [],
      currentQuestionIndex: 0,
      currentAnswers: new Map(),
      timerHandle: null,
      revealTimer: null,
      questionStartTime: null,
      secondsRemaining: 0,
    };

    this.lobbies.set(code, lobby);
    this.socketToLobby.set(socketId, code);
    return lobby;
  }

  joinLobby(socketId, { lobbyCode, nickname, password }) {
    const code = (lobbyCode || '').toUpperCase();
    const lobby = this.lobbies.get(code);

    if (!lobby) return { error: 'Lobby not found' };
    if (lobby.state !== 'waiting') return { error: 'Game already in progress' };
    if (lobby.players.length >= lobby.maxPlayers) return { error: 'Lobby is full' };
    if (lobby.players.some(p => p.nickname === nickname)) return { error: 'Nickname already taken' };
    if (lobby.isPrivate && lobby.password !== password) return { error: 'Wrong password' };

    lobby.players.push({ socketId, nickname, score: 0 });
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
        this._endQuestion(lobby, io);
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
    if (!lobby || lobby.hostSocketId !== socketId) return;
    if (lobby.players.length < 2 || lobby.state !== 'waiting') return;

    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    lobby.questions = shuffled.slice(0, lobby.settings.numQuestions);
    lobby.currentQuestionIndex = 0;
    lobby.players.forEach(p => { p.score = 0; });

    this._startQuestion(lobby, io);
  }

  restartLobby(socketId, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'finished') return;

    if (lobby.revealTimer) { clearTimeout(lobby.revealTimer); lobby.revealTimer = null; }
    lobby.state = 'waiting';
    lobby.questions = [];
    lobby.currentQuestionIndex = 0;
    lobby.currentAnswers = new Map();
    lobby.players.forEach(p => { p.score = 0; });

    io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
  }

  updateSettings(socketId, { numQuestions, timeLimit }, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.hostSocketId !== socketId || lobby.state !== 'waiting') return;
    if (numQuestions) lobby.settings.numQuestions = numQuestions;
    if (timeLimit) lobby.settings.timeLimit = timeLimit;
    io.to(lobby.id).emit('lobby-updated', this.lobbyPayload(lobby));
  }

  submitAnswer(socketId, { answer }, io) {
    const lobby = this.getLobby(socketId);
    if (!lobby || lobby.state !== 'in_question') return;
    if (lobby.currentAnswers.has(socketId)) return;

    const submittedMs = Date.now() - lobby.questionStartTime;
    lobby.currentAnswers.set(socketId, { answer, submittedMs });

    const player = lobby.players.find(p => p.socketId === socketId);
    if (player) io.to(lobby.id).emit('player-submitted', { nickname: player.nickname });

    if (lobby.currentAnswers.size >= lobby.players.length) {
      if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
      this._endQuestion(lobby, io);
    }
  }

  _startQuestion(lobby, io) {
    lobby.state = 'in_question';
    lobby.currentAnswers = new Map();
    lobby.questionStartTime = Date.now();
    lobby.secondsRemaining = lobby.settings.timeLimit;

    const q = lobby.questions[lobby.currentQuestionIndex];
    io.to(lobby.id).emit('question-start', {
      audioUrl: `/${q.audio}`,
      charCount: normalizeText(q.answer).length,
      hint: q.hint,
      questionIndex: lobby.currentQuestionIndex + 1,
      total: lobby.settings.numQuestions,
      timeLimit: lobby.settings.timeLimit,
    });

    lobby.timerHandle = setInterval(() => {
      lobby.secondsRemaining--;
      io.to(lobby.id).emit('timer-tick', { secondsRemaining: lobby.secondsRemaining });
      if (lobby.secondsRemaining <= 0) {
        clearInterval(lobby.timerHandle);
        lobby.timerHandle = null;
        this._endQuestion(lobby, io);
      }
    }, 1000);
  }

  _endQuestion(lobby, io) {
    if (lobby.state !== 'in_question') return;
    lobby.state = 'reveal';

    const q = lobby.questions[lobby.currentQuestionIndex];
    const timeLimitMs = lobby.settings.timeLimit * 1000;

    const results = lobby.players.map(player => {
      const submission = lobby.currentAnswers.get(player.socketId);
      const answer = submission?.answer ?? '';
      const submittedMs = submission?.submittedMs ?? null;

      const { accuracyScore, speedBonus, accuracy } = calculateScore(answer, q.answer, submittedMs, timeLimitMs);
      const pointsEarned = accuracyScore + speedBonus;
      player.score += pointsEarned;

      return {
        nickname: player.nickname,
        answer,
        accuracy: Math.round(accuracy * 100),
        pointsEarned,
        totalScore: player.score,
      };
    });

    io.to(lobby.id).emit('question-end', { correctAnswer: q.answer, results });

    lobby.revealTimer = setTimeout(() => {
      lobby.revealTimer = null;
      this._nextQuestion(lobby, io);
    }, 5000);
  }

  _nextQuestion(lobby, io) {
    lobby.currentQuestionIndex++;

    if (lobby.currentQuestionIndex >= lobby.settings.numQuestions) {
      lobby.state = 'finished';
      const finalScores = [...lobby.players]
        .sort((a, b) => b.score - a.score)
        .map(p => ({ nickname: p.nickname, score: p.score }));
      io.to(lobby.id).emit('game-over', { finalScores, winner: finalScores[0]?.nickname ?? '' });
    } else {
      this._startQuestion(lobby, io);
    }
  }

  _closeLobby(lobby, io, reason) {
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    if (lobby.revealTimer) { clearTimeout(lobby.revealTimer); lobby.revealTimer = null; }
    io.to(lobby.id).emit('kicked-to-menu', { reason });
    lobby.players.forEach(p => this.socketToLobby.delete(p.socketId));
    this.lobbies.delete(lobby.id);
  }
}
