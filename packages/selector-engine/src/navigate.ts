/**
 * Tracks the element currently under consideration during Visual Selector
 * keyboard navigation, and a visit history so ArrowDown ("移動履歴上の子要素へ戻る")
 * returns to whichever child ArrowUp came from, instead of always jumping
 * to firstElementChild.
 */
export class SelectionNavigator {
  private current: Element;
  private history: Element[];

  constructor(initial: Element) {
    this.current = initial;
    this.history = [initial];
  }

  get currentElement(): Element {
    return this.current;
  }

  toParent(): Element | null {
    const parent = this.current.parentElement;
    if (!parent) return null;
    this.current = parent;
    this.history.push(parent);
    return parent;
  }

  toChild(): Element | null {
    const cameFrom = this.previouslyVisitedChildOfCurrent();
    if (cameFrom) {
      this.current = cameFrom;
      this.history.push(cameFrom);
      return cameFrom;
    }
    const firstChild = this.current.firstElementChild;
    if (!firstChild) return null;
    this.current = firstChild;
    this.history.push(firstChild);
    return firstChild;
  }

  toPreviousSibling(): Element | null {
    const sibling = this.current.previousElementSibling;
    if (!sibling) return null;
    this.current = sibling;
    this.history.push(sibling);
    return sibling;
  }

  toNextSibling(): Element | null {
    const sibling = this.current.nextElementSibling;
    if (!sibling) return null;
    this.current = sibling;
    this.history.push(sibling);
    return sibling;
  }

  reset(element: Element): void {
    this.current = element;
    this.history = [element];
  }

  private previouslyVisitedChildOfCurrent(): Element | null {
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      const entry = this.history[i];
      if (entry === this.current) {
        const candidate = this.history[i - 1];
        if (candidate && candidate.parentElement === this.current) {
          return candidate;
        }
        return null;
      }
    }
    return null;
  }
}
