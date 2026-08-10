import {
  generateSelectorCandidates,
  pickBestCandidate,
  SelectionNavigator,
} from '@web-monitor/selector-engine';
import type { CreateMonitorRequest, ExtractionMode, MonitorMode } from '@web-monitor/shared';
import { createOverlayRoot, positionBox, type OverlayRoot } from './overlay/shadow-root.js';
import { renderPanel, type PanelState } from './panel.js';
import { createDraft, createFullPageDraft, type SelectionDraft } from './selection-draft.js';
import { sendExtensionMessage } from '../lib/messages.js';

export class SelectionController {
  private overlay: OverlayRoot | null = null;
  private navigator: SelectionNavigator | null = null;
  private selections: SelectionDraft[] = [];
  private monitorMode: MonitorMode = 'single';
  private monitorName = document.title.slice(0, 200);
  private statusMessage = '';
  private saving = false;
  private active = false;
  private abortController = new AbortController();
  private mutationObserver: MutationObserver | null = null;
  private repositionScheduled = false;

  start(): void {
    if (this.active) return;
    this.active = true;
    this.overlay = createOverlayRoot();
    this.attachListeners();
    this.renderPanel();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.abortController.abort();
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.overlay?.host.remove();
    this.overlay = null;
  }

  private attachListeners(): void {
    const { signal } = this.abortController;
    document.addEventListener('mousemove', this.onMouseMove, { capture: true, signal });
    document.addEventListener('click', this.onClick, { capture: true, signal });
    document.addEventListener('keydown', this.onKeyDown, { capture: true, signal });
    window.addEventListener('scroll', this.onReposition, { capture: true, signal });
    window.addEventListener('resize', this.onReposition, { signal });

    // Highlight boxes are drawn from getBoundingClientRect snapshots, so any
    // layout-affecting DOM change (not just scroll/resize) must trigger a
    // recompute, per §7.1.
    this.mutationObserver = new MutationObserver(() => this.scheduleReposition());
    this.mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  }

  private scheduleReposition(): void {
    if (this.repositionScheduled) return;
    this.repositionScheduled = true;
    requestAnimationFrame(() => {
      this.repositionScheduled = false;
      this.onReposition();
    });
  }

