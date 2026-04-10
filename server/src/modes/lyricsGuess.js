import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { calculateScore, normalizeText } from '../scoring.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const allQuestions = JSON.parse(
  readFileSync(join(__dirname, '../../../questions.json'), 'utf-8')
);

export function startGame(lobby, io) {
  const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
  lobby.questions = shuffled.slice(0, lobby.settings.numQuestions);
  lobby.currentQuestionIndex = 0;
  lobby.players.forEach(p => { p.score = 0; });
  startQuestion(lobby, io);
}

export function submitAnswer(lobby, socketId, { answer }, io) {
  if (lobby.state !== 'in_question') return;
  if (lobby.currentAnswers.has(socketId)) return;

  const submittedMs = Date.now() - lobby.questionStartTime;
  lobby.currentAnswers.set(socketId, { answer, submittedMs });

  const player = lobby.players.find(p => p.socketId === socketId);
  if (player) io.to(lobby.id).emit('player-submitted', { nickname: player.nickname });

  if (lobby.currentAnswers.size >= lobby.players.length) {
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    endQuestion(lobby, io);
  }
}

export function updateDraft(lobby, socketId, answer) {
  if (lobby.state !== 'in_question') return;
  if (lobby.currentAnswers.has(socketId)) return;
  lobby.playerDrafts.set(socketId, answer);
}

export function nextQuestion(lobby, socketId, io) {
  if (lobby.hostSocketId !== socketId || lobby.state !== 'reveal') return;
  advanceQuestion(lobby, io);
}

export function startQuestion(lobby, io) {
  lobby.state = 'in_question';
  lobby.currentAnswers = new Map();
  lobby.playerDrafts = new Map();
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
      endQuestion(lobby, io);
    }
  }, 1000);
}

export function endQuestion(lobby, io) {
  if (lobby.state !== 'in_question') return;
  lobby.state = 'reveal';

  const q = lobby.questions[lobby.currentQuestionIndex];
  const timeLimitMs = lobby.settings.timeLimit * 1000;

  const results = lobby.players.map(player => {
    const submission = lobby.currentAnswers.get(player.socketId);
    let answer, submittedMs;
    if (submission) {
      answer = submission.answer;
      submittedMs = submission.submittedMs;
    } else {
      answer = lobby.playerDrafts.get(player.socketId) ?? '';
      submittedMs = null;
    }

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
}

export function advanceQuestion(lobby, io) {
  lobby.currentQuestionIndex++;

  if (lobby.currentQuestionIndex >= lobby.settings.numQuestions) {
    lobby.state = 'finished';
    const finalScores = [...lobby.players]
      .sort((a, b) => b.score - a.score)
      .map(p => ({ nickname: p.nickname, score: p.score }));
    io.to(lobby.id).emit('game-over', { finalScores, winner: finalScores[0]?.nickname ?? '' });
  } else {
    startQuestion(lobby, io);
  }
}
