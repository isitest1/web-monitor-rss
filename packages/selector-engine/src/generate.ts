import type { SelectorCandidate } from '@web-monitor/shared';
import { scoreToken } from './token-quality.js';
import {
  checkCandidate,
  cssEscapeIdent,
  elementIndexAmongSiblingsOfSameTag,
  escapeAttrValue,
  stableDataAttributes,
} from './dom-utils.js';

const BASE_SCORES = {
  id: 100,
  'data-attr': 90,
  aria: 80,
  'tag-class': 60,
  'parent-child': 40,
  'nth-of-type': 10,
} as const;

const MAX_STABLE_CLASSES = 3;
const MAX_ANCESTOR_DEPTH = 4;

function tagOf(element: Element): string {
  return element.tagName.toLowerCase();
}

function stableClassTokens(element: Element): string[] {
  return Array.from(element.classList).filter((cls) => scoreToken(cls) >= 0.5);
}

function pushIfValid(
  candidates: SelectorCandidate[],
  root: ParentNode,
  target: Element,
  selector: string,
  strategy: SelectorCandidate['strategy'],
  quality: number,
): void {
  const { matchCount, matchesTarget } = checkCandidate(root, selector, target);
  if (!matchesTarget) return;
  const score = BASE_SCORES[strategy] * quality;
  candidates.push({ selector, strategy, score, matchCount });
}

function generateIdCandidate(
  root: ParentNode,
  target: Element,
  candidates: SelectorCandidate[],
): void {
  const id = target.id;
  if (!id) return;
  const quality = scoreToken(id);
  if (quality < 0.5) return;
  pushIfValid(candidates, root, target, `#${cssEscapeIdent(id)}`, 'id', quality);
}

function generateDataAttrCandidates(
  root: ParentNode,
  target: Element,
  candidates: SelectorCandidate[],
): void {
  for (const { name, value } of stableDataAttributes(target)) {
    const quality = scoreToken(value);
    if (quality < 0.5) continue;
    const selector = `[${name}="${escapeAttrValue(value)}"]`;
    pushIfValid(candidates, root, target, selector, 'data-attr', quality);
  }
}

function generateAriaCandidates(
  root: ParentNode,
  target: Element,
  candidates: SelectorCandidate[],
): void {
  const ariaLabel = target.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim().length > 0) {
    const quality = scoreToken(ariaLabel.replace(/\s+/g, '-'));
    const selector = `[aria-label="${escapeAttrValue(ariaLabel)}"]`;
    pushIfValid(candidates, root, target, selector, 'aria', Math.max(quality, 0.6));
  }
  const role = target.getAttribute('role');
  if (role) {
    const selector = `${tagOf(target)}[role="${escapeAttrValue(role)}"]`;
    pushIfValid(candidates, root, target, selector, 'aria', 0.7);
  }
}

function generateTagClassCandidate(
  root: ParentNode,
  target: Element,
  candidates: SelectorCandidate[],
): void {
  const stableClasses = stableClassTokens(target).slice(0, MAX_STABLE_CLASSES);
  if (stableClasses.length === 0) return;
  const selector = `${tagOf(target)}${stableClasses.map((c) => `.${cssEscapeIdent(c)}`).join('')}`;
  const quality = Math.min(...stableClasses.map(scoreToken));
  pushIfValid(candidates, root, target, selector, 'tag-class', quality);
}

function shortAncestorSelector(element: Element): string {
  const id = element.id;
  if (id && scoreToken(id) >= 0.5) return `#${cssEscapeIdent(id)}`;
  const stableClasses = stableClassTokens(element).slice(0, 1);
  if (stableClasses.length > 0) {
    return `${tagOf(element)}.${cssEscapeIdent(stableClasses[0]!)}`;
  }
  return `${tagOf(element)}:nth-of-type(${elementIndexAmongSiblingsOfSameTag(element)})`;
}

function generateParentChildCandidate(
  root: ParentNode,
  target: Element,
  candidates: SelectorCandidate[],
): void {
  const parent = target.parentElement;
  if (!parent) return;
  const parentPart = shortAncestorSelector(parent);
  const stableClasses = stableClassTokens(target).slice(0, MAX_STABLE_CLASSES);
  const childPart =
    stableClasses.length > 0
      ? `${tagOf(target)}${stableClasses.map((c) => `.${cssEscapeIdent(c)}`).join('')}`
      : tagOf(target);
  const selector = `${parentPart} > ${childPart}`;
  const quality = stableClasses.length > 0 ? Math.min(...stableClasses.map(scoreToken)) : 0.5;
  pushIfValid(candidates, root, target, selector, 'parent-child', quality);
}

function generateNthOfTypeCandidate(
  root: ParentNode,
  target: Element,
  candidates: SelectorCandidate[],
): void {
  const parts: string[] = [];
  let current: Element | null = target;
  let depth = 0;
  while (current && depth < MAX_ANCESTOR_DEPTH) {
    parts.unshift(`${tagOf(current)}:nth-of-type(${elementIndexAmongSiblingsOfSameTag(current)})`);
    if (current.id && scoreToken(current.id) >= 0.5) {
      parts[0] = `#${cssEscapeIdent(current.id)}`;
      break;
    }
    current = current.parentElement;
    depth += 1;
  }
  const selector = parts.join(' > ');
  pushIfValid(candidates, root, target, selector, 'nth-of-type', 1);
}

/**
 * Generates and validates every selector candidate for `target`, in the
 * priority order described in spec 7.3: stable id, stable data-* attribute,
 * meaningful ARIA attribute, short tag+class combination, parent/child
 * combination, and nth-of-type as a last resort. Every candidate is
 * verified with `root.querySelectorAll` and discarded if it does not
 * actually match `target`.
 */
export function generateSelectorCandidates(
  target: Element,
  root: ParentNode = document,
): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = [];
  generateIdCandidate(root, target, candidates);
  generateDataAttrCandidates(root, target, candidates);
  generateAriaCandidates(root, target, candidates);
  generateTagClassCandidate(root, target, candidates);
  generateParentChildCandidate(root, target, candidates);
  generateNthOfTypeCandidate(root, target, candidates);
  return candidates.sort((a, b) => b.score - a.score);
}
