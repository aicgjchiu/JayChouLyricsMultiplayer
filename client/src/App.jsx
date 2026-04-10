import React, { useState, useCallback } from 'react';
import socket from './socket.js';
import { useSocketEvent } from './hooks/useSocket.js';
import MainMenu from './pages/MainMenu.jsx';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';
import Reveal from './pages/Reveal.jsx';
import Results from './pages/Results.jsx';

export default function App() {
  const [page, setPage] = useState('menu');
  const [nickname, setNickname] = useState('');
  const [lobby, setLobby] = useState(null);
  const [question, setQuestion] = useState(null);
  const [timer, setTimer] = useState(0);
  const [revealData, setRevealData] = useState(null);
  const [finalData, setFinalData] = useState(null);

  useSocketEvent('lobby-updated', useCallback((data) => setLobby(data), []));

  useSocketEvent('joined-lobby', useCallback(() => setPage('lobby'), []));

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

  useSocketEvent('game-over', useCallback((data) => {
    setFinalData(data);
    setPage('results');
  }, []));

  useSocketEvent('kicked-to-menu', useCallback(() => {
    setPage('menu');
    setLobby(null);
    setQuestion(null);
    setRevealData(null);
    setFinalData(null);
  }, []));

  const goToMenu = useCallback(() => {
    socket.emit('leave-lobby');
    setPage('menu');
    setLobby(null);
    setQuestion(null);
    setRevealData(null);
    setFinalData(null);
  }, []);

  const goToLobby = useCallback((isHost) => {
    if (isHost) socket.emit('restart-lobby');
    setPage('lobby');
    setQuestion(null);
    setRevealData(null);
    setFinalData(null);
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
    </>
  );
}
