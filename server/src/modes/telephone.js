import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildAssignments } from '../rotation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const allSongs = JSON.parse(
  readFileSync(join(__dirname, '../../../songs.json'), 'utf-8')
);
const allLyrics = JSON.parse(
  readFileSync(join(__dirname, '../../../lyrics.json'), 'utf-8')
);

export function startGame(lobby, io) {
  const N = lobby.players.length;

  const shuffledSongs = [...allSongs].sort(() => Math.random() - 0.5);
  const songs = shuffledSongs.slice(0, N);

  const selectedSongNames = new Set(songs.map(s => s.name));
  const eligibleLyrics = allLyrics.filter(l => !selectedSongNames.has(l.songName));
  const shuffledLyrics = [...eligibleLyrics].sort(() => Math.random() - 0.5);
  const lyrics = shuffledLyrics.slice(0, N);

  const assignments = buildAssignments(N);

  lobby.telephone = {
    songs,
    lyrics,
    assignments,
    currentPhase: 0,
    recordings: new Map(),
    submissions: new Set(),
    guesses: new Map(),
    currentResultSong: 0,
  };

  _startPhase(lobby, io);
}

export function submitRecording(lobby, socketId, audioBuffer, io) {
  if (lobby.state !== 'telephone_phase') return;
  if (lobby.telephone.submissions.has(socketId)) return;

  const tel = lobby.telephone;
  const playerIdx = lobby.players.findIndex(p => p.socketId === socketId);
  if (playerIdx === -1) return;

  const phase = tel.assignments.singPhases[tel.currentPhase];
  const songIdx = phase.findIndex(a => a.playerIdx === playerIdx);
  if (songIdx === -1) return;

  tel.recordings.set(`${songIdx}-${tel.currentPhase}`, audioBuffer);
  tel.submissions.add(socketId);

  io.to(lobby.id).emit('player-submitted', {
    nickname: lobby.players[playerIdx].nickname,
  });

  if (tel.submissions.size >= lobby.players.length) {
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    _endPhase(lobby, io);
  }
}

export function submitGuess(lobby, socketId, guess, io) {
  if (lobby.state !== 'telephone_guess') return;
  if (lobby.telephone.submissions.has(socketId)) return;

  const tel = lobby.telephone;
  const playerIdx = lobby.players.findIndex(p => p.socketId === socketId);
  if (playerIdx === -1) return;

  const guessAssignment = tel.assignments.guessPhase.find(g => g.playerIdx === playerIdx);
  if (!guessAssignment) return;

  tel.guesses.set(guessAssignment.songIdx, {
    playerSocketId: socketId,
    nickname: lobby.players[playerIdx].nickname,
    guess,
  });
  tel.submissions.add(socketId);

  if (tel.submissions.size >= lobby.players.length) {
    if (lobby.timerHandle) { clearInterval(lobby.timerHandle); lobby.timerHandle = null; }
    _startResults(lobby, io);
  }
}

export function nextSong(lobby, socketId, io) {
  if (lobby.state !== 'telephone_results') return;
  if (lobby.hostSocketId !== socketId) return;

  const tel = lobby.telephone;
  tel.currentResultSong++;
  tel.currentReviewStep = 0;

  if (tel.currentResultSong >= tel.songs.length) {
    lobby.state = 'finished';
    io.to(lobby.id).emit('game-over', { mode: 'telephone' });
  } else {
    io.to(lobby.id).emit('telephone-next-song', {
      songIndex: tel.currentResultSong,
      reviewStep: 0,
    });
  }
}

function _startPhase(lobby, io) {
  lobby.state = 'telephone_phase';
  const tel = lobby.telephone;
  tel.submissions = new Set();
  lobby.secondsRemaining = lobby.settings.phaseDuration;

  const phase = tel.assignments.singPhases[tel.currentPhase];

  for (let songIdx = 0; songIdx < phase.length; songIdx++) {
    const assignment = phase[songIdx];
    const player = lobby.players[assignment.playerIdx];
    const song = tel.songs[songIdx];
    const lyric = tel.lyrics[assignment.lyricIdx];

    let audioUrl, audioType;
    if (tel.currentPhase === 0) {
      audioType = 'youtube';
      audioUrl = { youtubeId: song.youtubeId, startTime: song.startTime, endTime: song.endTime };
    } else {
      audioType = 'recording';
      const prevKey = `${songIdx}-${tel.currentPhase - 1}`;
      if (tel.recordings.has(prevKey)) {
        audioUrl = `/recordings/${lobby.id}/${songIdx}/${tel.currentPhase - 1}`;
      } else {
        audioUrl = _findFallbackAudio(tel, songIdx, tel.currentPhase - 1, lobby.id);
      }
    }

    io.to(player.socketId).emit('telephone-phase-start', {
      phaseIndex: tel.currentPhase,
      songLabel: `歌曲 ${songIdx + 1}`,
      lyrics: lyric.text,
      audioUrl,
      audioType,
      phaseDuration: lobby.settings.phaseDuration,
      isFirstPhase: tel.currentPhase === 0,
    });
  }

  lobby.timerHandle = setInterval(() => {
    lobby.secondsRemaining--;
    io.to(lobby.id).emit('telephone-timer-tick', { secondsRemaining: lobby.secondsRemaining });
    if (lobby.secondsRemaining <= 0) {
      clearInterval(lobby.timerHandle);
      lobby.timerHandle = null;
      _endPhase(lobby, io);
    }
  }, 1000);
}

