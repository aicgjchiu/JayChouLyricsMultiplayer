import React from 'react';
import socket from '../socket.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Results({ finalData, lobby, goToLobby, goToMenu, rematchPlayers, hostWantsRematch, votedRematch, onWantRematch, onJoinRematch }) {
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
              style={{ flex: 1, padding: 12, fontSize: 16, background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              再玩一次
            </button>
          )}
          {!isHost && !votedRematch && (
            <button
              onClick={onWantRematch}
              style={{ flex: 1, padding: 12, fontSize: 16, background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              🔥 再來一局
            </button>
          )}
          {!isHost && votedRematch && (
            <span style={{ flex: 1, padding: 12, fontSize: 15, color: '#16a34a', fontWeight: 600 }}>
              已表示再來一局 ✓
            </span>
          )}
          <button
            onClick={goToMenu}
            style={{ flex: 1, padding: 12, fontSize: 16, background: 'white', border: '2px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
            回主選單
          </button>
        </div>
      )}
    </div>
  );
}
