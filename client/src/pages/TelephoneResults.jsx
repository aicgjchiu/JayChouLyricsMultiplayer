import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket.js';
import YouTubePlayer from '../components/YouTubePlayer.jsx';

export default function TelephoneResults({ results, lobby, finalData, goToMenu, goToLobby, rematchPlayers, hostWantsRematch, votedRematch, onWantRematch, onJoinRematch }) {
  const chainAudioRef = useRef(null);

  const isHost = lobby?.hostSocketId === socket.id;
  const isGameOver = !!finalData;

  if (!results || !results.results) return null;

  const songs = results.results;
  const currentSong = results.currentSongIndex || 0;
  const song = songs[currentSong];
  if (!song) return null;

  const chain = song.chain;
  const step = results.reviewStep || 0;

  // Steps: 0=youtube, 1..chain.length=recordings, chain.length+1=reveal, chain.length+2=freeplay
  const revealStep = chain.length + 1;
  const freeplayStep = chain.length + 2;
  const inFreeplay = step >= freeplayStep;
  const inReview = !inFreeplay;

  function handleAdvance() {
    if (step < freeplayStep) {
      socket.emit('advance-review');
    }
  }

  // Auto-play chain audio when step lands on a recording
  useEffect(() => {
    if (step >= 1 && step <= chain.length) {
      const t = setTimeout(() => {
        if (chainAudioRef.current) {
          chainAudioRef.current.play().catch(() => {});
        }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [step, currentSong]);

  const chainIdx = step - 1; // which chain entry is active (0-based)

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>結果回顧 — 歌曲 {currentSong + 1}/{songs.length}</h2>
      </div>

      {/* === STEP-BY-STEP REVIEW === */}
      {inReview && (
        <div style={{ textAlign: 'center' }}>
          {/* Step 0: YouTube original */}
          {step === 0 && (
            <div style={{ background: '#f0f9ff', border: '2px solid #3b82f6', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <p style={{ margin: '0 0 4px', fontSize: 13, color: '#3b82f6' }}>原曲</p>
              <p style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 700 }}>{song.songName}</p>
              <YouTubePlayer
                youtubeId={song.youtube.youtubeId}
                startTime={song.youtube.startTime}
                endTime={song.youtube.endTime}
                disabled={false}
                autoPlay
              />
            </div>
          )}

          {/* Steps 1..chain.length: Recordings */}
          {step >= 1 && step <= chain.length && (
            <div style={{ background: '#fef9c3', border: '2px solid #f59e0b', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <p style={{ margin: '0 0 4px', fontSize: 13, color: '#b45309' }}>
                第 {chain[chainIdx].phaseIndex + 1} 回合
              </p>
              <p style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>
                {chain[chainIdx].nickname}
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 15, color: '#666' }}>
                歌詞: {chain[chainIdx].lyrics}
              </p>
              {chain[chainIdx].audioUrl ? (
                <audio
                  ref={chainAudioRef}
                  key={`review-${currentSong}-${chainIdx}`}
                  src={chain[chainIdx].audioUrl}
                  preload="auto"
                  controls
                  style={{ width: '100%', maxWidth: 400 }}
                />
              ) : (
                <p style={{ color: '#bbb', fontStyle: 'italic' }}>（未錄音）</p>
              )}
            </div>
          )}

          {/* Reveal step */}
          {step === revealStep && (
            <div style={{ background: '#f0fdf4', border: '2px solid #22c55e', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <p style={{ margin: '0 0 4px', fontSize: 13, color: '#16a34a' }}>{song.guesserNickname} 猜的答案</p>
              <p style={{ margin: '0 0 12px', fontSize: 28, fontWeight: 700 }}>{song.guess}</p>
              <p style={{ margin: '0 0 4px', fontSize: 13, color: '#888' }}>正確答案</p>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: song.guess === song.songName ? '#16a34a' : '#dc2626' }}>
                {song.songName}
              </p>
            </div>
          )}

          {/* Progress dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12, marginBottom: 16 }}>
            {/* YouTube dot */}
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: step === 0 ? '#3b82f6' : '#d1d5db',
            }} />
            {/* Chain dots */}
            {chain.map((_, i) => (
              <span key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: step === i + 1 ? '#f59e0b' : step > i + 1 ? '#d1d5db' : '#e5e7eb',
              }} />
            ))}
            {/* Reveal dot */}
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: step === revealStep ? '#22c55e' : '#e5e7eb',
            }} />
          </div>

          {/* Host advance button */}
          {isHost && (
            <button
              onClick={handleAdvance}
              style={{ padding: '10px 28px', fontSize: 16, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              下一步 ▶
            </button>
          )}
          {!isHost && (
            <p style={{ color: '#888', fontSize: 14 }}>等待房主繼續...</p>
          )}
        </div>
      )}

      {/* === FREE-PLAY VIEW (per-song, hidden when game over since full recap takes over) === */}
      {inFreeplay && !isGameOver && (
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

      {isGameOver && (
        <div>
          <h2 style={{ textAlign: 'center' }}>🎉 遊戲結束 — 總回顧</h2>

          {songs.map((s, songIdx) => (
            <div key={songIdx} style={{ marginBottom: 24, border: '2px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px', borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>
                歌曲 {songIdx + 1} — {s.songName}
              </h3>

              {/* YouTube original */}
              <div style={{ background: '#f0f9ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
                <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>原曲 — {s.songName}</p>
                <YouTubePlayer
                  youtubeId={s.youtube.youtubeId}
                  startTime={s.youtube.startTime}
                  endTime={s.youtube.endTime}
                  disabled={false}
                />
              </div>

              {/* Recording chain */}
              {s.chain.map((entry, idx) => (
                <div key={idx} style={{
                  background: '#f5f5f5', border: '1px solid #e5e5e5',
                  borderRadius: 8, padding: '10px 16px', marginBottom: 6,
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

              {/* Guess */}
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 16px' }}>
                <p style={{ margin: '0 0 4px', fontSize: 13, color: '#16a34a' }}>{s.guesserNickname} 猜的答案</p>
                <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{s.guess}</p>
                <p style={{ margin: 0, fontSize: 14, color: s.guess === s.songName ? '#16a34a' : '#dc2626' }}>
                  正確答案: {s.songName} {s.guess === s.songName ? '✓' : '✗'}
                </p>
              </div>
            </div>
          ))}

          {/* Rematch / menu buttons */}
          <div style={{ textAlign: 'center', marginTop: 16 }}>
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
                  <button onClick={onJoinRematch}
                    style={{ padding: '10px 24px', fontSize: 15, background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                    加入
                  </button>
                  <button onClick={goToMenu}
                    style={{ padding: '10px 24px', fontSize: 15, background: 'white', border: '2px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
                    回主選單
                  </button>
                </div>
              </div>
            )}

            {!hostWantsRematch && (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                {isHost && (
                  <button onClick={() => goToLobby(true)}
                    style={{ padding: '12px 24px', fontSize: 16, background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                    再玩一次
                  </button>
                )}
                {!isHost && !votedRematch && (
                  <button onClick={onWantRematch}
                    style={{ padding: '12px 24px', fontSize: 16, background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                    🔥 再來一局
                  </button>
                )}
                {!isHost && votedRematch && (
                  <span style={{ padding: '12px 24px', fontSize: 15, color: '#16a34a', fontWeight: 600 }}>
                    已表示再來一局 ✓
                  </span>
                )}
                <button onClick={goToMenu}
                  style={{ padding: '12px 24px', fontSize: 16, background: 'white', border: '2px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
                  回主選單
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
