import React, { useState, useCallback } from 'react';
import socket from '../socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';

export default function Lobby({ nickname, lobby, goToMenu }) {
  const [errorMsg, setErrorMsg] = useState('');

  const isHost = lobby?.hostSocketId === socket.id;
  const isTelephone = lobby?.settings?.gameMode === 'telephone';
  const minPlayers = isTelephone ? 3 : 2;

  useSocketEvent('error', useCallback(({ message }) => setErrorMsg(message), []));

  function handleStartGame() {
    socket.emit('start-game');
  }

  function handleSettingChange(key, value) {
    socket.emit('update-settings', { ...lobby.settings, [key]: Number(value) });
  }

  if (!lobby) return null;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{lobby.name}</h2>
        <button onClick={goToMenu} style={{ padding: '6px 14px' }}>離開</button>
      </div>

      <p style={{ margin: '0 0 12px', padding: '6px 12px', background: isTelephone ? '#fef3c7' : '#dbeafe', borderRadius: 6, fontSize: 14 }}>
        {isTelephone ? '🎤 音樂傳聲筒' : '🎵 周杰倫猜歌'}
      </p>

      {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: '0 0 12px' }}>玩家 ({lobby.players.length}/{lobby.maxPlayers})</h4>
          {lobby.players.map(p => (
            <div key={p.nickname} style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}>
              {p.isHost ? '👑 ' : '🎵 '}
              {p.nickname}
              {p.nickname === nickname ? ' (你)' : ''}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: '0 0 12px' }}>設定</h4>

          {!isTelephone && (
            <>
              <label style={{ display: 'block', marginBottom: 4 }}>題數</label>
              {isHost ? (
                <select value={lobby.settings.numQuestions}
                  onChange={e => handleSettingChange('numQuestions', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', marginBottom: 12 }}>
                  {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n} 題</option>)}
                </select>
              ) : (
                <p style={{ margin: '0 0 12px', fontWeight: 600 }}>{lobby.settings.numQuestions} 題</p>
              )}

              <label style={{ display: 'block', marginBottom: 4 }}>每題時間</label>
              {isHost ? (
                <select value={lobby.settings.timeLimit}
                  onChange={e => handleSettingChange('timeLimit', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', marginBottom: 12 }}>
                  {[15, 30, 45].map(s => <option key={s} value={s}>{s} 秒</option>)}
                </select>
              ) : (
                <p style={{ margin: '0 0 12px', fontWeight: 600 }}>{lobby.settings.timeLimit} 秒</p>
              )}
            </>
          )}

          {isTelephone && (
            <>
              <label style={{ display: 'block', marginBottom: 4 }}>每回合時間</label>
              {isHost ? (
                <select value={lobby.settings.phaseDuration}
                  onChange={e => handleSettingChange('phaseDuration', e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', marginBottom: 12 }}>
                  {[60, 90, 120].map(s => <option key={s} value={s}>{s} 秒</option>)}
                </select>
              ) : (
                <p style={{ margin: '0 0 12px', fontWeight: 600 }}>{lobby.settings.phaseDuration} 秒</p>
              )}
            </>
          )}

          <p style={{ margin: 0, color: '#888', fontSize: 14 }}>
            {lobby.isPrivate ? '🔒 私人' : '🌐 公開'}
          </p>
        </div>
      </div>

      {isHost && (
        <button
          onClick={handleStartGame}
          disabled={lobby.players.length < minPlayers}
          style={{
            display: 'block', width: '100%', marginTop: 20, padding: 14,
            fontSize: 18, background: lobby.players.length >= minPlayers ? '#22c55e' : '#ccc',
            color: 'white', border: 'none', borderRadius: 8,
            cursor: lobby.players.length >= minPlayers ? 'pointer' : 'not-allowed',
          }}>
          開始遊戲 {lobby.players.length < minPlayers ? `（需要至少 ${minPlayers} 名玩家）` : ''}
        </button>
      )}
      {!isHost && (
        <p style={{ textAlign: 'center', color: '#888', marginTop: 20 }}>等待房主開始遊戲...</p>
      )}
    </div>
  );
}
