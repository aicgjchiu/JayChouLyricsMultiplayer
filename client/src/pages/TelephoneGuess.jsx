import React, { useState, useRef, useEffect, useCallback } from 'react';
import socket from '../socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';

export default function TelephoneGuess({ guess, timer, lobby, nickname }) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedPlayers, setSubmittedPlayers] = useState([]);
  const audioRef = useRef(null);

  useEffect(() => {
    setAnswer('');
    setSubmitted(false);
    setSubmittedPlayers([]);
    if (audioRef.current) {
      audioRef.current.load();
      audioRef.current.play().catch(() => {});
    }
  }, [guess]);

  useSocketEvent('player-submitted', useCallback(({ nickname: n }) => {
    setSubmittedPlayers(prev => [...prev, n]);
  }, []));

  // Auto-submit on timer expiry
  useEffect(() => {
    if (timer <= 0 && !submitted) {
      handleSubmit();
    }
  }, [timer]);

  function handleSubmit(e) {
    if (e) e.preventDefault();
    if (submitted) return;
    setSubmitted(true);
    socket.emit('submit-guess', { guess: answer });
  }

  if (!guess) return null;

  const timerColor = timer <= 10 ? '#ef4444' : '#1f2937';

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 16, color: '#555' }}>猜歌名</span>
        <span style={{ fontSize: 28, fontWeight: 700, color: timerColor }}>⏱ {timer}s</span>
      </div>

      <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 16, marginBottom: 16, textAlign: 'center' }}>
        <p style={{ margin: '0 0 8px', color: '#888', fontSize: 14 }}>聽聽這段錄音，猜猜是哪首歌？</p>
        <audio ref={audioRef} src={guess.audioUrl} preload="auto" style={{ width: '100%', marginBottom: 8 }} controls />
        <button
          onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); } }}
          style={{ padding: '6px 16px', fontSize: 14 }}>
          🔁 重播
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          disabled={submitted}
          placeholder={submitted ? '已提交' : '輸入歌名...'}
          style={{
            width: '100%', padding: '10px 12px', fontSize: 16, boxSizing: 'border-box',
            border: '2px solid #ddd', borderRadius: 8,
            background: submitted ? '#f9f9f9' : 'white',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="submit" disabled={submitted} style={{
            padding: '8px 20px', fontSize: 15,
            background: submitted ? '#ccc' : '#3b82f6', color: 'white',
            border: 'none', borderRadius: 6, cursor: submitted ? 'not-allowed' : 'pointer',
          }}>
            {submitted ? '已提交 ✓' : '提交'}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 20, borderTop: '1px solid #eee', paddingTop: 12 }}>
        <p style={{ color: '#888', fontSize: 13, margin: '0 0 8px' }}>其他玩家</p>
        {lobby?.players
          .filter(p => p.nickname !== nickname)
          .map(p => (
            <span key={p.nickname} style={{ marginRight: 12, fontSize: 14 }}>
              {submittedPlayers.includes(p.nickname) ? '✅' : '✍️'} {p.nickname}
            </span>
          ))}
      </div>
    </div>
  );
}
