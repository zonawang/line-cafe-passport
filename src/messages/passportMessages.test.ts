import assert from 'node:assert/strict';
import test from 'node:test';

process.env.LINE_CHANNEL_SECRET = 'test-secret';
process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

const {
  createPassportCard,
  createPassportMessages,
  passportMessageInternals
} = await import('./passportMessages.js');

const stats = {
  period: 'all' as const,
  periodLabel: '全部紀錄',
  totalVisits: 4,
  uniqueCafeCount: 3,
  averageRating: 4.25,
  fiveStarVisits: 2,
  topTags: [{ tag: 'quiet' as const, label: '安靜', count: 3 }],
  favoriteCafe: { title: 'Cafe A', uri: 'https://maps.google.com/a', visits: 2, averageRating: 4.5 },
  currentWishlistCount: 3,
  wishlistVisitedCount: 1
};

test('creates a shareable passport card with metrics and period controls', () => {
  const message = createPassportCard(stats, '你很常造訪安靜的咖啡廳。');
  assert.match(message.altText, /咖啡護照/);
  assert.equal(message.contents.type, 'bubble');
  assert.deepEqual(
    (message.quickReply?.items ?? []).map((item) => item.action?.type),
    ['message', 'message', 'message', 'message']
  );
  if (message.contents.type !== 'bubble') return;
  assert.equal(message.contents.footer?.type, 'box');
  assert.equal(Buffer.byteLength(JSON.stringify(message), 'utf8') < 30_000, true);
});

test('adds explicit sharing guidance before the card', () => {
  const messages = createPassportMessages({ stats, summary: '回顧', showShareGuide: true });
  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.type, 'text');
  if (messages[0]?.type === 'text') assert.match(messages[0].text, /轉傳/);
  assert.equal(messages[1]?.type, 'flex');
});

test('keeps the selected period when creating a share command', () => {
  assert.equal(passportMessageInternals.shareCommand('all'), '分享我的咖啡護照');
  assert.equal(passportMessageInternals.shareCommand('month'), '分享本月咖啡護照');
  assert.equal(passportMessageInternals.shareCommand('year'), '分享今年咖啡護照');
});

test('guides an empty passport to wishlist or location search', () => {
  const messages = createPassportMessages({
    stats: { ...stats, totalVisits: 0, uniqueCafeCount: 0, averageRating: undefined, favoriteCafe: undefined },
    summary: '還沒有資料'
  });
  assert.equal(messages[0]?.type, 'text');
  if (messages[0]?.type !== 'text') return;
  assert.match(messages[0].text, /想去清單/);
  assert.deepEqual(
    (messages[0].quickReply?.items ?? []).map((item) => item.action?.type),
    ['message', 'location']
  );
});

test('lets an empty monthly passport return to broader periods', () => {
  const messages = createPassportMessages({
    stats: {
      ...stats,
      period: 'month',
      periodLabel: '2026 年 9 月',
      totalVisits: 0,
      uniqueCafeCount: 0,
      averageRating: undefined,
      favoriteCafe: undefined,
      currentWishlistCount: 0
    },
    summary: '還沒有資料'
  });
  assert.equal(messages[0]?.type, 'text');
  if (messages[0]?.type !== 'text') return;
  assert.deepEqual(
    (messages[0].quickReply?.items ?? []).map((item) => item.action?.label),
    ['查看全部護照', '查看今年護照', '傳送目前位置']
  );
});

test('does not put the LINE owner id into a shareable card', () => {
  const message = createPassportCard({
    ...stats,
    latestVisit: {
      id: 'journey_1',
      ownerId: 'secret-line-user-id',
      conversationId: 'secret-conversation-id',
      cafeTitle: 'Cafe A',
      cafeUri: 'https://maps.google.com/a',
      rating: 5,
      tags: ['quiet'],
      status: 'completed',
      createdAtMs: 1,
      visitedAtMs: 1,
      completedAtMs: 2
    }
  }, '回顧');
  const payload = JSON.stringify(message);
  assert.equal(payload.includes('secret-line-user-id'), false);
  assert.equal(payload.includes('secret-conversation-id'), false);
});
