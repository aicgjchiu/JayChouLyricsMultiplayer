import * as OpenCC from 'opencc-js';

// Convert Simplified Chinese to Traditional (Taiwan standard)
const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });
// Convert Traditional to Simplified — used to unify variant characters before comparison
// e.g. both 刮 (traditional) and 颳 (opencc tw variant) map to the same simplified form
const toSimplified = OpenCC.Converter({ from: 't', to: 'cn' });

export function normalizeText(str) {
  return toTraditional(str).replace(/[\s\p{P}]/gu, '');
}

/** Normalize text for LCS comparison: strip spaces/punctuation and unify character variants */
function normalizeForComparison(str) {
  return toSimplified(toTraditional(str)).replace(/[\s\p{P}]/gu, '');
}

function lcs(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * @param {string} playerAnswer - raw player input (may be simplified Chinese)
 * @param {string} correctAnswer - correct lyric from questions.json (traditional Chinese)
 * @param {number|null} submittedMs - ms elapsed since question started (null = no submission)
 * @param {number} timeLimitMs - total question time in ms
 * @returns {{ accuracyScore: number, speedBonus: number, total: number, accuracy: number }}
 */
export function calculateScore(playerAnswer, correctAnswer, submittedMs, timeLimitMs) {
  const normPlayer = normalizeForComparison(playerAnswer);
  const normCorrect = normalizeForComparison(correctAnswer);

  if (normCorrect.length === 0) return { accuracyScore: 0, speedBonus: 0, total: 0, accuracy: 0 };

  const matchingChars = lcs(normPlayer, normCorrect);
  const accuracy = matchingChars / normCorrect.length;
  const accuracyScore = Math.floor(accuracy * 100);

  let speedBonus = 0;
  if (accuracy >= 0.6 && submittedMs !== null) {
    speedBonus = Math.max(0, Math.floor((1 - submittedMs / timeLimitMs) * 50));
  }

  return { accuracyScore, speedBonus, total: accuracyScore + speedBonus, accuracy };
}