function _endPhase(lobby, io) {
  const tel = lobby.telephone;
  io.to(lobby.id).emit('telephone-phase-end', { phaseIndex: tel.currentPhase });

  tel.currentPhase++;

  if (tel.currentPhase >= lobby.players.length - 1) {
    _startGuess(lobby, io);
  } else {
    _startPhase(lobby, io);
  }
}

function _startGuess(lobby, io) {
  lobby.state = 'telephone_guess';
  const tel = lobby.telephone;
  tel.submissions = new Set();
  lobby.secondsRemaining = lobby.settings.phaseDuration;

  for (const guess of tel.assignments.guessPhase) {
    const player = lobby.players[guess.playerIdx];
    const songIdx = guess.songIdx;

    const lastPhase = lobby.players.length - 2;
    const lastKey = `${songIdx}-${lastPhase}`;
    let audioUrl;
    if (tel.recordings.has(lastKey)) {
      audioUrl = `/recordings/${lobby.id}/${songIdx}/${lastPhase}`;
    } else {
      audioUrl = _findFallbackAudio(tel, songIdx, lastPhase, lobby.id);
    }

    io.to(player.socketId).emit('telephone-guess-start', {
      audioUrl,
      phaseDuration: lobby.settings.phaseDuration,
    });
  }

  lobby.timerHandle = setInterval(() => {
    lobby.secondsRemaining--;
    io.to(lobby.id).emit('telephone-timer-tick', { secondsRemaining: lobby.secondsRemaining });
    if (lobby.secondsRemaining <= 0) {
      clearInterval(lobby.timerHandle);
      lobby.timerHandle = null;
      _startResults(lobby, io);
    }
  }, 1000);
}

export function advanceReview(lobby, socketId, io) {
  if (lobby.state !== 'telephone_results') return;
  if (lobby.hostSocketId !== socketId) return;

  const tel = lobby.telephone;
  const song = tel.resultsData[tel.currentResultSong];
  // Total steps: 0=youtube, 1..chain.length=recordings, chain.length+1=reveal, chain.length+2=freeplay
  const maxStep = song.chain.length + 2;

  tel.currentReviewStep++;

  if (tel.currentReviewStep > maxStep) return;

  io.to(lobby.id).emit('telephone-review-step', {
    songIndex: tel.currentResultSong,
    step: tel.currentReviewStep,
  });
}

function _startResults(lobby, io) {
  lobby.state = 'telephone_results';
  const tel = lobby.telephone;
  tel.currentResultSong = 0;
  tel.currentReviewStep = 0; // starts at youtube (step 0)

  const results = tel.songs.map((song, songIdx) => {
    const chain = [];
    for (let p = 0; p < lobby.players.length - 1; p++) {
      const assignment = tel.assignments.singPhases[p][songIdx];
      const player = lobby.players[assignment.playerIdx];
      const lyric = tel.lyrics[assignment.lyricIdx];
      const hasRecording = tel.recordings.has(`${songIdx}-${p}`);
      chain.push({
        nickname: player.nickname,
        lyrics: lyric.text,
        audioUrl: hasRecording ? `/recordings/${lobby.id}/${songIdx}/${p}` : null,
        phaseIndex: p,
      });
    }

    const guessData = tel.guesses.get(songIdx);

    return {
      songName: song.name,
      youtube: { youtubeId: song.youtubeId, startTime: song.startTime, endTime: song.endTime },
      chain,
      guess: guessData ? guessData.guess : '（未作答）',
      guesserNickname: guessData ? guessData.nickname : '?',
    };
  });

  tel.resultsData = results;

  io.to(lobby.id).emit('telephone-results-start', { results, reviewStep: 0 });
}

function _findFallbackAudio(tel, songIdx, targetPhase, lobbyId) {
  for (let p = targetPhase; p >= 0; p--) {
    if (tel.recordings.has(`${songIdx}-${p}`)) {
      return `/recordings/${lobbyId}/${songIdx}/${p}`;
    }
  }
  return null;
}
