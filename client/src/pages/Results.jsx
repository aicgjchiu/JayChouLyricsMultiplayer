import React from 'react';
import socket from '../socket.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Results({ finalData, lobby, goToLobby, goToMenu }) {
  if (!finalData) return null;

  const isHost = lobby?.hostSocketId === socket.id;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24, textAlign: 'center' }}>
      <h1 style={{ marginBottom: 4 }}>🏆 遊戲結束</h1>
      {finalData.winner && (
        <p style={{ fontSize: 20, marginBottom: 24, color: '#f59e0b' }}>
          恭喜 <strong>{finalData.winner}</strong> 獲勝！
        </p>
      )}

      <div style={{ border: '1px solid #ddd', borderRadius: 10, overflow: 'hidden', marginBottom: 28 }}>
        {finalData.finalScores.map((p, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px', borderBottom: i < finalData.finalScores.length - 1 ? '1px solid #eee' : 'none',
            background: i === 0 ? '#fefce8' : 'white',
          }}>
            <span style={{ fontSize: 22, width: 32 }}>{MEDALS[i] || `${i + 1}`}</span>
            <span style={{ flex: 1, textAlign: 'left', fontWeight: i === 0 ? 700 : 400, fontSize: 16 }}>{p.nickname}</span>
            <span style={{ fontWeight: 700, fontSize: 18 }}>{p.score} 分</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button
          onClick={() => goToLobby(isHost)}
          style={{ flex: 1, padding: 12, fontSize: 16, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          返回 Lobby
        </button>
        <button
          onClick={goToMenu}
          style={{ flex: 1, padding: 12, fontSize: 16, background: 'white', border: '2px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
          回主選單
        </button>
      </div>
    </div>
  );
}
