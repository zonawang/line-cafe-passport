import type { messagingApi } from '@line/bot-sdk';

import type {
  PassportPeriod,
  PassportStats
} from '../services/passportStatistics.js';

function metricBox(label: string, value: string): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    alignItems: 'center',
    contents: [
      { type: 'text', text: value, size: 'xl', weight: 'bold', color: '#6F4E37' },
      { type: 'text', text: label, size: 'xs', color: '#8A8A8A' }
    ]
  };
}

function shareCommand(period: PassportPeriod): string {
  if (period === 'month') return '分享本月咖啡護照';
  if (period === 'year') return '分享今年咖啡護照';
  return '分享我的咖啡護照';
}

function quickReply(period: PassportPeriod): messagingApi.QuickReply {
  return {
    items: [
      { type: 'action', action: { type: 'message', label: '本月護照', text: '本月咖啡護照' } },
      { type: 'action', action: { type: 'message', label: '今年護照', text: '今年咖啡護照' } },
      { type: 'action', action: { type: 'message', label: '全部記錄', text: '我的咖啡護照' } },
      { type: 'action', action: { type: 'message', label: '分享這張護照', text: shareCommand(period) } }
    ]
  };
}

function latestVisitText(stats: PassportStats): string | undefined {
  const journey = stats.latestVisit;
  if (!journey) return undefined;
  const valueMs = journey.visitedAtMs ?? journey.completedAtMs;
  const date = valueMs
    ? new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        dateStyle: 'medium'
      }).format(valueMs)
    : undefined;
  return `最近一站：${journey.cafeTitle}${date ? `（${date}）` : ''}`;
}

export function createPassportCard(
  stats: PassportStats,
  summary: string
): messagingApi.FlexMessage {
  const tagText = stats.topTags.length
    ? stats.topTags.map((tag) => `${tag.label} ${tag.count}`).join(' · ')
    : '還沒有足夠的體驗標籤';
  const favoriteText = stats.favoriteCafe
    ? `最常去：${stats.favoriteCafe.title}（${stats.favoriteCafe.visits} 次）`
    : '最常去：還沒有資料';
  const wishlistText = stats.currentWishlistCount
    ? `目前收藏後已造訪：${stats.wishlistVisitedCount}/${stats.currentWishlistCount}`
    : '目前想去清單：0 間';
  const latest = latestVisitText(stats);
  return {
    type: 'flex',
    altText: `我的咖啡護照｜${stats.periodLabel}`,
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#6F4E37',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: '☕ MY CAFE PASSPORT', size: 'xs', color: '#F5E6D3', weight: 'bold' },
          { type: 'text', text: '我的咖啡護照', size: 'xl', color: '#FFFFFF', weight: 'bold' },
          { type: 'text', text: stats.periodLabel, size: 'sm', color: '#F5E6D3' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'lg',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              metricBox('造訪', String(stats.totalVisits)),
              metricBox('店家', String(stats.uniqueCafeCount)),
              metricBox('平均分數', stats.averageRating?.toFixed(1) ?? '—')
            ]
          },
          { type: 'separator', color: '#E8DDD2' },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: `五星體驗：${stats.fiveStarVisits} 次`, size: 'sm', color: '#555555' },
              { type: 'text', text: favoriteText, size: 'sm', color: '#555555', wrap: true },
              { type: 'text', text: `常見印象：${tagText}`, size: 'sm', color: '#555555', wrap: true },
              {
                type: 'text',
                text: wishlistText,
                size: 'sm',
                color: '#555555',
                wrap: true
              },
              ...(latest ? [{ type: 'text' as const, text: latest, size: 'sm' as const, color: '#555555', wrap: true }] : [])
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FFF8EC',
            cornerRadius: 'md',
            paddingAll: '14px',
            contents: [
              { type: 'text', text: '✨ Gemini 咖啡回顧', size: 'xs', weight: 'bold', color: '#9A6B35' },
              { type: 'text', text: summary, size: 'sm', color: '#5A4633', wrap: true, margin: 'sm' }
            ]
          }
        ]
      },
      footer: stats.favoriteCafe?.uri
        ? {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'button',
              style: 'primary',
              color: '#6F4E37',
              action: {
                type: 'uri',
                label: '查看最常去的店',
                uri: stats.favoriteCafe.uri
              }
            }]
          }
        : undefined
    },
    quickReply: quickReply(stats.period)
  };
}

export function createPassportMessages(input: {
  stats: PassportStats;
  summary: string;
  showShareGuide?: boolean;
}): messagingApi.Message[] {
  if (input.stats.totalVisits === 0) {
    return [{
      type: 'text',
      text: [
        `📕 ${input.stats.periodLabel}還沒有完成的咖啡足跡。`,
        '',
        input.stats.currentWishlistCount
          ? `你的想去清單還有 ${input.stats.currentWishlistCount} 間，可以先挑一間出發。`
          : '先傳送位置找一間咖啡廳，造訪後留下評分，就會開始累積護照。'
      ].join('\n'),
      quickReply: {
        items: [
          ...(input.stats.period !== 'all' ? [{
            type: 'action' as const,
            action: { type: 'message' as const, label: '查看全部護照', text: '我的咖啡護照' }
          }] : []),
          ...(input.stats.period === 'month' ? [{
            type: 'action' as const,
            action: { type: 'message' as const, label: '查看今年護照', text: '今年咖啡護照' }
          }] : []),
          ...(input.stats.currentWishlistCount ? [{
            type: 'action' as const,
            action: { type: 'message' as const, label: '查看想去清單', text: '我的想去清單' }
          }] : []),
          { type: 'action', action: { type: 'location', label: '傳送目前位置' } }
        ]
      }
    }];
  }
  const card = createPassportCard(input.stats, input.summary);
  return input.showShareGuide
    ? [{
        type: 'text',
        text: '下方是不含 LINE 名稱與頭像的分享版。可使用 LINE 的分享／轉傳功能，將這張卡片送到朋友或群組。'
      }, card]
    : [card];
}

export const passportMessageInternals = { latestVisitText, quickReply, shareCommand };
