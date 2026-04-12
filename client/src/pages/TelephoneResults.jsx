import React, { useState, useEffect, useRef, useCallback } from 'react';
import socket from '../socket.js';
import YouTubePlayer from '../components/YouTubePlayer.jsx';

export default function TelephoneResults({ results, lobby, finalData, goToMenu, goToLobby, rematchPlayers, hostWantsRematch, votedRematch, onWantRematch, onJoinRematch }) {
  const [currentSong, setCurrentSong] = useState(0);
  // Auto-play stages: 'youtube' -> 'chain' -> 'reveal' -> 'freeplay'
  const [autoStage, setAutoStage] = useState('youtube');
  const [activeChainIdx, setActiveChainIdx] = useState(-1);
  const chainAudioRef = useRef(null);

  const isHost = lobby?.hostSocketId === socket.id;
  const isGameOver = !!finalData;

  // Reset auto-play when song changes
  useEffect(() => {
    if (results?.currentSongIndex !== undefined) {
      setCurrentSong(results.currentSongIndex);
      setAutoStage('youtube');
      setActiveChainIdx(-1);
    }
  }, [results?.currentSongIndex]);

  if (!results || !results.results) return null;

  const songs = results.results;
  const song = songs[currentSong];
  if (!song) return null;

  const chain = song.chain;

  // YouTube finished -> start chain auto-play
  function handleYoutubeEnded() {
    if (autoStage !== 'youtube') return;
    if (chain.length > 0 && chain[0].audioUrl) {
      setAutoStage('chain');
      setActiveChainIdx(0);
    } else {
      // No recordings, skip to reveal
      setAutoStage('reveal');
      setTimeout(() => setAutoStage('freeplay'), 3000);
    }
  }

  // Chain audio ended -> play next or move to reveal
  function handleChainAudioEnded() {
    const nextIdx = activeChainIdx + 1;
    if (nextIdx < chain.length && chain[nextIdx].audioUrl) {
      setActiveChainIdx(nextIdx);
    } else {
      setAutoStage('reveal');
      setTimeout(() => setAutoStage('freeplay'), 3000);
    }
  }

  // Play current chain entry when activeChainIdx changes
  useEffect(() => {
    if (autoStage === 'chain' && activeChainIdx >= 0) {
      // Small delay so the new audio element mounts
      const t = setTimeout(() => {
        if (chainAudioRef.current) {
          chainAudioRef.current.play().catch(() => {});
        }
      }, 400);
      return () => clearTimeout(t);
    }
  }, [autoStage, activeChainIdx]);

  const inAutoPlay = autoStage !== 'freeplay';
  const currentLabel = autoStage === 'youtube'
    ? song.songName
    : autoStage === 'chain' && activeChainIdx >= 0
      ? chain[activeChainIdx]?.nickname
      : null;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>結果回顧 — 歌曲 {currentSong + 1}/{songs.length}</h2>
      </div>

      {/* === AUTO-PLAY VIEW === */}
      {inAutoPlay && (
        <div style={{ textAlign: 'center' }}>
          {/* Now playing label */}
          {autoStage === 'youtube' && (
            <div style={{ background: '#f0f9ff', border: '2px solid #3b82f6', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <p style={{ margin: '0 0 4px', fontSize: 13, color: '#3b82f6' }}>正在播放原曲</p>
              <p style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 700 }}>{song.songName}</p>
              <YouTubePlayer
                youtubeId={song.youtube.youtubeId}
                startTime={song.youtube.startTime}
                endTime={song.youtube.endTime}
                disabled={false}
                autoPlay
                onEnded={handleYoutubeEnded}
              />
            </div>
          )}

          {autoStage === 'chain' && activeChainIdx >= 0 && (
            <div style={{ background: '#fef9c3', border: '2px solid #f59e0b', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <p style={{ margin: '0 0 4px', fontSize: 13, color: '#b45309' }}>
                第 {chain[activeChainIdx].phaseIndex + 1} 回合
              </p>
              <p style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>
                {chain[activeChainIdx].nickname}
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 15, color: '#666' }}>
                歌詞: {chain[activeChainIdx].lyrics}
              </p>
              <audio
                ref={chainAudioRef}
                key={`auto-${currentSong}-${activeChainIdx}`}
                src={chain[activeChainIdx].audioUrl}
                preload="auto"
                onEnded={handleChainAudioEnded}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 12, height: 12, background: '#ef4444', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
                <span style={{ fontSize: 15, color: '#888' }}>播放中...</span>
              </div>
            </div>
          )}

          {autoStage === 'reveal' && (
            <div style={{ background: '#f0fdf4', border: '2px solid #22c55e', borderRadius: 12, padding: 20, marginBottom: 16, animation: 'fadeIn 0.5s' }}>
              <p style={{ margin: '0 0 4px', fontSize: 13, color: '#16a34a' }}>{song.guesserNickname} 猜的答案</p>
              <p style={{ margin: '0 0 12px', fontSize: 28, fontWeight: 700 }}>{song.guess}</p>
              <p style={{ margin: '0 0 4px', fontSize: 13, color: '#888' }}>正確答案</p>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: song.guess === song.songName ? '#16a34a' : '#dc2626' }}>
                {song.songName}
              </p>
            </div>
          )}

          {/* Progress dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
            {/* YouTube dot */}
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: autoStage === 'youtube' ? '#3b82f6' : '#d1d5db',
            }} />
            {chain.map((_, i) => (
              <span key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: autoStage === 'chain' && i === activeChainIdx ? '#f59e0b'
                  : (autoStage === 'chain' && i < activeChainIdx) || autoStage === 'reveal' || autoStage === 'freeplay' ? '#d1d5db' : '#e5e7eb',
              }} />
            ))}
          </div>
        </div>
      )}

      {/* === FREE-PLAY VIEW (after auto-play completes) === */}
      {!inAutoPlay && (
        <>
          {/* YouTube original */}
          <div style={{ background: '#f0f9ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>原曲 — {song.songName}</p>
            <YouTubePlayer
              youtubeId={song.youtube.youtubeId}
              startTime={song.youtube.startTime}
              endTime={song.youtube.endTime}
              disabled={false}
            />
          </div>

          {/* Recording chain */}
          {chain.map((entry, idx) => (
            <div key={idx} style={{
              background: '#f5f5f5',
              border: '1px solid #e5e5e5',
              borderRadius: 8, padding: '10px 16px', marginBottom: 8,
            }}>
              <p style={{ margin: '0 0 4px', fontSize: 13, color: '#888' }}>
                第 {entry.phaseIndex + 1} 回合 — {entry.nickname}
              </p>
              <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 500 }}>歌詞: {entry.lyrics}</p>
              {entry.audioUrl ? (
                <audio src={entry.audioUrl} preload="auto" style={{ width: '100%' }} controls />
              ) : (
                <p style={{ color: '#bbb', fontStyle: 'italic', margin: 0 }}>（未錄音）</p>
              )}
            </div>
          ))}

          {/* Guess reveal */}
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#16a34a' }}>{song.guesserNickname} 猜的答案</p>
            <p style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>{song.guess}</p>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#888' }}>正確答案</p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: song.guess === song.songName ? '#16a34a' : '#dc2626' }}>
              {song.songName}
            </p>
          </div>

          {/* Navigation */}
          {!isGameOver && isHost && (
            <button
              onClick={() => socket.emit('next-song')}
              style={{ width: '100%', padding: '12px', fontSize: 16, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              下一首 ▶
            </button>
          )}
          {!isGameOver && !isHost && (
            <p style={{ textAlign: 'center', color: '#888', fontSize: 14 }}>等待房主繼續...</p>
          )}
        </>
      )}

      {isGameOver && !inAutoPlay && (
        <div style={{ textAlign: 'center' }}>
          <h2>🎉 遊戲結束</h2>

          {rematchPlayers?.length > 0 && !hostWantsRematch && (
            <div style={{ margin: '0 0 16px', padding: '8px 16px', background: '#fef3c7', borderRadius: 8 }}>
              {rematchPlayers.map(n => (
                <span key={n} style={{ display: 'inline-block', margin: '4px 8px', fontSize: 14 }}>
                  🔥 {n} 想再來一局
                </span>
              ))}
            </div>
          )}

          {hostWantsRematch && !isHost && (
            <div style={{ margin: '0 0 16px', padding: '16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8 }}>
              <p style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>房主想再來一局！</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  onClick={onJoinRematch}
                  style={{ padding: '10px 24px', fontSize: 15, background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                  加入
                </button>
                <button
                  onClick={goToMenu}
                  style={{ padding: '10px 24px', fontSize: 15, background: 'white', border: '2px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
                  回主選單
                </button>
              </div>
            </div>
          )}

          {!hostWantsRematch && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {isHost && (
                <button
                  onClick={() => goToLobby(true)}
                  style={{ padding: '12px 24px', fontSize: 16, background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                  再玩一次
                </button>
              )}
              {!isHost && !votedRematch && (
                <button
                  onClick={onWantRematch}
                  style={{ padding: '12px 24px', fontSize: 16, background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                  🔥 再來一局
                </button>
              )}
              {!isHost && votedRematch && (
                <span style={{ padding: '12px 24px', fontSize: 15, color: '#16a34a', fontWeight: 600 }}>
                  已表示再來一局 ✓
                </span>
              )}
              <button
                onClick={goToMenu}
                style={{ padding: '12px 24px', fontSize: 16, background: 'white', border: '2px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
                回主選單
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
