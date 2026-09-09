import assert from 'node:assert/strict';
import test from 'node:test';

process.env.LINE_CHANNEL_SECRET = 'test-secret';
process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

const {
  fallbackPassportSummary,
  passportSummaryInternals,
  sanitizePassportSummary
} = await import('./passportSummary.js');

const stats = {
  period: 'month' as const,
  periodLabel: '2026 年 9 月',
  totalVisits: 3,
  uniqueCafeCount: 2,
  averageRating: 4.3,
  fiveStarVisits: 1,
  topTags: [{ tag: 'quiet' as const, label: '安靜', count: 2 }],
  favoriteCafe: { title: 'Cafe A', uri: 'https://maps/a', visits: 2, averageRating: 4.5 },
  currentWishlistCount: 2,
  wishlistVisitedCount: 1
};

test('creates a grounded deterministic fallback', () => {
  const summary = fallbackPassportSummary(stats);
  assert.match(summary, /3 次/);
  assert.match(summary, /4\.3 分/);
  assert.match(summary, /安靜/);
});

test('sanitizes markdown and limits model output', () => {
  assert.equal(sanitizePassportSummary('**很棒。**\n繼續探索。', '備用'), '很棒。 繼續探索。');
  assert.equal(sanitizePassportSummary(' '.repeat(10), '備用'), '備用');
  assert.equal(sanitizePassportSummary('內容在句中停止', '備用'), '備用');
  assert.equal(
    sanitizePassportSummary(`${'a'.repeat(170)}。${'b'.repeat(100)}。`, '備用'),
    `${'a'.repeat(170)}。`
  );
});

test('fingerprint changes when visible statistics change', () => {
  const first = passportSummaryInternals.summaryFingerprint(stats);
  const second = passportSummaryInternals.summaryFingerprint({ ...stats, totalVisits: 4 });
  assert.notEqual(first, second);
});

test('prompt forbids unsupported inferences', () => {
  const prompt = passportSummaryInternals.summaryPrompt(stats);
  assert.match(prompt, /不得猜測/);
  assert.match(prompt, /"visits":3/);
});
