export const TELEPHONE_PRESETS = {
  novice: { audioLockOnRecord: false, singalongEnabled: true,  distractionEnabled: false },
  hard:   { audioLockOnRecord: true,  singalongEnabled: false, distractionEnabled: false },
  hell:   { audioLockOnRecord: true,  singalongEnabled: false, distractionEnabled: true  },
};

export function getPresetConfig(name) {
  return TELEPHONE_PRESETS[name] ? { ...TELEPHONE_PRESETS[name] } : null;
}

export function derivePresetLabel({ audioLockOnRecord, singalongEnabled, distractionEnabled }) {
  for (const [label, cfg] of Object.entries(TELEPHONE_PRESETS)) {
    if (cfg.audioLockOnRecord === audioLockOnRecord
        && cfg.singalongEnabled === singalongEnabled
        && cfg.distractionEnabled === distractionEnabled) {
      return label;
    }
  }
  return 'custom';
}

export function normalizeTelephoneConfig(raw) {
  const cfg = {
    audioLockOnRecord: !!raw.audioLockOnRecord,
    singalongEnabled: !!raw.singalongEnabled,
    distractionEnabled: !!raw.distractionEnabled,
  };
  return { ...cfg, telephoneModeLabel: derivePresetLabel(cfg) };
}

export const DEFAULT_TELEPHONE_CONFIG = normalizeTelephoneConfig({
  audioLockOnRecord: true, singalongEnabled: false, distractionEnabled: false,
});
