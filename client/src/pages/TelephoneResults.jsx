import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket.js';
import YouTubePlayer from '../components/YouTubePlayer.jsx';

export default function TelephoneResults({ results, lobby, finalData, goToMenu, goToLobby, rematchPlayers, hostWantsRematch, votedRematch, onWantRematch, onJoinRematch }) {
  const [currentSong, setCurrentSong] = useState(0);
  const [autoPlayIndex, setAutoPlayIndex] = useState(0);
  const [autoPlayDone, setAutoPlayDone] = useState(false);
  const audioRefs = useRef([]);

  const isHost = lobby?.hostSocketId === socket.id;
  const isGameOver = !!finalData;

  // Update currentSong from server events
  useEffect(() => {
    if (results?.currentSongIndex !== undefined) {
      setCurrentSong(results.currentSongIndex);
      setAutoPlayIndex(0);
      setAutoPlayDone(false);
    }
  }, [results?.currentSongIndex]);

  if (!results || !results.results) return null;

  const songs = results.results;
  const song = songs[currentSong];
  if (!song) return null;

  const chainLength = song.chain.length;

  function handleAudioEnded(idx) {
    if (autoPlayDone) return;
    const nextIdx = idx + 1;
    if (nextIdx < chainLength) {
      setAutoPlayIndex(nextIdx);
      setTimeout(() => {
        if (audioRefs.current[nextIdx]) {
          audioRefs.current[nextIdx].play().catch(() => {});
        }
      }, 500);
    } else {
      setAutoPlayDone(true);
    }
  }

  function handlePlayEntry(idx) {
    audioRefs.current.forEach((ref, i) => {
      if (ref && i !== idx) { ref.pause(); ref.currentTime = 0; }
    });
    if (audioRefs.current[idx]) {
      audioRefs.current[idx].currentTime = 0;
      audioRefs.current[idx].play().catch(() => {});
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>結果回顧 — 歌曲 {currentSong + 1}/{songs.length}</h2>
      </div>

      {/* YouTube original */}
      <div style={{ background: '#f0f9ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
        <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>原曲</p>
        <YouTubePlayer
          youtubeId={song.youtube.youtubeId}
          startTime={song.youtube.startTime}
          endTime={song.youtube.endTime}
          disabled={false}
        />
      </div>

      {/* Recording chain */}
      {song.chain.map((entry, idx) => (
        <div key={idx} style={{
          background: autoPlayIndex === idx && !autoPlayDone ? '#fef9c3' : '#f5f5f5',
          border: autoPlayIndex === idx && !autoPlayDone ? '1px solid #fcd34d' : '1px solid #e5e5e5',
          borderRadius: 8, padding: '10px 16px', marginBottom: 8,
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#888' }}>
            第 {entry.phaseIndex + 1} 回合 — {entry.nickname}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 500 }}>歌詞: {entry.lyrics}</p>
          {entry.audioUrl ? (
            <>
              <audio
                ref={el => audioRefs.current[idx] = el}
                src={entry.audioUrl}
                preload="auto"
                onEnded={() => handleAudioEnded(idx)}
                style={{ width: '100%' }}
                controls
              />
              {autoPlayDone && (
                <button onClick={() => handlePlayEntry(idx)}
                  style={{ marginTop: 4, padding: '4px 12px', fontSize: 13 }}>
                  ▶ 播放
                </button>
              )}
            </>
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

      {isGameOver && (
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
