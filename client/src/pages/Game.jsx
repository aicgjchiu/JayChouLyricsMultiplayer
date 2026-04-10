import React, { useState, useRef, useEffect, useCallback } from 'react';
import socket from '../socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';
import { getCharCount } from '../utils/scoring.js';

export default function Game({ question, timer, lobby, nickname }) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedPlayers, setSubmittedPlayers] = useState([]);
  const audioRef = useRef(null);

  // Reset state when a new question arrives
  useEffect(() => {
    setAnswer('');
    setSubmitted(false);
    setSubmittedPlayers([]);
    if (audioRef.current) {
      audioRef.current.load();
      audioRef.current.play().catch(() => {});
    }
  }, [question?.questionIndex]);

  useSocketEvent('player-submitted', useCallback(({ nickname: submitterNickname }) => {
    setSubmittedPlayers(prev => [...prev, submitterNickname]);
  }, []));

  function handleAnswerChange(e) {
    const newAnswer = e.target.value;
    setAnswer(newAnswer);
    if (!submitted) {
      socket.emit('update-draft', { answer: newAnswer });
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (submitted) return;
    socket.emit('submit-answer', { answer });
    setSubmitted(true);
  }

  if (!question) return null;

  const timerColor = timer <= 10 ? '#ef4444' : '#1f2937';
  const typedCount = getCharCount(answer);

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 16, color: '#555' }}>第 {question.questionIndex} / {question.total} 題</span>
        <span style={{ fontSize: 28, fontWeight: 700, color: timerColor }}>⏱ {timer}s</span>
      </div>

      <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 16, marginBottom: 16, textAlign: 'center' }}>
        <p style={{ margin: '0 0 4px', color: '#888', fontSize: 14 }}>提示：{question.hint}（共 {question.charCount} 字）</p>
        <audio ref={audioRef} src={question.audioUrl} preload="auto" style={{ width: '100%', marginBottom: 8 }} controls />
        <button
          onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); } }}
          style={{ padding: '6px 16px', fontSize: 14 }}>
          🔁 重播
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <textarea
          value={answer}
          onChange={handleAnswerChange}
          disabled={submitted}
          placeholder={submitted ? '已提交' : '輸入歌詞...'}
          rows={2}
          style={{
            width: '100%', padding: '10px 12px', fontSize: 16, boxSizing: 'border-box',
            border: '2px solid #ddd', borderRadius: 8, resize: 'none',
            background: submitted ? '#f9f9f9' : 'white',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ color: '#888', fontSize: 14 }}>{typedCount} / {question.charCount} 字</span>
          <button type="submit" disabled={submitted} style={{ padding: '8px 20px', fontSize: 15, background: submitted ? '#ccc' : '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: submitted ? 'not-allowed' : 'pointer' }}>
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
