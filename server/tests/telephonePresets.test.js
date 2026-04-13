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
      audioLockOnRecord: false, singalongEnabled: true, distractionEnabled: false,
    });
    expect(getPresetConfig('hard')).toEqual({
      audioLockOnRecord: true, singalongEnabled: false, distractionEnabled: false,
    });
    expect(getPresetConfig('hell')).toEqual({
      audioLockOnRecord: true, singalongEnabled: false, distractionEnabled: true,
    });
  });

  it('returns null for unknown preset names (including "custom")', () => {
    expect(getPresetConfig('custom')).toBe(null);
    expect(getPresetConfig('bogus')).toBe(null);
  });

  it('derives the matching preset label from a flag bundle', () => {
    expect(derivePresetLabel({ audioLockOnRecord: false, singalongEnabled: true, distractionEnabled: false })).toBe('novice');
    expect(derivePresetLabel({ audioLockOnRecord: true, singalongEnabled: false, distractionEnabled: true })).toBe('hell');
  });

  it('returns "custom" when no preset matches', () => {
    expect(derivePresetLabel({ audioLockOnRecord: true, singalongEnabled: true, distractionEnabled: true })).toBe('custom');
  });

  it('normalizeTelephoneConfig preserves singalong independent of audioLock', () => {
    const out = normalizeTelephoneConfig({ audioLockOnRecord: false, singalongEnabled: true, distractionEnabled: false });
    expect(out.singalongEnabled).toBe(true);
    expect(out.telephoneModeLabel).toBe('novice');
  });

  it('normalizeTelephoneConfig stamps the correct label for hard preset', () => {
    const out = normalizeTelephoneConfig({ audioLockOnRecord: true, singalongEnabled: false, distractionEnabled: false });
    expect(out.telephoneModeLabel).toBe('hard');
  });
});
