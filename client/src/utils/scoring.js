// Client-side only — no OpenCC conversion, display purposes only
export function normalizeForCount(str) {
  return str.replace(/[\s\p{P}]/gu, '');
}

export function getCharCount(str) {
  return normalizeForCount(str).length;
}
