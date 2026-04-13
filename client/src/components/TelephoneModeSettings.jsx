import React from 'react';
import { TELEPHONE_PRESETS, getPresetConfig, derivePresetLabel } from '../../../shared/telephonePresets.js';

const PRESET_LABELS = { novice: '新手版', hard: '困難版', hell: '地獄版', custom: 'Custom' };

export default function TelephoneModeSettings({ config, onChange, disabled = false }) {
  const { audioLockOnRecord, singalongEnabled, distractionEnabled, telephoneModeLabel } = config;

  function applyPreset(label) {
    if (label === 'custom') {
      onChange({ ...config, telephoneModeLabel: 'custom' });
      return;
    }
    const preset = getPresetConfig(label);
    onChange({ ...preset, telephoneModeLabel: label });
  }

  function toggleFlag(key, value) {
    const next = {
      audioLockOnRecord, singalongEnabled, distractionEnabled,
      [key]: value,
    };
    if (!next.audioLockOnRecord) next.singalongEnabled = false;
    onChange({ ...next, telephoneModeLabel: derivePresetLabel(next) });
  }

  return (
    <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginTop: 12 }}>
      <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>遊戲難度</label>
      <select
        value={telephoneModeLabel}
        onChange={e => applyPreset(e.target.value)}
        disabled={disabled}
        style={{ padding: '6px 10px', fontSize: 14, marginBottom: 12 }}
      >
        {['novice', 'hard', 'hell', 'custom'].map(k => (
          <option key={k} value={k}>{PRESET_LABELS[k]}</option>
        ))}
      </select>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
        <label>
          <input type="checkbox" disabled={disabled}
            checked={audioLockOnRecord}
            onChange={e => toggleFlag('audioLockOnRecord', e.target.checked)} />
          {' '}開始錄音後停止播放音樂
        </label>

        {audioLockOnRecord && (
          <label style={{ marginLeft: 16 }}>
            <input type="checkbox" disabled={disabled}
              checked={singalongEnabled}
              onChange={e => toggleFlag('singalongEnabled', e.target.checked)} />
            {' '}伴唱模式（錄音時提供按鈕同步播放音樂）
          </label>
        )}

        <label>
          <input type="checkbox" disabled={disabled}
            checked={distractionEnabled}
            onChange={e => toggleFlag('distractionEnabled', e.target.checked)} />
          {' '}干擾音樂（錄音時隨機播放其他聲音）
        </label>
      </div>
    </div>
  );
}
