import React, { useState, useEffect, useCallback } from 'react';
import socket from '../socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';

export default function MainMenu({ nickname, setNickname }) {
  const [view, setView] = useState('home'); // 'home' | 'create' | 'join'
  const [lobbyList, setLobbyList] = useState([]);
  const [form, setForm] = useState({
    lobbyName: '', numQuestions: 10, timeLimit: 30, isPrivate: false, password: '',
  });
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    socket.emit('get-lobbies');
    const interval = setInterval(() => socket.emit('get-lobbies'), 5000);
    return () => clearInterval(interval);
  }, []);

  useSocketEvent('lobby-list', useCallback((list) => setLobbyList(list), []));
  useSocketEvent('error', useCallback(({ message }) => setErrorMsg(message), []));

  function handleCreate(e) {
    e.preventDefault();
    if (!nickname.trim()) { setErrorMsg('請輸入暱稱'); return; }
    setErrorMsg('');
    socket.emit('create-lobby', {
      nickname: nickname.trim(),
      lobbyName: form.lobbyName || `${nickname.trim()}'s Lobby`,
      numQuestions: form.numQuestions,
      timeLimit: form.timeLimit,
      isPrivate: form.isPrivate,
      password: form.isPrivate ? form.password : null,
    });
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!nickname.trim()) { setErrorMsg('請輸入暱稱'); return; }
    if (!joinCode.trim()) { setErrorMsg('請輸入邀請碼'); return; }
    setErrorMsg('');
    socket.emit('join-lobby', {
      lobbyCode: joinCode.trim().toUpperCase(),
      nickname: nickname.trim(),
      password: joinPassword || null,
    });
  }

  function handleQuickJoin(code) {
    if (!nickname.trim()) { setErrorMsg('請先輸入暱稱'); return; }
    setErrorMsg('');
    socket.emit('join-lobby', { lobbyCode: code, nickname: nickname.trim(), password: null });
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <h1 style={{ textAlign: 'center', marginBottom: 24 }}>🎵 Jay Chou Lyrics</h1>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4 }}>暱稱</label>
        <input
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          placeholder="輸入你的暱稱..."
          maxLength={16}
          style={{ width: '100%', padding: '8px 12px', fontSize: 16, boxSizing: 'border-box' }}
        />
      </div>

      {errorMsg && <p style={{ color: 'red', margin: '8px 0' }}>{errorMsg}</p>}

      {view === 'home' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <button onClick={() => setView('create')} style={{ flex: 1, padding: 10, fontSize: 16 }}>
              建立 Lobby
            </button>
            <button onClick={() => setView('join')} style={{ flex: 1, padding: 10, fontSize: 16 }}>
              加入 Lobby
            </button>
          </div>

          <h3 style={{ marginBottom: 8 }}>公開 Lobbies</h3>
          {lobbyList.length === 0 && <p style={{ color: '#888' }}>目前沒有公開 Lobby</p>}
          {lobbyList.map(l => (
            <div key={l.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
              <span>{l.name}</span>
              <span style={{ color: '#888', fontSize: 14 }}>{l.playerCount}/{l.maxPlayers} 人</span>
              <button onClick={() => handleQuickJoin(l.code)} style={{ padding: '4px 12px' }}>加入</button>
            </div>
          ))}
        </>
      )}

      {view === 'create' && (
        <form onSubmit={handleCreate}>
          <h3>建立 Lobby</h3>
          <label>Lobby 名稱</label>
          <input value={form.lobbyName} onChange={e => setForm(f => ({ ...f, lobbyName: e.target.value }))}
            placeholder={`${nickname || '你'}'s Lobby`} style={{ width: '100%', padding: '6px 10px', margin: '4px 0 12px', boxSizing: 'border-box' }} />

          <label>題數</label>
          <select value={form.numQuestions} onChange={e => setForm(f => ({ ...f, numQuestions: Number(e.target.value) }))}
            style={{ width: '100%', padding: '6px 10px', margin: '4px 0 12px' }}>
            {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n} 題</option>)}
          </select>

          <label>每題時間</label>
          <select value={form.timeLimit} onChange={e => setForm(f => ({ ...f, timeLimit: Number(e.target.value) }))}
            style={{ width: '100%', padding: '6px 10px', margin: '4px 0 12px' }}>
            {[15, 30, 45].map(s => <option key={s} value={s}>{s} 秒</option>)}
          </select>

          <label>
            <input type="checkbox" checked={form.isPrivate} onChange={e => setForm(f => ({ ...f, isPrivate: e.target.checked }))} />
            {' '}私人 Lobby
          </label>
          {form.isPrivate && (
            <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="設定密碼" style={{ width: '100%', padding: '6px 10px', margin: '8px 0 12px', boxSizing: 'border-box' }} />
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" style={{ flex: 1, padding: 10 }}>建立</button>
            <button type="button" onClick={() => setView('home')} style={{ flex: 1, padding: 10 }}>返回</button>
          </div>
        </form>
      )}

      {view === 'join' && (
        <form onSubmit={handleJoin}>
          <h3>加入 Lobby</h3>
          <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="邀請碼 (6 碼)" maxLength={6}
            style={{ width: '100%', padding: '8px 12px', margin: '4px 0 12px', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 18, letterSpacing: 4 }} />
          <input value={joinPassword} onChange={e => setJoinPassword(e.target.value)}
            placeholder="密碼（私人 Lobby 才需要）" type="password"
            style={{ width: '100%', padding: '6px 10px', margin: '4px 0 12px', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={{ flex: 1, padding: 10 }}>加入</button>
            <button type="button" onClick={() => setView('home')} style={{ flex: 1, padding: 10 }}>返回</button>
          </div>
        </form>
      )}
    </div>
  );
}
