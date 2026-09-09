import assert from 'node:assert/strict';
import test from 'node:test';

process.env.LINE_CHANNEL_SECRET = 'test-secret';
process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

const { passportTextHandlerInternals } = await import('./passportTextHandler.js');

test('maps passport commands to all, month, year, and share modes', () => {
  const commands = passportTextHandlerInternals.COMMANDS;
  assert.deepEqual(commands.get('我的咖啡護照'), { period: 'all', share: false });
  assert.deepEqual(commands.get('本月咖啡護照'), { period: 'month', share: false });
  assert.deepEqual(commands.get('今年咖啡護照'), { period: 'year', share: false });
  assert.deepEqual(commands.get('分享我的咖啡護照'), { period: 'all', share: true });
  assert.deepEqual(commands.get('分享本月咖啡護照'), { period: 'month', share: true });
  assert.deepEqual(commands.get('分享今年咖啡護照'), { period: 'year', share: true });
});
