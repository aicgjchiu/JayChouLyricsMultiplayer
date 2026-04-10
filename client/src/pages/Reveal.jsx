import React from 'react';
import socket from '../socket.js';

export default function Reveal({ revealData, lobby }) {
  if (!revealData) return null;

  const isHost = lobby?.hostSocketId === socket.id;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>本題結果</h2>
        {isHost ? (
          <button
            onClick={() => socket.emit('next-question')}
            style={{ padding: '8px 20px', fontSize: 15, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            下一題 ▶
          </button>
        ) : (
          <p style={{ margin: 0, color: '#888', fontSize: 14 }}>等待房主繼續...</p>
        )}
      </div>

      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 16px', marginBottom: 20 }}>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: '#16a34a' }}>正確答案</p>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{revealData.correctAnswer}</p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ddd', color: '#888', fontSize: 13 }}>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>玩家</th>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>答案</th>
            <th style={{ padding: '6px 8px', textAlign: 'center' }}>準確率</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>得分</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>總分</th>
          </tr>
        </thead>
        <tbody>
          {revealData.results.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '8px 8px', fontWeight: 500 }}>{r.nickname}</td>
              <td style={{ padding: '8px 8px', color: r.answer ? '#333' : '#bbb', fontStyle: r.answer ? 'normal' : 'italic' }}>
                {r.answer || '（未作答）'}
              </td>
              <td style={{ padding: '8px 8px', textAlign: 'center', color: r.accuracy >= 80 ? '#16a34a' : r.accuracy >= 50 ? '#d97706' : '#dc2626' }}>
                {r.accuracy}%
              </td>
              <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600, color: r.pointsEarned > 0 ? '#16a34a' : '#888' }}>
                +{r.pointsEarned}
              </td>
              <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700 }}>
                {r.totalScore}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
