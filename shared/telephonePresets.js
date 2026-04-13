export const TELEPHONE_PRESETS = {
  novice: { audioLockOnRecord: true,  singalongEnabled: true,  distractionEnabled: false },
  hard:   { audioLockOnRecord: false, singalongEnabled: false, distractionEnabled: false },
  hell:   { audioLockOnRecord: false, singalongEnabled: false, distractionEnabled: true  },
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
  const audioLockOnRecord = !!raw.audioLockOnRecord;
  const singalongEnabled = audioLockOnRecord ? !!raw.singalongEnabled : false;
  const distractionEnabled = !!raw.distractionEnabled;
  const cfg = { audioLockOnRecord, singalongEnabled, distractionEnabled };
  return { ...cfg, telephoneModeLabel: derivePresetLabel(cfg) };
}

export const DEFAULT_TELEPHONE_CONFIG = normalizeTelephoneConfig({
  audioLockOnRecord: true, singalongEnabled: false, distractionEnabled: false,
});
