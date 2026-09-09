import type { messagingApi } from '@line/bot-sdk';

import { createPassportMessages } from '../messages/passportMessages.js';
import { listPassportJourneys } from '../services/journeyStore.js';
import {
  buildPassportStats,
  type PassportPeriod
} from '../services/passportStatistics.js';
import { getPassportSummary } from '../services/passportSummary.js';
import { listPassportWishlistItems } from '../services/wishlistStore.js';
import { logger } from '../utils/logger.js';

const COMMANDS = new Map<string, { period: PassportPeriod; share: boolean }>([
  ['我的咖啡護照', { period: 'all', share: false }],
  ['咖啡護照', { period: 'all', share: false }],
  ['我的咖啡回顧', { period: 'all', share: false }],
  ['本月咖啡護照', { period: 'month', share: false }],
  ['這個月咖啡回顧', { period: 'month', share: false }],
  ['今年咖啡護照', { period: 'year', share: false }],
  ['年度咖啡回顧', { period: 'year', share: false }],
  ['分享我的咖啡護照', { period: 'all', share: true }],
  ['分享本月咖啡護照', { period: 'month', share: true }],
  ['分享今年咖啡護照', { period: 'year', share: true }]
]);

export async function handlePassportText(input: {
  ownerId: string;
  sourceType: 'user' | 'group' | 'room';
  text: string;
}): Promise<messagingApi.Message[] | undefined> {
  const command = COMMANDS.get(input.text.trim());
  if (!command) return undefined;
  if (!input.ownerId) {
    return [{ type: 'text', text: '目前無法確認是哪位成員的咖啡護照，請稍後再試。' }];
  }
  try {
    const [journeys, wishlistItems] = await Promise.all([
      listPassportJourneys(input.ownerId),
      listPassportWishlistItems(input.ownerId)
    ]);
    const stats = buildPassportStats({
      journeys,
      wishlistItems,
      period: command.period
    });
    const summary = await getPassportSummary({ ownerId: input.ownerId, stats });
    return createPassportMessages({
      stats,
      summary,
      showShareGuide: command.share && input.sourceType === 'user'
    });
  } catch (error) {
    logger.error('Failed to create cafe passport', {
      error: error instanceof Error ? error.message : String(error)
    });
    return [{
      type: 'text',
      text: '目前無法整理咖啡護照，請稍後再試。',
      quickReply: {
        items: [{
          type: 'action',
          action: { type: 'message', label: '重新查看', text: '我的咖啡護照' }
        }]
      }
    }];
  }
}

export const passportTextHandlerInternals = { COMMANDS };