  private isInsideOverlay(node: Node): boolean {
    if (!this.overlay) return false;
    // Node.contains() does not cross shadow-DOM boundaries (a shadow root
    // has no parentNode), so a plain `host.contains(node)` check always
    // returns false for panel-internal elements. getRootNode() correctly
    // identifies any node whose closest shadow root is ours.
    if (this.overlay.host.contains(node)) return true;
    return node.getRootNode() === this.overlay.shadow;
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.overlay) return;
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (!el || this.isInsideOverlay(el)) return;
    if (this.navigator?.currentElement === el) return;
    this.navigator = new SelectionNavigator(el);
    this.renderHoverBox();
  };

  private onReposition = (): void => {
    this.renderHoverBox();
    this.renderSelectedBoxes();
  };

  private onClick = (event: MouseEvent): void => {
    if (!this.overlay) return;
    const path = event.composedPath();
    const target = path[0];
    if (target instanceof Node && this.isInsideOverlay(target)) return;
    event.preventDefault();
    event.stopPropagation();
    this.confirmCurrent();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.overlay) return;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.stop();
        break;
      case 'Enter':
        event.preventDefault();
        this.confirmCurrent();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveNavigator((nav) => nav.toParent());
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.moveNavigator((nav) => nav.toChild());
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.moveNavigator((nav) => nav.toPreviousSibling());
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.moveNavigator((nav) => nav.toNextSibling());
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        this.deleteCurrentIfSelected();
        break;
    }
  };

  private moveNavigator(step: (nav: SelectionNavigator) => Element | null): void {
    if (!this.navigator) return;
    const moved = step(this.navigator);
    if (moved) this.renderHoverBox();
  }

  private confirmCurrent(): void {
    if (!this.navigator) return;
    const element = this.navigator.currentElement;
    const candidates = generateSelectorCandidates(element, document);
    const best = pickBestCandidate(candidates, this.monitorMode);
    const draft = createDraft(
      element,
      candidates,
      best,
      `選択${this.selections.length + 1}`,
      this.monitorMode,
    );
    this.selections.push(draft);
    this.renderSelectedBoxes();
    this.renderPanel();
  }

  private deleteCurrentIfSelected(): void {
    if (!this.navigator) return;
    const idx = this.selections.findIndex((s) => s.element === this.navigator!.currentElement);
    if (idx >= 0) {
      this.selections.splice(idx, 1);
      this.renderSelectedBoxes();
      this.renderPanel();
    }
  }

  private removeSelection(id: string): void {
    this.selections = this.selections.filter((s) => s.id !== id);
    this.renderSelectedBoxes();
    this.renderPanel();
  }

  private renderHoverBox(): void {
    if (!this.overlay || !this.navigator) return;
    const rect = this.navigator.currentElement.getBoundingClientRect();
    positionBox(this.overlay.hoverBox, rect);
  }

  private renderSelectedBoxes(): void {
    if (!this.overlay) return;
    this.overlay.selectedBoxesContainer.innerHTML = '';
    for (const selection of this.selections) {
      const box = document.createElement('div');
      box.className = 'selected-box';
      positionBox(box, selection.element.getBoundingClientRect());
      this.overlay.selectedBoxesContainer.appendChild(box);
    }
  }

  private renderPanel(): void {
    if (!this.overlay) return;
    const state: PanelState = {
      monitorName: this.monitorName,
      monitorMode: this.monitorMode,
      selections: this.selections,
      statusMessage: this.statusMessage,
      saving: this.saving,
    };
    renderPanel(this.overlay.panel, state, {
      onMonitorNameChange: (value) => {
        this.monitorName = value;
      },
      onMonitorModeChange: (mode) => {
        this.monitorMode = mode;
        this.renderPanel();
      },
      onLabelChange: (id, label) => {
        const selection = this.selections.find((s) => s.id === id);
        if (selection) selection.label = label;
      },
      onExtractionModeChange: (id, mode) => {
        const selection = this.selections.find((s) => s.id === id);
        if (selection) {
          selection.extractionMode = mode;
          this.renderPanel();
        }
      },
      onRemove: (id) => this.removeSelection(id),
      onAddFullPage: () => {
        this.selections.push(createFullPageDraft(`ページ全体${this.selections.length + 1}`));
        this.renderPanel();
      },
      onSave: () => void this.save(),
      onCancel: () => this.stop(),
    });
  }

  private async save(): Promise<void> {
    if (this.selections.length === 0) return;
    this.saving = true;
    this.statusMessage = '';
    this.renderPanel();

    const payload: CreateMonitorRequest = {
      name: this.monitorName || document.title || location.href,
      url: location.href,
      monitorMode: this.monitorMode,
      comparisonRule: 'normalized_equality',
      executionMode: 'server',
      checkIntervalSec: 86400,
      enabled: true,
      orderIndex: 0,
      selections: this.selections.map((selection, index) => ({
        label: selection.label,
        selectorType: selection.selectorType,
        selector: selection.selector,
        selectorCandidates: selection.selectorCandidates,
        extractionMode: selection.extractionMode satisfies ExtractionMode,
        attributeName: selection.attributeName,
        normalization: selection.normalization,
        matchMode: selection.matchMode,
        orderIndex: index,
      })),
    };

    const result = await sendExtensionMessage({ type: 'CREATE_MONITOR', payload });
    this.saving = false;
    if (result.ok) {
      this.statusMessage = '保存しました。';
      this.renderPanel();
      window.setTimeout(() => this.stop(), 800);
    } else {
      this.statusMessage = `保存に失敗しました: ${result.error}`;
      this.renderPanel();
    }
  }
}
