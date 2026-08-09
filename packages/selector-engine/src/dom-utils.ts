export function cssEscapeIdent(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

export function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export interface CandidateCheck {
  matchCount: number;
  matchesTarget: boolean;
}

export function checkCandidate(
  root: ParentNode,
  selector: string,
  target: Element,
): CandidateCheck {
  let matches: Element[];
  try {
    matches = Array.from(root.querySelectorAll(selector));
  } catch {
    return { matchCount: 0, matchesTarget: false };
  }
  return { matchCount: matches.length, matchesTarget: matches.includes(target) };
}

const DATA_ATTR_PRIORITY = ['data-testid', 'data-test', 'data-qa'];

export function stableDataAttributes(element: Element): Array<{ name: string; value: string }> {
  const attrs: Array<{ name: string; value: string }> = [];
  for (const name of DATA_ATTR_PRIORITY) {
    const value = element.getAttribute(name);
    if (value) attrs.push({ name, value });
  }
  for (const attr of Array.from(element.attributes)) {
    if (
      attr.name.startsWith('data-') &&
      !DATA_ATTR_PRIORITY.includes(attr.name) &&
      attr.value.length > 0
    ) {
      attrs.push({ name: attr.name, value: attr.value });
    }
  }
  return attrs;
}

export function elementIndexAmongSiblingsOfSameTag(element: Element): number {
  const tag = element.tagName;
  let index = 1;
  let sibling = element.previousElementSibling;
  while (sibling) {
    if (sibling.tagName === tag) index += 1;
    sibling = sibling.previousElementSibling;
  }
  return index;
}
