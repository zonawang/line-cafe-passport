import { createHash } from 'node:crypto';

import { Firestore, Timestamp } from '@google-cloud/firestore';
import { GoogleGenAI } from '@google/genai';

import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import type { PassportStats } from './passportStatistics.js';

type StoredPassportSummary = {
  fingerprint: string;
  summary: string;
  updatedAt: Timestamp;
};

const PASSPORT_SUMMARY_VERSION = 2;

const firestore = new Firestore({ projectId: env.GOOGLE_CLOUD_PROJECT });
const passportUsers = firestore.collection(env.FIRESTORE_PASSPORTS_COLLECTION);
const ai = new GoogleGenAI({
  enterprise: true,
  project: env.GOOGLE_CLOUD_PROJECT,
  location: env.GOOGLE_CLOUD_LOCATION,
  apiVersion: 'v1'
});

function summaryFingerprint(stats: PassportStats): string {
  return createHash('sha256').update(JSON.stringify({
    summaryVersion: PASSPORT_SUMMARY_VERSION,
    period: stats.period,
    periodLabel: stats.periodLabel,
    totalVisits: stats.totalVisits,
    uniqueCafeCount: stats.uniqueCafeCount,
    averageRating: stats.averageRating,
    fiveStarVisits: stats.fiveStarVisits,
    topTags: stats.topTags,
    favoriteCafe: stats.favoriteCafe,
    latestVisitId: stats.latestVisit?.id,
    currentWishlistCount: stats.currentWishlistCount,
    wishlistVisitedCount: stats.wishlistVisitedCount
  })).digest('base64url').slice(0, 32);
}

export function fallbackPassportSummary(stats: PassportStats): string {
  if (stats.totalVisits === 0) {
    return `${stats.periodLabel}還沒有完成的咖啡足跡。下次造訪後留下評分，就會開始累積屬於你的咖啡回顧。`;
  }
  const rating = stats.averageRating === undefined
    ? ''
    : `、平均 ${stats.averageRating} 分`;
  const tag = stats.topTags[0]
    ? `最常留下的印象是「${stats.topTags[0].label}」。`
    : '再多留下幾次體驗標籤，偏好會更清楚。';
  return `${stats.periodLabel}共完成 ${stats.totalVisits} 次咖啡造訪${rating}。${tag}`;
}

export function sanitizePassportSummary(value: string, fallback: string): string {
  const cleaned = value
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/[*_#`>]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!cleaned || !/[。！？.!?]$/u.test(cleaned)) return fallback;
  if (cleaned.length <= 180) return cleaned;

  const shortened = cleaned.slice(0, 180);
  const sentenceEnd = Math.max(
    shortened.lastIndexOf('。'),
    shortened.lastIndexOf('！'),
    shortened.lastIndexOf('？'),
    shortened.lastIndexOf('.'),
    shortened.lastIndexOf('!'),
    shortened.lastIndexOf('?')
  );
  return sentenceEnd >= 0 ? shortened.slice(0, sentenceEnd + 1) : fallback;
}

function summaryPrompt(stats: PassportStats): string {
  return [
    '你是 LINE 咖啡護照的回顧文案助手。',
    '只能使用下方 JSON 中已提供的事實，不得猜測個性、消費、地點或沒有出現的偏好。',
    '使用繁體中文、第二人稱、溫暖自然且不浮誇，寫 2 句完整的話，總長度不超過 100 個中文字。',
    '每句都必須有完整句意，最後一句必須以句號、驚嘆號或問號結束。',
    '不要使用 Markdown、標題或列表。',
    JSON.stringify({
      period: stats.periodLabel,
      visits: stats.totalVisits,
      uniqueCafes: stats.uniqueCafeCount,
      averageRating: stats.averageRating ?? null,
      fiveStarVisits: stats.fiveStarVisits,
      topTags: stats.topTags.map((tag) => ({ label: tag.label, count: tag.count })),
      favoriteCafe: stats.favoriteCafe
        ? { title: stats.favoriteCafe.title, visits: stats.favoriteCafe.visits }
        : null,
      currentWishlistVisited: stats.wishlistVisitedCount
    })
  ].join('\n');
}

export async function getPassportSummary(input: {
  ownerId: string;
  stats: PassportStats;
}): Promise<string> {
  const fallback = fallbackPassportSummary(input.stats);
  if (input.stats.totalVisits === 0) return fallback;

  const fingerprint = summaryFingerprint(input.stats);
  const document = passportUsers
    .doc(input.ownerId)
    .collection('summaries')
    .doc(input.stats.period);
  try {
    const snapshot = await document.get();
    if (snapshot.exists) {
      const cached = snapshot.data() as StoredPassportSummary;
      if (cached.fingerprint === fingerprint && cached.summary) return cached.summary;
    }
  } catch (error) {
    logger.error('Failed to read passport summary cache', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: env.GEMINI_PASSPORT_MODEL,
      contents: summaryPrompt(input.stats),
      config: {
        temperature: 0.4,
        maxOutputTokens: 512,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    const summary = sanitizePassportSummary(response.text ?? '', fallback);
    try {
      await document.set({ fingerprint, summary, updatedAt: Timestamp.now() });
    } catch (error) {
      logger.error('Failed to cache passport summary', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return summary;
  } catch (error) {
    logger.error('Failed to generate passport summary', {
      error: error instanceof Error ? error.message : String(error)
    });
    return fallback;
  }
}

export const passportSummaryInternals = {
  summaryFingerprint,
  summaryPrompt
};
