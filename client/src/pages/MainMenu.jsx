import React, { useState, useEffect, useCallback } from 'react';
import socket from '../socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';
import { getPlayerId } from '../playerId.js';

export default function MainMenu({ nickname, setNickname }) {
  const [view, setView] = useState('home'); // 'home' | 'create'
  const [lobbyList, setLobbyList] = useState([]);
  const [form, setForm] = useState({
    lobbyName: '', numQuestions: 10, timeLimit: 30, isPrivate: false, password: '',
    gameMode: 'lyrics-guess', phaseDuration: 90,
  });
  const [joiningPrivate, setJoiningPrivate] = useState(null); // lobby object | null
  const [privatePassword, setPrivatePassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [rejoinTarget, setRejoinTarget] = useState(null); // lobby object or null
  const [rejoinNickname, setRejoinNickname] = useState('');

  useEffect(() => {
    const fetchLobbies = () => socket.emit('get-lobbies');
    fetchLobbies();
    socket.on('connect', fetchLobbies);
    const interval = setInterval(fetchLobbies, 5000);
    return () => {
      socket.off('connect', fetchLobbies);
      clearInterval(interval);
    };
  }, []);

  useSocketEvent('lobby-list', useCallback((list) => setLobbyList(list), []));
  useSocketEvent('error', useCallback(({ message }) => setErrorMsg(message), []));

  function handleCreate(e) {
    e.preventDefault();
    if (!nickname.trim()) { setErrorMsg('請輸入暱稱'); return; }
    setErrorMsg('');
    socket.emit('create-lobby', {
      playerId: getPlayerId(),
      nickname: nickname.trim(),
      lobbyName: form.lobbyName || `${nickname.trim()}'s Lobby`,
      numQuestions: form.numQuestions,
      timeLimit: form.timeLimit,
      isPrivate: form.isPrivate,
      password: form.isPrivate ? form.password : null,
      gameMode: form.gameMode,
      phaseDuration: form.phaseDuration,
    });
  }

  function handleQuickJoin(lobby) {
    if (!nickname.trim()) { setErrorMsg('請先輸入暱稱'); return; }
    if (lobby.isPrivate) {
      setErrorMsg('');
      setJoiningPrivate(lobby);
      setPrivatePassword('');
      return;
    }
    setErrorMsg('');
    socket.emit('join-lobby', { playerId: getPlayerId(), lobbyCode: lobby.code, nickname: nickname.trim(), password: null });
  }

  function handleRejoinPrompt(l) {
    setErrorMsg('');
    setRejoinTarget(l);
    setRejoinNickname(nickname.trim() || '');
    setJoiningPrivate(null);
  }

  function handleRejoinConfirm(e) {
    e.preventDefault();
    if (!rejoinTarget) return;
    if (!rejoinNickname.trim()) { setErrorMsg('請輸入你斷線前的暱稱'); return; }
    socket.emit('reconnect-lobby', {
      lobbyCode: rejoinTarget.code,
      nickname: rejoinNickname.trim(),
      playerId: getPlayerId(),
    });
  }

  function handlePrivateJoin(e) {
    e.preventDefault();
    if (!nickname.trim()) { setErrorMsg('請先輸入暱稱'); return; }
    setErrorMsg('');
    // joiningPrivate is intentionally not cleared here — keeps form open on wrong-password error.
    // On success, App.jsx navigates away and unmounts MainMenu, clearing state implicitly.
    socket.emit('join-lobby', { playerId: getPlayerId(), lobbyCode: joiningPrivate.code, nickname: nickname.trim(), password: privatePassword || null });
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
          <div style={{ marginBottom: 24 }}>
            <button onClick={() => setView('create')} style={{ width: '100%', padding: 10, fontSize: 16 }}>
              建立 Lobby
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Lobbies</h3>
            <button onClick={() => socket.emit('get-lobbies')} style={{ padding: '4px 10px', fontSize: 13 }}>重新整理</button>
          </div>
          {lobbyList.length === 0 && <p style={{ color: '#888' }}>目前沒有 Lobby</p>}
          {lobbyList.map(l => (
            <div key={l.code} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ flex: 1 }}>
                  {l.isPrivate ? '🔒 ' : ''}{l.name}
                  {l.inProgress && <span style={{ marginLeft: 8, fontSize: 12, color: '#f97316' }}>（遊玩中）</span>}
                </span>
                <span style={{ color: '#888', fontSize: 14 }}>{l.playerCount}/{l.maxPlayers} 人</span>
                {!l.inProgress && (
                  <button
                    onClick={() => handleQuickJoin(l)}
                    disabled={l.playerCount >= l.maxPlayers}
                    style={{ padding: '4px 12px', opacity: l.playerCount >= l.maxPlayers ? 0.4 : 1, cursor: l.playerCount >= l.maxPlayers ? 'not-allowed' : 'pointer' }}
                  >加入</button>
                )}
                {l.inProgress && l.disconnectedNicknames && l.disconnectedNicknames.length > 0 && (
                  <button
                    onClick={() => handleRejoinPrompt(l)}
                    style={{ padding: '4px 12px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  >重新加入</button>
                )}
              </div>
              {l.inProgress && l.disconnectedNicknames && l.disconnectedNicknames.length > 0 && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
                  斷線中：{l.disconnectedNicknames.join('、')}
                </p>
              )}
              {joiningPrivate?.code === l.code && (
                <form onSubmit={handlePrivateJoin} style={{ padding: '8px 0', display: 'flex', gap: 8 }}>
                  <input
                    value={privatePassword}
                    onChange={e => setPrivatePassword(e.target.value)}
                    placeholder={`「${joiningPrivate.name}」的密碼`}
                    type="password"
                    autoFocus
                    style={{ flex: 1, padding: '6px 10px', boxSizing: 'border-box' }}
                  />
                  <button type="submit" style={{ padding: '6px 12px' }}>確認</button>
                  <button type="button" onClick={() => { setJoiningPrivate(null); setErrorMsg(''); }} style={{ padding: '6px 12px' }}>取消</button>
                </form>
              )}
              {rejoinTarget?.code === l.code && (
                <form onSubmit={handleRejoinConfirm} style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, margin: '6px 0 0', padding: '8px' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 13 }}>
                    輸入你斷線前的暱稱（當前斷線：{l.disconnectedNicknames.join('、')}）
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={rejoinNickname}
                      onChange={e => setRejoinNickname(e.target.value)}
                      placeholder="例如 Player2"
                      autoFocus
                      style={{ flex: 1, padding: '6px 10px', boxSizing: 'border-box' }}
                    />
                    <button type="submit" style={{ padding: '6px 12px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 4 }}>重新加入</button>
                    <button type="button" onClick={() => { setRejoinTarget(null); setErrorMsg(''); }} style={{ padding: '6px 12px' }}>取消</button>
                  </div>
                </form>
              )}
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

          <label>遊戲模式</label>
          <select value={form.gameMode} onChange={e => setForm(f => ({ ...f, gameMode: e.target.value }))}
            style={{ width: '100%', padding: '6px 10px', margin: '4px 0 12px' }}>
            <option value="lyrics-guess">周杰倫猜歌</option>
            <option value="telephone">音樂傳聲筒</option>
          </select>

          {form.gameMode === 'lyrics-guess' && (
            <>
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
            </>
          )}

          {form.gameMode === 'telephone' && (
            <>
              <label>每回合時間</label>
              <select value={form.phaseDuration} onChange={e => setForm(f => ({ ...f, phaseDuration: Number(e.target.value) }))}
                style={{ width: '100%', padding: '6px 10px', margin: '4px 0 12px' }}>
                {[60, 90, 120].map(s => <option key={s} value={s}>{s} 秒</option>)}
              </select>
            </>
          )}

          <label>
            <input type="checkbox" checked={form.isPrivate} onChange={e => setForm(f => ({ ...f, isPrivate: e.target.checked }))} />
            {' '}私人 Lobby（需要密碼）
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
    </div>
  );
}
