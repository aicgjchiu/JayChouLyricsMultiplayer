import { describe, it, expect } from 'vitest';
import { GameManager } from '../src/gameManager.js';

function mkIo() { return { to: () => ({ emit: () => {} }) }; }

describe('telephone config in settings', () => {
  it('createLobby defaults telephone flags + label', () => {
    const m = new GameManager();
    const lobby = m.createLobby('s1', { nickname: 'A', gameMode: 'telephone' });
    expect(lobby.settings.audioLockOnRecord).toBe(true);
    expect(lobby.settings.singalongEnabled).toBe(false);
    expect(lobby.settings.distractionEnabled).toBe(false);
    expect(lobby.settings.telephoneModeLabel).toBe('hard');
  });

  it('createLobby honors provided preset label by expanding to flags', () => {
    const m = new GameManager();
    const lobby = m.createLobby('s1', { nickname: 'A', gameMode: 'telephone', telephoneModeLabel: 'novice' });
    expect(lobby.settings.audioLockOnRecord).toBe(false);
    expect(lobby.settings.singalongEnabled).toBe(true);
    expect(lobby.settings.distractionEnabled).toBe(false);
    expect(lobby.settings.telephoneModeLabel).toBe('novice');
  });

  it('updateSettings recomputes label when flags change', () => {
    const m = new GameManager();
    const lobby = m.createLobby('s1', { nickname: 'A', gameMode: 'telephone', telephoneModeLabel: 'novice' });
    m.updateSettings('s1', { distractionEnabled: true }, mkIo());
    expect(lobby.settings.distractionEnabled).toBe(true);
    expect(lobby.settings.telephoneModeLabel).toBe('custom');
  });

  it('updateSettings with telephoneModeLabel expands to matching flags', () => {
    const m = new GameManager();
    const lobby = m.createLobby('s1', { nickname: 'A', gameMode: 'telephone' });
    m.updateSettings('s1', { telephoneModeLabel: 'hell' }, mkIo());
    expect(lobby.settings.audioLockOnRecord).toBe(true);
    expect(lobby.settings.singalongEnabled).toBe(false);
    expect(lobby.settings.distractionEnabled).toBe(true);
    expect(lobby.settings.telephoneModeLabel).toBe('hell');
  });

  it('updateSettings preserves singalong independent of audioLock', () => {
    const m = new GameManager();
    const lobby = m.createLobby('s1', { nickname: 'A', gameMode: 'telephone' });
    m.updateSettings('s1', { audioLockOnRecord: false, singalongEnabled: true, distractionEnabled: false }, mkIo());
    expect(lobby.settings.telephoneModeLabel).toBe('novice');
    m.updateSettings('s1', { audioLockOnRecord: true }, mkIo());
    expect(lobby.settings.singalongEnabled).toBe(true);
  });
});
