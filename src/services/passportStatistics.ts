import type { JourneyTag } from '../actions/journeyPostbackActions.js';
import type { CafeJourney } from './journeyStore.js';
import type { WishlistItem } from './wishlistStore.js';

export const PASSPORT_PERIODS = ['all', 'month', 'year'] as const;
export type PassportPeriod = (typeof PASSPORT_PERIODS)[number];

export const PASSPORT_TAG_LABELS: Record<JourneyTag, string> = {
  quiet: '安靜',
  outlets: '有插座',
  work: '適合工作',
  revisit: '想再訪'
};

export type PassportTagStat = {
  tag: JourneyTag;
  label: string;
  count: number;
};

export type PassportCafeStat = {
  title: string;
  uri: string;
  visits: number;
  averageRating: number;
};

export type PassportStats = {
  period: PassportPeriod;
  periodLabel: string;
  periodStartMs?: number;
  periodEndMs?: number;
  totalVisits: number;
  uniqueCafeCount: number;
  averageRating?: number;
  fiveStarVisits: number;
  topTags: PassportTagStat[];
  favoriteCafe?: PassportCafeStat;
  latestVisit?: CafeJourney;
  currentWishlistCount: number;
  wishlistVisitedCount: number;
};

const TAIPEI_OFFSET_MS = 8 * 60 * 60_000;

function taipeiYearMonth(nowMs: number): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric'
  }).formatToParts(nowMs);
  const value = (type: 'year' | 'month') =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month') };
}

export function passportPeriodRange(
  period: PassportPeriod,
  nowMs = Date.now()
): { label: string; startMs?: number; endMs?: number } {
  if (period === 'all') return { label: '全部紀錄' };
  const { year, month } = taipeiYearMonth(nowMs);
  if (period === 'year') {
    return {
      label: `${year} 年`,
      startMs: Date.UTC(year, 0, 1) - TAIPEI_OFFSET_MS,
      endMs: Date.UTC(year + 1, 0, 1) - TAIPEI_OFFSET_MS
    };
  }
  return {
    label: `${year} 年 ${month} 月`,
    startMs: Date.UTC(year, month - 1, 1) - TAIPEI_OFFSET_MS,
    endMs: Date.UTC(year, month, 1) - TAIPEI_OFFSET_MS
  };
}

function journeyTime(journey: CafeJourney): number {
  return journey.visitedAtMs ?? journey.completedAtMs ?? journey.createdAtMs;
}

function cafeKey(uri: string, title: string): string {
  return uri.trim().toLocaleLowerCase('en-US') || title.trim().toLocaleLowerCase('zh-TW');
}

function roundedRating(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildPassportStats(input: {
  journeys: CafeJourney[];
  wishlistItems: WishlistItem[];
  period: PassportPeriod;
  nowMs?: number;
}): PassportStats {
  const range = passportPeriodRange(input.period, input.nowMs);
  const journeys = input.journeys
    .filter((journey) => journey.status === 'completed')
    .filter((journey) => {
      const value = journeyTime(journey);
      return (range.startMs === undefined || value >= range.startMs)
        && (range.endMs === undefined || value < range.endMs);
    })
    .sort((a, b) => journeyTime(b) - journeyTime(a));

  const ratings = journeys
    .map((journey) => journey.rating)
    .filter((rating): rating is number => rating !== undefined);
  const cafeStats = new Map<string, {
    title: string;
    uri: string;
    visits: number;
    ratingTotal: number;
    ratingCount: number;
    latestMs: number;
  }>();
  const tagCounts = new Map<JourneyTag, number>();

  for (const journey of journeys) {
    const key = cafeKey(journey.cafeUri, journey.cafeTitle);
    const current = cafeStats.get(key) ?? {
      title: journey.cafeTitle,
      uri: journey.cafeUri,
      visits: 0,
      ratingTotal: 0,
      ratingCount: 0,
      latestMs: 0
    };
    current.visits += 1;
    current.latestMs = Math.max(current.latestMs, journeyTime(journey));
    if (journey.rating !== undefined) {
      current.ratingTotal += journey.rating;
      current.ratingCount += 1;
    }
    cafeStats.set(key, current);
    for (const tag of new Set(journey.tags)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const favorite = Array.from(cafeStats.values()).sort((a, b) =>
    b.visits - a.visits
    || (b.ratingCount ? b.ratingTotal / b.ratingCount : 0)
      - (a.ratingCount ? a.ratingTotal / a.ratingCount : 0)
    || b.latestMs - a.latestMs
  )[0];
  const tagOrder = new Map<JourneyTag, number>(
    (Object.keys(PASSPORT_TAG_LABELS) as JourneyTag[]).map((tag, index) => [tag, index])
  );
  const topTags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, label: PASSPORT_TAG_LABELS[tag], count }))
    .sort((a, b) => b.count - a.count || (tagOrder.get(a.tag) ?? 0) - (tagOrder.get(b.tag) ?? 0))
    .slice(0, 3);

  const visitedKeys = new Map<string, number[]>();
  for (const journey of journeys) {
    const key = cafeKey(journey.cafeUri, journey.cafeTitle);
    visitedKeys.set(key, [...(visitedKeys.get(key) ?? []), journeyTime(journey)]);
  }
  const wishlistVisitedCount = input.wishlistItems.filter((item) => {
    const times = visitedKeys.get(cafeKey(item.cafe.uri, item.cafe.title)) ?? [];
    return times.some((visitedAtMs) => visitedAtMs >= item.createdAtMs);
  }).length;

  return {
    period: input.period,
    periodLabel: range.label,
    ...(range.startMs !== undefined ? { periodStartMs: range.startMs } : {}),
    ...(range.endMs !== undefined ? { periodEndMs: range.endMs } : {}),
    totalVisits: journeys.length,
    uniqueCafeCount: cafeStats.size,
    averageRating: ratings.length
      ? roundedRating(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length)
      : undefined,
    fiveStarVisits: ratings.filter((rating) => rating === 5).length,
    topTags,
    favoriteCafe: favorite
      ? {
          title: favorite.title,
          uri: favorite.uri,
          visits: favorite.visits,
          averageRating: favorite.ratingCount
            ? roundedRating(favorite.ratingTotal / favorite.ratingCount)
            : 0
        }
      : undefined,
    latestVisit: journeys[0],
    currentWishlistCount: input.wishlistItems.length,
    wishlistVisitedCount
  };
}

export const passportStatisticsInternals = { cafeKey, journeyTime, taipeiYearMonth };
