import { describe, it, expect } from 'vitest';
import {
  TELEPHONE_PRESETS,
  getPresetConfig,
  derivePresetLabel,
  normalizeTelephoneConfig,
} from '../../shared/telephonePresets.js';

describe('telephonePresets', () => {
  it('returns exact flag bundles for each named preset', () => {
    expect(getPresetConfig('novice')).toEqual({
      audioLockOnRecord: true, singalongEnabled: true, distractionEnabled: false,
    });
    expect(getPresetConfig('hard')).toEqual({
      audioLockOnRecord: false, singalongEnabled: false, distractionEnabled: false,
    });
    expect(getPresetConfig('hell')).toEqual({
      audioLockOnRecord: false, singalongEnabled: false, distractionEnabled: true,
    });
  });

  it('returns null for unknown preset names (including "custom")', () => {
    expect(getPresetConfig('custom')).toBe(null);
    expect(getPresetConfig('bogus')).toBe(null);
  });

  it('derives the matching preset label from a flag bundle', () => {
    expect(derivePresetLabel({ audioLockOnRecord: true, singalongEnabled: true, distractionEnabled: false })).toBe('novice');
    expect(derivePresetLabel({ audioLockOnRecord: false, singalongEnabled: false, distractionEnabled: true })).toBe('hell');
  });

  it('returns "custom" when no preset matches', () => {
    expect(derivePresetLabel({ audioLockOnRecord: true, singalongEnabled: false, distractionEnabled: true })).toBe('custom');
  });

  it('normalizeTelephoneConfig coerces singalong=false when audioLock=false', () => {
    const out = normalizeTelephoneConfig({ audioLockOnRecord: false, singalongEnabled: true, distractionEnabled: false });
    expect(out.singalongEnabled).toBe(false);
  });

  it('normalizeTelephoneConfig stamps the correct label', () => {
    const out = normalizeTelephoneConfig({ audioLockOnRecord: true, singalongEnabled: true, distractionEnabled: false });
    expect(out.telephoneModeLabel).toBe('novice');
  });
});
