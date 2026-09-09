import assert from 'node:assert/strict';
import test from 'node:test';

process.env.LINE_CHANNEL_SECRET = 'test-secret';
process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

const { buildPassportStats, passportPeriodRange } = await import('./passportStatistics.js');

const journey = (input: {
  id: string;
  title: string;
  uri: string;
  rating: number;
  tags?: Array<'quiet' | 'outlets' | 'work' | 'revisit'>;
  visitedAtMs: number;
}) => ({
  id: input.id,
  ownerId: 'user_1',
  conversationId: 'user_1',
  cafeTitle: input.title,
  cafeUri: input.uri,
  rating: input.rating,
  tags: input.tags ?? [],
  status: 'completed' as const,
  createdAtMs: input.visitedAtMs,
  visitedAtMs: input.visitedAtMs,
  completedAtMs: input.visitedAtMs
});

test('creates Taipei month boundaries instead of UTC month boundaries', () => {
  const range = passportPeriodRange('month', Date.parse('2026-09-15T00:00:00Z'));
  assert.equal(range.label, '2026 年 9 月');
  assert.equal(range.startMs, Date.parse('2026-08-31T16:00:00Z'));
  assert.equal(range.endMs, Date.parse('2026-09-30T16:00:00Z'));
});

test('summarizes visits, unique cafes, ratings, tags, and favorite cafe', () => {
  const stats = buildPassportStats({
    period: 'all',
    journeys: [
      journey({ id: '1', title: 'Cafe A', uri: 'https://maps/a', rating: 5, tags: ['quiet', 'work'], visitedAtMs: 300 }),
      journey({ id: '2', title: 'Cafe A', uri: 'https://maps/a', rating: 4, tags: ['quiet'], visitedAtMs: 200 }),
      journey({ id: '3', title: 'Cafe B', uri: 'https://maps/b', rating: 3, tags: ['outlets'], visitedAtMs: 100 })
    ],
    wishlistItems: []
  });
  assert.equal(stats.totalVisits, 3);
  assert.equal(stats.uniqueCafeCount, 2);
  assert.equal(stats.averageRating, 4);
  assert.equal(stats.fiveStarVisits, 1);
  assert.equal(stats.favoriteCafe?.title, 'Cafe A');
  assert.equal(stats.favoriteCafe?.visits, 2);
  assert.deepEqual(stats.topTags.map((tag) => [tag.tag, tag.count]), [
    ['quiet', 2],
    ['outlets', 1],
    ['work', 1]
  ]);
});

test('filters monthly journeys using the visit time', () => {
  const nowMs = Date.parse('2026-09-15T00:00:00Z');
  const stats = buildPassportStats({
    period: 'month',
    nowMs,
    journeys: [
      journey({ id: 'inside', title: 'September Cafe', uri: 'https://maps/september', rating: 5, visitedAtMs: Date.parse('2026-08-31T16:30:00Z') }),
      journey({ id: 'outside', title: 'August Cafe', uri: 'https://maps/august', rating: 2, visitedAtMs: Date.parse('2026-08-31T15:59:00Z') })
    ],
    wishlistItems: []
  });
  assert.equal(stats.totalVisits, 1);
  assert.equal(stats.latestVisit?.cafeTitle, 'September Cafe');
});

test('counts only current wishlist items visited after they were saved', () => {
  const stats = buildPassportStats({
    period: 'all',
    journeys: [
      journey({ id: 'before', title: 'Cafe A', uri: 'https://maps/a', rating: 4, visitedAtMs: 100 }),
      journey({ id: 'after', title: 'Cafe B', uri: 'https://maps/b', rating: 5, visitedAtMs: 400 })
    ],
    wishlistItems: [
      { id: 'a', ownerId: 'user_1', cafe: { title: 'Cafe A', uri: 'https://maps/a' }, createdAtMs: 200 },
      { id: 'b', ownerId: 'user_1', cafe: { title: 'Cafe B', uri: 'https://maps/b' }, createdAtMs: 300 }
    ]
  });
  assert.equal(stats.currentWishlistCount, 2);
  assert.equal(stats.wishlistVisitedCount, 1);
});

test('returns a useful empty passport', () => {
  const stats = buildPassportStats({ period: 'year', journeys: [], wishlistItems: [] });
  assert.equal(stats.totalVisits, 0);
  assert.equal(stats.averageRating, undefined);
  assert.equal(stats.favoriteCafe, undefined);
  assert.deepEqual(stats.topTags, []);
});
