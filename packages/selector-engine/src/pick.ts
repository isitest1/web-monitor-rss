import type { MonitorMode, SelectorCandidate } from '@web-monitor/shared';

/**
 * Chooses the winning candidate for the given monitor mode. Candidates must
 * already be sorted by score descending (as returned by
 * `generateSelectorCandidates`).
 *
 * - single mode prefers a candidate that matches exactly one element.
 * - list mode prefers a candidate representing the repeating structure
 *   (matchCount > 1); a single matching element is still acceptable.
 */
export function pickBestCandidate(
  candidates: SelectorCandidate[],
  mode: MonitorMode,
): SelectorCandidate | null {
  if (candidates.length === 0) return null;

  if (mode === 'single') {
    const unique = candidates.find((c) => c.matchCount === 1);
    return unique ?? candidates[0]!;
  }

  const repeating = candidates.find((c) => c.matchCount > 1);
  return repeating ?? candidates[0]!;
}
