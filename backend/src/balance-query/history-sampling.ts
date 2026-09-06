import { BadRequestException } from '@nestjs/common';
import { ExactDecimal } from '../common/exact-money';

export type HistoryResolution = 'daily' | 'compact';
export interface HistorySampling {
  resolution: HistoryResolution;
  sourcePointCount: number;
  returnedPointCount: number;
  maxPoints: number | null;
}

/** Preserve endpoints and each time bucket's extrema, including global extrema. */
export function sampleHistory<T extends { value: string }>(
  points: T[],
  maxPoints: number,
): T[] {
  if (!Number.isInteger(maxPoints) || maxPoints < 4 || maxPoints > 1000) {
    throw new BadRequestException(
      'maxPoints must be an integer between 4 and 1000',
    );
  }
  if (points.length <= maxPoints) return points;
  const selected = new Set([0, points.length - 1]);
  const buckets = Math.floor((maxPoints - 2) / 2);
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = 1 + Math.floor((bucket * (points.length - 2)) / buckets);
    const end = 1 + Math.floor(((bucket + 1) * (points.length - 2)) / buckets);
    let min = start;
    let max = start;
    for (let index = start + 1; index < end; index++) {
      if (new ExactDecimal(points[index].value).lt(points[min].value))
        min = index;
      if (new ExactDecimal(points[index].value).gt(points[max].value))
        max = index;
    }
    selected.add(min);
    selected.add(max);
  }
  return [...selected].sort((a, b) => a - b).map((index) => points[index]);
}
