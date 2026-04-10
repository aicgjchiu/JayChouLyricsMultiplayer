import React, { useState, useCallback } from 'react';
import socket from './socket.js';
import { useSocketEvent } from './hooks/useSocket.js';
import MainMenu from './pages/MainMenu.jsx';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';
import Reveal from './pages/Reveal.jsx';
import Results from './pages/Results.jsx';
import TelephonePhase from './pages/TelephonePhase.jsx';
import TelephoneGuess from './pages/TelephoneGuess.jsx';
import TelephoneResults from './pages/TelephoneResults.jsx';

export default function App() {
  const [page, setPage] = useState('menu');
  const [nickname, setNickname] = useState('');
  const [lobby, setLobby] = useState(null);
  const [question, setQuestion] = useState(null);
  const [timer, setTimer] = useState(0);
  const [revealData, setRevealData] = useState(null);
  const [finalData, setFinalData] = useState(null);
  // Telephone mode state
  const [phonePhase, setPhonePhase] = useState(null);
  const [phoneGuess, setPhoneGuess] = useState(null);
  const [phoneResults, setPhoneResults] = useState(null);

  useSocketEvent('lobby-updated', useCallback((data) => setLobby(data), []));

  useSocketEvent('joined-lobby', useCallback(() => setPage('lobby'), []));

  // Lyrics-guess events
  useSocketEvent('question-start', useCallback((data) => {
    setQuestion(data);
    setTimer(data.timeLimit);
    setRevealData(null);
    setPage('game');
  }, []));

  useSocketEvent('timer-tick', useCallback(({ secondsRemaining }) => {
    setTimer(secondsRemaining);
  }, []));

  useSocketEvent('question-end', useCallback((data) => {
    setRevealData(data);
    setPage('reveal');
  }, []));

  // Telephone events
  useSocketEvent('telephone-phase-start', useCallback((data) => {
    setPhonePhase(data);
    setTimer(data.phaseDuration);
    setPage('telephone-phase');
  }, []));

  useSocketEvent('telephone-timer-tick', useCallback(({ secondsRemaining }) => {
    setTimer(secondsRemaining);
  }, []));

  useSocketEvent('telephone-phase-end', useCallback(() => {
    // Brief transition — next phase-start will arrive shortly
  }, []));

  useSocketEvent('telephone-guess-start', useCallback((data) => {
    setPhoneGuess(data);
    setTimer(data.phaseDuration);
    setPage('telephone-guess');
  }, []));

  useSocketEvent('telephone-results-start', useCallback((data) => {
    setPhoneResults(data);
    setPage('telephone-results');
  }, []));

  useSocketEvent('telephone-next-song', useCallback(({ songIndex }) => {
    setPhoneResults(prev => prev ? { ...prev, currentSongIndex: songIndex } : prev);
  }, []));

  useSocketEvent('game-over', useCallback((data) => {
    setFinalData(data);
    if (data.mode === 'telephone') {
      setPage('telephone-results');
    } else {
      setPage('results');
    }
  }, []));

  useSocketEvent('kicked-to-menu', useCallback(() => {
    setPage('menu');
    setLobby(null);
    setQuestion(null);
    setRevealData(null);
    setFinalData(null);
    setPhonePhase(null);
    setPhoneGuess(null);
    setPhoneResults(null);
  }, []));

  const goToMenu = useCallback(() => {
    socket.emit('leave-lobby');
    setPage('menu');
    setLobby(null);
    setQuestion(null);
    setRevealData(null);
    setFinalData(null);
    setPhonePhase(null);
    setPhoneGuess(null);
    setPhoneResults(null);
  }, []);

  const goToLobby = useCallback((isHost) => {
    if (isHost) socket.emit('restart-lobby');
    setPage('lobby');
    setQuestion(null);
    setRevealData(null);
    setFinalData(null);
    setPhonePhase(null);
    setPhoneGuess(null);
    setPhoneResults(null);
  }, []);

  const sharedProps = {
    nickname, setNickname,
    lobby, setLobby,
    question, timer,
    revealData, finalData,
    setPage, goToMenu, goToLobby,
  };

  return (
    <>
      {page === 'menu' && <MainMenu {...sharedProps} />}
      {page === 'lobby' && <Lobby {...sharedProps} />}
      {page === 'game' && <Game {...sharedProps} />}
      {page === 'reveal' && <Reveal {...sharedProps} />}
      {page === 'results' && <Results {...sharedProps} />}
      {page === 'telephone-phase' && <TelephonePhase phase={phonePhase} timer={timer} lobby={lobby} nickname={nickname} />}
      {page === 'telephone-guess' && <TelephoneGuess guess={phoneGuess} timer={timer} lobby={lobby} nickname={nickname} />}
      {page === 'telephone-results' && (
        <TelephoneResults results={phoneResults} lobby={lobby} finalData={finalData} goToMenu={goToMenu} goToLobby={goToLobby} />
      )}
    </>
  );
}
